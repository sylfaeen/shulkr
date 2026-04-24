package dev.shulkr.core.velocity;

import com.google.inject.Inject;
import com.velocitypowered.api.event.Subscribe;
import com.velocitypowered.api.event.proxy.ProxyInitializeEvent;
import com.velocitypowered.api.event.proxy.ProxyShutdownEvent;
import com.velocitypowered.api.plugin.Plugin;
import com.velocitypowered.api.plugin.annotation.DataDirectory;
import com.velocitypowered.api.proxy.ProxyServer;
import dev.shulkr.core.common.MetricsPayload;
import dev.shulkr.core.common.config.PluginConfig;
import dev.shulkr.core.common.http.AgentHttpClient;
import org.slf4j.Logger;
import org.yaml.snakeyaml.Yaml;

import java.io.IOException;
import java.io.InputStream;
import java.lang.management.ManagementFactory;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

@Plugin(
    id = "shulkr-core",
    name = "shulkr-core",
    version = "${pluginVersion}",
    authors = { "shulkr" },
    description = "shulkr companion agent — pushes verified telemetry to the shulkr panel."
)
public final class ShulkrCoreVelocityPlugin {

    private final ProxyServer proxy;
    private final Logger logger;
    private final Path dataDirectory;
    private final long startedAt = System.currentTimeMillis();
    private final String pluginVersion;

    private PluginConfig config;
    private AgentHttpClient httpClient;
    private ScheduledExecutorService scheduler;
    private ScheduledFuture<?> task;

    @Inject
    public ShulkrCoreVelocityPlugin(ProxyServer proxy, Logger logger, @DataDirectory Path dataDirectory) {
        this.proxy = proxy;
        this.logger = logger;
        this.dataDirectory = dataDirectory;
        this.pluginVersion = readEmbeddedVersion();
    }

    @Subscribe
    public void onInit(ProxyInitializeEvent event) {
        try {
            ensureConfigFile();
            loadConfig();
        } catch (Exception e) {
            logger.error("shulkr-core: config load failed", e);
            return;
        }
        if (!config.isValid()) {
            logger.warn("shulkr-core: missing server_id/token — push disabled");
            return;
        }
        startPushLoop();
        logger.info("shulkr-core v{} loaded (velocity) — pushing every {}s to {}",
            pluginVersion, config.getPushIntervalSeconds(), config.getBackendUrl());
    }

    @Subscribe
    public void onShutdown(ProxyShutdownEvent event) {
        if (task != null) task.cancel(false);
        if (scheduler != null) {
            scheduler.shutdown();
            try {
                scheduler.awaitTermination(3, TimeUnit.SECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
        }
        if (httpClient != null) httpClient.close();
    }

    @SuppressWarnings("unchecked")
    private void loadConfig() throws IOException {
        try (var reader = Files.newBufferedReader(dataDirectory.resolve("config.yml"))) {
            var map = (Map<String, Object>) new Yaml().load(reader);
            if (map == null) map = new HashMap<>();
            this.config = new PluginConfig(
                (String) map.getOrDefault("backend_url", "http://127.0.0.1:3000"),
                (String) map.getOrDefault("server_id", ""),
                (String) map.getOrDefault("token", ""),
                ((Number) map.getOrDefault("push_interval_seconds", 5)).intValue(),
                ((Number) map.getOrDefault("protocol_version", 1)).intValue()
            );
        }
    }

    private void ensureConfigFile() throws IOException {
        Files.createDirectories(dataDirectory);
        var configPath = dataDirectory.resolve("config.yml");
        if (!Files.exists(configPath)) {
            try (InputStream in = getClass().getResourceAsStream("/config.yml")) {
                if (in != null) Files.copy(in, configPath);
            }
        }
    }

    private void startPushLoop() {
        var userAgent = "shulkr-core/" + pluginVersion + " (velocity)";
        this.httpClient = new AgentHttpClient(config, userAgent, (level, msg) -> {
            switch (level) {
                case INFO: logger.info(msg); break;
                case WARNING: logger.warn(msg); break;
                case SEVERE: logger.error(msg); break;
            }
        });
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            var t = new Thread(r, "shulkr-core-velocity-push");
            t.setDaemon(true);
            return t;
        });
        long periodMs = Duration.ofSeconds(config.getPushIntervalSeconds()).toMillis();
        this.task = scheduler.scheduleAtFixedRate(() -> {
            try {
                httpClient.push(collect());
            } catch (Throwable t) {
                logger.warn("shulkr-core: push failed: {}", t.getMessage());
            }
        }, periodMs, periodMs, TimeUnit.MILLISECONDS);
    }

    private MetricsPayload collect() {
        var payload = new MetricsPayload();
        payload.protocol_version = 1;
        payload.plugin_version = pluginVersion;
        payload.platform = "velocity";
        payload.platform_version = proxy.getVersion().getVersion();
        payload.collected_at = Instant.now().toString();
        payload.tps = null;
        payload.mspt = null;
        payload.memory = collectMemory();
        payload.players = collectPlayers();
        payload.worlds = new ArrayList<>();
        payload.proxy_backends = collectBackends();
        payload.uptime_ms = System.currentTimeMillis() - startedAt;
        return payload;
    }

    private MetricsPayload.MemorySnapshot collectMemory() {
        var snap = new MetricsPayload.MemorySnapshot();
        var runtime = Runtime.getRuntime();
        snap.used = runtime.totalMemory() - runtime.freeMemory();
        snap.max = runtime.maxMemory();
        var mx = ManagementFactory.getMemoryMXBean();
        snap.heap_used = mx.getHeapMemoryUsage().getUsed();
        snap.heap_max = Math.max(0, mx.getHeapMemoryUsage().getMax());
        snap.nonheap_used = mx.getNonHeapMemoryUsage().getUsed();
        return snap;
    }

    private List<MetricsPayload.PlayerSnapshot> collectPlayers() {
        var list = new ArrayList<MetricsPayload.PlayerSnapshot>();
        proxy.getAllPlayers().forEach(p -> {
            var entry = new MetricsPayload.PlayerSnapshot();
            entry.uuid = p.getUniqueId().toString();
            entry.name = p.getUsername();
            entry.world = null;
            entry.backend = p.getCurrentServer().map(s -> s.getServerInfo().getName()).orElse(null);
            entry.ping = (int) p.getPing();
            list.add(entry);
        });
        return list;
    }

    private List<MetricsPayload.ProxyBackendSnapshot> collectBackends() {
        var list = new ArrayList<MetricsPayload.ProxyBackendSnapshot>();
        proxy.getAllServers().forEach(s -> {
            var snap = new MetricsPayload.ProxyBackendSnapshot();
            snap.name = s.getServerInfo().getName();
            snap.online_players = s.getPlayersConnected().size();
            snap.reachable = !s.getPlayersConnected().isEmpty();
            list.add(snap);
        });
        return list;
    }

    private String readEmbeddedVersion() {
        try (InputStream in = getClass().getResourceAsStream("/shulkr-core-version.txt")) {
            if (in != null) return new String(in.readAllBytes()).trim();
        } catch (IOException ignored) {
            // fall through
        }
        return "0.0.0";
    }
}
