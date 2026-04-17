import { initContract } from '@ts-rest/core';
import { authContract } from '@shulkr/shared/contract/auth';
import { usersContract } from '@shulkr/shared/contract/users';
import { serversContract } from '@shulkr/shared/contract/servers';
import { filesContract } from '@shulkr/shared/contract/files';
import { jarsContract } from '@shulkr/shared/contract/jars';
import { pluginsContract } from '@shulkr/shared/contract/plugins';
import { tasksContract } from '@shulkr/shared/contract/tasks';
import { settingsContract } from '@shulkr/shared/contract/settings';
import { javaContract } from '@shulkr/shared/contract/java';
import { firewallContract } from '@shulkr/shared/contract/firewall';
import { onboardingContract } from '@shulkr/shared/contract/onboarding';
import { totpContract } from '@shulkr/shared/contract/totp';
import { auditContract } from '@shulkr/shared/contract/audit';
import { envContract } from '@shulkr/shared/contract/env';
import { domainsContract } from '@shulkr/shared/contract/domains';
import { sftpContract } from '@shulkr/shared/contract/sftp';
import { logsContract } from '@shulkr/shared/contract/logs';
import { metricsContract } from '@shulkr/shared/contract/metrics';
import { playersContract } from '@shulkr/shared/contract/players';
import { marketplaceContract } from '@shulkr/shared/contract/marketplace';
import { webhooksContract } from '@shulkr/shared/contract/webhooks';
import { alertsContract } from '@shulkr/shared/contract/alerts';
import { notificationsContract } from '@shulkr/shared/contract/notifications';
import { analyticsContract } from '@shulkr/shared/contract/analytics';
import { playerProfileContract } from '@shulkr/shared/contract/player_profile';
import { consoleContract } from '@shulkr/shared/contract/console';

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
  webhooks: webhooksContract,
  alerts: alertsContract,
  notifications: notificationsContract,
  analytics: analyticsContract,
  playerProfile: playerProfileContract,
  console: consoleContract,
});
