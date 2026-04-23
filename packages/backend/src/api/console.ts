import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { commandSuggestionService } from '@shulkr/backend/services/command_suggestion_service';
import { authenticate, assertPermissions, isMiddlewareError } from '@shulkr/backend/api/middleware';

const s = initServer();

export const consoleRoutes = s.router(contract.console, {
  suggestions: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:console:input');
      const suggestions = await commandSuggestionService.getSuggestions(user.sub, params.serverId, query.q);
      return { status: 200 as const, body: suggestions };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  history: async ({ request, params, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:console:input');
      const history = await commandSuggestionService.getHistory(user.sub, params.serverId, query.q ?? '');
      return { status: 200 as const, body: history };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
