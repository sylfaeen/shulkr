import { randomBytes, createHash } from 'node:crypto';
import { and, desc, eq, gt, isNull, or, sql } from 'drizzle-orm';
import { ErrorCodes } from '@shulkr/shared';
import { backupShareLinks, users, type BackupShareLinkRow } from '@shulkr/backend/db/schema';
import { getBackupPath } from '@shulkr/backend/services/backup_service';
import { cipherEncrypt, cipherDecrypt } from '@shulkr/backend/services/encryption_service';
import type { AppDeps } from '@shulkr/backend/deps';

type Deps = Pick<AppDeps, 'db' | 'clock' | 'fs' | 'encryption'>;

export type ShareLinkView = {
  id: number;
  token: string;
  createdByUsername: string | null;
  createdAt: string;
  expiresAt: string | null;
  revoked: boolean;
  downloadCount: number;
  lastDownloadedAt: string | null;
};

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

export async function createShareLink(
  deps: Deps,
  input: { filename: string; expiresInHours?: number | null; createdBy: number; serverId?: string }
): Promise<{ token: string; expiresAt: string | null }> {
  const localPath = await getBackupPath(deps, input.filename);
  if (!localPath) throw new Error(ErrorCodes.BACKUP_SHARE_NOT_LOCAL);

  const token = generateToken();
  const now = deps.clock();

  const expiresAt = input.expiresInHours
    ? new Date(now.getTime() + input.expiresInHours * 3_600_000).toISOString()
    : null;

  await deps.db.insert(backupShareLinks).values({
    filename: input.filename,
    server_id: input.serverId ?? null,
    token_hash: hashToken(token),
    token_encrypted: cipherEncrypt(deps, token),
    created_by: input.createdBy,
    created_at: now.toISOString(),
    expires_at: expiresAt,
  });

  return { token, expiresAt };
}

export async function listShareLinks(deps: Deps, filename: string): Promise<Array<ShareLinkView>> {
  const rows = await deps.db
    .select({ link: backupShareLinks, username: users.username })
    .from(backupShareLinks)
    .leftJoin(users, eq(backupShareLinks.created_by, users.id))
    .where(eq(backupShareLinks.filename, filename))
    .orderBy(desc(backupShareLinks.created_at));

  return rows.map(({ link, username }) => ({
    id: link.id,
    token: cipherDecrypt(deps, link.token_encrypted),
    createdByUsername: username,
    createdAt: link.created_at,
    expiresAt: link.expires_at,
    revoked: link.revoked_at !== null,
    downloadCount: link.download_count,
    lastDownloadedAt: link.last_downloaded_at,
  }));
}

export async function revokeShareLink(deps: Deps, id: number): Promise<boolean> {
  const [row] = await deps.db.select().from(backupShareLinks).where(eq(backupShareLinks.id, id)).limit(1);
  if (!row) return false;

  await deps.db
    .update(backupShareLinks)
    .set({ revoked_at: deps.clock().toISOString() })
    .where(eq(backupShareLinks.id, id));

  return true;
}

// The single security chokepoint for the public route: returns the row only when the token matches a link that is neither revoked nor expired, null otherwise. A null expires_at means the link never expires.
export async function resolveActiveShareLink(deps: Deps, token: string): Promise<BackupShareLinkRow | null> {
  const now = deps.clock().toISOString();

  const [row] = await deps.db
    .select()
    .from(backupShareLinks)
    .where(
      and(
        eq(backupShareLinks.token_hash, hashToken(token)),
        isNull(backupShareLinks.revoked_at),
        or(isNull(backupShareLinks.expires_at), gt(backupShareLinks.expires_at, now))
      )
    )
    .limit(1);

  return row ?? null;
}

export async function recordDownload(deps: Deps, id: number, ip: string): Promise<void> {
  await deps.db
    .update(backupShareLinks)
    .set({
      download_count: sql`${backupShareLinks.download_count} + 1`,
      last_downloaded_at: deps.clock().toISOString(),
      last_downloaded_ip: ip,
    })
    .where(eq(backupShareLinks.id, id));
}

export async function deleteShareLinksForFilename(deps: Deps, filename: string): Promise<void> {
  await deps.db.delete(backupShareLinks).where(eq(backupShareLinks.filename, filename));
}
