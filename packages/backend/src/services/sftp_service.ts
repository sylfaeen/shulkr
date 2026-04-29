import os from 'node:os';
import { resolve } from 'node:path';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { sftpAccounts, servers } from '@shulkr/backend/db/schema';
import { APP_DIR } from '@shulkr/backend/services/paths';
import { ErrorCodes } from '@shulkr/shared';
import type { CreateSftpAccountRequest, UpdateSftpAccountRequest, SftpAccountResponse } from '@shulkr/shared';
import { type AppDeps } from '@shulkr/backend/deps';

const BCRYPT_ROUNDS = 12;
const SCRIPT_PATH = process.env.SFTP_SCRIPT_PATH || resolve(APP_DIR, 'scripts/subs/subs_sftp.sh');

export interface SftpInfo {
  host: string;
  port: number;
  username: string;
  hasPassword: boolean;
}

export interface CommandResult {
  success: boolean;
  error?: string;
}

type Deps = Pick<AppDeps, 'db' | 'shell' | 'clock'>;

function getServerIp(): string {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (!entry.internal && entry.family === 'IPv4') {
        return entry.address;
      }
    }
  }
  return 'localhost';
}

function parseJsonFromOutput(output: string): { success?: boolean; error?: string } | null {
  const match = output.match(/\{[^}]*"(?:success|error)"[^}]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as { success?: boolean; error?: string };
  } catch {
    return null;
  }
}

async function runSftpScript(deps: Deps, args: Array<string>): Promise<CommandResult> {
  const result = await deps.shell.run('sudo', [SCRIPT_PATH, ...args], { timeoutMs: 30000 });
  if (!result.success) {
    const parsed = parseJsonFromOutput(result.stderr) || parseJsonFromOutput(result.stdout);
    const errorMessage = parsed?.error || `SFTP script failed: ${(result.stderr || 'unknown error').trim()}`;
    return { success: false, error: errorMessage };
  }
  try {
    const parsed = JSON.parse(result.stdout) as { success?: boolean };
    return { success: parsed.success !== false };
  } catch {
    return { success: true };
  }
}

function formatAllowedPathsArg(allowedPaths: Array<string>): string {
  if (allowedPaths.length === 0 || (allowedPaths.length === 1 && allowedPaths[0] === '/')) {
    return '/';
  }
  return allowedPaths.join(',');
}

function formatAccount(account: typeof sftpAccounts.$inferSelect): SftpAccountResponse {
  let allowedPaths: Array<string> = [];
  try {
    allowedPaths = JSON.parse(account.allowed_paths) as Array<string>;
  } catch {}
  return {
    id: account.id,
    serverId: account.server_id,
    username: account.username,
    permissions: account.permissions,
    allowedPaths,
    hasPassword: Boolean(account.password),
    createdAt: account.created_at,
    updatedAt: account.updated_at,
  };
}

export function getSftpInfo(): SftpInfo {
  return {
    host: getServerIp(),
    port: 22,
    username: 'shulkr',
    hasPassword: true,
  };
}

export async function listSftpAccounts(deps: Deps, serverId: string): Promise<Array<SftpAccountResponse>> {
  const accounts = await deps.db.select().from(sftpAccounts).where(eq(sftpAccounts.server_id, serverId));
  return accounts.map(formatAccount);
}

export async function getSftpAccountServerId(deps: Deps, accountId: number): Promise<string | null> {
  const [account] = await deps.db
    .select({ server_id: sftpAccounts.server_id })
    .from(sftpAccounts)
    .where(eq(sftpAccounts.id, accountId))
    .limit(1);
  return account?.server_id ?? null;
}

