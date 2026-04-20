import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { avatarService } from '@shulkr/backend/services/avatar_service';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MIN_SIZE = 8;
const MAX_SIZE = 512;
const DEFAULT_SIZE = 64;

export async function avatarRoute(fastify: FastifyInstance) {
  fastify.get(
    '/:uuid/avatar',
    async (
      request: FastifyRequest<{
        Params: { uuid: string };
        Querystring: { size?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { uuid } = request.params;
      if (!UUID_REGEX.test(uuid)) {
        return reply.status(400).send({ message: 'Invalid UUID format' });
      }
      const rawSize = Number(request.query.size) || DEFAULT_SIZE;
      const size = Math.max(MIN_SIZE, Math.min(MAX_SIZE, rawSize));
      const buffer = await avatarService.getAvatar(uuid, size);
      return reply.header('Content-Type', 'image/png').header('Cache-Control', 'public, max-age=3600').send(buffer);
    }
  );
}
