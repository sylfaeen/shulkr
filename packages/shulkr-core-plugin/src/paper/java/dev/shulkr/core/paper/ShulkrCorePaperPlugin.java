package dev.shulkr.core.paper;

import dev.shulkr.core.common.config.PluginConfig;
import dev.shulkr.core.common.http.AgentHttpClient;
import dev.shulkr.core.paper.commands.ShulkrCommand;
import dev.shulkr.core.paper.metrics.MetricsCollector;
import dev.shulkr.core.paper.scheduler.PushScheduler;
import org.bukkit.Bukkit;
import org.bukkit.plugin.java.JavaPlugin;

public final class ShulkrCorePaperPlugin extends JavaPlugin {

    private PluginConfig config;
    private AgentHttpClient httpClient;
    private PushScheduler pushScheduler;
    private long startedAt;

    @Override
    public void onEnable() {
        this.startedAt = System.currentTimeMillis();
        saveDefaultConfig();
        reloadPluginConfig();

        var command = getCommand("shulkr");
        if (command != null) {
            command.setExecutor(new ShulkrCommand(this));
        }

        var label = FoliaSupport.isFolia() ? "shulkr-core (Folia) v" : "shulkr-core v";
        getLogger().info(label + getDescription().getVersion() + " loaded");
    }

    @Override
    public void onDisable() {
        if (pushScheduler != null) {
            pushScheduler.stop();
            pushScheduler = null;
        }
        if (httpClient != null) {
            httpClient.close();
            httpClient = null;
        }
        getLogger().info("shulkr-core disabled");
    }

    public void reloadPluginConfig() {
        reloadConfig();
        var raw = getConfig();
        this.config = new PluginConfig(
            raw.getString("backend_url", "http://127.0.0.1:3000"),
            raw.getString("server_id", ""),
            raw.getString("token", ""),
            raw.getInt("push_interval_seconds", 5),
            raw.getInt("protocol_version", 1)
        );
        if (pushScheduler != null) {
            pushScheduler.stop();
            pushScheduler = null;
        }
        if (httpClient != null) {
            httpClient.close();
            httpClient = null;
        }
        if (!config.isValid()) {
            getLogger().warning("shulkr-core: missing server_id/token in config.yml — push disabled");
            return;
        }
        var userAgent = "shulkr-core/" + getDescription().getVersion() + " (" + platformLabel() + ")";
        this.httpClient = new AgentHttpClient(config, userAgent, (level, msg) -> {
            switch (level) {
                case INFO: getLogger().info(msg); break;
                case WARNING: getLogger().warning(msg); break;
                case SEVERE: getLogger().severe(msg); break;
            }
        });
        var collector = new MetricsCollector(this, startedAt, getDescription().getVersion(), platformLabel(), platformVersion());
        this.pushScheduler = new PushScheduler(this, config, collector, httpClient);
        this.pushScheduler.start();
        getLogger().info(
            "shulkr-core: pushing metrics every " + config.getPushIntervalSeconds() + "s to " + config.getBackendUrl()
        );
    }

    public String platformLabel() {
        return FoliaSupport.isFolia() ? "folia" : "paper";
    }

    public String platformVersion() {
        return Bukkit.getVersion();
    }

    public PluginConfig getPluginConfig() {
        return config;
    }

    public PushScheduler getPushScheduler() {
        return pushScheduler;
    }
}
