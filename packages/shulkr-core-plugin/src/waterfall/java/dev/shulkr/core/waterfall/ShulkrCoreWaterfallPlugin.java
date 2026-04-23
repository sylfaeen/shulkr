package dev.shulkr.core.waterfall;

import dev.shulkr.core.common.MetricsPayload;
import dev.shulkr.core.common.config.PluginConfig;
import dev.shulkr.core.common.http.AgentHttpClient;
import net.md_5.bungee.api.ProxyServer;
import net.md_5.bungee.api.plugin.Plugin;
import net.md_5.bungee.config.Configuration;
import net.md_5.bungee.config.ConfigurationProvider;
import net.md_5.bungee.config.YamlConfiguration;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.lang.management.ManagementFactory;
import java.nio.file.Files;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

public final class ShulkrCoreWaterfallPlugin extends Plugin {

    private final long startedAt = System.currentTimeMillis();
    private PluginConfig config;
    private AgentHttpClient httpClient;
    private ScheduledExecutorService scheduler;
    private ScheduledFuture<?> task;
    private String pluginVersion;

    @Override
    public void onEnable() {
        this.pluginVersion = getDescription().getVersion();
        try {
            ensureConfigFile();
            loadConfig();
        } catch (Exception e) {
            getLogger().severe("shulkr-core: config load failed: " + e.getMessage());
            return;
        }
        if (!config.isValid()) {
            getLogger().warning("shulkr-core: missing server_id/token — push disabled");
            return;
        }
        startPushLoop();
        getLogger().info("shulkr-core v" + pluginVersion + " loaded (waterfall) — pushing every "
            + config.getPushIntervalSeconds() + "s to " + config.getBackendUrl());
    }

    @Override
    public void onDisable() {
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

    private void ensureConfigFile() throws IOException {
        if (!getDataFolder().exists()) {
            getDataFolder().mkdir();
        }
        var file = new File(getDataFolder(), "config.yml");
        if (!file.exists()) {
            try (InputStream in = getResourceAsStream("config.yml")) {
                if (in != null) Files.copy(in, file.toPath());
            }
        }
    }

    private void loadConfig() throws IOException {
        var file = new File(getDataFolder(), "config.yml");
        Configuration cfg = ConfigurationProvider.getProvider(YamlConfiguration.class).load(file);
        this.config = new PluginConfig(
            cfg.getString("backend_url", "http://127.0.0.1:3000"),
            cfg.getString("server_id", ""),
            cfg.getString("token", ""),
            cfg.getInt("push_interval_seconds", 5),
            cfg.getInt("protocol_version", 1)
        );
    }

    private void startPushLoop() {
        var userAgent = "shulkr-core/" + pluginVersion + " (waterfall)";
        this.httpClient = new AgentHttpClient(config, userAgent, (level, msg) -> {
            switch (level) {
                case INFO: getLogger().info(msg); break;
                case WARNING: getLogger().warning(msg); break;
                case SEVERE: getLogger().severe(msg); break;
            }
        });
        this.scheduler = Executors.newSingleThreadScheduledExecutor(r -> {
            var t = new Thread(r, "shulkr-core-waterfall-push");
            t.setDaemon(true);
            return t;
        });
        long periodMs = Duration.ofSeconds(config.getPushIntervalSeconds()).toMillis();
        this.task = scheduler.scheduleAtFixedRate(() -> {
            try {
                httpClient.push(collect());
            } catch (Throwable t) {
                getLogger().warning("shulkr-core: push failed: " + t.getMessage());
            }
        }, periodMs, periodMs, TimeUnit.MILLISECONDS);
    }

    private MetricsPayload collect() {
        var payload = new MetricsPayload();
        payload.protocol_version = 1;
        payload.plugin_version = pluginVersion;
        payload.platform = "waterfall";
        payload.platform_version = ProxyServer.getInstance().getVersion();
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
        ProxyServer.getInstance().getPlayers().forEach(p -> {
            var entry = new MetricsPayload.PlayerSnapshot();
            entry.uuid = p.getUniqueId().toString();
            entry.name = p.getName();
            entry.world = null;
            entry.backend = p.getServer() != null ? p.getServer().getInfo().getName() : null;
            entry.ping = p.getPing();
            list.add(entry);
        });
        return list;
    }

    private List<MetricsPayload.ProxyBackendSnapshot> collectBackends() {
        var list = new ArrayList<MetricsPayload.ProxyBackendSnapshot>();
        ProxyServer.getInstance().getServers().forEach((name, info) -> {
            var snap = new MetricsPayload.ProxyBackendSnapshot();
            snap.name = name;
            snap.online_players = info.getPlayers().size();
            snap.reachable = !info.getPlayers().isEmpty();
            list.add(snap);
        });
        return list;
    }
}
