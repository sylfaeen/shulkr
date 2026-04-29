import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import type { FastifyInstance } from 'fastify';
import type { AppDeps } from '@shulkr/backend/deps';
import { createAuthRoutes } from '@shulkr/backend/api/auth';
import { createUsersRoutes } from '@shulkr/backend/api/users';
import { serversRoutes } from '@shulkr/backend/api/servers';
import { filesRoutes } from '@shulkr/backend/api/files';
import { jarsRoutes } from '@shulkr/backend/api/jars';
import { pluginsRoutes } from '@shulkr/backend/api/plugins';
import { tasksRoutes } from '@shulkr/backend/api/tasks';
import { settingsRoutes } from '@shulkr/backend/api/settings';
import { javaRoutes } from '@shulkr/backend/api/java';
import { firewallRoutes } from '@shulkr/backend/api/firewall';
import { globalIpBansRoutes } from '@shulkr/backend/api/global_ip_bans';
import { createOnboardingRoutes } from '@shulkr/backend/api/onboarding';
import { createTotpRoutes } from '@shulkr/backend/api/totp';
import { createAuditRoutes } from '@shulkr/backend/api/audit';
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
import { createAnalyticsRoutes } from '@shulkr/backend/api/analytics';
import { playerProfileRoutes } from '@shulkr/backend/api/player_profile';
import { consoleRoutes } from '@shulkr/backend/api/console';
import { cloudDestinationsRoutes } from '@shulkr/backend/api/cloud_destinations';
import { wizardRoutes } from '@shulkr/backend/api/wizard';
import { agentsRoutes } from '@shulkr/backend/api/agents';

const s = initServer();

export function createApiRouter(deps: AppDeps) {
  return s.router(contract, {
    auth: createAuthRoutes(deps),
    users: createUsersRoutes(deps),
    servers: serversRoutes,
    files: filesRoutes,
    jars: jarsRoutes,
    plugins: pluginsRoutes,
    tasks: tasksRoutes,
    settings: settingsRoutes,
    java: javaRoutes,
    firewall: firewallRoutes,
    globalIpBans: globalIpBansRoutes,
    onboarding: createOnboardingRoutes(deps),
    totp: createTotpRoutes(deps),
    audit: createAuditRoutes(deps),
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
    // Migrated to function-injection in story 58.5.
    analytics: createAnalyticsRoutes(deps),
    playerProfile: playerProfileRoutes,
    console: consoleRoutes,
    cloudDestinations: cloudDestinationsRoutes,
    wizard: wizardRoutes,
    agents: agentsRoutes,
  });
}

export async function registerApiRoutes(fastify: FastifyInstance, deps: AppDeps) {
  await fastify.register(s.plugin(createApiRouter(deps)), { prefix: '' });
}
