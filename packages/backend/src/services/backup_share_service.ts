import { randomBytes, createHash } from 'node:crypto';
import { and, desc, eq, gt, isNull, sql } from 'drizzle-orm';
import { ErrorCodes } from '@shulkr/shared';
import { backupShareLinks, type BackupShareLinkRow } from '@shulkr/backend/db/schema';
import { getBackupPath } from '@shulkr/backend/services/backup_service';
import type { AppDeps } from '@shulkr/backend/deps';

type Deps = Pick<AppDeps, 'db' | 'clock' | 'fs'>;

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

function hashToken(plain: string): string {
  return createHash('sha256').update(plain).digest('hex');
}

function previewOf(token: string): string {
  return token.slice(0, 8);
}

export async function createShareLink(
  deps: Deps,
  input: { filename: string; expiresInHours: number; createdBy: number; serverId?: string }
): Promise<{ token: string; preview: string; expiresAt: string }> {
  const localPath = await getBackupPath(deps, input.filename);
  if (!localPath) throw new Error(ErrorCodes.BACKUP_SHARE_NOT_LOCAL);

  const token = generateToken();
  const now = deps.clock();
  const expiresAt = new Date(now.getTime() + input.expiresInHours * 3_600_000).toISOString();

  await deps.db.insert(backupShareLinks).values({
    filename: input.filename,
    server_id: input.serverId ?? null,
    token_hash: hashToken(token),
    token_preview: previewOf(token),
    created_by: input.createdBy,
    created_at: now.toISOString(),
    expires_at: expiresAt,
  });

  return { token, preview: previewOf(token), expiresAt };
}

export async function listShareLinks(deps: Deps, filename: string): Promise<Array<BackupShareLinkRow>> {
  return deps.db
    .select()
    .from(backupShareLinks)
    .where(eq(backupShareLinks.filename, filename))
    .orderBy(desc(backupShareLinks.created_at));
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

// The single security chokepoint for the public route: returns the row only when the token matches a link that is neither revoked nor expired, null otherwise.
export async function resolveActiveShareLink(deps: Deps, token: string): Promise<BackupShareLinkRow | null> {
  const now = deps.clock().toISOString();

  const [row] = await deps.db
    .select()
    .from(backupShareLinks)
    .where(
      and(
        eq(backupShareLinks.token_hash, hashToken(token)),
        isNull(backupShareLinks.revoked_at),
        gt(backupShareLinks.expires_at, now)
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
