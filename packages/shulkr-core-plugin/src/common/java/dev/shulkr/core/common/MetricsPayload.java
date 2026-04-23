package dev.shulkr.core.common;

import java.util.List;

/**
 * Shared payload shape for all platforms. Proxy platforms (velocity / waterfall)
 * leave `tps`, `mspt`, and `worlds` null/empty and populate `proxy_backends` instead.
 */
public final class MetricsPayload {
    public int protocol_version;
    public String plugin_version;
    public String platform; // "paper" | "folia" | "velocity" | "waterfall"
    public String platform_version;
    public String collected_at;
    public TpsSnapshot tps;
    public MsptSnapshot mspt;
    public MemorySnapshot memory;
    public List<PlayerSnapshot> players;
    public List<WorldSnapshot> worlds;
    public List<ProxyBackendSnapshot> proxy_backends;
    public long uptime_ms;

    public static final class TpsSnapshot {
        public double avg5s;
        public double avg1m;
        public double avg15m;
    }

    public static final class MsptSnapshot {
        public double avg5s;
        public double avg1m;
        public double avg15m;
    }

    public static final class MemorySnapshot {
        public long used;
        public long max;
        public long heap_used;
        public long heap_max;
        public long nonheap_used;
    }

    public static final class PlayerSnapshot {
        public String uuid;
        public String name;
        public String world;
        public String backend;
        public Integer ping;
    }

    public static final class WorldSnapshot {
        public String name;
        public int entities;
        public int loaded_chunks;
        public int players;
    }

    public static final class ProxyBackendSnapshot {
        public String name;
        public int online_players;
        public boolean reachable;
    }
}
