import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';
import { customDomains } from '@shulkr/backend/db/schema';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedAuthenticatedUser, type SeededAuth } from '@shulkr/backend/test/seed';

const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);
const ZIP = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00, 0x00, 0x00]);
const ALL = ['shares:files'];

describe('public files', () => {
  let testApp: TestApp;
  let ipCounter = 0;

  beforeAll(async () => {
    testApp = await createTestApp();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  beforeEach(() => {
    testApp.deps.fs.reset();
    testApp.deps.fs.setStatfs({ bsize: 4096, blocks: 10_000_000, bfree: 5_000_000, bavail: 5_000_000 });

    for (const table of ['public_files', 'public_file_uploads', 'audit_logs', 'custom_domains', 'users']) {
      testApp.deps.sqlite.exec(`DELETE FROM ${table};`);
    }
  });

  // Each public request gets its own address so the per-IP limit of the public route never interferes with unrelated assertions.
  function fetchPublic(
    url: string,
    method: 'GET' | 'HEAD' = 'GET',
    remoteAddress = `10.0.${Math.floor(ipCounter / 250)}.${ipCounter++ % 250}`
  ) {
    return testApp.app.inject({ method, url, remoteAddress });
  }

  async function seed(permissions: Array<string> = ALL): Promise<SeededAuth> {
    return seedAuthenticatedUser(testApp.app, testApp.deps, { permissions });
  }

  async function sendChunk(auth: SeededAuth, uploadId: string, offset: number, chunk: Buffer) {
    return testApp.app.inject({
      method: 'PUT',
      url: `/api/public-files/uploads/${uploadId}/chunks?offset=${offset}`,
      headers: { ...auth.headers, 'content-type': 'application/octet-stream' },
      payload: chunk,
    });
  }

  async function share(
    auth: SeededAuth,
    content: Buffer,
    opts: { name?: string; expiresInHours?: number | null; maxDownloads?: number | null } = {}
  ) {
    const open = await testApp.app.inject({
      method: 'POST',
      url: '/api/public-files/uploads',
      headers: auth.headers,
      payload: {
        name: opts.name ?? 'file.bin',
        sizeBytes: content.length,
        expiresInHours: opts.expiresInHours === undefined ? 168 : opts.expiresInHours,
        maxDownloads: opts.maxDownloads ?? null,
      },
    });

    expect(open.statusCode).toBe(201);
    const { uploadId } = open.json() as { uploadId: string };

    expect((await sendChunk(auth, uploadId, 0, content)).statusCode).toBe(200);

    const done = await testApp.app.inject({
      method: 'POST',
      url: `/api/public-files/uploads/${uploadId}/complete`,
      headers: auth.headers,
    });

    expect(done.statusCode).toBe(201);

    return done.json() as { id: number; url: string; sha1: string; mimeType: string; disposition: string };
  }

  describe('permissions', () => {
    it('rejects every route without a token', async () => {
      expect((await testApp.app.inject({ method: 'GET', url: '/api/public-files' })).statusCode).toBe(401);
      expect((await sendChunk({ headers: {} } as SeededAuth, 'x'.repeat(22), 0, ZIP)).statusCode).toBe(401);
    });

    it('requires shares:files:list to list', async () => {
      const viewer = await seed(['shares:files:upload']);

      expect((await testApp.app.inject({ method: 'GET', url: '/api/public-files', headers: viewer.headers })).statusCode).toBe(
        403
      );
    });

    it('requires shares:files:upload to open an upload or send a chunk', async () => {
      const viewer = await seed(['shares:files:list']);

      const open = await testApp.app.inject({
        method: 'POST',
        url: '/api/public-files/uploads',
        headers: viewer.headers,
        payload: { name: 'a', sizeBytes: 1, expiresInHours: 1, maxDownloads: null },
      });

      expect(open.statusCode).toBe(403);
      expect((await sendChunk(viewer, 'x'.repeat(22), 0, ZIP)).statusCode).toBe(403);
    });

    it('requires shares:files:manage to update, rotate, replace or delete', async () => {
      const admin = await seed();
      const file = await share(admin, ZIP);
      const uploader = await seed(['shares:files:list', 'shares:files:upload']);

      const requests = [
        { method: 'PATCH' as const, url: `/api/public-files/${file.id}`, payload: { expiresInHours: null, maxDownloads: null } },
        { method: 'POST' as const, url: `/api/public-files/${file.id}/rotate` },
        { method: 'POST' as const, url: `/api/public-files/${file.id}/replace`, payload: { name: 'b', sizeBytes: 1 } },
        { method: 'DELETE' as const, url: `/api/public-files/${file.id}` },
      ];

      for (const request of requests) {
        expect((await testApp.app.inject({ ...request, headers: uploader.headers })).statusCode).toBe(403);
      }
    });
  });

  describe('public route', () => {
    it('serves the exact uploaded bytes without authentication', async () => {
      const admin = await seed();
      const file = await share(admin, ZIP, { name: 'pack.zip' });

      const res = await fetchPublic(file.url);

      expect(res.statusCode).toBe(200);
      expect(res.rawPayload.equals(ZIP)).toBe(true);
      expect(createHash('sha1').update(res.rawPayload).digest('hex')).toBe(file.sha1);
      expect(res.headers['content-type']).toBe('application/zip');
      expect(res.headers['content-length']).toBe(String(ZIP.length));
      expect(res.headers['content-disposition']).toBe(`attachment; filename="pack.zip"; filename*=UTF-8''pack.zip`);
    });

    it('sets the hardening headers on a download', async () => {
      const admin = await seed();
      const file = await share(admin, ZIP);

      const res = await fetchPublic(file.url);

      expect(res.headers['content-security-policy']).toContain('sandbox');
      expect(res.headers['content-security-policy']).toContain("default-src 'none'");
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['referrer-policy']).toBe('no-referrer');
      expect(res.headers['x-robots-tag']).toBe('noindex, nofollow');
      expect(res.headers['cache-control']).toBe('no-store');
      expect(res.headers['cross-origin-resource-policy']).toBe('same-origin');
    });

    it('serves a raster image inline and embeddable', async () => {
      const admin = await seed();
      const file = await share(admin, PNG, { name: 'banner.png' });

      const res = await fetchPublic(file.url);

      expect(res.headers['content-type']).toBe('image/png');
      expect(res.headers['content-disposition']).toMatch(/^inline;/);
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    });

    it('forces an SVG disguised as a PNG to download as opaque bytes', async () => {
      const admin = await seed();

      const file = await share(admin, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), {
        name: 'logo.png',
      });

      const res = await fetchPublic(file.url);

      expect(res.headers['content-type']).toBe('application/octet-stream');
      expect(res.headers['content-disposition']).toMatch(/^attachment;/);
    });

    it('encodes a non-ASCII name with an ASCII fallback that cannot break the header', async () => {
      const admin = await seed();
      const file = await share(admin, ZIP, { name: 'résumé "final".zip' });

      const res = await fetchPublic(file.url);

      expect(res.headers['content-disposition']).toBe(
        `attachment; filename="r_sum_ _final_.zip"; filename*=UTF-8''r%C3%A9sum%C3%A9%20%22final%22.zip`
      );
    });

    it('answers one identical 404 for every invalid case', async () => {
      const admin = await seed();
      const rotated = await share(admin, ZIP);
      const deleted = await share(admin, ZIP);
      const exhausted = await share(admin, ZIP, { maxDownloads: 1 });

      await testApp.app.inject({ method: 'POST', url: `/api/public-files/${rotated.id}/rotate`, headers: admin.headers });
      await testApp.app.inject({ method: 'DELETE', url: `/api/public-files/${deleted.id}`, headers: admin.headers });
      await fetchPublic(exhausted.url);

      const urls = ['/f/short', '/f/..%2F..%2Fdata%2Fshulkr.db', `/f/${'A'.repeat(43)}`, rotated.url, deleted.url, exhausted.url];

      const responses = await Promise.all(urls.map((url) => fetchPublic(url)));
      const reference = responses[0];

      for (const res of responses) {
        expect(res.statusCode).toBe(404);
        expect(res.body).toBe(reference.body);
        expect(res.headers['content-security-policy']).toBe(reference.headers['content-security-policy']);
        expect(res.headers['cache-control']).toBe('no-store');
      }
    });

    it('stops serving an expired link', async () => {
      const admin = await seed();
      const file = await share(admin, ZIP, { expiresInHours: 1 });
      testApp.deps.sqlite.prepare('UPDATE public_files SET expires_at = ? WHERE id = ?').run('2025-12-31T23:00:00.000Z', file.id);

      expect((await fetchPublic(file.url)).statusCode).toBe(404);
    });

    it('does not consume a download on HEAD', async () => {
      const admin = await seed();
      const file = await share(admin, ZIP, { maxDownloads: 1 });

      const head = await fetchPublic(file.url, 'HEAD');

      expect(head.statusCode).toBe(200);
      expect(head.headers['content-length']).toBe(String(ZIP.length));
      expect((await fetchPublic(file.url)).statusCode).toBe(200);
      expect((await fetchPublic(file.url)).statusCode).toBe(404);
    });

    it('audits a public download with the visitor ip', async () => {
      const admin = await seed();
      const file = await share(admin, ZIP);

      await fetchPublic(file.url, 'GET', '203.0.113.7');

      const row = testApp.deps.sqlite.prepare(`SELECT * FROM audit_logs WHERE action = 'public_file_download'`).get() as {
        ip: string;
        user_id: number | null;
      };

      expect(row.ip).toBe('203.0.113.7');
      expect(row.user_id).toBeNull();
    });

    it('limits requests per ip', async () => {
      const statuses: Array<number> = [];

      for (let i = 0; i < 31; i++) statuses.push((await fetchPublic('/f/short', 'GET', '198.51.100.1')).statusCode);

      expect(statuses.slice(0, 30).every((s) => s === 404)).toBe(true);
      expect(statuses[30]).toBe(429);
    });
  });

  describe('uploads', () => {
    it('isolates upload sessions between users', async () => {
      const alice = await seed();
      const bob = await seed();

      const open = await testApp.app.inject({
        method: 'POST',
        url: '/api/public-files/uploads',
        headers: alice.headers,
        payload: { name: 'a', sizeBytes: ZIP.length, expiresInHours: 1, maxDownloads: null },
      });

      const { uploadId } = open.json() as { uploadId: string };

      expect((await sendChunk(bob, uploadId, 0, ZIP)).statusCode).toBe(404);

      const complete = await testApp.app.inject({
        method: 'POST',
        url: `/api/public-files/uploads/${uploadId}/complete`,
        headers: bob.headers,
      });

      expect(complete.statusCode).toBe(404);
    });

    it('rejects a chunk at the wrong offset', async () => {
      const admin = await seed();

      const open = await testApp.app.inject({
        method: 'POST',
        url: '/api/public-files/uploads',
        headers: admin.headers,
        payload: { name: 'a', sizeBytes: 10, expiresInHours: 1, maxDownloads: null },
      });

      const { uploadId } = open.json() as { uploadId: string };

      expect((await sendChunk(admin, uploadId, 4, ZIP)).statusCode).toBe(409);

      const badOffset = await testApp.app.inject({
        method: 'PUT',
        url: `/api/public-files/uploads/${uploadId}/chunks?offset=-1`,
        headers: { ...admin.headers, 'content-type': 'application/octet-stream' },
        payload: ZIP,
      });

      expect(badOffset.statusCode).toBe(400);
    });
  });

  describe('management', () => {
    it('lists files with a null base url when no panel domain is configured', async () => {
      const admin = await seed();
      const file = await share(admin, ZIP);

      const res = await testApp.app.inject({ method: 'GET', url: '/api/public-files', headers: admin.headers });
      const body = res.json() as { files: Array<{ url: string }>; baseUrl: string | null; usedBytes: number };

      expect(body.baseUrl).toBeNull();
      expect(body.files[0].url).toBe(file.url);
      expect(body.usedBytes).toBe(ZIP.length);
    });

    it('uses the panel domain as base url, https once SSL is enabled', async () => {
      const admin = await seed();

      await testApp.deps.db
        .insert(customDomains)
        .values({ server_id: null, domain: 'panel.example.org', port: 3001, type: 'panel', ssl_enabled: true });

      const res = await testApp.app.inject({ method: 'GET', url: '/api/public-files', headers: admin.headers });

      expect((res.json() as { baseUrl: string }).baseUrl).toBe('https://panel.example.org');
    });

    describe('base url scheme when ssl_enabled lags behind nginx', () => {
      async function listBaseUrl(opts: { forwardedProto?: string; remoteAddress?: string; withDomain?: boolean }) {
        const admin = await seed();

        if (opts.withDomain !== false) {
          await testApp.deps.db
            .insert(customDomains)
            .values({ server_id: null, domain: 'panel.example.org', port: 3001, type: 'panel', ssl_enabled: false });
        }

        const res = await testApp.app.inject({
          method: 'GET',
          url: '/api/public-files',
          headers: { ...admin.headers, ...(opts.forwardedProto ? { 'x-forwarded-proto': opts.forwardedProto } : {}) },
          remoteAddress: opts.remoteAddress ?? '127.0.0.1',
        });

        return (res.json() as { baseUrl: string | null }).baseUrl;
      }

      it('keeps http when neither the database nor the request says https', async () => {
        expect(await listBaseUrl({})).toBe('http://panel.example.org');
      });

      it('uses https when the request reached the panel over HTTPS through the local proxy', async () => {
        expect(await listBaseUrl({ forwardedProto: 'https' })).toBe('https://panel.example.org');
      });

      it('ignores X-Forwarded-Proto sent by an address that is not a trusted proxy', async () => {
        expect(await listBaseUrl({ forwardedProto: 'https', remoteAddress: '203.0.113.9' })).toBe('http://panel.example.org');
      });

      it('still leaves the base url to the browser when no panel domain is configured', async () => {
        expect(await listBaseUrl({ forwardedProto: 'https', withDomain: false })).toBeNull();
      });
    });

    it('replacing the content keeps the public url and serves the new bytes', async () => {
      const admin = await seed();
      const file = await share(admin, ZIP, { name: 'pack.zip' });
      const next = Buffer.concat([ZIP, Buffer.from('v2')]);

      const open = await testApp.app.inject({
        method: 'POST',
        url: `/api/public-files/${file.id}/replace`,
        headers: admin.headers,
        payload: { name: 'pack.zip', sizeBytes: next.length },
      });

      expect(open.statusCode).toBe(201);
      const { uploadId } = open.json() as { uploadId: string };
      await sendChunk(admin, uploadId, 0, next);

      const done = await testApp.app.inject({
        method: 'POST',
        url: `/api/public-files/uploads/${uploadId}/complete`,
        headers: admin.headers,
      });

      const replaced = done.json() as { url: string; sha1: string };

      expect(replaced.url).toBe(file.url);
      expect(replaced.sha1).not.toBe(file.sha1);

      const res = await fetchPublic(file.url);

      expect(res.rawPayload.equals(next)).toBe(true);
      expect(createHash('sha1').update(res.rawPayload).digest('hex')).toBe(replaced.sha1);
    });

    it('replacing an unknown file answers 404', async () => {
      const admin = await seed();

      const res = await testApp.app.inject({
        method: 'POST',
        url: '/api/public-files/999/replace',
        headers: admin.headers,
        payload: { name: 'x', sizeBytes: 1 },
      });

      expect(res.statusCode).toBe(404);
    });
  });
});
