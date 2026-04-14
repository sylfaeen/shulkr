import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import type { FastifyInstance } from 'fastify';
import { authRoutes } from '@shulkr/backend/api/auth';
import { usersRoutes } from '@shulkr/backend/api/users';
import { serversRoutes } from '@shulkr/backend/api/servers';
import { filesRoutes } from '@shulkr/backend/api/files';
import { jarsRoutes } from '@shulkr/backend/api/jars';
import { pluginsRoutes } from '@shulkr/backend/api/plugins';
import { tasksRoutes } from '@shulkr/backend/api/tasks';
import { settingsRoutes } from '@shulkr/backend/api/settings';
import { javaRoutes } from '@shulkr/backend/api/java';
import { firewallRoutes } from '@shulkr/backend/api/firewall';
import { onboardingRoutes } from '@shulkr/backend/api/onboarding';
import { totpRoutes } from '@shulkr/backend/api/totp';
import { auditRoutes } from '@shulkr/backend/api/audit';
import { envRoutes } from '@shulkr/backend/api/env';
import { domainsRoutes } from '@shulkr/backend/api/domains';
import { sftpRoutes } from '@shulkr/backend/api/sftp';
import { logsRoutes } from '@shulkr/backend/api/logs';
import { metricsRoutes } from '@shulkr/backend/api/metrics';
import { playersRoutes } from '@shulkr/backend/api/players';
import { marketplaceRoutes } from '@shulkr/backend/api/marketplace';
import { webhooksRoutes } from '@shulkr/backend/api/webhooks';
import { alertsRoutes } from '@shulkr/backend/api/alerts';
import { notificationsRoutes } from '@shulkr/backend/api/notifications';
import { analyticsRoutes } from '@shulkr/backend/api/analytics';
import { playerProfileRoutes } from '@shulkr/backend/api/player_profile';
import { sparkRoutes } from '@shulkr/backend/api/spark';
import { consoleRoutes } from '@shulkr/backend/api/console';

const s = initServer();

export const apiRouter = s.router(contract, {
  auth: authRoutes,
  users: usersRoutes,
  servers: serversRoutes,
  files: filesRoutes,
  jars: jarsRoutes,
  plugins: pluginsRoutes,
  tasks: tasksRoutes,
  settings: settingsRoutes,
  java: javaRoutes,
  firewall: firewallRoutes,
  onboarding: onboardingRoutes,
  totp: totpRoutes,
  audit: auditRoutes,
  env: envRoutes,
  domains: domainsRoutes,
  sftp: sftpRoutes,
  logs: logsRoutes,
  metrics: metricsRoutes,
  players: playersRoutes,
  marketplace: marketplaceRoutes,
  webhooks: webhooksRoutes,
  alerts: alertsRoutes,
  notifications: notificationsRoutes,
  analytics: analyticsRoutes,
  playerProfile: playerProfileRoutes,
  spark: sparkRoutes,
  console: consoleRoutes,
});

export async function registerApiRoutes(fastify: FastifyInstance) {
  await fastify.register(s.plugin(apiRouter), { prefix: '' });
}
