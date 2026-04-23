package dev.shulkr.core.paper.scheduler;

import dev.shulkr.core.common.MetricsPayload;
import dev.shulkr.core.common.config.PluginConfig;
import dev.shulkr.core.common.http.AgentHttpClient;
import dev.shulkr.core.paper.FoliaSupport;
import dev.shulkr.core.paper.metrics.MetricsCollector;
import org.bukkit.Bukkit;
import org.bukkit.plugin.java.JavaPlugin;
import org.bukkit.scheduler.BukkitTask;

import java.time.Duration;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledFuture;
import java.util.concurrent.TimeUnit;

/**
 * Orchestrates the collect-then-push cycle on both Paper and Folia.
 *
 * - Paper: uses the Bukkit scheduler (main thread collect + async push).
 * - Folia: uses the GlobalRegionScheduler for collect (global state only) and
 *   an async executor for push. We avoid deprecated/nonexistent Bukkit global
 *   schedulers on Folia.
 */
public final class PushScheduler {

    private final JavaPlugin plugin;
    private final PluginConfig config;
    private final MetricsCollector collector;
    private final AgentHttpClient http;

    // Paper-only handle
    private BukkitTask paperTask;
    // Folia-only handles
    private ScheduledExecutorService foliaCollectExecutor;
    private ScheduledFuture<?> foliaFuture;
    private ScheduledExecutorService pushExecutor;

    private volatile String lastStatus = "idle";
    private volatile long lastPushAt = 0L;

    public PushScheduler(JavaPlugin plugin, PluginConfig config, MetricsCollector collector, AgentHttpClient http) {
        this.plugin = plugin;
        this.config = config;
        this.collector = collector;
        this.http = http;
    }

    public void start() {
        long periodSeconds = Math.max(2L, config.getPushIntervalSeconds());
        this.pushExecutor = Executors.newSingleThreadScheduledExecutor(r -> {
            var t = new Thread(r, "shulkr-core-push");
            t.setDaemon(true);
            return t;
        });
        if (FoliaSupport.isFolia()) {
            startFolia(periodSeconds);
        } else {
            startPaper(periodSeconds);
        }
    }

    public void stop() {
        if (paperTask != null) {
            paperTask.cancel();
            paperTask = null;
        }
        if (foliaFuture != null) {
            foliaFuture.cancel(false);
            foliaFuture = null;
        }
        if (foliaCollectExecutor != null) {
            foliaCollectExecutor.shutdownNow();
            foliaCollectExecutor = null;
        }
        if (pushExecutor != null) {
            pushExecutor.shutdown();
            try {
                pushExecutor.awaitTermination(3, TimeUnit.SECONDS);
            } catch (InterruptedException ignored) {
                Thread.currentThread().interrupt();
            }
            pushExecutor = null;
        }
    }

    public String getLastStatus() {
        return lastStatus;
    }

    public long getLastPushAt() {
        return lastPushAt;
    }

    private void startPaper(long periodSeconds) {
        long periodTicks = periodSeconds * 20L;
        paperTask = Bukkit.getScheduler().runTaskTimer(plugin, this::paperCycle, periodTicks, periodTicks);
    }

    private void startFolia(long periodSeconds) {
        foliaCollectExecutor = Executors.newSingleThreadScheduledExecutor(r -> {
            var t = new Thread(r, "shulkr-core-folia-collect");
            t.setDaemon(true);
            return t;
        });
        // On Folia we run the collect on the global region scheduler via reflection to
        // keep the jar compilable against the Paper API only.
        foliaFuture = foliaCollectExecutor.scheduleAtFixedRate(
            this::foliaCycle,
            Duration.ofSeconds(periodSeconds).toMillis(),
            Duration.ofSeconds(periodSeconds).toMillis(),
            TimeUnit.MILLISECONDS
        );
    }

    private void paperCycle() {
        final MetricsPayload payload;
        try {
            payload = collector.collect();
        } catch (Throwable t) {
            plugin.getLogger().warning("shulkr-core: collect failed: " + t.getMessage());
            lastStatus = "collect-error";
            return;
        }
        schedulePush(payload);
    }

    private void foliaCycle() {
        // Submit the collection to Folia's GlobalRegionScheduler via reflection,
        // await the result, then push async.
        try {
            var server = Bukkit.getServer();
            var getGlobal = server.getClass().getMethod("getGlobalRegionScheduler");
            var scheduler = getGlobal.invoke(server);
            var executeMethod = scheduler.getClass().getMethod("execute", org.bukkit.plugin.Plugin.class, Runnable.class);
            final MetricsPayload[] holder = new MetricsPayload[1];
            final Object lock = new Object();
            final boolean[] done = { false };
            executeMethod.invoke(scheduler, plugin, (Runnable) () -> {
                try {
                    holder[0] = collector.collect();
                } catch (Throwable t) {
                    plugin.getLogger().warning("shulkr-core: collect failed: " + t.getMessage());
                }
                synchronized (lock) {
                    done[0] = true;
                    lock.notifyAll();
                }
            });
            synchronized (lock) {
                long deadline = System.currentTimeMillis() + 2000;
                while (!done[0] && System.currentTimeMillis() < deadline) {
                    lock.wait(deadline - System.currentTimeMillis());
                }
            }
            if (holder[0] == null) {
                lastStatus = "collect-timeout";
                return;
            }
            schedulePush(holder[0]);
        } catch (Throwable t) {
            plugin.getLogger().warning("shulkr-core: folia cycle failed: " + t.getMessage());
            lastStatus = "folia-error";
        }
    }

    private void schedulePush(MetricsPayload payload) {
        if (pushExecutor == null) return;
        pushExecutor.execute(() -> {
            try {
                http.push(payload);
                lastStatus = "ok";
                lastPushAt = System.currentTimeMillis();
            } catch (Throwable t) {
                lastStatus = "push-error";
            }
        });
    }
}
