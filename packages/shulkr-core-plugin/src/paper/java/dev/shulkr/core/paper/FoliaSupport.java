package dev.shulkr.core.paper;

/**
 * Runtime detection of the Folia fork. When running on Folia, Bukkit's global
 * scheduler is unavailable and work must be submitted via region schedulers.
 * We only need to detect the presence of Folia-specific classes.
 */
public final class FoliaSupport {

    private FoliaSupport() {
    }

    private static final boolean IS_FOLIA;

    static {
        boolean detected;
        try {
            Class.forName("io.papermc.paper.threadedregions.RegionizedServer");
            detected = true;
        } catch (ClassNotFoundException e) {
            detected = false;
        }
        IS_FOLIA = detected;
    }

    public static boolean isFolia() {
        return IS_FOLIA;
    }
}
