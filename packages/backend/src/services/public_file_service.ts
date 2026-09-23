import { createHash, randomBytes, randomUUID } from 'node:crypto';
import path from 'node:path';
import { and, desc, eq, gt, gte, isNotNull, isNull, lt, lte, or, sql } from 'drizzle-orm';
import {
  ErrorCodes,
  PUBLIC_FILE_CHUNK_BYTES,
  PUBLIC_FILE_MAX_BYTES,
  type PublicFile,
  type PublicFileDisposition,
} from '@shulkr/shared';
import { publicFiles, publicFileUploads, users, type PublicFileRow } from '@shulkr/backend/db/schema';
import { cipherDecrypt, cipherEncrypt } from '@shulkr/backend/services/encryption_service';
import type { AppDeps } from '@shulkr/backend/deps';

type Deps = Pick<AppDeps, 'db' | 'fs' | 'clock' | 'encryption' | 'config'>;

const INCOMING_DIR = '.incoming';
const MAX_OPEN_UPLOADS_PER_USER = 3;
const DISK_FREE_MARGIN_BYTES = 2 * 1024 * 1024 * 1024;
const STALE_UPLOAD_MS = 24 * 3_600_000;
const MAINTENANCE_INTERVAL_MS = 3_600_000;
const MAX_NAME_LENGTH = 200;

// 32 random bytes in base64url, unpadded. Anything else is rejected before a query runs.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const STORAGE_KEY_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const UPLOAD_ID_PATTERN = /^[A-Za-z0-9_-]{22}$/;

let maintenanceIntervalId: ReturnType<typeof setInterval> | null = null;

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function storePath(deps: Pick<AppDeps, 'config'>): string {
  return deps.config.PUBLIC_FILES_PATH;
}

function incomingPath(deps: Pick<AppDeps, 'config'>, uploadId: string): string {
  return path.join(storePath(deps), INCOMING_DIR, uploadId);
}

function expiresAtFrom(now: Date, hours: number | null): string | null {
  return hours === null ? null : new Date(now.getTime() + hours * 3_600_000).toISOString();
}

// The name is only ever displayed and written into Content-Disposition, never used as a path. Unicode direction marks are removed because U+202E turns "photo<RLO>gpj.exe" into what reads as "photoexe.jpg".
export function sanitizePublicFileName(raw: string): string {
  const base = raw.split(/[\\/]/).pop() ?? '';
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f-\u009f\u200e\u200f\u202a-\u202e\u2066-\u2069]/g, '').trim();
  const clipped = Array.from(cleaned).slice(0, MAX_NAME_LENGTH).join('');

  return clipped === '' || clipped === '.' || clipped === '..' ? 'file' : clipped;
}