export async function createSftpAccount(deps: Deps, data: CreateSftpAccountRequest): Promise<SftpAccountResponse> {
  const [server] = await deps.db.select().from(servers).where(eq(servers.id, data.serverId)).limit(1);
  if (!server) throw new Error('Server not found');

  // Story 59.8: pre-check username uniqueness before any shell call. The DB has a UNIQUE index on username (idx_sftp_accounts_username), but catching the SQLite error after the fact would still let us trigger subs_sftp.sh and pollute audit logs. Pre-check keeps the system clean and gives the route a stable ErrorCode to map to 409.
  const [duplicate] = await deps.db
    .select({ id: sftpAccounts.id })
    .from(sftpAccounts)
    .where(eq(sftpAccounts.username, data.username))
    .limit(1);
  if (duplicate) throw new Error(ErrorCodes.SFTP_USERNAME_TAKEN);

  const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
  const [account] = await deps.db
    .insert(sftpAccounts)
    .values({
      server_id: data.serverId,
      username: data.username,
      password: passwordHash,
      permissions: data.permissions,
      allowed_paths: JSON.stringify(data.allowedPaths),
    })
    .returning();

  const result = await runSftpScript(deps, ['create-user', data.username, data.password, server.path]);
  if (!result.success) {
    await deps.db.delete(sftpAccounts).where(eq(sftpAccounts.id, account.id));
    throw new Error(result.error || 'Failed to create SFTP user on the system');
  }

  if (data.permissions === 'read-only') {
    const permResult = await runSftpScript(deps, ['update-permissions', data.username, server.path, data.permissions]);
    if (!permResult.success) {
      // the user is created but permissions may not be set correctly
    }
  }
  return formatAccount(account);
}

export async function updateSftpAccount(deps: Deps, data: UpdateSftpAccountRequest): Promise<SftpAccountResponse> {
  const [existing] = await deps.db.select().from(sftpAccounts).where(eq(sftpAccounts.id, data.id)).limit(1);
  if (!existing) throw new Error('SFTP account not found');

  const [server] = await deps.db.select().from(servers).where(eq(servers.id, existing.server_id)).limit(1);
  if (!server) throw new Error('Server not found');

  const updateData: Record<string, string> = {
    updated_at: deps.clock().toISOString(),
  };
  if (data.password) {
    updateData.password = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
    const result = await runSftpScript(deps, ['update-password', existing.username, data.password]);
    if (!result.success) throw new Error(result.error || 'Failed to update SFTP password on the system');
  }
  if (data.permissions && data.permissions !== existing.permissions) {
    updateData.permissions = data.permissions;
    const result = await runSftpScript(deps, ['update-permissions', existing.username, server.path, data.permissions]);
    if (!result.success) throw new Error(result.error || 'Failed to update SFTP permissions on the system');
  }
  if (data.username) {
    updateData.username = data.username;
  }
  if (data.allowedPaths) {
    updateData.allowed_paths = JSON.stringify(data.allowedPaths);
    const allowedPathsArg = formatAllowedPathsArg(data.allowedPaths);
    const pathsResult = await runSftpScript(deps, ['update-paths', existing.username, server.path, allowedPathsArg]);
    if (!pathsResult.success) throw new Error(pathsResult.error || 'Failed to update SFTP allowed paths on the system');
  }

  const [updated] = await deps.db.update(sftpAccounts).set(updateData).where(eq(sftpAccounts.id, data.id)).returning();
  return formatAccount(updated);
}

export async function deleteSftpAccount(deps: Deps, id: number): Promise<CommandResult> {
  const [account] = await deps.db.select().from(sftpAccounts).where(eq(sftpAccounts.id, id)).limit(1);
  if (!account) throw new Error('SFTP account not found');

  const result = await runSftpScript(deps, ['delete-user', account.username]);
  if (!result.success) throw new Error(result.error || 'Failed to delete SFTP user from the system');
  await deps.db.delete(sftpAccounts).where(eq(sftpAccounts.id, id));
  return { success: true };
}

export async function cleanupServerSftpAccounts(deps: Deps, serverId: string): Promise<void> {
  const accounts = await deps.db.select().from(sftpAccounts).where(eq(sftpAccounts.server_id, serverId));
  for (const account of accounts) {
    await runSftpScript(deps, ['delete-user', account.username]);
  }
  await deps.db.delete(sftpAccounts).where(eq(sftpAccounts.server_id, serverId));
}
