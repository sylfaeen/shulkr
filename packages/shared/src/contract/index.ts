import { initContract } from '@ts-rest/core';
import { authContract } from './auth';
import { usersContract } from './users';
import { serversContract } from './servers';
import { filesContract } from './files';
import { jarsContract } from './jars';
import { pluginsContract } from './plugins';
import { tasksContract } from './tasks';
import { settingsContract } from './settings';
import { javaContract } from './java';
import { firewallContract } from './firewall';
import { onboardingContract } from './onboarding';
import { totpContract } from './totp';
import { auditContract } from './audit';
import { envContract } from './env';
import { domainsContract } from './domains';
import { sftpContract } from './sftp';
import { logsContract } from './logs';
import { metricsContract } from './metrics';
import { playersContract } from './players';
import { marketplaceContract } from './marketplace';

const c = initContract();

export const contract = c.router({
  auth: authContract,
  users: usersContract,
  servers: serversContract,
  files: filesContract,
  jars: jarsContract,
  plugins: pluginsContract,
  tasks: tasksContract,
  settings: settingsContract,
  java: javaContract,
  firewall: firewallContract,
  onboarding: onboardingContract,
  totp: totpContract,
  audit: auditContract,
  env: envContract,
  domains: domainsContract,
  sftp: sftpContract,
  logs: logsContract,
  metrics: metricsContract,
  players: playersContract,
  marketplace: marketplaceContract,
});
