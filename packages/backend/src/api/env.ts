import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { auditService } from '@shulkr/backend/services/audit_service';
import { readEnvContent, writeEnvContent } from '@shulkr/backend/services/env_service';
import { authenticate, assertPermissions, isMiddlewareError } from './middleware';

const s = initServer();

export const envRoutes = s.router(contract.env, {
  getContent: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:environment');

      const content = readEnvContent();
      return { status: 200 as const, body: { content } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  saveContent: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:environment');

      writeEnvContent(body.content);

      await auditService.log({
        userId: user.sub,
        username: user.username,
        action: 'update',
        resourceType: 'env',
        details: { action: 'save' },
      });

      return { status: 200 as const, body: { success: true as const } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
