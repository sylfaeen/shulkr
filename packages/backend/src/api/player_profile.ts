import { initServer } from '@ts-rest/fastify';
import { contract, ErrorCodes } from '@shulkr/shared';
import { playerProfileService } from '@shulkr/backend/services/player_profile_service';
import { authenticate, assertPermissions, isMiddlewareError } from '@shulkr/backend/api/middleware';

const s = initServer();

export const playerProfileRoutes = s.router(contract.playerProfile, {
  profile: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:history');

      const profile = await playerProfileService.getProfile(params.serverId, params.playerName);
      if (!profile) {
        return { status: 404 as const, body: { code: ErrorCodes.PLAYER_NOT_FOUND, message: 'Player not found' } };
      }

      return { status: 200 as const, body: profile };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  sessions: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:history');

      const result = await playerProfileService.getSessions(
        params.serverId,
        params.playerName,
        query.limit ?? 50,
        query.offset ?? 0
      );

      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  moderation: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:bans');

      const result = await playerProfileService.getModeration(params.serverId, params.playerName);
      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  search: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:players:history');

      const results = await playerProfileService.search(params.serverId, query.q);
      return { status: 200 as const, body: results };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
