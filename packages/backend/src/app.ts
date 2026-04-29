import Fastify, { type FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import websocket from '@fastify/websocket';
import multipart from '@fastify/multipart';
import authPlugin from '@shulkr/backend/plugins/auth';
import assertPermissionPlugin from '@shulkr/backend/plugins/assert-permission';
import rateLimitPlugin from '@shulkr/backend/plugins/rate_limit';
import cookiePlugin from '@shulkr/backend/plugins/cookie';
import { registerRoutes } from '@shulkr/backend/routes';
import { registerWebSocketRoutes } from '@shulkr/backend/routes/websocket';
import { registerApiRoutes } from '@shulkr/backend/api';
import { setAppDeps, type AppDeps } from '@shulkr/backend/deps';

/**
 * Builds a fully-wired Fastify instance from an AppDeps container.
 * Used both by the production entry point (index.ts) and by createTestApp()
 * so that tests exercise the same stack as production.
 *
 * Out of scope (handled by the caller in index.ts):
 *  - Service initializations (taskScheduler, jobQueue, etc.)
 *  - Auto-starting servers, firewall sync
 *  - Static frontend serving + SPA fallback
 *  - Listening on a port
 */
export async function createApp(deps: AppDeps): Promise<FastifyInstance> {
  setAppDeps(deps);

  const app = Fastify({
    logger: { level: deps.config.LOG_LEVEL },
    trustProxy: deps.config.TRUST_PROXY,
  });

  app.get('/api/health', async () => ({
    status: 'ok',
    timestamp: deps.clock().toISOString(),
  }));

  if (
    deps.config.NODE_ENV !== 'test' &&
    deps.config.CORS_ORIGIN.some((o) => o.includes('https://')) &&
    !deps.config.SECURE_COOKIES
  ) {
    app.log.warn(
      'CORS_ORIGIN contains HTTPS URLs but SECURE_COOKIES is not enabled. Set SECURE_COOKIES=true in .env for secure cookie transmission.'
    );
  }

  await app.register(cors, {
    origin: deps.config.CORS_ORIGIN,
    credentials: true,
  });

  const isHttps = deps.config.SECURE_COOKIES;
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'wasm-unsafe-eval'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
        imgSrc: ["'self'", 'data:', 'https://cdn.modrinth.com', 'https://hangarcdn.papermc.io'],
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

  await app.register(cookiePlugin);
  await app.register(rateLimitPlugin);
  await app.register(authPlugin);
  await app.register(assertPermissionPlugin);
  await app.register(websocket);
  await app.register(multipart, {
    limits: {
      fileSize: 100 * 1024 * 1024, // 100MB max file size
    },
  });

  await registerRoutes(app);
  await registerWebSocketRoutes(app);
  await registerApiRoutes(app, deps);

  return app;
}
