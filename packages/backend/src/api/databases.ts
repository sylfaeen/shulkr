import { initServer } from '@ts-rest/fastify';
import { eq } from 'drizzle-orm';
import { contract, ErrorCodes } from '@shulkr/shared';
import { servers } from '@shulkr/backend/db/schema';
import {
  createServerDatabase,
  deleteServerDatabase,
  getServerDatabase,
  listServerDatabases,
  readDatabaseCredentials,
  rotateDatabasePassword,
} from '@shulkr/backend/services/database_service';
import {
  createDatabaseAccess,
  getDatabaseAccess,
  listDatabaseAccesses,
  readAccessCredentials,
  revokeDatabaseAccess,
  rotateAccessPassword,
} from '@shulkr/backend/services/database_access_service';
import { getEngineStatus } from '@shulkr/backend/services/database_engine_service';
import { databaseAccesses } from '@shulkr/backend/db/schema';
import { logAuditAction } from '@shulkr/backend/services/audit_service';
import { rateLimitCheck } from '@shulkr/backend/services/rate_limit_service';
import { authenticate, assertPermissions, isMiddlewareError } from '@shulkr/backend/api/middleware';
import { getAppDeps } from '@shulkr/backend/deps';

const s = initServer();

const notFound = { status: 404 as const, body: { code: ErrorCodes.DATABASE_NOT_FOUND, message: 'Database not found' } };

const accessNotFound = {
  status: 404 as const,
  body: { code: ErrorCodes.DATABASE_ACCESS_NOT_FOUND, message: 'Database access not found' },
};

function mapScriptError(error: unknown) {
  if (!(error instanceof Error)) return null;

  if (error.message === ErrorCodes.DATABASE_ENGINE_NOT_INSTALLED) {
    return {
      status: 503 as const,
      body: { code: error.message, message: 'The database engine is not available on this machine' },
    };
  }

  if (error.message === ErrorCodes.DATABASE_SCRIPT_FAILED) {
    return { status: 503 as const, body: { code: error.message, message: 'The database engine rejected the operation' } };
  }

  if (error.message === ErrorCodes.DATABASE_SLUG_TAKEN) {
    return { status: 409 as const, body: { code: error.message, message: 'A database with this name already exists' } };
  }

  if (error.message === ErrorCodes.DATABASE_ACCESS_IP_TAKEN) {
    return { status: 409 as const, body: { code: error.message, message: 'An identical access already exists' } };
  }

  if (error.message === ErrorCodes.DATABASE_LIMIT_REACHED) {
    return { status: 400 as const, body: { code: error.message, message: 'This server reached its database limit' } };
  }

  return null;
}

