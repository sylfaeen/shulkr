import java.nio.file.Files

plugins {
    java
}

val pluginVersion: String = Files.readString(file("version.txt").toPath()).trim()

group = "dev.shulkr"
version = pluginVersion

// Paper 26.x publishes its API as Java 25 class files, so the compiler has to run on a JDK 25 toolchain (auto-provisioned by the foojay resolver when none is installed locally).
java {
    toolchain {
        languageVersion.set(JavaLanguageVersion.of(25))
    }
}

// The emitted bytecode stays at Java 17 so one jar runs everywhere we ship it: Paper 1.19 to 1.20.4 (Java 17), 1.20.5 to 1.21.x (Java 21), 26.x (Java 25), plus Velocity and Waterfall.
tasks.withType<JavaCompile>().configureEach {
    options.release.set(17)
    options.encoding = "UTF-8"
}

repositories {
    mavenCentral()
    maven("https://repo.papermc.io/repository/maven-public/") { name = "papermc" }
}


sourceSets {
    create("common") {
        java.srcDir("src/common/java")
    }
    create("paper") {
        java.srcDir("src/paper/java")
        resources.srcDir("src/paper/resources")
        compileClasspath += sourceSets["common"].output
        runtimeClasspath += sourceSets["common"].output
    }
    create("velocity") {
        java.srcDir("src/velocity/java")
        resources.srcDir("src/velocity/resources")
        compileClasspath += sourceSets["common"].output
        runtimeClasspath += sourceSets["common"].output
    }
    create("waterfall") {
        java.srcDir("src/waterfall/java")
        resources.srcDir("src/waterfall/resources")
        compileClasspath += sourceSets["common"].output
        runtimeClasspath += sourceSets["common"].output
    }
}


// Gradle derives the wanted JVM version of each compile classpath from the release flag above, and the Paper 26.x module metadata declares Java 25, so resolution must be told explicitly that compiling Java 17 bytecode against that API is intended.
configurations.named("paperCompileClasspath") {
    attributes.attribute(org.gradle.api.attributes.java.TargetJvmVersion.TARGET_JVM_VERSION_ATTRIBUTE, 25)
}


dependencies {
    // Gson is bundled by Paper/BungeeCord/Velocity runtimes, so compileOnly is enough.
    "commonCompileOnly"("com.google.code.gson:gson:2.10.1")
    // Paper (also works on Folia). Since 26.1 every Paper build is a release named <version>.build.<n>-<channel>; bump the build number deliberately.
    "paperCompileOnly"("io.papermc.paper:paper-api:26.2.build.127-stable")
    // Velocity
    "velocityCompileOnly"("com.velocitypowered:velocity-api:3.3.0-SNAPSHOT")
    "velocityAnnotationProcessor"("com.velocitypowered:velocity-api:3.3.0-SNAPSHOT")
    "velocityImplementation"("org.yaml:snakeyaml:2.2")
    // Waterfall (BungeeCord API)
    "waterfallCompileOnly"("io.github.waterfallmc:waterfall-api:1.20-R0.3-SNAPSHOT")
}


listOf("paper", "velocity", "waterfall").forEach { name ->
    tasks.named<Copy>("process${name.replaceFirstChar { it.uppercase() }}Resources") {
        duplicatesStrategy = DuplicatesStrategy.EXCLUDE
        filesMatching(listOf("plugin.yml", "bungee.yml", "velocity-plugin.json")) {
            expand("version" to pluginVersion)
        }
    }
}


fun registerPlatformJar(name: String, sourceSetName: String = name) {
    tasks.register<Jar>("${name}Jar") {
        archiveBaseName.set("shulkr-core-$name")
        archiveVersion.set(pluginVersion)
        destinationDirectory.set(layout.buildDirectory.dir("libs/$pluginVersion"))
        from(sourceSets[sourceSetName].output)
        from(sourceSets["common"].output)
        // Embed version for runtime reading (velocity reads /shulkr-core-version.txt)
        from(file("version.txt")) {
            rename { "shulkr-core-version.txt" }
        }
        // Velocity needs snakeyaml bundled in the jar
        if (sourceSetName == "velocity") {
            dependsOn(configurations["velocityRuntimeClasspath"])
            from({ configurations["velocityRuntimeClasspath"].filter { it.name.endsWith(".jar") }.map { zipTree(it) } }) {
                exclude("META-INF/*.SF", "META-INF/*.DSA", "META-INF/*.RSA", "module-info.class")
            }
        }
    }
}

registerPlatformJar("paper")
// Folia reuses the Paper source set: same code, runtime detection via FoliaSupport.
registerPlatformJar("folia", sourceSetName = "paper")
registerPlatformJar("velocity")
registerPlatformJar("waterfall")

// Disable default jar (would produce an empty jar from the root source set)
tasks.named("jar") { enabled = false }


tasks.register("copyToBackendDist") {
    dependsOn("paperJar", "foliaJar", "velocityJar", "waterfallJar")
    doLast {
        val destBase = rootProject.file("../backend/dist/assets/plugins")
        listOf("paper", "folia", "velocity", "waterfall").forEach { platform ->
            val dest = destBase.resolve(platform)
            dest.mkdirs()
            val src = tasks.named<Jar>("${platform}Jar").get().archiveFile.get().asFile
            src.copyTo(dest.resolve("shulkr-core-$platform.jar"), overwrite = true)
            dest.resolve("version.txt").writeText(pluginVersion)
        }
    }
}

tasks.named("build") {
    dependsOn("paperJar", "foliaJar", "velocityJar", "waterfallJar")
    finalizedBy("copyToBackendDist")
}
