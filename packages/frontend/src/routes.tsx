import { createRootRoute, createRoute, createRouter, redirect, Outlet, Navigate } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AuthInitializer } from '@shulkr/frontend/features/auth_initializer';
import { AppShell } from '@shulkr/frontend/features/layouts/app_shell';
import { MainLayout } from '@shulkr/frontend/pages/app/features/layouts/main_layout';
import { ServerLayout } from '@shulkr/frontend/pages/app/features/layouts/server_layout';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
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
import { ServerSettingsPage } from '@shulkr/frontend/pages/app/servers/id/settings/settings';
import { ServerSettingsGeneralPage } from '@shulkr/frontend/pages/app/servers/id/settings/general';
import { ServerSettingsJarsPage } from '@shulkr/frontend/pages/app/servers/id/settings/jars';
import { ServerSettingsJvmPage } from '@shulkr/frontend/pages/app/servers/id/settings/jvm';
import { SettingsFirewallPage } from '@shulkr/frontend/pages/app/settings/firewall';
import { ServerSettingsDomainsPage } from '@shulkr/frontend/pages/app/servers/id/settings/domains';
import { ServerSettingsSftpPage } from '@shulkr/frontend/pages/app/servers/id/settings/sftp';
import { ServerPluginsPage } from '@shulkr/frontend/pages/app/servers/id/plugins';
import { ServerTasksPage } from '@shulkr/frontend/pages/app/servers/id/tasks';
import { ServerBackupsPage } from '@shulkr/frontend/pages/app/servers/id/backups';
import { ServerLogsPage } from '@shulkr/frontend/pages/app/servers/id/logs';
import { ServerPlayersPage } from '@shulkr/frontend/pages/app/servers/id/players';
import { NotFoundPage } from '@shulkr/frontend/pages/web/not_found';
import { SettingsEnvironmentPage } from '@shulkr/frontend/pages/app/settings/environment';
import { AccountPage } from '@shulkr/frontend/pages/app/account';
import { AppNotFoundPage } from '@shulkr/frontend/pages/app/not_found';
import { DocsLayout } from '@shulkr/frontend/pages/app/features/layouts/docs_layout';
import { MarkdownPage } from '@shulkr/frontend/pages/app/docs/markdown';
import { DEFAULT_DOC_SLUG } from '@shulkr/frontend/pages/app/docs/features/docs_content';
import { SettingsGeneralPage } from '@shulkr/frontend/pages/app/settings/general';
import { SettingsSftpPage } from '@shulkr/frontend/pages/app/settings/sftp';
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
  component: UsersPage,
});

const userEditRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'users/$id',
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
  component: SettingsGeneralPage,
});

const appSettingsEnvironmentRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'settings/environment',
  component: SettingsEnvironmentPage,
});

const appSettingsFirewallRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'settings/firewall',
  component: SettingsFirewallPage,
});

const appSettingsSftpRoute = createRoute({
  getParentRoute: () => mainLayoutRoute,
  path: 'settings/sftp',
  component: SettingsSftpPage,
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
  component: ServerConsolePage,
});

const serverFilesRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'files',
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
  component: ServerFileEditorPage,
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
  component: ServerSettingsGeneralPage,
});

const serverSettingsJarsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'settings/jars',
  component: ServerSettingsJarsPage,
});

const serverSettingsJvmRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'settings/jvm',
  component: ServerSettingsJvmPage,
});

const serverSettingsSftpRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'settings/sftp',
  component: ServerSettingsSftpPage,
});

const serverSettingsDomainsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'settings/domains',
  component: ServerSettingsDomainsPage,
});

const serverPluginsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'plugins',
  component: ServerPluginsPage,
});

const serverTasksRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'tasks',
  component: ServerTasksPage,
});

const serverBackupsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'backups',
  component: ServerBackupsPage,
});

const serverLogsRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'logs',
  component: ServerLogsPage,
});

const serverPlayersRoute = createRoute({
  getParentRoute: () => serverLayoutRoute,
  path: 'players',
  component: ServerPlayersPage,
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
      appSettingsSftpRoute,
      accountRoute,
    ]),
    docsLayoutRoute.addChildren([docsIndexRoute, docsSlugRoute]),
    serverLayoutRoute.addChildren([
      serverDashboardRoute,
      serverFilesRoute,
      serverFileEditRoute,
      serverSettingsRoute,
      serverSettingsGeneralRoute,
      serverSettingsJarsRoute,
      serverSettingsJvmRoute,
      serverSettingsSftpRoute,
      serverSettingsDomainsRoute,
      serverPluginsRoute,
      serverBackupsRoute,
      serverLogsRoute,
      serverPlayersRoute,
      serverTasksRoute,
    ]),
  ]),
]);

export const router = createRouter({ routeTree });

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router;
  }
}
