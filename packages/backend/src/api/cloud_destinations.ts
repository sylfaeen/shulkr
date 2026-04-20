import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { eq } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { cloudDestinations, backupMetadata, type CloudDestinationRow } from '@shulkr/backend/db/schema';
import { authenticate, assertPermissions, isMiddlewareError } from '@shulkr/backend/api/middleware';
import { encryptSecret, decryptSecret } from '@shulkr/backend/services/encryption_service';
import { testConnection, type CloudDestinationCredentials } from '@shulkr/backend/services/cloud_storage_service';

const s = initServer();

function serializeDestination(row: CloudDestinationRow) {
  return {
    id: row.id,
    name: row.name,
    provider: row.provider,
    endpoint: row.endpoint,
    region: row.region,
    bucket: row.bucket,
    accessKeyId: row.access_key_id,
    prefix: row.prefix,
    enabled: row.enabled,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function rowToCredentials(row: CloudDestinationRow): CloudDestinationCredentials {
  return {
    provider: row.provider,
    endpoint: row.endpoint,
    region: row.region,
    bucket: row.bucket,
    accessKeyId: row.access_key_id,
    secretAccessKey: decryptSecret(row.secret_access_key_encrypted),
    prefix: row.prefix,
  };
}

export const cloudDestinationsRoutes = s.router(contract.cloudDestinations, {
  list: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:cloud-destinations:list');
      const rows = await db.select().from(cloudDestinations);
      return { status: 200 as const, body: { destinations: rows.map(serializeDestination) } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  get: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:cloud-destinations:list');
      const [row] = await db.select().from(cloudDestinations).where(eq(cloudDestinations.id, params.id)).limit(1);
      if (!row) return { status: 404 as const, body: { code: 'NOT_FOUND', message: 'Destination not found' } };
      return { status: 200 as const, body: serializeDestination(row) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  create: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:cloud-destinations:create');
      const [row] = await db
        .insert(cloudDestinations)
        .values({
          name: body.name,
          provider: body.provider,
          endpoint: body.endpoint,
          region: body.region,
          bucket: body.bucket,
          access_key_id: body.accessKeyId,
          secret_access_key_encrypted: encryptSecret(body.secretAccessKey),
          prefix: body.prefix ?? '',
        })
        .returning();
      return { status: 201 as const, body: serializeDestination(row) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  update: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:cloud-destinations:update');
      const [existing] = await db.select().from(cloudDestinations).where(eq(cloudDestinations.id, params.id)).limit(1);
      if (!existing) return { status: 404 as const, body: { code: 'NOT_FOUND', message: 'Destination not found' } };
      const updateData: Record<string, unknown> = { updated_at: new Date().toISOString() };
      if (body.name !== undefined) updateData.name = body.name;
      if (body.endpoint !== undefined) updateData.endpoint = body.endpoint;
      if (body.region !== undefined) updateData.region = body.region;
      if (body.bucket !== undefined) updateData.bucket = body.bucket;
      if (body.accessKeyId !== undefined) updateData.access_key_id = body.accessKeyId;
      if (body.secretAccessKey !== undefined) updateData.secret_access_key_encrypted = encryptSecret(body.secretAccessKey);
      if (body.prefix !== undefined) updateData.prefix = body.prefix;
      if (body.enabled !== undefined) updateData.enabled = body.enabled;
      const [row] = await db.update(cloudDestinations).set(updateData).where(eq(cloudDestinations.id, params.id)).returning();
      return { status: 200 as const, body: serializeDestination(row) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  delete: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:cloud-destinations:delete');
      const [existing] = await db.select().from(cloudDestinations).where(eq(cloudDestinations.id, params.id)).limit(1);
      if (!existing) return { status: 404 as const, body: { code: 'NOT_FOUND', message: 'Destination not found' } };
      const usedBy = await db.select().from(backupMetadata).where(eq(backupMetadata.cloud_destination_id, params.id)).limit(1);
      if (usedBy.length > 0) {
        return {
          status: 409 as const,
          body: { code: 'IN_USE', message: 'Destination has cloud backups — delete them first or disable the destination' },
        };
      }
      await db.delete(cloudDestinations).where(eq(cloudDestinations.id, params.id));
      return { status: 200 as const, body: { message: 'Destination deleted' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
  test: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:cloud-destinations:test');
      const result = await testConnection({
        provider: body.provider,
        endpoint: body.endpoint,
        region: body.region,
        bucket: body.bucket,
        accessKeyId: body.accessKeyId,
        secretAccessKey: body.secretAccessKey,
        prefix: body.prefix ?? '',
      });
      return { status: 200 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
