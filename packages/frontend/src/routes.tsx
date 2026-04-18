import { createRootRoute, createRoute, createRouter, redirect, Outlet, Navigate } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthInitializer } from '@shulkr/frontend/features/auth_initializer';
import { AppShell } from '@shulkr/frontend/features/layouts/app_shell';
import { MainLayout } from '@shulkr/frontend/pages/app/features/layouts/main_layout';
import { ServerLayout } from '@shulkr/frontend/pages/app/features/layouts/server_layout';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import { hasGroupAccess, type PermissionId } from '@shulkr/shared';
import { ToastProvider } from '@shulkr/frontend/features/ui/toast';
import { WebSocketProvider } from '@shulkr/frontend/providers/websocket_provider';
import { LoginPage } from '@shulkr/frontend/pages/web/login';
import { SetupPage } from '@shulkr/frontend/pages/web/setup';
import { UsersPage } from '@shulkr/frontend/pages/app/users/users';
import { UserEditPage } from '@shulkr/frontend/pages/app/users/edit';
import { ServersPage } from '@shulkr/frontend/pages/app/servers/servers';
import { ServerConsolePage } from '@shulkr/frontend/pages/app/servers/id/console';
import { ServerFilesPage } from '@shulkr/frontend/pages/app/servers/id/files';
import { ServerFileEditorPage } from '@shulkr/frontend/pages/app/servers/id/file_editor';
import { ServerDbViewerPage } from '@shulkr/frontend/pages/app/servers/id/db_viewer';
import { ServerSettingsPage } from '@shulkr/frontend/pages/app/servers/id/settings/settings';
import { ServerSettingsGeneralPage } from '@shulkr/frontend/pages/app/servers/id/settings/general';
import { ServerSettingsJarsPage } from '@shulkr/frontend/pages/app/servers/id/settings/jars';

import { SettingsFirewallPage } from '@shulkr/frontend/pages/app/settings/firewall';
import { ServerSettingsDomainsPage } from '@shulkr/frontend/pages/app/servers/id/settings/domains';
import { ServerSettingsSftpPage } from '@shulkr/frontend/pages/app/servers/id/settings/sftp';
import { ServerPluginsPage } from '@shulkr/frontend/pages/app/servers/id/plugins';
import { ServerTasksPage } from '@shulkr/frontend/pages/app/servers/id/tasks';
import { ServerBackupsPage } from '@shulkr/frontend/pages/app/servers/id/backups';
import { ServerLogsPage } from '@shulkr/frontend/pages/app/servers/id/logs';
import { ServerPlayersPage } from '@shulkr/frontend/pages/app/servers/id/players';
import { ServerWebhooksPage } from '@shulkr/frontend/pages/app/servers/id/settings/webhooks';
import { ServerAlertsPage } from '@shulkr/frontend/pages/app/servers/id/settings/alerts';
import { ServerAnalyticsPage } from '@shulkr/frontend/pages/app/servers/id/analytics';
import { PlayerProfilePage } from '@shulkr/frontend/pages/app/servers/id/player_profile';
import { NotFoundPage } from '@shulkr/frontend/pages/web/not_found';
import { SettingsEnvironmentPage } from '@shulkr/frontend/pages/app/settings/environment';
import { AccountPage } from '@shulkr/frontend/pages/app/account';
import { AppNotFoundPage } from '@shulkr/frontend/pages/app/not_found';
import { DocsLayout } from '@shulkr/frontend/pages/app/features/layouts/docs_layout';
import { MarkdownPage } from '@shulkr/frontend/pages/app/docs/markdown';
import { DEFAULT_DOC_SLUG } from '@shulkr/frontend/pages/app/docs/features/docs_content';
import { SettingsDatabasePage } from '@shulkr/frontend/pages/app/settings/database';
import { SettingsGeneralPage } from '@shulkr/frontend/pages/app/settings/general';
import { CloudDestinationsPage } from '@shulkr/frontend/pages/app/settings/cloud_destinations';
import { SettingsPage } from '@shulkr/frontend/pages/app/settings/settings';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: false,
      refetchOnWindowFocus: false,
    },
  },
});

