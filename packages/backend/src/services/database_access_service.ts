import { eq, and, ne } from 'drizzle-orm';
import { ErrorCodes } from '@shulkr/shared';
import type { CreateDatabaseAccessRequest, DatabaseAccessCredentials, DatabaseAccessResponse } from '@shulkr/shared';
import { databaseAccesses, type DatabaseAccessRow, type ServerDatabaseRow } from '@shulkr/backend/db/schema';
import { cipherEncrypt, cipherDecrypt } from '@shulkr/backend/services/encryption_service';
import { addFirewallRule, listFirewallRules, removeFirewallRule } from '@shulkr/backend/services/firewall_service';
import {
  DATABASE_PORT,
  assertEngineAvailable,
  buildAccessUser,
  generateDatabasePassword,
  readDatabaseUsage,
  runDatabaseScript,
  setEngineBind,
} from '@shulkr/backend/services/database_engine_service';
import { getServerPublicIp } from '@shulkr/backend/services/network_service';
import type { AppDeps } from '@shulkr/backend/deps';

type Deps = Pick<AppDeps, 'db' | 'shell' | 'fs' | 'clock' | 'encryption' | 'config'>;

const CA_DOWNLOAD_PATH = '/api/databases/engine/ca';

function formatAccess(row: DatabaseAccessRow): DatabaseAccessResponse {
  return {
    id: row.id,
    databaseId: row.database_id,
    label: row.label,
    username: row.username,
    scope: row.scope,
    allowedIp: row.allowed_ip,
    requireCertificate: row.require_certificate,
    lastUsedAt: row.last_used_at,
    createdAt: row.created_at,
  };
}

function buildCredentials(row: DatabaseAccessRow, dbName: string, password: string): DatabaseAccessCredentials {
  return {
    host: getServerPublicIp(),
    port: DATABASE_PORT,
    dbName,
    username: row.username,
    password,
    scope: row.scope,
    allowedIp: row.allowed_ip,
    caCertificateUrl: CA_DOWNLOAD_PATH,
  };
}

async function countRemoteAccesses(deps: Deps): Promise<number> {
  const rows = await deps.db.select({ id: databaseAccesses.id }).from(databaseAccesses);

  return rows.length;
}

// One firewall rule per IP, shared by every access granted to that machine. Removing it while another access still uses it would silently break that access.
async function ensureFirewallRule(deps: Deps, ip: string): Promise<void> {
  const rules = await listFirewallRules(deps);
  const existing = rules.find((rule) => rule.port === String(DATABASE_PORT) && rule.from_ip === ip);
  if (existing) return;

  await addFirewallRule(deps, {
    action: 'allow',
    port: String(DATABASE_PORT),
    protocol: 'tcp',
    from_ip: ip,
    label: `Database access (${ip})`,
  });
}

async function removeFirewallRuleIfUnused(deps: Deps, ip: string, excludeAccessId: number): Promise<void> {
  const remaining = await deps.db
    .select({ id: databaseAccesses.id })
    .from(databaseAccesses)
    .where(and(eq(databaseAccesses.allowed_ip, ip), ne(databaseAccesses.id, excludeAccessId)));

  if (remaining.length > 0) return;

  const rules = await listFirewallRules(deps);
  const rule = rules.find((entry) => entry.port === String(DATABASE_PORT) && entry.from_ip === ip);
  if (rule) await removeFirewallRule(deps, rule.id);
}

export async function listDatabaseAccesses(deps: Deps, databaseId: number): Promise<Array<DatabaseAccessResponse>> {
  const rows = await deps.db.select().from(databaseAccesses).where(eq(databaseAccesses.database_id, databaseId));

  return rows.map(formatAccess);
}

export async function getDatabaseAccess(deps: Deps, accessId: number): Promise<DatabaseAccessRow | null> {
  const [row] = await deps.db.select().from(databaseAccesses).where(eq(databaseAccesses.id, accessId)).limit(1);

  return row ?? null;
}

