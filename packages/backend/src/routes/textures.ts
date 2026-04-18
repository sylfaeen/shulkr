import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { minecraftTextureService } from '@shulkr/backend/services/minecraft_texture_service';

const ID_REGEX = /^[a-z0-9_]+$/;

export async function textureRoute(fastify: FastifyInstance) {
  fastify.get('/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const { id } = request.params;
    if (!ID_REGEX.test(id)) {
      return reply.status(400).send({ message: 'Invalid texture ID' });
    }

    const buffer = await minecraftTextureService.getTexture(id);
    if (!buffer) {
      return reply.status(404).send({ message: 'Texture not found' });
    }

    return reply.header('Content-Type', 'image/png').header('Cache-Control', 'public, max-age=86400').send(buffer);
  });
}
