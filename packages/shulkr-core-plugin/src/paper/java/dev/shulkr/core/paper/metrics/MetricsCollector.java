package dev.shulkr.core.paper.metrics;

import dev.shulkr.core.common.MetricsPayload;
import org.bukkit.Bukkit;
import org.bukkit.entity.Player;
import org.bukkit.plugin.java.JavaPlugin;

import java.lang.management.ManagementFactory;
import java.time.Instant;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;

/**
 * Collects a full metrics snapshot from the Paper/Bukkit API (also works on Folia).
 */
public final class MetricsCollector {

    private final JavaPlugin plugin;
    private final long startedAt;
    private final String pluginVersion;
    private final String platform;
    private final String platformVersion;

    public MetricsCollector(JavaPlugin plugin, long startedAt, String pluginVersion, String platform, String platformVersion) {
        this.plugin = plugin;
        this.startedAt = startedAt;
        this.pluginVersion = pluginVersion;
        this.platform = platform;
        this.platformVersion = platformVersion;
    }

    public MetricsPayload collect() {
        var payload = new MetricsPayload();
        payload.protocol_version = 1;
        payload.plugin_version = pluginVersion;
        payload.platform = platform;
        payload.platform_version = platformVersion;
        payload.collected_at = Instant.now().toString();
        payload.tps = collectTps();
        payload.mspt = collectMspt();
        payload.memory = collectMemory();
        payload.players = collectPlayers();
        payload.worlds = collectWorlds();
        payload.proxy_backends = new ArrayList<>();
        payload.uptime_ms = System.currentTimeMillis() - startedAt;
        return payload;
    }

    private MetricsPayload.TpsSnapshot collectTps() {
        var snap = new MetricsPayload.TpsSnapshot();
        try {
            double[] tps = Bukkit.getServer().getTPS();
            snap.avg5s = clampTps(tps.length > 0 ? tps[0] : 20.0);
            snap.avg1m = clampTps(tps.length > 0 ? tps[0] : 20.0);
            snap.avg15m = clampTps(tps.length > 2 ? tps[2] : (tps.length > 0 ? tps[0] : 20.0));
        } catch (Throwable t) {
            snap.avg5s = 20.0;
            snap.avg1m = 20.0;
            snap.avg15m = 20.0;
        }
        return snap;
    }

    private MetricsPayload.MsptSnapshot collectMspt() {
        var snap = new MetricsPayload.MsptSnapshot();
        try {
            double avg = Bukkit.getServer().getAverageTickTime();
            snap.avg5s = Math.max(0, avg);
            snap.avg1m = Math.max(0, avg);
            snap.avg15m = Math.max(0, avg);
        } catch (Throwable t) {
            snap.avg5s = 0.0;
            snap.avg1m = 0.0;
            snap.avg15m = 0.0;
        }
        return snap;
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
        for (Player p : Bukkit.getOnlinePlayers()) {
            var entry = new MetricsPayload.PlayerSnapshot();
            entry.uuid = p.getUniqueId().toString();
            entry.name = p.getName();
            entry.world = p.getWorld().getName();
            entry.backend = null;
            try {
                entry.ping = p.getPing();
            } catch (Throwable t) {
                entry.ping = null;
            }
            list.add(entry);
        }
        return list;
    }

    private List<MetricsPayload.WorldSnapshot> collectWorlds() {
        var playersPerWorld = new HashMap<String, Integer>();
        for (Player p : Bukkit.getOnlinePlayers()) {
            var w = p.getWorld().getName();
            playersPerWorld.merge(w, 1, Integer::sum);
        }
        var list = new ArrayList<MetricsPayload.WorldSnapshot>();
        for (var world : Bukkit.getWorlds()) {
            var snap = new MetricsPayload.WorldSnapshot();
            snap.name = world.getName();
            snap.entities = world.getEntities().size();
            snap.loaded_chunks = world.getLoadedChunks().length;
            snap.players = playersPerWorld.getOrDefault(world.getName(), 0);
            list.add(snap);
        }
        return list;
    }

    private static double clampTps(double v) {
        if (Double.isNaN(v) || v < 0) return 0.0;
        return Math.min(20.0, v);
    }
}
