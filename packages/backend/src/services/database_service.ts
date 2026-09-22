import { eq, and, count } from 'drizzle-orm';
import { ErrorCodes } from '@shulkr/shared';
import type { CreateDatabaseRequest, DatabaseCredentials, ServerDatabaseResponse } from '@shulkr/shared';
import { serverDatabases, databaseAccesses, servers, type ServerDatabaseRow } from '@shulkr/backend/db/schema';
import { cipherEncrypt, cipherDecrypt } from '@shulkr/backend/services/encryption_service';
import {
  DATABASE_HOST_LOCAL,
  DATABASE_PORT,
  assertEngineAvailable,
  buildDatabaseName,
  buildDatabaseUser,
  generateDatabasePassword,
  generateDatabasePrefix,
  readDatabaseUsage,
  runDatabaseScript,
} from '@shulkr/backend/services/database_engine_service';
import type { AppDeps } from '@shulkr/backend/deps';

type Deps = Pick<AppDeps, 'db' | 'shell' | 'fs' | 'clock' | 'encryption' | 'config'>;

function formatDatabase(row: ServerDatabaseRow, sizeBytes: number | null, accessCount: number): ServerDatabaseResponse {
  return {
    id: row.id,
    serverId: row.server_id,
    slug: row.slug,
    dbName: row.db_name,
    dbUser: row.db_user,
    host: DATABASE_HOST_LOCAL,
    port: DATABASE_PORT,
    sizeBytes,
    accessCount,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// The prefix is what keeps two servers from ever reaching each other's databases, even when they use the same slug. It is minted once per server, on its first database.
async function resolveServerPrefix(deps: Deps, serverId: string): Promise<string> {
  const [server] = await deps.db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
  if (!server) throw new Error(ErrorCodes.SERVER_NOT_FOUND);
  if (server.db_prefix) return server.db_prefix;

  for (let attempt = 0; attempt < 5; attempt++) {
    const candidate = generateDatabasePrefix();
    const [taken] = await deps.db.select({ id: servers.id }).from(servers).where(eq(servers.db_prefix, candidate)).limit(1);
    if (taken) continue;

    await deps.db.update(servers).set({ db_prefix: candidate }).where(eq(servers.id, serverId));

    return candidate;
  }

  throw new Error(ErrorCodes.DATABASE_SCRIPT_FAILED);
}

export async function listServerDatabases(deps: Deps, serverId: string): Promise<Array<ServerDatabaseResponse>> {
  const rows = await deps.db.select().from(serverDatabases).where(eq(serverDatabases.server_id, serverId));
  if (rows.length === 0) return [];

  const usage = await readDatabaseUsage(deps);

  const accessCounts = await deps.db
    .select({ databaseId: databaseAccesses.database_id, total: count() })
    .from(databaseAccesses)
    .groupBy(databaseAccesses.database_id);

  const countByDatabase = new Map(accessCounts.map((entry) => [entry.databaseId, entry.total]));

  return rows.map((row) => formatDatabase(row, usage.sizes.get(row.db_name) ?? null, countByDatabase.get(row.id) ?? 0));
}

export async function getServerDatabase(deps: Deps, databaseId: number): Promise<ServerDatabaseRow | null> {
  const [row] = await deps.db.select().from(serverDatabases).where(eq(serverDatabases.id, databaseId)).limit(1);

  return row ?? null;
}

export async function createServerDatabase(
  deps: Deps,
  input: CreateDatabaseRequest
): Promise<{ database: ServerDatabaseResponse; credentials: DatabaseCredentials }> {
  await assertEngineAvailable(deps);

  const [duplicate] = await deps.db
    .select({ id: serverDatabases.id })
    .from(serverDatabases)
    .where(and(eq(serverDatabases.server_id, input.serverId), eq(serverDatabases.slug, input.slug)))
    .limit(1);

  if (duplicate) throw new Error(ErrorCodes.DATABASE_SLUG_TAKEN);

  const [existing] = await deps.db
    .select({ total: count() })
    .from(serverDatabases)
    .where(eq(serverDatabases.server_id, input.serverId));

  if ((existing?.total ?? 0) >= deps.config.MAX_DATABASES_PER_SERVER) throw new Error(ErrorCodes.DATABASE_LIMIT_REACHED);

  const prefix = await resolveServerPrefix(deps, input.serverId);
  const dbName = buildDatabaseName(prefix, input.slug);
  const dbUser = buildDatabaseUser(prefix, input.slug);
  const password = generateDatabasePassword();

  const outcome = await runDatabaseScript(deps, ['create-db', dbName, dbUser], password);
  if (!outcome.success) throw new Error(ErrorCodes.DATABASE_SCRIPT_FAILED);

  const now = deps.clock().toISOString();

  try {
    const [row] = await deps.db
      .insert(serverDatabases)
      .values({
        server_id: input.serverId,
        slug: input.slug,
        db_name: dbName,
        db_user: dbUser,
        password_encrypted: cipherEncrypt(deps, password),
        created_at: now,
        updated_at: now,
      })
      .returning();

    return {
      database: formatDatabase(row, 0, 0),
      credentials: { host: DATABASE_HOST_LOCAL, port: DATABASE_PORT, dbName, username: dbUser, password },
    };
  } catch (error) {
    // The MariaDB database exists but no row references it. Left as is, it would be invisible in the panel and impossible to remove without SSH.
    await runDatabaseScript(deps, ['drop-db', dbName]);
    throw error;
  }
}

export function readDatabaseCredentials(deps: Deps, row: ServerDatabaseRow): DatabaseCredentials {
  return {
    host: DATABASE_HOST_LOCAL,
    port: DATABASE_PORT,
    dbName: row.db_name,
    username: row.db_user,
    password: cipherDecrypt(deps, row.password_encrypted),
  };
}

export async function rotateDatabasePassword(deps: Deps, row: ServerDatabaseRow): Promise<DatabaseCredentials> {
  await assertEngineAvailable(deps);

  const password = generateDatabasePassword();
  const outcome = await runDatabaseScript(deps, ['rotate-password', row.db_user, DATABASE_HOST_LOCAL], password);
  if (!outcome.success) throw new Error(ErrorCodes.DATABASE_SCRIPT_FAILED);

  await deps.db
    .update(serverDatabases)
    .set({ password_encrypted: cipherEncrypt(deps, password), updated_at: deps.clock().toISOString() })
    .where(eq(serverDatabases.id, row.id));

  return { host: DATABASE_HOST_LOCAL, port: DATABASE_PORT, dbName: row.db_name, username: row.db_user, password };
}

// drop-db dumps the database as root before removing it, and drops every user that held privileges on it, so the accesses are cleaned up by the same call.
export async function deleteServerDatabase(deps: Deps, row: ServerDatabaseRow): Promise<void> {
  await assertEngineAvailable(deps);

  const outcome = await runDatabaseScript(deps, ['drop-db', row.db_name]);
  if (!outcome.success) throw new Error(ErrorCodes.DATABASE_SCRIPT_FAILED);

  await deps.db.delete(serverDatabases).where(eq(serverDatabases.id, row.id));
}

// Called before a server is removed. The SQLite cascade only deletes rows: without this, the MariaDB databases would survive with nothing pointing at them.
export async function deleteDatabasesForServer(deps: Deps, serverId: string): Promise<void> {
  const rows = await deps.db.select().from(serverDatabases).where(eq(serverDatabases.server_id, serverId));

  for (const row of rows) {
    const outcome = await runDatabaseScript(deps, ['drop-db', row.db_name]);
    if (!outcome.success) throw new Error(ErrorCodes.DATABASE_SCRIPT_FAILED);
  }

  await deps.db.delete(serverDatabases).where(eq(serverDatabases.server_id, serverId));
}
