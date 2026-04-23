package dev.shulkr.core.common.config;

/**
 * Platform-agnostic config container. Each platform's plugin parses its YAML
 * (via Bukkit/Velocity/BungeeCord config APIs) and builds an instance.
 */
public final class PluginConfig {

    private final String backendUrl;
    private final String serverId;
    private final String token;
    private final int pushIntervalSeconds;
    private final int protocolVersion;

    public PluginConfig(String backendUrl, String serverId, String token, int pushIntervalSeconds, int protocolVersion) {
        this.backendUrl = backendUrl;
        this.serverId = serverId;
        this.token = token;
        this.pushIntervalSeconds = Math.max(2, Math.min(60, pushIntervalSeconds));
        this.protocolVersion = protocolVersion;
    }

    public boolean isValid() {
        return serverId != null && !serverId.isEmpty() && token != null && !token.isEmpty();
    }

    public String getBackendUrl() {
        return backendUrl;
    }

    public String getServerId() {
        return serverId;
    }

    public String getToken() {
        return token;
    }

    public int getPushIntervalSeconds() {
        return pushIntervalSeconds;
    }

    public int getProtocolVersion() {
        return protocolVersion;
    }
}
