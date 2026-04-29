import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { getInstalledJavaVersions } from '@shulkr/backend/services/java_service';
import { authenticate, assertPermissions, isMiddlewareError } from '@shulkr/backend/api/middleware';
import { getAppDeps } from '@shulkr/backend/deps';

const s = initServer();

export const javaRoutes = s.router(contract.java, {
  getInstalledVersions: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:jvm:read');
      const result = await getInstalledJavaVersions(getAppDeps());
      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
