import { describe, it, expect, beforeEach } from 'vitest';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { ErrorCodes, PUBLIC_FILE_CHUNK_BYTES, PUBLIC_FILE_MAX_BYTES } from '@shulkr/shared';
import { publicFiles, publicFileUploads } from '@shulkr/backend/db/schema';
import { createTestDeps, resetTestDb, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedUser } from '@shulkr/backend/test/seed';
import {
  appendPublicFileChunk,
  cancelPublicFileUpload,
  completePublicFileUpload,
  consumePublicFileDownload,
  deletePublicFile,
  detectPublicFileType,
  listPublicFiles,
  openPublicFileUpload,
  prunePublicFiles,
  resolvePublicFile,
  rotatePublicFileToken,
  sanitizePublicFileName,
  sweepOrphanPublicFiles,
  updatePublicFile,
} from '@shulkr/backend/services/public_file_service';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

describe('public_file_service', () => {
  let deps: TestDeps;
  let userId: number;
  const store = () => deps.config.PUBLIC_FILES_PATH;

  beforeEach(async () => {
    resetTestDb();
    deps = createTestDeps({ now: '2026-01-01T00:00:00Z' });
    deps.fs.reset();
    deps.fs.setStatfs({ bsize: 4096, blocks: 10_000_000, bfree: 5_000_000, bavail: 5_000_000 });
    userId = (await seedUser(deps)).id;
  });

  async function upload(
    content: Buffer,
    opts: { name?: string; expiresInHours?: number | null; maxDownloads?: number | null } = {}
  ) {
    const { uploadId } = await openPublicFileUpload(deps, {
      userId,
      name: opts.name ?? 'banner.png',
      sizeBytes: content.length,
      expiresInHours: opts.expiresInHours === undefined ? 168 : opts.expiresInHours,
      maxDownloads: opts.maxDownloads ?? null,
    });

    await appendPublicFileChunk(deps, { uploadId, userId, offset: 0, chunk: content });

    return completePublicFileUpload(deps, { uploadId, userId });
  }

  function tokenOf(url: string): string {
    return url.replace('/f/', '');
  }

  describe('sanitizePublicFileName', () => {
    it('keeps only the last path component', () => {
      expect(sanitizePublicFileName('../../etc/passwd')).toBe('passwd');
      expect(sanitizePublicFileName('C:\\Users\\me\\pack.zip')).toBe('pack.zip');
    });

    it('removes control characters and unicode direction overrides', () => {
      expect(sanitizePublicFileName('photo\u202egpj.exe')).toBe('photogpj.exe');
      expect(sanitizePublicFileName('a\r\nb\u0000c')).toBe('abc');
    });

    it('falls back to a neutral name when nothing usable remains', () => {
      expect(sanitizePublicFileName('')).toBe('file');
      expect(sanitizePublicFileName('..')).toBe('file');
      expect(sanitizePublicFileName('dir/')).toBe('file');
    });

    it('caps the length at 200 code points', () => {
      expect(Array.from(sanitizePublicFileName('é'.repeat(300)))).toHaveLength(200);
    });
  });

  describe('detectPublicFileType', () => {
    it('serves raster images inline', () => {
      expect(detectPublicFileType(PNG)).toEqual({ mimeType: 'image/png', disposition: 'inline' });

      expect(detectPublicFileType(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toEqual({
        mimeType: 'image/jpeg',
        disposition: 'inline',
      });

      expect(detectPublicFileType(Buffer.from('GIF89a...'))).toEqual({ mimeType: 'image/gif', disposition: 'inline' });

      expect(detectPublicFileType(Buffer.from('RIFF\0\0\0\0WEBPVP8 '))).toEqual({
        mimeType: 'image/webp',
        disposition: 'inline',
      });
    });

    it('forces SVG, HTML and PDF to download as opaque bytes', () => {
      for (const content of ['<svg xmlns="http://www.w3.org/2000/svg">', '<!doctype html><script>', '%PDF-1.7']) {
        expect(detectPublicFileType(Buffer.from(content))).toEqual({
          mimeType: 'application/octet-stream',
          disposition: 'attachment',
        });
      }
    });

    it('recognizes a zip but still forces its download', () => {
      expect(detectPublicFileType(Buffer.from([0x50, 0x4b, 0x03, 0x04]))).toEqual({
        mimeType: 'application/zip',
        disposition: 'attachment',
      });
    });
  });

  describe('upload', () => {
    it('stores the file under a UUID unrelated to its name and token, and resolves it by token', async () => {
      const { file } = await upload(PNG, { name: 'banner.png' });
      const [row] = await deps.db.select().from(publicFiles);

      expect(row.storage_key).toMatch(/^[0-9a-f-]{36}$/);
      expect(file.url).not.toContain(row.storage_key);
      expect(file.url).not.toContain('banner');
      expect(deps.fs.files.get(path.join(store(), row.storage_key))).toEqual(PNG);

      const resolved = await resolvePublicFile(deps, tokenOf(file.url));

      expect(resolved?.row.id).toBe(row.id);
      expect(resolved?.filePath).toBe(path.join(store(), row.storage_key));
    });

    it('stores the token hashed and encrypted, never in clear', async () => {
      const { file } = await upload(PNG);
      const token = tokenOf(file.url);
      const [row] = await deps.db.select().from(publicFiles);

      expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(row.token_hash).toHaveLength(64);
      expect(row.token_hash).not.toContain(token);
      expect(row.token_encrypted).not.toContain(token);
    });

    it('exposes the SHA-1 of the exact stored bytes, as server.properties expects', async () => {
      const content = Buffer.from([0x50, 0x4b, 0x03, 0x04, 9, 8, 7]);
      const { file, row } = await upload(content, { name: 'pack.zip' });
      const stored = deps.fs.files.get(path.join(store(), row.storage_key))!;

      expect(stored.equals(content)).toBe(true);
      expect(file.sha1).toBe(createHash('sha1').update(content).digest('hex'));
    });

    it('detects the type from content, not from the declared name', async () => {
      const { file } = await upload(Buffer.from('<svg onload="alert(1)">'), { name: 'innocent.png' });

      expect(file.mimeType).toBe('application/octet-stream');
      expect(file.disposition).toBe('attachment');
    });

    it('rejects a file above 2 GiB', async () => {
      await expect(
        openPublicFileUpload(deps, {
          userId,
          name: 'x',
          sizeBytes: PUBLIC_FILE_MAX_BYTES + 1,
          expiresInHours: 1,
          maxDownloads: null,
        })
      ).rejects.toThrow(ErrorCodes.PUBLIC_FILE_TOO_LARGE);
    });

    it('counts uploads in progress against the quota', async () => {
      deps = createTestDeps({ now: '2026-01-01T00:00:00Z', env: { PUBLIC_FILES_MAX_TOTAL_BYTES: '100' } });
      deps.fs.setStatfs({ bsize: 4096, blocks: 10_000_000, bfree: 5_000_000, bavail: 5_000_000 });
      await openPublicFileUpload(deps, { userId, name: 'a', sizeBytes: 60, expiresInHours: 1, maxDownloads: null });

      await expect(
        openPublicFileUpload(deps, { userId, name: 'b', sizeBytes: 60, expiresInHours: 1, maxDownloads: null })
      ).rejects.toThrow(ErrorCodes.PUBLIC_FILE_QUOTA_EXCEEDED);
    });

    it('refuses an upload that would leave less than the free-space margin', async () => {
      deps.fs.setStatfs({ bsize: 4096, blocks: 1_000_000, bfree: 540_000, bavail: 540_000 });

      await expect(
        openPublicFileUpload(deps, { userId, name: 'big', sizeBytes: 100_000_000, expiresInHours: 1, maxDownloads: null })
      ).rejects.toThrow(ErrorCodes.PUBLIC_FILE_DISK_FULL);
    });

    it('limits the number of open uploads per user', async () => {
      for (let i = 0; i < 3; i++) {
        await openPublicFileUpload(deps, { userId, name: `f${i}`, sizeBytes: 1, expiresInHours: 1, maxDownloads: null });
      }

      await expect(
        openPublicFileUpload(deps, { userId, name: 'f4', sizeBytes: 1, expiresInHours: 1, maxDownloads: null })
      ).rejects.toThrow(ErrorCodes.PUBLIC_FILE_UPLOAD_LIMIT);
    });
  });

  describe('chunks', () => {
    async function open(sizeBytes: number) {
      return (await openPublicFileUpload(deps, { userId, name: 'pack.zip', sizeBytes, expiresInHours: 1, maxDownloads: null }))
        .uploadId;
    }

    it('assembles sequential chunks in order', async () => {
      const uploadId = await open(6);

      await appendPublicFileChunk(deps, { uploadId, userId, offset: 0, chunk: Buffer.from('abc') });
      await appendPublicFileChunk(deps, { uploadId, userId, offset: 3, chunk: Buffer.from('def') });
      const { row } = await completePublicFileUpload(deps, { uploadId, userId });

      expect(deps.fs.files.get(path.join(store(), row.storage_key))?.toString()).toBe('abcdef');
    });

    it('rejects an offset that is not exactly the received byte count', async () => {
      const uploadId = await open(6);
      await appendPublicFileChunk(deps, { uploadId, userId, offset: 0, chunk: Buffer.from('abc') });

      for (const offset of [0, 2, 4, -1]) {
        await expect(appendPublicFileChunk(deps, { uploadId, userId, offset, chunk: Buffer.from('d') })).rejects.toThrow(
          ErrorCodes.PUBLIC_FILE_CHUNK_INVALID
        );
      }
    });

    it('never lets the file grow past its declared size', async () => {
      const uploadId = await open(3);

      await expect(appendPublicFileChunk(deps, { uploadId, userId, offset: 0, chunk: Buffer.from('abcd') })).rejects.toThrow(
        ErrorCodes.PUBLIC_FILE_CHUNK_INVALID
      );

      const [session] = await deps.db.select().from(publicFileUploads).where(eq(publicFileUploads.id, uploadId));
      expect(session.received_bytes).toBe(0);
    });

    it('rejects an empty or oversized chunk', async () => {
      const uploadId = await open(PUBLIC_FILE_CHUNK_BYTES + 10);

      await expect(appendPublicFileChunk(deps, { uploadId, userId, offset: 0, chunk: Buffer.alloc(0) })).rejects.toThrow(
        ErrorCodes.PUBLIC_FILE_CHUNK_INVALID
      );

      await expect(
        appendPublicFileChunk(deps, { uploadId, userId, offset: 0, chunk: Buffer.alloc(PUBLIC_FILE_CHUNK_BYTES + 1) })
      ).rejects.toThrow(ErrorCodes.PUBLIC_FILE_CHUNK_INVALID);
    });

    it('treats another user session as nonexistent', async () => {
      const uploadId = await open(3);
      const other = (await seedUser(deps)).id;

      await expect(
        appendPublicFileChunk(deps, { uploadId, userId: other, offset: 0, chunk: Buffer.from('abc') })
      ).rejects.toThrow(ErrorCodes.PUBLIC_FILE_UPLOAD_NOT_FOUND);

      await expect(completePublicFileUpload(deps, { uploadId, userId: other })).rejects.toThrow(
        ErrorCodes.PUBLIC_FILE_UPLOAD_NOT_FOUND
      );

      expect(await cancelPublicFileUpload(deps, { uploadId, userId: other })).toBe(false);
    });

    it('rejects an upload id shaped like a path', async () => {
      await expect(
        appendPublicFileChunk(deps, { uploadId: '../../../etc/passwd', userId, offset: 0, chunk: Buffer.from('x') })
      ).rejects.toThrow(ErrorCodes.PUBLIC_FILE_UPLOAD_NOT_FOUND);
    });

    it('refuses to finalize an incomplete upload', async () => {
      const uploadId = await open(6);
      await appendPublicFileChunk(deps, { uploadId, userId, offset: 0, chunk: Buffer.from('abc') });

      await expect(completePublicFileUpload(deps, { uploadId, userId })).rejects.toThrow(
        ErrorCodes.PUBLIC_FILE_UPLOAD_INCOMPLETE
      );
    });

    it('cancelling removes the session and its staging file', async () => {
      const uploadId = await open(6);
      await appendPublicFileChunk(deps, { uploadId, userId, offset: 0, chunk: Buffer.from('abc') });

      expect(await cancelPublicFileUpload(deps, { uploadId, userId })).toBe(true);
      expect(await deps.db.select().from(publicFileUploads)).toHaveLength(0);
      expect(deps.fs.files.has(path.join(store(), '.incoming', uploadId))).toBe(false);
    });
  });

  describe('resolution', () => {
    it('returns null for malformed, unknown, expired and exhausted tokens', async () => {
      const { file: expiring } = await upload(PNG, { expiresInHours: 1 });
      const { file: capped } = await upload(PNG, { maxDownloads: 1 });

      expect(await resolvePublicFile(deps, 'short')).toBeNull();
      expect(await resolvePublicFile(deps, '../' + 'a'.repeat(40))).toBeNull();
      expect(await resolvePublicFile(deps, 'A'.repeat(43))).toBeNull();

      const [cappedRow] = await deps.db.select().from(publicFiles).where(eq(publicFiles.id, capped.id));
      expect(await consumePublicFileDownload(deps, cappedRow.id, '1.2.3.4')).toBe(true);
      expect(await resolvePublicFile(deps, tokenOf(capped.url))).toBeNull();

      const later = createTestDeps({ now: '2026-01-01T02:00:00Z' });
      expect(await resolvePublicFile(later, tokenOf(expiring.url))).toBeNull();
    });

    it('returns null when the file vanished from disk', async () => {
      const { file, row } = await upload(PNG);
      await deps.fs.unlink(path.join(store(), row.storage_key));

      expect(await resolvePublicFile(deps, tokenOf(file.url))).toBeNull();
    });

    it('never serves a row whose storage key escapes the store', async () => {
      const { file, row } = await upload(PNG);
      deps.sqlite.prepare('UPDATE public_files SET storage_key = ? WHERE id = ?').run('../../data/shulkr.db', row.id);

      expect(await resolvePublicFile(deps, tokenOf(file.url))).toBeNull();
    });

    it('consumes the last allowed download only once', async () => {
      const { row } = await upload(PNG, { maxDownloads: 1 });

      const results = await Promise.all([
        consumePublicFileDownload(deps, row.id, '1.1.1.1'),
        consumePublicFileDownload(deps, row.id, '2.2.2.2'),
      ]);

      expect(results.filter(Boolean)).toHaveLength(1);
    });
  });

  describe('management', () => {
    it('lists files with a re-displayable url', async () => {
      const { file } = await upload(PNG);
      const [listed] = await listPublicFiles(deps);

      expect(listed.url).toBe(file.url);
      expect(listed.sizeBytes).toBe(PNG.length);
    });

    it('rotating kills the previous url', async () => {
      const { file } = await upload(PNG);
      const rotated = await rotatePublicFileToken(deps, file.id);

      expect(rotated?.url).not.toBe(file.url);
      expect(await resolvePublicFile(deps, tokenOf(file.url))).toBeNull();
      expect(await resolvePublicFile(deps, tokenOf(rotated!.url))).not.toBeNull();
    });

    it('updates expiry relative to now and the download cap', async () => {
      const { file } = await upload(PNG);
      const updated = await updatePublicFile(deps, file.id, { expiresInHours: null, maxDownloads: 5 });

      expect(updated?.expiresAt).toBeNull();
      expect(updated?.maxDownloads).toBe(5);
    });

    it('replacing the content keeps the url and updates the digest', async () => {
      const { file, row: before } = await upload(Buffer.from('pack-v1'), { name: 'pack.zip', maxDownloads: 50 });
      await consumePublicFileDownload(deps, file.id, '1.1.1.1');

      const next = Buffer.from('pack-v2-larger');

      const { uploadId } = await openPublicFileUpload(deps, {
        userId,
        name: 'pack-v2.zip',
        sizeBytes: next.length,
        expiresInHours: null,
        maxDownloads: null,
        replacesFileId: file.id,
      });

      await appendPublicFileChunk(deps, { uploadId, userId, offset: 0, chunk: next });
      const { file: replaced, replaced: wasReplaced } = await completePublicFileUpload(deps, { uploadId, userId });

      expect(wasReplaced).toBe(true);
      expect(replaced.id).toBe(file.id);
      expect(replaced.url).toBe(file.url);
      expect(replaced.sha1).toBe(createHash('sha1').update(next).digest('hex'));
      expect(replaced.sizeBytes).toBe(next.length);
      expect(replaced.name).toBe('pack-v2.zip');
      expect(replaced.expiresAt).toBe(file.expiresAt);
      expect(replaced.maxDownloads).toBe(50);
      expect(replaced.downloadCount).toBe(1);
      expect(deps.fs.files.has(path.join(store(), before.storage_key))).toBe(false);

      const resolved = await resolvePublicFile(deps, tokenOf(file.url));
      expect(deps.fs.files.get(resolved!.filePath)?.toString()).toBe('pack-v2-larger');
      expect(await deps.db.select().from(publicFiles)).toHaveLength(1);
    });

    it('refuses to replace a file that does not exist', async () => {
      await expect(
        openPublicFileUpload(deps, {
          userId,
          name: 'x',
          sizeBytes: 1,
          expiresInHours: null,
          maxDownloads: null,
          replacesFileId: 999,
        })
      ).rejects.toThrow(ErrorCodes.PUBLIC_FILE_NOT_FOUND);
    });

    it('a replacement finishing after its target was deleted leaves nothing behind', async () => {
      const { file, row } = await upload(Buffer.from('v1'));

      const { uploadId } = await openPublicFileUpload(deps, {
        userId,
        name: 'v2',
        sizeBytes: 2,
        expiresInHours: null,
        maxDownloads: null,
        replacesFileId: file.id,
      });

      await appendPublicFileChunk(deps, { uploadId, userId, offset: 0, chunk: Buffer.from('v2') });
      // Production opens SQLite without foreign_keys, so the pending session survives its target.
      deps.sqlite.exec('PRAGMA foreign_keys = OFF;');
      deps.sqlite.prepare('DELETE FROM public_files WHERE id = ?').run(file.id);
      deps.sqlite.exec('PRAGMA foreign_keys = ON;');

      await expect(completePublicFileUpload(deps, { uploadId, userId })).rejects.toThrow(ErrorCodes.PUBLIC_FILE_NOT_FOUND);
      expect([...deps.fs.files.keys()].filter((k) => k.startsWith(store()))).toEqual([path.join(store(), row.storage_key)]);
    });

    it('deleting removes the row and the stored file', async () => {
      const { file, row } = await upload(PNG);

      await deletePublicFile(deps, file.id);

      expect(await deps.db.select().from(publicFiles)).toHaveLength(0);
      expect(deps.fs.files.has(path.join(store(), row.storage_key))).toBe(false);
    });
  });

  describe('maintenance', () => {
    it('prunes expired and exhausted files and stale uploads', async () => {
      const { row: expiring } = await upload(PNG, { expiresInHours: 1 });
      const { row: capped } = await upload(PNG, { maxDownloads: 1, expiresInHours: null });
      const { row: kept } = await upload(PNG, { expiresInHours: null });
      await consumePublicFileDownload(deps, capped.id, '1.1.1.1');
      await openPublicFileUpload(deps, { userId, name: 'stale', sizeBytes: 5, expiresInHours: 1, maxDownloads: null });

      const later = createTestDeps({ now: '2026-01-02T01:00:00Z' });
      later.fs = deps.fs;
      const result = await prunePublicFiles(later);

      expect(result).toEqual({ files: 2, uploads: 1 });
      expect((await deps.db.select().from(publicFiles)).map((r) => r.id)).toEqual([kept.id]);
      expect(deps.fs.files.has(path.join(store(), expiring.storage_key))).toBe(false);
      expect(deps.fs.files.has(path.join(store(), capped.storage_key))).toBe(false);
    });

    it('sweeps orphan files left by a crash, keeping known ones', async () => {
      const { row } = await upload(PNG);
      deps.fs.put(path.join(store(), 'e3b0c442-98fc-4c14-9afb-f4c8996fb924'), 'orphan');
      deps.fs.put(path.join(store(), '.incoming', 'abandoned'), 'partial');

      expect(await sweepOrphanPublicFiles(deps)).toBe(2);
      expect(deps.fs.files.has(path.join(store(), row.storage_key))).toBe(true);
    });
  });
});