export const databasesRoutes = s.router(contract.databases, {
  engineStatus: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:databases:read');

      const deps = getAppDeps();
      const accesses = await deps.db.select({ id: databaseAccesses.id }).from(databaseAccesses).limit(1);

      return { status: 200 as const, body: await getEngineStatus(deps, accesses.length > 0) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  list: async ({ request, query }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:databases:list');

      return { status: 200 as const, body: { databases: await listServerDatabases(getAppDeps(), query.serverId) } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  create: async ({ request, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:databases:create');

      const result = await createServerDatabase(getAppDeps(), body);

      await logAuditAction(getAppDeps(), {
        userId: user.sub,
        username: user.username,
        action: 'create',
        resourceType: 'server_database',
        resourceId: body.serverId,
        details: { database: result.database.dbName },
        ip: request.ip,
      });

      return { status: 201 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;

      const mapped = mapScriptError(error);
      if (mapped) return mapped;

      throw error;
    }
  },

  credentials: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:databases:reveal');

      const deps = getAppDeps();

      // Tighter than the general API ceiling. Without it the audit log faithfully records someone extracting every password in a loop, without slowing it down.
      rateLimitCheck(deps, `user:${user.sub}:databases.reveal`, 10, 60_000);

      const row = await getServerDatabase(deps, params.id);
      if (!row) return notFound;

      // The reveal is journalled rather than prevented: the password also lives in plaintext inside the plugin config, so traceability is the control that matters.
      await logAuditAction(deps, {
        userId: user.sub,
        username: user.username,
        action: 'reveal',
        resourceType: 'server_database',
        resourceId: row.server_id,
        details: { database: row.db_name },
        ip: request.ip,
      });

      return { status: 200 as const, body: readDatabaseCredentials(deps, row) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  rotate: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:databases:rotate');

      const deps = getAppDeps();
      const row = await getServerDatabase(deps, params.id);
      if (!row) return notFound;

      const credentials = await rotateDatabasePassword(deps, row);

      await logAuditAction(deps, {
        userId: user.sub,
        username: user.username,
        action: 'rotate',
        resourceType: 'server_database',
        resourceId: row.server_id,
        details: { database: row.db_name },
        ip: request.ip,
      });

      return { status: 200 as const, body: credentials };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;

      const mapped = mapScriptError(error);
      if (mapped) return mapped;

      throw error;
    }
  },

  remove: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:databases:delete');

      const deps = getAppDeps();
      const row = await getServerDatabase(deps, params.id);
      if (!row) return notFound;

      // Typing the full name is the guard against a one-click deletion of a plugin's production data.
      if (body.confirmation !== row.db_name) {
        return {
          status: 400 as const,
          body: { code: ErrorCodes.DATABASE_CONFIRMATION_MISMATCH, message: 'Confirmation does not match the database name' },
        };
      }

      await deleteServerDatabase(deps, row);

      await logAuditAction(deps, {
        userId: user.sub,
        username: user.username,
        action: 'delete',
        resourceType: 'server_database',
        resourceId: row.server_id,
        details: { database: row.db_name },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Database deleted' } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;

      const mapped = mapScriptError(error);
      if (mapped) return mapped;

      throw error;
    }
  },

  listAccesses: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:databases:access');

      const deps = getAppDeps();
      const row = await getServerDatabase(deps, params.id);
      if (!row) return notFound;

      return { status: 200 as const, body: { accesses: await listDatabaseAccesses(deps, row.id) } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  createAccess: async ({ request, params, body }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:databases:access');

      const deps = getAppDeps();
      const row = await getServerDatabase(deps, params.id);
      if (!row) return notFound;

      const [server] = await deps.db
        .select({ db_prefix: servers.db_prefix })
        .from(servers)
        .where(eq(servers.id, row.server_id))
        .limit(1);

      if (!server?.db_prefix) return notFound;

      const result = await createDatabaseAccess(deps, row, server.db_prefix, body);

      await logAuditAction(deps, {
        userId: user.sub,
        username: user.username,
        action: 'create',
        resourceType: 'database_access',
        resourceId: row.server_id,
        details: { database: row.db_name, label: body.label, scope: body.scope, allowedIp: body.allowedIp },
        ip: request.ip,
      });

      return { status: 201 as const, body: result };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;

      const mapped = mapScriptError(error);
      if (mapped) return mapped;

      throw error;
    }
  },

  accessCredentials: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:databases:reveal');

      const deps = getAppDeps();
      rateLimitCheck(deps, `user:${user.sub}:databases.reveal`, 10, 60_000);

      const row = await getServerDatabase(deps, params.id);
      if (!row) return notFound;

      const access = await getDatabaseAccess(deps, params.accessId);
      if (!access || access.database_id !== row.id) return accessNotFound;

      await logAuditAction(deps, {
        userId: user.sub,
        username: user.username,
        action: 'reveal',
        resourceType: 'database_access',
        resourceId: row.server_id,
        details: { database: row.db_name, label: access.label },
        ip: request.ip,
      });

      return { status: 200 as const, body: readAccessCredentials(deps, access, row.db_name) };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  rotateAccess: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:databases:access');

      const deps = getAppDeps();
      const row = await getServerDatabase(deps, params.id);
      if (!row) return notFound;

      const access = await getDatabaseAccess(deps, params.accessId);
      if (!access || access.database_id !== row.id) return accessNotFound;

      const credentials = await rotateAccessPassword(deps, access, row.db_name);

      await logAuditAction(deps, {
        userId: user.sub,
        username: user.username,
        action: 'rotate',
        resourceType: 'database_access',
        resourceId: row.server_id,
        details: { database: row.db_name, label: access.label },
        ip: request.ip,
      });

      return { status: 200 as const, body: credentials };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;

      const mapped = mapScriptError(error);
      if (mapped) return mapped;

      throw error;
    }
  },

  revokeAccess: async ({ request, params }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'server:databases:access');

      const deps = getAppDeps();
      const row = await getServerDatabase(deps, params.id);
      if (!row) return notFound;

      const access = await getDatabaseAccess(deps, params.accessId);
      if (!access || access.database_id !== row.id) return accessNotFound;

      const result = await revokeDatabaseAccess(deps, access);

      await logAuditAction(deps, {
        userId: user.sub,
        username: user.username,
        action: 'delete',
        resourceType: 'database_access',
        resourceId: row.server_id,
        details: { database: row.db_name, label: access.label, allowedIp: access.allowed_ip },
        ip: request.ip,
      });

      return { status: 200 as const, body: { message: 'Access revoked', engineRestarted: result.engineRestarted } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;

      const mapped = mapScriptError(error);
      if (mapped) return mapped;

      throw error;
    }
  },
});
