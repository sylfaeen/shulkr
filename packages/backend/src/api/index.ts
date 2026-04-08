import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import type { FastifyInstance } from 'fastify';
import { authRoutes } from './auth';
import { usersRoutes } from './users';
import { serversRoutes } from './servers';
import { filesRoutes } from './files';
import { jarsRoutes } from './jars';
import { pluginsRoutes } from './plugins';
import { tasksRoutes } from './tasks';
import { settingsRoutes } from './settings';
import { javaRoutes } from './java';
import { firewallRoutes } from './firewall';
import { onboardingRoutes } from './onboarding';
import { totpRoutes } from './totp';
import { auditRoutes } from './audit';
import { envRoutes } from './env';
import { domainsRoutes } from './domains';
import { sftpRoutes } from './sftp';
import { logsRoutes } from './logs';
import { metricsRoutes } from './metrics';
import { serverConfigRoutes } from './server_config';

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
  serverConfig: serverConfigRoutes,
});

export async function registerApiRoutes(fastify: FastifyInstance) {
  await fastify.register(s.plugin(apiRouter), { prefix: '' });
}
