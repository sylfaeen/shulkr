import './env';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import Fastify from 'fastify';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import fastifyStatic from '@fastify/static';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import { initializeDatabase } from '@shulkr/backend/db/migrate';
import authPlugin from '@shulkr/backend/plugins/auth';
import assertPermissionPlugin from '@shulkr/backend/plugins/assert-permission';
import rateLimitPlugin from '@shulkr/backend/plugins/rate_limit';
import cookiePlugin from '@shulkr/backend/plugins/cookie';
import { registerRoutes } from '@shulkr/backend/routes';
import { registerWebSocketRoutes } from '@shulkr/backend/routes/websocket';
import { registerApiRoutes } from '@shulkr/backend/api';
import { taskScheduler } from '@shulkr/backend/services/task_scheduler';
import { jobQueueService } from '@shulkr/backend/services/job_queue_service';
import { metricsHistoryService } from '@shulkr/backend/services/metrics_history_service';
import { playerHistoryService } from '@shulkr/backend/services/player_history_service';
import { ServerService } from '@shulkr/backend/services/server_service';
import { firewallService } from '@shulkr/backend/services/firewall_service';

const fastify = Fastify({
  logger: true,
  trustProxy: true,
});

fastify.get('/api/health', async () => {
  return { status: 'ok', timestamp: new Date().toISOString() };
});

const start = async () => {
  try {
    await initializeDatabase();
    await jobQueueService.initialize();
    await taskScheduler.initialize();
    metricsHistoryService.initialize();
    playerHistoryService.initialize();

    // Warn if HTTPS origins are configured but secure cookies are disabled
    const corsOrigin = process.env.CORS_ORIGIN ?? '';
    if (corsOrigin.includes('https://') && process.env.SECURE_COOKIES !== 'true') {
      fastify.log.warn(
        'CORS_ORIGIN contains HTTPS URLs but SECURE_COOKIES is not enabled. Set SECURE_COOKIES=true in .env for secure cookie transmission.'
      );
    }

    // Auto-start servers with auto_start enabled
    const serverService = new ServerService();
    const servers = await serverService.getAllServers();
    const autoStartServers = servers.filter((s) => s.auto_start);

    if (autoStartServers.length > 0) {
      fastify.log.info(`Auto-starting ${autoStartServers.length} server(s)...`);
      for (const server of autoStartServers) {
        try {
          const result = await serverService.startServer(server.id);
          if (result.success) {
            fastify.log.info(`Auto-started server: ${server.name}`);
          } else {
            fastify.log.warn(`Failed to auto-start server ${server.name}: ${result.error}`);
          }
        } catch (err) {
          fastify.log.error(`Error auto-starting server ${server.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      }
    }

    // Sync firewall rules from database to iptables (production only)
    if (process.env.NODE_ENV === 'production') {
      const syncResult = await firewallService.syncRules();
      if (syncResult.synced > 0) {
        fastify.log.info(`Firewall: synced ${syncResult.synced}/${syncResult.total} rules to iptables`);
      }
    }

    // Register CORS
    const corsOrigins = process.env.CORS_ORIGIN
      ? process.env.CORS_ORIGIN.split(',').map((o) => o.trim())
      : ['http://localhost:3000', 'http://localhost:5173'];

    await fastify.register(cors, {
      origin: corsOrigins,
      credentials: true,
    });

    // Register security headers (only enforce HTTPS when SSL is actually configured)
    const isHttps = process.env.SECURE_COOKIES === 'true';

    await fastify.register(helmet, {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          imgSrc: ["'self'", 'data:', 'https://cdn.modrinth.com'],
          connectSrc: ["'self'", 'ws:', 'wss:'],
          fontSrc: ["'self'", 'https://fonts.gstatic.com'],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: null,
        },
      },
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: isHttps ? { policy: 'same-origin' } : false,
      originAgentCluster: isHttps,
      strictTransportSecurity: isHttps,
    });

    // Register plugins
    await fastify.register(cookiePlugin);
    await fastify.register(rateLimitPlugin);
    await fastify.register(authPlugin);
    await fastify.register(assertPermissionPlugin);
    await fastify.register(websocket);
    await fastify.register(multipart, {
      limits: {
        fileSize: 100 * 1024 * 1024, // 100MB max file size
      },
    });

    // Register REST routes (file/plugin/backup uploads)
    await registerRoutes(fastify);
    await registerWebSocketRoutes(fastify);

    // Register ts-rest API routes
    await registerApiRoutes(fastify);

    // Serve frontend static files in production
    const frontendDistPath = path.resolve(__dirname, '../../frontend/dist');
    await fastify.register(fastifyStatic, {
      root: frontendDistPath,
      prefix: '/',
    });

    // SPA fallback: serve index.html for all non-API routes
    fastify.setNotFoundHandler(async (request, reply) => {
      if (
        request.url.startsWith('/api/') ||
        request.url.startsWith('/api/') ||
        request.url.startsWith('/ws/') ||
        request.url.startsWith('/docs/')
      ) {
        return reply.status(404).send({ error: 'Not found' });
      }
      const indexPath = path.join(frontendDistPath, 'index.html');
      const content = fs.readFileSync(indexPath, 'utf-8');
      return reply.type('text/html').send(content);
    });

    await fastify.listen({ port: 3001, host: '0.0.0.0' });
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

start().then();