// Decides from the file's own bytes, never from its extension or the browser's claim. Only raster images render inline, everything else (SVG, HTML and PDF included) is forced to download so nothing can execute on the panel origin.
export function detectPublicFileType(head: Buffer): { mimeType: string; disposition: PublicFileDisposition } {
  const startsWith = (bytes: Array<number>, offset = 0) => bytes.every((b, i) => head[offset + i] === b);

  if (startsWith([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return { mimeType: 'image/png', disposition: 'inline' };
  if (startsWith([0xff, 0xd8, 0xff])) return { mimeType: 'image/jpeg', disposition: 'inline' };

  if (startsWith([0x47, 0x49, 0x46, 0x38]) && (head[4] === 0x37 || head[4] === 0x39) && head[5] === 0x61) {
    return { mimeType: 'image/gif', disposition: 'inline' };
  }

  if (startsWith([0x52, 0x49, 0x46, 0x46]) && startsWith([0x57, 0x45, 0x42, 0x50], 8)) {
    return { mimeType: 'image/webp', disposition: 'inline' };
  }

  if (startsWith([0x50, 0x4b, 0x03, 0x04]) || startsWith([0x50, 0x4b, 0x05, 0x06])) {
    return { mimeType: 'application/zip', disposition: 'attachment' };
  }

  return { mimeType: 'application/octet-stream', disposition: 'attachment' };
}

function toView(deps: Pick<AppDeps, 'encryption'>, row: PublicFileRow, username: string | null): PublicFile {
  return {
    id: row.id,
    name: row.original_name,
    mimeType: row.mime_type,
    disposition: row.disposition,
    sizeBytes: row.size_bytes,
    sha1: row.sha1,
    url: `/f/${cipherDecrypt(deps, row.token_encrypted)}`,
    createdByUsername: username,
    createdAt: row.created_at,
    expiresAt: row.expires_at,
    maxDownloads: row.max_downloads,
    downloadCount: row.download_count,
    lastDownloadedAt: row.last_downloaded_at,
  };
}

async function getView(deps: Deps, id: number): Promise<PublicFile | null> {
  const [result] = await deps.db
    .select({ file: publicFiles, username: users.username })
    .from(publicFiles)
    .leftJoin(users, eq(publicFiles.created_by, users.id))
    .where(eq(publicFiles.id, id))
    .limit(1);

  return result ? toView(deps, result.file, result.username) : null;
}

export async function ensurePublicFileStore(deps: Pick<AppDeps, 'fs' | 'config'>): Promise<void> {
  await deps.fs.mkdir(path.join(storePath(deps), INCOMING_DIR), { recursive: true, mode: 0o700 });
}

// Bytes already committed: stored files plus the full declared size of every upload in progress, so parallel uploads cannot each pass the quota check on their own.
export async function getPublicFileUsage(deps: Pick<AppDeps, 'db'>): Promise<number> {
  const [stored] = await deps.db.select({ total: sql<number>`coalesce(sum(${publicFiles.size_bytes}), 0)` }).from(publicFiles);

  const [pending] = await deps.db
    .select({ total: sql<number>`coalesce(sum(${publicFileUploads.size_bytes}), 0)` })
    .from(publicFileUploads);

  return Number(stored.total) + Number(pending.total);
}

export async function listPublicFiles(deps: Deps): Promise<Array<PublicFile>> {
  const rows = await deps.db
    .select({ file: publicFiles, username: users.username })
    .from(publicFiles)
    .leftJoin(users, eq(publicFiles.created_by, users.id))
    .orderBy(desc(publicFiles.created_at), desc(publicFiles.id));

  return rows.map(({ file, username }) => toView(deps, file, username));
}

export async function openPublicFileUpload(
  deps: Deps,
  input: {
    userId: number;
    name: string;
    sizeBytes: number;
    expiresInHours: number | null;
    maxDownloads: number | null;
    replacesFileId?: number;
  }
): Promise<{ uploadId: string }> {
  if (input.sizeBytes < 1 || input.sizeBytes > PUBLIC_FILE_MAX_BYTES) throw new Error(ErrorCodes.PUBLIC_FILE_TOO_LARGE);

  if (input.replacesFileId !== undefined) {
    const [target] = await deps.db
      .select({ id: publicFiles.id })
      .from(publicFiles)
      .where(eq(publicFiles.id, input.replacesFileId))
      .limit(1);

    if (!target) throw new Error(ErrorCodes.PUBLIC_FILE_NOT_FOUND);
  }

  const [open] = await deps.db
    .select({ count: sql<number>`count(*)` })
    .from(publicFileUploads)
    .where(eq(publicFileUploads.user_id, input.userId));

  if (Number(open.count) >= MAX_OPEN_UPLOADS_PER_USER) throw new Error(ErrorCodes.PUBLIC_FILE_UPLOAD_LIMIT);

  if ((await getPublicFileUsage(deps)) + input.sizeBytes > deps.config.PUBLIC_FILES_MAX_TOTAL_BYTES) {
    throw new Error(ErrorCodes.PUBLIC_FILE_QUOTA_EXCEEDED);
  }

  await ensurePublicFileStore(deps);

  const disk = await deps.fs.statfs(storePath(deps));

  if (disk.bavail * disk.bsize - input.sizeBytes < DISK_FREE_MARGIN_BYTES) throw new Error(ErrorCodes.PUBLIC_FILE_DISK_FULL);

  const uploadId = randomBytes(16).toString('base64url');
  const now = deps.clock().toISOString();

  await deps.fs.writeFile(incomingPath(deps, uploadId), Buffer.alloc(0));

  await deps.db.insert(publicFileUploads).values({
    id: uploadId,
    user_id: input.userId,
    original_name: sanitizePublicFileName(input.name),
    size_bytes: input.sizeBytes,
    received_bytes: 0,
    expires_in_hours: input.expiresInHours,
    max_downloads: input.maxDownloads,
    replaces_file_id: input.replacesFileId ?? null,
    created_at: now,
    updated_at: now,
  });

  return { uploadId };
}

async function discardUpload(deps: Deps, uploadId: string): Promise<void> {
  await deps.db.delete(publicFileUploads).where(eq(publicFileUploads.id, uploadId));
  await deps.fs.unlink(incomingPath(deps, uploadId)).catch(() => {});
}

// The byte range is reserved in one conditional UPDATE before anything touches the disk: the offset must equal what was already received and the total can never exceed the declared size. Two concurrent requests for the same range cannot both win, and the positional write puts each range at its exact place. A session owned by someone else matches no row, exactly like an unknown one.
export async function appendPublicFileChunk(
  deps: Deps,
  input: { uploadId: string; userId: number; offset: number; chunk: Buffer }
): Promise<{ receivedBytes: number; sizeBytes: number }> {
  if (!UPLOAD_ID_PATTERN.test(input.uploadId)) throw new Error(ErrorCodes.PUBLIC_FILE_UPLOAD_NOT_FOUND);

  const [session] = await deps.db
    .select()
    .from(publicFileUploads)
    .where(and(eq(publicFileUploads.id, input.uploadId), eq(publicFileUploads.user_id, input.userId)))
    .limit(1);

  if (!session) throw new Error(ErrorCodes.PUBLIC_FILE_UPLOAD_NOT_FOUND);

  const length = input.chunk.length;

  if (!Number.isSafeInteger(input.offset) || length === 0 || length > PUBLIC_FILE_CHUNK_BYTES) {
    throw new Error(ErrorCodes.PUBLIC_FILE_CHUNK_INVALID);
  }

  const [claimed] = await deps.db
    .update(publicFileUploads)
    .set({
      received_bytes: sql`${publicFileUploads.received_bytes} + ${length}`,
      updated_at: deps.clock().toISOString(),
    })
    .where(
      and(
        eq(publicFileUploads.id, input.uploadId),
        eq(publicFileUploads.user_id, input.userId),
        eq(publicFileUploads.received_bytes, input.offset),
        lte(sql`${publicFileUploads.received_bytes} + ${length}`, publicFileUploads.size_bytes)
      )
    )
    .returning({ receivedBytes: publicFileUploads.received_bytes, sizeBytes: publicFileUploads.size_bytes });

  if (!claimed) throw new Error(ErrorCodes.PUBLIC_FILE_CHUNK_INVALID);

  try {
    await deps.fs.writeAt(incomingPath(deps, input.uploadId), input.chunk, input.offset);
  } catch (error) {
    // The range is already counted as received, so a failed write leaves a hole that no retry can fill. The upload is abandoned rather than finalized with corrupt content.
    await discardUpload(deps, input.uploadId);
    throw error;
  }

  return claimed;
}

export async function cancelPublicFileUpload(deps: Deps, input: { uploadId: string; userId: number }): Promise<boolean> {
  if (!UPLOAD_ID_PATTERN.test(input.uploadId)) return false;

  const [deleted] = await deps.db
    .delete(publicFileUploads)
    .where(and(eq(publicFileUploads.id, input.uploadId), eq(publicFileUploads.user_id, input.userId)))
    .returning({ id: publicFileUploads.id });

  if (!deleted) return false;

  await deps.fs.unlink(incomingPath(deps, input.uploadId)).catch(() => {});

  return true;
}

async function digestFile(
  deps: Pick<AppDeps, 'fs'>,
  filePath: string
): Promise<{ sha256: string; sha1: string; head: Buffer; size: number }> {
  const hash = createHash('sha256');
  const sha1 = createHash('sha1');
  const headParts: Array<Buffer> = [];
  let headLength = 0;
  let size = 0;

  for await (const chunk of deps.fs.createReadStream(filePath)) {
    const buf = chunk as Buffer;
    hash.update(buf);
    sha1.update(buf);
    size += buf.length;

    if (headLength < 16) {
      headParts.push(buf.subarray(0, 16 - headLength));
      headLength += Math.min(buf.length, 16 - headLength);
    }
  }

  return { sha256: hash.digest('hex'), sha1: sha1.digest('hex'), head: Buffer.concat(headParts), size };
}

export async function completePublicFileUpload(
  deps: Deps,
  input: { uploadId: string; userId: number }
): Promise<{ file: PublicFile; row: PublicFileRow; replaced: boolean }> {
  if (!UPLOAD_ID_PATTERN.test(input.uploadId)) throw new Error(ErrorCodes.PUBLIC_FILE_UPLOAD_NOT_FOUND);

  const [session] = await deps.db
    .select()
    .from(publicFileUploads)
    .where(and(eq(publicFileUploads.id, input.uploadId), eq(publicFileUploads.user_id, input.userId)))
    .limit(1);

  if (!session) throw new Error(ErrorCodes.PUBLIC_FILE_UPLOAD_NOT_FOUND);
  if (session.received_bytes !== session.size_bytes) throw new Error(ErrorCodes.PUBLIC_FILE_UPLOAD_INCOMPLETE);

  // Deleting the session is the claim: a second concurrent completion finds no row and stops here.
  const [claimed] = await deps.db
    .delete(publicFileUploads)
    .where(and(eq(publicFileUploads.id, input.uploadId), eq(publicFileUploads.user_id, input.userId)))
    .returning();

  if (!claimed) throw new Error(ErrorCodes.PUBLIC_FILE_UPLOAD_NOT_FOUND);

  const staging = incomingPath(deps, input.uploadId);

  try {
    const digest = await digestFile(deps, staging);

    if (digest.size !== claimed.size_bytes) throw new Error(ErrorCodes.PUBLIC_FILE_UPLOAD_INCOMPLETE);

    const { mimeType, disposition } = detectPublicFileType(digest.head);
    const storageKey = randomUUID();
    const finalPath = path.join(storePath(deps), storageKey);
    const now = deps.clock();

    // The file is moved, never rewritten: the bytes served are the bytes uploaded, so the digests shown in the panel match what a client receives.
    await deps.fs.rename(staging, finalPath);

    const content = {
      storage_key: storageKey,
      original_name: claimed.original_name,
      mime_type: mimeType,
      disposition,
      size_bytes: digest.size,
      sha256: digest.sha256,
      sha1: digest.sha1,
    };

    if (claimed.replaces_file_id !== null) {
      try {
        const [previous] = await deps.db
          .select({ storageKey: publicFiles.storage_key })
          .from(publicFiles)
          .where(eq(publicFiles.id, claimed.replaces_file_id))
          .limit(1);

        if (!previous) throw new Error(ErrorCodes.PUBLIC_FILE_NOT_FOUND);

        // Only the content moves: token, expiry and counters stay, so the URL written in server.properties keeps working and only the digest changes.
        const [row] = await deps.db
          .update(publicFiles)
          .set(content)
          .where(eq(publicFiles.id, claimed.replaces_file_id))
          .returning();

        if (!row) throw new Error(ErrorCodes.PUBLIC_FILE_NOT_FOUND);

        await removeStoredFile(deps, previous.storageKey);
        const file = await getView(deps, row.id);

        return { file: file!, row, replaced: true };
      } catch (error) {
        await deps.fs.unlink(finalPath).catch(() => {});
        throw error;
      }
    }

    const token = randomBytes(32).toString('base64url');

    try {
      const [row] = await deps.db
        .insert(publicFiles)
        .values({
          ...content,
          token_hash: hashToken(token),
          token_encrypted: cipherEncrypt(deps, token),
          created_by: input.userId,
          created_at: now.toISOString(),
          expires_at: expiresAtFrom(now, claimed.expires_in_hours),
          max_downloads: claimed.max_downloads,
        })
        .returning();

      const file = await getView(deps, row.id);

      return { file: file!, row, replaced: false };
    } catch (error) {
      await deps.fs.unlink(finalPath).catch(() => {});
      throw error;
    }
  } catch (error) {
    await deps.fs.unlink(staging).catch(() => {});
    throw error;
  }
}

export async function updatePublicFile(
  deps: Deps,
  id: number,
  input: { expiresInHours: number | null; maxDownloads: number | null }
): Promise<PublicFile | null> {
  const [updated] = await deps.db
    .update(publicFiles)
    .set({ expires_at: expiresAtFrom(deps.clock(), input.expiresInHours), max_downloads: input.maxDownloads })
    .where(eq(publicFiles.id, id))
    .returning({ id: publicFiles.id });

  return updated ? getView(deps, updated.id) : null;
}

// Replaces the token: the previous URL stops resolving immediately, since only the new hash is stored.
export async function rotatePublicFileToken(deps: Deps, id: number): Promise<PublicFile | null> {
  const token = randomBytes(32).toString('base64url');

  const [updated] = await deps.db
    .update(publicFiles)
    .set({ token_hash: hashToken(token), token_encrypted: cipherEncrypt(deps, token) })
    .where(eq(publicFiles.id, id))
    .returning({ id: publicFiles.id });

  return updated ? getView(deps, updated.id) : null;
}

async function removeStoredFile(deps: Pick<AppDeps, 'fs' | 'config'>, storageKey: string): Promise<void> {
  if (!STORAGE_KEY_PATTERN.test(storageKey)) return;
  await deps.fs.unlink(path.join(storePath(deps), storageKey)).catch(() => {});
}

export async function deletePublicFile(deps: Deps, id: number): Promise<PublicFileRow | null> {
  const pending = await deps.db
    .delete(publicFileUploads)
    .where(eq(publicFileUploads.replaces_file_id, id))
    .returning({ id: publicFileUploads.id });

  for (const upload of pending) await deps.fs.unlink(incomingPath(deps, upload.id)).catch(() => {});

  const [deleted] = await deps.db.delete(publicFiles).where(eq(publicFiles.id, id)).returning();
  if (!deleted) return null;

  await removeStoredFile(deps, deleted.storage_key);

  return deleted;
}

function activeCondition(nowIso: string) {
  return and(
    or(isNull(publicFiles.expires_at), gt(publicFiles.expires_at, nowIso)),
    or(isNull(publicFiles.max_downloads), lt(publicFiles.download_count, publicFiles.max_downloads))
  );
}

// The single security chokepoint of the public route. The token is the only input and it only ever selects a row by its hash; the disk path comes from that row alone, is re-validated and must stay inside the store. Every failure returns null so the route can answer one identical 404.
export async function resolvePublicFile(
  deps: Pick<AppDeps, 'db' | 'fs' | 'clock' | 'config'>,
  token: string
): Promise<{ row: PublicFileRow; filePath: string } | null> {
  if (!TOKEN_PATTERN.test(token)) return null;

  const [row] = await deps.db
    .select()
    .from(publicFiles)
    .where(and(eq(publicFiles.token_hash, hashToken(token)), activeCondition(deps.clock().toISOString())))
    .limit(1);

  if (!row || !STORAGE_KEY_PATTERN.test(row.storage_key)) return null;

  const root = path.resolve(storePath(deps));
  const filePath = path.resolve(root, row.storage_key);

  if (path.dirname(filePath) !== root) return null;
  if (!(await deps.fs.exists(filePath))) return null;

  return { row, filePath };
}

// Conditional on the file still being active, so two simultaneous requests for the last allowed download serve only one.
export async function consumePublicFileDownload(deps: Pick<AppDeps, 'db' | 'clock'>, id: number, ip: string): Promise<boolean> {
  const now = deps.clock().toISOString();

  const [updated] = await deps.db
    .update(publicFiles)
    .set({
      download_count: sql`${publicFiles.download_count} + 1`,
      last_downloaded_at: now,
      last_downloaded_ip: ip,
    })
    .where(and(eq(publicFiles.id, id), activeCondition(now)))
    .returning({ id: publicFiles.id });

  return updated !== undefined;
}

export async function prunePublicFiles(deps: Deps): Promise<{ files: number; uploads: number }> {
  const now = deps.clock();
  const nowIso = now.toISOString();

  const expired = await deps.db
    .delete(publicFiles)
    .where(
      or(
        and(isNotNull(publicFiles.expires_at), lte(publicFiles.expires_at, nowIso)),
        and(isNotNull(publicFiles.max_downloads), gte(publicFiles.download_count, publicFiles.max_downloads))
      )
    )
    .returning({ storageKey: publicFiles.storage_key });

  for (const file of expired) await removeStoredFile(deps, file.storageKey);

  const staleBefore = new Date(now.getTime() - STALE_UPLOAD_MS).toISOString();

  const stale = await deps.db
    .delete(publicFileUploads)
    .where(lt(publicFileUploads.updated_at, staleBefore))
    .returning({ id: publicFileUploads.id });

  for (const upload of stale) await deps.fs.unlink(incomingPath(deps, upload.id)).catch(() => {});

  return { files: expired.length, uploads: stale.length };
}

// Removes what a crash can leave behind: a stored file whose row was never inserted, or a staging file whose session is gone.
export async function sweepOrphanPublicFiles(deps: Deps): Promise<number> {
  await ensurePublicFileStore(deps);

  const knownFiles = new Set((await deps.db.select({ key: publicFiles.storage_key }).from(publicFiles)).map((r) => r.key));
  const knownUploads = new Set((await deps.db.select({ id: publicFileUploads.id }).from(publicFileUploads)).map((r) => r.id));
  let removed = 0;

  for (const entry of await deps.fs.readdir(storePath(deps))) {
    if (entry === INCOMING_DIR || knownFiles.has(entry)) continue;
    const entryPath = path.join(storePath(deps), entry);
    if (!(await deps.fs.stat(entryPath)).isFile()) continue;
    await deps.fs.unlink(entryPath);
    removed++;
  }

  const incoming = path.join(storePath(deps), INCOMING_DIR);

  for (const entry of await deps.fs.readdir(incoming)) {
    if (knownUploads.has(entry)) continue;
    const entryPath = path.join(incoming, entry);
    if (!(await deps.fs.stat(entryPath)).isFile()) continue;
    await deps.fs.unlink(entryPath);
    removed++;
  }

  return removed;
}

export function initializePublicFileMaintenance(deps: AppDeps): void {
  void sweepOrphanPublicFiles(deps)
    .then(() => prunePublicFiles(deps))
    .catch((error: unknown) => deps.logger.error({ err: error }, 'public file maintenance failed'));

  maintenanceIntervalId = setInterval(() => {
    void prunePublicFiles(deps).catch((error: unknown) => deps.logger.error({ err: error }, 'public file prune failed'));
  }, MAINTENANCE_INTERVAL_MS);

  maintenanceIntervalId.unref();
}

export function stopPublicFileMaintenance(): void {
  if (maintenanceIntervalId) clearInterval(maintenanceIntervalId);
  maintenanceIntervalId = null;
}