// Auth guard: redirect to log in if not authenticated
function requireAuth() {
  const { isAuthenticated, isInitialized } = useAuthStore.getState();

  if (!isInitialized) {
    return;
  }

  if (!isAuthenticated) {
    throw redirect({ to: '/' });
  }
}

// Permission guard: redirect to /app/servers if user lacks required permission
function requirePermission(...required: Array<PermissionId>) {
  return () => {
    const { user } = useAuthStore.getState();
    if (!user) return;
    if (!hasGroupAccess(user.permissions, ...required)) {
      throw redirect({ to: '/app/servers' });
    }
  };
}

// Redirect to /app if already authenticated
function redirectIfAuthenticated() {
  const { isAuthenticated, isInitialized } = useAuthStore.getState();

  if (!isInitialized) {
    return;
  }

  if (isAuthenticated) {
    throw redirect({ to: '/app' });
  }
}

// Protected shell - wraps all authenticated pages with AppShell
function ProtectedShell() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const isInitialized = useAuthStore((state) => state.isInitialized);

  if (isInitialized && !isAuthenticated) {
    return <Navigate to={'/'} />;
  }

  return (
    <WebSocketProvider>
      <AppShell>
        <Outlet />
      </AppShell>
    </WebSocketProvider>
  );
}

function RootComponent() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <AuthInitializer>
          <Outlet />
        </AuthInitializer>
      </ToastProvider>
    </QueryClientProvider>
  );
}

const rootRoute = createRootRoute({
  component: RootComponent,
  notFoundComponent: NotFoundPage,
});

const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/',
  beforeLoad: redirectIfAuthenticated,
  component: LoginPage,
});

const setupRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/setup',
  component: SetupPage,
});

// App shell route - contains header, child layouts provide navigation
const appRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: '/app',
  beforeLoad: requireAuth,
  component: ProtectedShell,
  notFoundComponent: AppNotFoundPage,
});

const mainLayoutRoute = createRoute({
  getParentRoute: () => appRoute,
  id: 'main',
  component: MainLayout,
});

const dashboardRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/app/servers' });
  },
});

const serversRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'servers',
  component: ServersPage,
});

const usersRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'users',
  beforeLoad: requirePermission('users:manage'),
  component: UsersPage,
});

const userEditRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'users/$id',
  beforeLoad: requirePermission('users:manage'),
  component: UserEditPage,
});

const appSettingsRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'settings',
  component: SettingsPage,
});

const appSettingsGeneralRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'settings/general',
  beforeLoad: requirePermission('settings:general'),
  component: SettingsGeneralPage,
});

const appSettingsEnvironmentRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'settings/environment',
  beforeLoad: requirePermission('settings:environment'),
  component: SettingsEnvironmentPage,
});

const appSettingsFirewallRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'settings/firewall',
  beforeLoad: requirePermission('settings:firewall'),
  component: SettingsFirewallPage,
});

const appSettingsDatabaseRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'settings/database',
  beforeLoad: requirePermission('settings:general'),
  component: SettingsDatabasePage,
});

const appSettingsCloudDestinationsRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'settings/cloud-destinations',
  beforeLoad: requirePermission('settings:cloud-destinations'),
  component: CloudDestinationsPage,
});

const accountRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'account',
  component: AccountPage,
});

const docsLayoutRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'docs',
  component: DocsLayout,
});

const docsIndexRoute = createRoute({
  getParentRoute: () => docsLayoutRoute,
  path: '/',
  beforeLoad: () => {
    throw redirect({ to: '/app/docs/$slug', params: { slug: DEFAULT_DOC_SLUG } });
  },
});

const docsSlugRoute = createRoute({
  getParentRoute: () => docsLayoutRoute,
  path: '$slug',
  component: MarkdownPage,
});

const serverLayoutRoute = createRoute({
  getParentRoute: () => appRoute,
  path: 'servers/$id',
  component: ServerLayout,
});

const serverDashboardRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: '/',
  beforeLoad: requirePermission('server:console', 'server:power'),
  component: ServerConsolePage,
});

const serverFilesRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'files',
  beforeLoad: requirePermission('server:files:read', 'server:files:write'),
  component: ServerFilesPage,
  validateSearch: (search: Record<string, unknown>): { path?: string } => {
    return {
      path: typeof search.path === 'string' ? search.path : undefined,
    };
  },
});

const serverFileEditRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'files/edit',
  beforeLoad: requirePermission('server:files:write'),
  component: ServerFileEditorPage,
  validateSearch: (search: Record<string, unknown>): { path?: string } => {
    return {
      path: typeof search.path === 'string' ? search.path : undefined,
    };
  },
});

const serverDbViewerRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'files/db',
  beforeLoad: requirePermission('server:files:read'),
  component: ServerDbViewerPage,
  validateSearch: (search: Record<string, unknown>): { path?: string } => {
    return {
      path: typeof search.path === 'string' ? search.path : undefined,
    };
  },
});

const serverSettingsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'settings',
  component: ServerSettingsPage,
});

const serverSettingsGeneralRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'settings/general',
  beforeLoad: requirePermission('server:general'),
  component: ServerSettingsGeneralPage,
});

const serverSettingsJarsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'settings/jars',
  beforeLoad: requirePermission('server:jars'),
  component: ServerSettingsJarsPage,
});

const serverSettingsSftpRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'settings/sftp',
  beforeLoad: requirePermission('server:sftp'),
  component: ServerSettingsSftpPage,
});

const serverSettingsDomainsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'settings/domains',
  beforeLoad: requirePermission('server:domains'),
  component: ServerSettingsDomainsPage,
});

const serverPluginsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'plugins',
  beforeLoad: requirePermission('server:plugins'),
  component: ServerPluginsPage,
});

const serverTasksRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'tasks',
  beforeLoad: requirePermission('server:tasks'),
  component: ServerTasksPage,
});

const serverBackupsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'backups',
  beforeLoad: requirePermission('server:backups'),
  component: ServerBackupsPage,
});

const serverLogsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'logs',
  beforeLoad: requirePermission('server:files:read'),
  component: ServerLogsPage,
});

const serverPlayersRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'players',
  beforeLoad: requirePermission('server:players'),
  component: ServerPlayersPage,
});

const serverSettingsWebhooksRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'settings/webhooks',
  beforeLoad: requirePermission('server:webhooks'),
  component: ServerWebhooksPage,
});

const serverSettingsAlertsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'settings/alerts',
  beforeLoad: requirePermission('server:alerts'),
  component: ServerAlertsPage,
});

const serverAnalyticsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'analytics',
  beforeLoad: requirePermission('server:players'),
  component: ServerAnalyticsPage,
});

const serverPlayerProfileRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'players/$playerName',
  beforeLoad: requirePermission('server:players'),
  component: PlayerProfilePage,
});

const routeTree = rootRoute.addChildren([
  loginRoute,
  setupRoute,
  appRoute.addChildren([
    mainLayoutRoute.addChildren([
      dashboardRoute,
      serversRoute,
      usersRoute,
      userEditRoute,
      appSettingsRoute,
      appSettingsGeneralRoute,
      appSettingsEnvironmentRoute,
      appSettingsFirewallRoute,
      appSettingsDatabaseRoute,
      appSettingsCloudDestinationsRoute,
      accountRoute,
    ]),
    docsLayoutRoute.addChildren([docsIndexRoute, docsSlugRoute]),
    serverLayoutRoute.addChildren([
      serverDashboardRoute,
      serverFilesRoute,
      serverFileEditRoute,
      serverDbViewerRoute,
      serverSettingsRoute,
      serverSettingsGeneralRoute,
      serverSettingsJarsRoute,

      serverSettingsSftpRoute,
      serverSettingsDomainsRoute,
      serverPluginsRoute,
      serverBackupsRoute,
      serverLogsRoute,
      serverPlayersRoute,
      serverTasksRoute,
      serverSettingsWebhooksRoute,
      serverSettingsAlertsRoute,
      serverAnalyticsRoute,
      serverPlayerProfileRoute,
    ]),
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
