import { describe, it, expect, beforeAll, afterAll } from 'vitest';
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