export async function createDatabaseAccess(
  deps: Deps,
  database: ServerDatabaseRow,
  prefix: string,
  input: CreateDatabaseAccessRequest
): Promise<{ access: DatabaseAccessResponse; credentials: DatabaseAccessCredentials; engineRestarted: boolean }> {
  await assertEngineAvailable(deps);

  const [duplicate] = await deps.db
    .select({ id: databaseAccesses.id })
    .from(databaseAccesses)
    .where(
      and(
        eq(databaseAccesses.database_id, database.id),
        eq(databaseAccesses.allowed_ip, input.allowedIp),
        eq(databaseAccesses.scope, input.scope)
      )
    )
    .limit(1);

  if (duplicate) throw new Error(ErrorCodes.DATABASE_ACCESS_IP_TAKEN);

  const username = buildAccessUser(prefix);
  const password = generateDatabasePassword();
  const isFirstRemoteAccess = (await countRemoteAccesses(deps)) === 0;

  const granted = await runDatabaseScript(
    deps,
    ['grant-access', database.db_name, username, input.allowedIp, input.scope, input.requireCertificate ? 'x509' : 'ssl'],
    password
  );

  if (!granted.success) throw new Error(ErrorCodes.DATABASE_SCRIPT_FAILED);

  const clientCertificate = typeof granted.payload?.clientCert === 'string' ? granted.payload.clientCert : undefined;
  const clientKey = typeof granted.payload?.clientKey === 'string' ? granted.payload.clientKey : undefined;

  try {
    await ensureFirewallRule(deps, input.allowedIp);

    // bind-address is instance-wide, so the engine only starts listening off the loopback once a remote access actually exists. The firewall rule and the per-IP GRANT stay the active filters.
    if (isFirstRemoteAccess) await setEngineBind(deps, '0.0.0.0');

    const now = deps.clock().toISOString();

    const [row] = await deps.db
      .insert(databaseAccesses)
      .values({
        database_id: database.id,
        label: input.label,
        username,
        password_encrypted: cipherEncrypt(deps, password),
        scope: input.scope,
        allowed_ip: input.allowedIp,
        require_certificate: input.requireCertificate,
        created_at: now,
        updated_at: now,
      })
      .returning();

    return {
      access: formatAccess(row),
      credentials: { ...buildCredentials(row, database.db_name, password), clientCertificate, clientKey },
      engineRestarted: isFirstRemoteAccess,
    };
  } catch (error) {
    await runDatabaseScript(deps, ['revoke-access', username, input.allowedIp]);
    throw error;
  }
}

export function readAccessCredentials(deps: Deps, row: DatabaseAccessRow, dbName: string): DatabaseAccessCredentials {
  return buildCredentials(row, dbName, cipherDecrypt(deps, row.password_encrypted));
}

export async function rotateAccessPassword(
  deps: Deps,
  row: DatabaseAccessRow,
  dbName: string
): Promise<DatabaseAccessCredentials> {
  await assertEngineAvailable(deps);

  const password = generateDatabasePassword();
  const outcome = await runDatabaseScript(deps, ['rotate-password', row.username, row.allowed_ip], password);
  if (!outcome.success) throw new Error(ErrorCodes.DATABASE_SCRIPT_FAILED);

  await deps.db
    .update(databaseAccesses)
    .set({ password_encrypted: cipherEncrypt(deps, password), updated_at: deps.clock().toISOString() })
    .where(eq(databaseAccesses.id, row.id));

  return buildCredentials(row, dbName, password);
}

export async function revokeDatabaseAccess(deps: Deps, row: DatabaseAccessRow): Promise<{ engineRestarted: boolean }> {
  await assertEngineAvailable(deps);

  const outcome = await runDatabaseScript(deps, ['revoke-access', row.username, row.allowed_ip]);
  if (!outcome.success) throw new Error(ErrorCodes.DATABASE_SCRIPT_FAILED);

  await removeFirewallRuleIfUnused(deps, row.allowed_ip, row.id);
  await deps.db.delete(databaseAccesses).where(eq(databaseAccesses.id, row.id));

  const isLastRemoteAccess = (await countRemoteAccesses(deps)) === 0;
  if (isLastRemoteAccess) await setEngineBind(deps, '127.0.0.1');

  return { engineRestarted: isLastRemoteAccess };
}

// Sampled by the scheduler. A connection opened and closed between two samples is missed, so the UI must say "no activity observed since", not "last connected on".
export async function refreshAccessActivity(deps: Deps): Promise<void> {
  const usage = await readDatabaseUsage(deps);
  if (usage.activeUsers.size === 0) return;

  const now = deps.clock().toISOString();

  for (const username of usage.activeUsers) {
    await deps.db.update(databaseAccesses).set({ last_used_at: now }).where(eq(databaseAccesses.username, username));
  }
}
