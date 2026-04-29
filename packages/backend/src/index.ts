import './env';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import fastifyStatic from '@fastify/static';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import { parseConfig } from '@shulkr/backend/config';
import { closeDeps, createDeps, getAppDeps } from '@shulkr/backend/deps';
import { createApp } from '@shulkr/backend/app';
import { initializeDatabase } from '@shulkr/backend/db/migrate';
import { taskScheduler } from '@shulkr/backend/services/task_scheduler';
import { jobQueueService } from '@shulkr/backend/services/job_queue_service';
import { initializeMetricsHistory } from '@shulkr/backend/services/metrics_history_service';
import { initializeTpsService } from '@shulkr/backend/services/tps_service';
import { agentIngestService } from '@shulkr/backend/services/agent_ingest_service';
import { initializePlayerHistory } from '@shulkr/backend/services/player_history_service';
import { notificationService } from '@shulkr/backend/services/notification_service';
import { getAllServers, startServer } from '@shulkr/backend/services/server_service';
import { syncFirewallRules } from '@shulkr/backend/services/firewall_service';

// Story 58.2: validate process.env via Zod and assemble the AppDeps container. Crashes the boot with a clear Zod error message if any required env var is missing or invalid. Existing services keep using their singleton imports until the migration sweep (stories 58.5–58.6.8) replaces them with deps.
const config = parseConfig(process.env);
const deps = createDeps(config);

const start = async () => {
  try {
    await initializeDatabase(deps.sqlite);
    await jobQueueService.initialize();
    await taskScheduler.initialize();
    initializeTpsService(getAppDeps());
    initializeMetricsHistory(getAppDeps());
    agentIngestService.initialize();
    initializePlayerHistory(getAppDeps());
    notificationService.initialize();

    // Auto-start servers with auto_start enabled
    const servers = await getAllServers(getAppDeps());
    const autoStartServers = servers.filter((s) => s.auto_start);
    if (autoStartServers.length > 0) {
      console.log(`Auto-starting ${autoStartServers.length} server(s)...`);
      for (const server of autoStartServers) {
        try {
          const result = await startServer(getAppDeps(), server.id);
          if (result.success) {
            console.log(`Auto-started server: ${server.name}`);
          } else {
            console.warn(`Failed to auto-start server ${server.name}: ${result.error}`);
          }
        } catch (err) {
          console.error(`Error auto-starting server ${server.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // Sync firewall rules from database to iptables (production only)
    if (config.NODE_ENV === 'production') {
      const syncResult = await syncFirewallRules(getAppDeps());
      if (syncResult.synced > 0) {
        console.log(`Firewall: synced ${syncResult.synced}/${syncResult.total} rules to iptables`);
      }
    }

    // Build the Fastify instance via the shared createApp factory.
    const app = await createApp(deps);

    // Production-only: serve the built frontend and add SPA fallback.
    const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
    await app.register(fastifyStatic, {
      root: frontendDistPath,
      prefix: '/',
    });
    app.setNotFoundHandler(async (request, reply) => {
      if (request.url.startsWith('/api/') || request.url.startsWith('/ws/') || request.url.startsWith('/docs/')) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const indexPath = path.join(frontendDistPath, 'index.html');
      const content = fs.readFileSync(indexPath, 'utf-8');
      return reply.type('text/html').send(content);
    });

    setupShutdown(app);

    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
};

function setupShutdown(app: Awaited<ReturnType<typeof createApp>>): void {
  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    app.log.info(`${signal} received, shutting down gracefully`);
    try {
      await app.close();
    } catch (err) {
      app.log.error(err, 'fastify close failed during shutdown');
    }
    closeDeps(deps);
    process.exit(0);
  }
  process.on('SIGTERM', () => {
    void shutdown('SIGTERM');
  });
  process.on('SIGINT', () => {
    void shutdown('SIGINT');
  });
}

start().then();
