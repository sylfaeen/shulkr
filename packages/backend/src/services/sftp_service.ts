import os from 'node:os';
import { execFile } from 'node:child_process';
import { resolve } from 'node:path';
import bcrypt from 'bcrypt';
import { eq } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { sftpAccounts, servers } from '@shulkr/backend/db/schema';
import { APP_DIR } from '@shulkr/backend/services/paths';
import type { CreateSftpAccountRequest, UpdateSftpAccountRequest, SftpAccountResponse } from '@shulkr/shared';

const BCRYPT_ROUNDS = 12;

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

function parseJsonFromOutput(output: string): { success?: boolean; error?: string } | null {
  const match = output.match(/\{[^}]*"(?:success|error)"[^}]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]) as { success?: boolean; error?: string };
  } catch {
    return null;
  }
}

function runSftpScript(args: Array<string>): Promise<CommandResult> {
  return new Promise((resolvePromise) => {
    execFile('sudo', [SCRIPT_PATH, ...args], { shell: false, timeout: 30000 }, (error, stdout, stderr) => {
      if (error) {
        const parsed = parseJsonFromOutput(stderr) || parseJsonFromOutput(stdout);
        const errorMessage = parsed?.error || `SFTP script failed: ${(stderr || error.message).trim()}`;
        resolvePromise({ success: false, error: errorMessage });
        return;
      }

      try {
        const result = JSON.parse(stdout) as { success?: boolean };
        resolvePromise({ success: result.success !== false });
      } catch {
        resolvePromise({ success: true });
      }
    });
  });
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

export class SftpService {
  getSftpInfo(): SftpInfo {
    return {
      host: getServerIp(),
      port: 22,
      username: 'shulkr',
      hasPassword: true,
    };
  }

  async listAccounts(serverId: string): Promise<Array<SftpAccountResponse>> {
    const accounts = await db.select().from(sftpAccounts).where(eq(sftpAccounts.server_id, serverId));
    return accounts.map(formatAccount);
  }

  async getAccountServerId(accountId: number): Promise<string | null> {
    const [account] = await db
      .select({ server_id: sftpAccounts.server_id })
      .from(sftpAccounts)
      .where(eq(sftpAccounts.id, accountId))
      .limit(1);
    return account?.server_id ?? null;
  }

  async createAccount(data: CreateSftpAccountRequest): Promise<SftpAccountResponse> {
    const [server] = await db.select().from(servers).where(eq(servers.id, data.serverId)).limit(1);
    if (!server) throw new Error('Server not found');

    const passwordHash = await bcrypt.hash(data.password, BCRYPT_ROUNDS);

    const [account] = await db
      .insert(sftpAccounts)
      .values({
        server_id: data.serverId,
        username: data.username,
        password: passwordHash,
        permissions: data.permissions,
        allowed_paths: JSON.stringify(data.allowedPaths),
      })
      .returning();

    const result = await runSftpScript(['create-user', data.username, data.password, server.path]);

    if (!result.success) {
      await db.delete(sftpAccounts).where(eq(sftpAccounts.id, account.id));
      throw new Error(result.error || 'Failed to create SFTP user on the system');
    }

    if (data.permissions === 'read-only') {
      const permResult = await runSftpScript(['update-permissions', data.username, server.path, data.permissions]);
      if (!permResult.success) {
        // the user is created but permissions may not be set correctly
      }
    }

    return formatAccount(account);
  }

  async updateAccount(data: UpdateSftpAccountRequest): Promise<SftpAccountResponse> {
    const [existing] = await db.select().from(sftpAccounts).where(eq(sftpAccounts.id, data.id)).limit(1);

    if (!existing) throw new Error('SFTP account not found');

    const [server] = await db.select().from(servers).where(eq(servers.id, existing.server_id)).limit(1);
    if (!server) throw new Error('Server not found');

    const updateData: Record<string, string> = {
      updated_at: new Date().toISOString(),
    };

    if (data.password) {
      updateData.password = await bcrypt.hash(data.password, BCRYPT_ROUNDS);
      const result = await runSftpScript(['update-password', existing.username, data.password]);
      if (!result.success) throw new Error(result.error || 'Failed to update SFTP password on the system');
    }

    if (data.permissions && data.permissions !== existing.permissions) {
      updateData.permissions = data.permissions;
      const result = await runSftpScript(['update-permissions', existing.username, server.path, data.permissions]);
      if (!result.success) throw new Error(result.error || 'Failed to update SFTP permissions on the system');
    }

    if (data.username) {
      updateData.username = data.username;
    }

    if (data.allowedPaths) {
      updateData.allowed_paths = JSON.stringify(data.allowedPaths);
      const allowedPathsArg = formatAllowedPathsArg(data.allowedPaths);
      const pathsResult = await runSftpScript(['update-paths', existing.username, server.path, allowedPathsArg]);
      if (!pathsResult.success) throw new Error(pathsResult.error || 'Failed to update SFTP allowed paths on the system');
    }

    const [updated] = await db.update(sftpAccounts).set(updateData).where(eq(sftpAccounts.id, data.id)).returning();

    return formatAccount(updated);
  }

  async deleteAccount(id: number): Promise<CommandResult> {
    const [account] = await db.select().from(sftpAccounts).where(eq(sftpAccounts.id, id)).limit(1);

    if (!account) throw new Error('SFTP account not found');

    const result = await runSftpScript(['delete-user', account.username]);
    if (!result.success) throw new Error(result.error || 'Failed to delete SFTP user from the system');

    await db.delete(sftpAccounts).where(eq(sftpAccounts.id, id));

    return { success: true };
  }

  async cleanupServerAccounts(serverId: string): Promise<void> {
    const accounts = await db.select().from(sftpAccounts).where(eq(sftpAccounts.server_id, serverId));

    for (const account of accounts) {
      await runSftpScript(['delete-user', account.username]);
    }

    await db.delete(sftpAccounts).where(eq(sftpAccounts.server_id, serverId));
  }
}

export const sftpService = new SftpService();
