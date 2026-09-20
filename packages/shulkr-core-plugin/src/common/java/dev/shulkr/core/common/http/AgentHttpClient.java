package dev.shulkr.core.common.http;

import com.google.gson.Gson;
import dev.shulkr.core.common.MetricsPayload;
import dev.shulkr.core.common.config.PluginConfig;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.HashMap;
import java.util.Map;
import java.util.function.BiConsumer;

/**
 * Async HTTP client that pushes metrics payloads to the shulkr backend.
 * Platform-agnostic — loggers are injected as a BiConsumer so each platform
 * can forward to its own logger (Bukkit logger, SLF4J on Velocity, BungeeCord logger).
 */
public final class AgentHttpClient {

    private static final Duration TIMEOUT = Duration.ofSeconds(3);
    private static final long DEDUP_WINDOW_MS = 60_000;
    private static final int MAX_RETRIES = 3;

    public enum LogLevel { INFO, WARNING, SEVERE }

    private final PluginConfig config;
    private final String userAgent;
    private final BiConsumer<LogLevel, String> logger;
    private final HttpClient client;
    private final Gson gson = new Gson();
    private final Map<String, Long> lastWarnAt = new HashMap<>();

    public AgentHttpClient(PluginConfig config, String userAgent, BiConsumer<LogLevel, String> logger) {
        this.config = config;
        this.userAgent = userAgent;
        this.logger = logger;
        // Force HTTP/1.1 — Fastify's strict Content-Length check can trip up Java's
        // default HTTP/2 handling in some setups.
        this.client = HttpClient.newBuilder()
            .version(HttpClient.Version.HTTP_1_1)
            .connectTimeout(TIMEOUT)
            .build();
    }

    public void close() {
        // HttpClient has no explicit close in JDK 17; nothing to do.
    }

    public void push(MetricsPayload payload) {
        var json = gson.toJson(payload);
        // Use explicit UTF-8 bytes so Content-Length matches the exact byte count
        // (Fastify rejects with FST_ERR_CTP_INVALID_CONTENT_LENGTH if it mismatches).
        byte[] body = json.getBytes(StandardCharsets.UTF_8);
        var url = config.getBackendUrl().replaceAll("/$", "")
            + "/api/agents/" + config.getServerId() + "/metrics";
        var request = HttpRequest.newBuilder()
            .uri(URI.create(url))
            .timeout(TIMEOUT)
            .header("Content-Type", "application/json; charset=utf-8")
            .header("Authorization", "Bearer " + config.getToken())
            .header("User-Agent", userAgent)
            .POST(HttpRequest.BodyPublishers.ofByteArray(body))
            .build();

        long delayMs = 1000;
        for (int attempt = 1; attempt <= MAX_RETRIES; attempt++) {
            try {
                HttpResponse<String> response = client.send(request, HttpResponse.BodyHandlers.ofString());
                int code = response.statusCode();
                if (code == 204 || code == 200) {
                    return;
                }
                if (code >= 400 && code < 500) {
                    logDeduped("4xx", LogLevel.WARNING,
                        "shulkr-core: backend rejected payload (" + code + "): " + truncate(response.body(), 200));
                    return;
                }
                // 5xx — retry
            } catch (Throwable t) {
                if (attempt == MAX_RETRIES) {
                    logDeduped("net", LogLevel.WARNING, "shulkr-core: push failed (" + t.getClass().getSimpleName() + ")");
                }
            }
            if (attempt < MAX_RETRIES) {
                try {
                    Thread.sleep(delayMs);
                } catch (InterruptedException ie) {
                    Thread.currentThread().interrupt();
                    return;
                }
                delayMs *= 2;
            }
        }
    }

    private void logDeduped(String key, LogLevel level, String message) {
        long now = System.currentTimeMillis();
        Long last = lastWarnAt.get(key);
        if (last == null || now - last > DEDUP_WINDOW_MS) {
            logger.accept(level, message);
            lastWarnAt.put(key, now);
        }
    }

    private static String truncate(String s, int max) {
        if (s == null) return "";
        return s.length() <= max ? s : s.substring(0, max) + "…";
    }
}
