import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { db } from '@shulkr/backend/db';
import { servers } from '@shulkr/backend/db/schema';
import { authenticate, assertPermissions, isMiddlewareError } from '@shulkr/backend/api/middleware';
import {
  getHostRamMb,
  getRecommendedMaxRamMb,
  getSizePresets,
  MC_SETTINGS_BY_TYPE,
} from '@shulkr/backend/services/wizard_presets';
import { provisionFirstServer } from '@shulkr/backend/services/first_server_provisioning';

const s = initServer();

export const wizardRoutes = s.router(contract.wizard, {
  getPresets: async ({ request }) => {
    try {
      await authenticate(request);
      return {
        status: 200 as const,
        body: {
          hostRamMb: getHostRamMb(),
          recommendedMaxRamMb: getRecommendedMaxRamMb(),
          sizes: getSizePresets(),
          mcSettingsByType: MC_SETTINGS_BY_TYPE,
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  createFirstServer: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'servers:create');

      const existing = await db.select({ id: servers.id }).from(servers).limit(1);
      if (existing.length > 0) {
        return {
          status: 409 as const,
          body: { code: 'SERVERS_ALREADY_EXIST', message: 'This wizard only runs on empty instances' },
        };
      }

      const result = await provisionFirstServer(body);
      return { status: 201 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
