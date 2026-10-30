import { describe, it, expect, beforeAll, afterAll, afterEach, vi } from 'vitest';
import AdmZip from 'adm-zip';
import { createTestApp, type TestApp } from '@shulkr/backend/test/createTestApp';
import { seedAuthenticatedUser, seedServer } from '@shulkr/backend/test/seed';

function buildJar(entries: Record<string, string>, options: { stored?: boolean } = {}): Buffer {
  const zip = new AdmZip();

  for (let i = 0; i < 300; i++) {
    zip.addFile(`com/example/Class${i}.class`, Buffer.alloc(512, i));
  }

  for (const [name, content] of Object.entries(entries)) {
    zip.addFile(name, Buffer.from(content, 'utf-8'));
    if (options.stored) zip.getEntry(name)!.header.method = 0;
  }

  return zip.toBuffer();
}

describe('plugins routes', () => {
  type ListedPlugin = {
    filename: string;
    enabled: boolean;
    version: string | null;
    description: string | null;
    authors: Array<string>;
  };

  let testApp: TestApp;
  let plugins: Array<ListedPlugin>;

  beforeAll(async () => {
    testApp = await createTestApp();

    const server = seedServer(testApp.deps);
    const user = await seedAuthenticatedUser(testApp.app, testApp.deps, { permissions: ['server:plugins:list'] });

    const jars: Record<string, Buffer> = {
      'Spigot.jar': buildJar({
        'plugin.yml': 'name: Spigot\nversion: 1.2.3\ndescription: A spigot plugin\nauthors: [alice, bob]\n',
      }),
      'Paper.jar': buildJar({ 'paper-plugin.yml': 'name: Paper\nversion: 2.0.1\nauthor: carol\n' }),
      'Both.jar': buildJar({ 'paper-plugin.yml': 'name: Both\nversion: paper\n', 'plugin.yml': 'name: Both\nversion: spigot\n' }),
      'Stored.jar': buildJar({ 'plugin.yml': 'name: Stored\nversion: 0.1\n' }, { stored: true }),
      'Disabled.jar_': buildJar({ 'plugin.yml': 'name: Disabled\nversion: 9\n' }),
      'NoDescriptor.jar': buildJar({ 'config.yml': 'foo: bar\n' }),
      'Corrupted.jar': Buffer.from('not a zip archive'),
    };

    for (const [filename, content] of Object.entries(jars)) {
      testApp.deps.fs.put(`/tmp/test-${server.id}/plugins/${filename}`, content);
    }

    const res = await testApp.app.inject({
      method: 'GET',
      url: `/api/servers/${server.id}/plugins`,
      headers: user.headers,
    });

    expect(res.statusCode).toBe(200);
    plugins = (res.json() as { plugins: Array<ListedPlugin> }).plugins;
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  function find(filename: string): ListedPlugin {
    const plugin = plugins.find((p) => p.filename === filename);
    expect(plugin).toBeDefined();

    return plugin!;
  }

  it('reads version, description and authors from plugin.yml', () => {
    expect(find('Spigot.jar')).toMatchObject({
      enabled: true,
      version: '1.2.3',
      description: 'A spigot plugin',
      authors: ['alice', 'bob'],
    });
  });

  it('falls back to paper-plugin.yml and a single author', () => {
    expect(find('Paper.jar')).toMatchObject({ version: '2.0.1', description: null, authors: ['carol'] });
  });

  it('prefers plugin.yml over paper-plugin.yml', () => {
    expect(find('Both.jar').version).toBe('spigot');
  });

  it('reads an uncompressed descriptor', () => {
    expect(find('Stored.jar').version).toBe('0.1');
  });

  it('reads metadata of a disabled plugin', () => {
    expect(find('Disabled.jar_')).toMatchObject({ enabled: false, version: '9' });
  });

  it('lists a jar without descriptor or an unreadable jar with empty metadata', () => {
    expect(find('NoDescriptor.jar')).toMatchObject({ version: null, description: null, authors: [] });
    expect(find('Corrupted.jar')).toMatchObject({ version: null, description: null, authors: [] });
  });
});

describe('plugin toggle and delete routes', () => {
  let testApp: TestApp;
  let serverId: string;
  let headers: Record<string, string>;

  beforeAll(async () => {
    testApp = await createTestApp();
    serverId = seedServer(testApp.deps).id;

    const user = await seedAuthenticatedUser(testApp.app, testApp.deps, {
      permissions: ['server:plugins:toggle', 'server:plugins:delete'],
    });

    headers = user.headers;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await testApp.cleanup();
  });

  function pluginPath(filename: string): string {
    return `/tmp/test-${serverId}/plugins/${filename}`;
  }

  function toggle(filename: string, targetServerId = serverId) {
    return testApp.app.inject({
      method: 'POST',
      url: `/api/servers/${targetServerId}/plugins/toggle`,
      headers,
      payload: { filename },
    });
  }

  function remove(filename: string) {
    return testApp.app.inject({
      method: 'DELETE',
      url: `/api/servers/${serverId}/plugins/${encodeURIComponent(filename)}`,
      headers,
    });
  }

  it('disables an enabled plugin by renaming it', async () => {
    testApp.deps.fs.put(pluginPath('WorldEdit.jar'), 'jar');

    const res = await toggle('WorldEdit.jar');

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ name: 'WorldEdit.jar_', enabled: false });
    expect(await testApp.deps.fs.exists(pluginPath('WorldEdit.jar_'))).toBe(true);
  });

  it('returns 404 when toggling a missing plugin', async () => {
    const res = await toggle('Missing.jar');

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'FILE_NOT_FOUND' });
  });

  it('returns 409 and leaves both files untouched when the target name already exists', async () => {
    testApp.deps.fs.put(pluginPath('Twin.jar'), 'enabled');
    testApp.deps.fs.put(pluginPath('Twin.jar_'), 'disabled');

    const res = await toggle('Twin.jar');

    expect(res.statusCode).toBe(409);
    expect(res.json()).toMatchObject({ code: 'FILE_ALREADY_EXISTS' });
    expect((await testApp.deps.fs.readFile(pluginPath('Twin.jar'))).toString()).toBe('enabled');
    expect((await testApp.deps.fs.readFile(pluginPath('Twin.jar_'))).toString()).toBe('disabled');
  });

  it('returns 500 when the rename fails on disk', async () => {
    testApp.deps.fs.put(pluginPath('Locked.jar'), 'jar');
    vi.spyOn(testApp.deps.fs, 'rename').mockRejectedValueOnce(new Error('EACCES'));

    const res = await toggle('Locked.jar');

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ code: 'FILE_ACCESS_DENIED', message: 'Failed to toggle plugin' });
    expect(await testApp.deps.fs.exists(pluginPath('Locked.jar'))).toBe(true);
  });

  it('returns 400 and renames nothing when toggling a file that is not a plugin jar', async () => {
    testApp.deps.fs.put(pluginPath('config.yml'), 'foo: bar');

    const res = await toggle('config.yml');

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
    expect(await testApp.deps.fs.exists(pluginPath('config.yml'))).toBe(true);
  });

  it('returns 400 when the filename escapes the server folder', async () => {
    const res = await toggle('../../outside.jar');

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'FILE_PATH_TRAVERSAL' });
  });

  it('returns 404 when the server does not exist', async () => {
    const res = await toggle('WorldEdit.jar', 'unknown-server');

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'SERVER_NOT_FOUND' });
  });

  it('deletes a plugin', async () => {
    testApp.deps.fs.put(pluginPath('Old.jar'), 'jar');

    const res = await remove('Old.jar');

    expect(res.statusCode).toBe(200);
    expect(await testApp.deps.fs.exists(pluginPath('Old.jar'))).toBe(false);
  });

  it('returns 404 when deleting a missing plugin', async () => {
    const res = await remove('Missing.jar');

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ code: 'FILE_NOT_FOUND' });
  });

  it('returns 400 when deleting a file that is not a plugin jar', async () => {
    const res = await remove('config.yml');

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ code: 'VALIDATION_ERROR' });
  });

  it('returns 500 when the deletion fails on disk', async () => {
    testApp.deps.fs.put(pluginPath('Stuck.jar'), 'jar');
    vi.spyOn(testApp.deps.fs, 'unlink').mockRejectedValueOnce(new Error('EACCES'));

    const res = await remove('Stuck.jar');

    expect(res.statusCode).toBe(500);
    expect(res.json()).toMatchObject({ code: 'FILE_ACCESS_DENIED', message: 'Failed to delete plugin' });
    expect(await testApp.deps.fs.exists(pluginPath('Stuck.jar'))).toBe(true);
  });
});
