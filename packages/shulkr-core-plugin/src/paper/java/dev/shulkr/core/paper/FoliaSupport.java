package dev.shulkr.core.paper;

import io.papermc.paper.ServerBuildInfo;
import net.kyori.adventure.key.Key;

// Runtime detection of the Folia fork. On Folia the global Bukkit scheduler is unavailable and work must go through the region schedulers, so the plugin only needs a reliable yes/no answer at startup.
public final class FoliaSupport {

    private static final boolean IS_FOLIA = detect();

    private FoliaSupport() {
    }

    public static boolean isFolia() {
        return IS_FOLIA;
    }

    private static boolean detect() {
        // Brand check recommended by the Paper docs. ServerBuildInfo does not exist on Paper 1.20.4 and older, where this call throws NoClassDefFoundError and we fall back to the class probe below.
        try {
            return ServerBuildInfo.buildInfo().isBrandCompatible(Key.key("papermc", "folia"));
        } catch (Throwable ignored) {
            // Older Paper build without ServerBuildInfo, handled by the fallback below.
        }
        // Legacy probe: this class is added by Folia's region threading patch (still present in Folia 26.2) and never exists on plain Paper.
        try {
            Class.forName("io.papermc.paper.threadedregions.RegionizedServer");
            return true;
        } catch (ClassNotFoundException e) {
            return false;
        }
    }
}
