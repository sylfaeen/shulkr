import { describe, it, expect, beforeEach, vi } from 'vitest';
import { serverProcessManager, type ServerConfig } from '@shulkr/backend/services/server_process_manager';
import { createTestDeps } from '@shulkr/backend/test/createTestDeps';
import type { FakeShellRunner } from '@shulkr/backend/test/fakes/fake_shell';
import type { FakeFsAdapter } from '@shulkr/backend/test/fakes/fake_fs';
import { seedServer } from '@shulkr/backend/test/seed';
import type { AppDeps } from '@shulkr/backend/deps';

function makeConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  return {
    id: `srv-${Math.random().toString(36).slice(2, 10)}`,
    name: 'test',
    path: '/srv/minecraft/test',
    jar_file: 'paper.jar',
    min_ram: '1G',
    max_ram: '2G',
    jvm_flags: '',
    java_port: 25565,
    java_path: null,
    auto_restart_on_crash: false,
    ...overrides,
  };
}

function seedHappyPath(fs: FakeFsAdapter, shell: FakeShellRunner, config: ServerConfig, javaVersion = '21') {
  fs.put('/usr/bin/java', '#!/bin/sh\nexit 0');
  fs.put(`${config.path}/${config.jar_file}`, 'jar-bytes');
  shell.mockRun('/usr/bin/java', { success: true, stdout: '', stderr: `openjdk version "${javaVersion}"`, exitCode: 0 });
}

async function spawnArgsFor(javaVersion: string, jvmFlags = '') {
  vi.useFakeTimers();
  const deps = createTestDeps();
  const config = makeConfig({ jvm_flags: jvmFlags });
  seedHappyPath(deps.fs, deps.shell, config, javaVersion);

  const startPromise = serverProcessManager.start(config);
  await vi.advanceTimersByTimeAsync(0);
  deps.shell.lastSpawnHandle()?.triggerSpawn();
  await startPromise;

  const args = deps.shell.calls.find((c) => c.kind === 'spawn')?.args ?? [];
  deps.shell.lastSpawnHandle()?.triggerExit(0);
  await vi.advanceTimersByTimeAsync(0);
  vi.useRealTimers();

  return args;
}

describe('server_process_manager', () => {
  beforeEach(() => {
    createTestDeps();
  });

  it('getStatus returns stopped for an unknown server', () => {
    const status = serverProcessManager.getStatus('srv-unknown');
    expect(status).toEqual({ status: 'stopped', pid: null, uptime: null });
  });

  it('sendCommand returns false for an unknown / non-running server', () => {
    expect(serverProcessManager.sendCommand('srv-unknown', 'list')).toBe(false);
  });

  it('getRunningServers returns [] when no server is started', () => {
    expect(serverProcessManager.getRunningServers()).toEqual([]);
  });

  it('start returns SERVER_JAVA_NOT_FOUND when no java binary is reachable', async () => {
    const deps = createTestDeps();
    const config = makeConfig();
    deps.fs.put(`${config.path}/${config.jar_file}`, 'jar-bytes');
    deps.shell.mockRun('which', { success: false, stdout: '', stderr: 'not found', exitCode: 1 });

    const result = await serverProcessManager.start(config);
    expect(result.success).toBe(false);
    expect(result.error).toBe('SERVER_JAVA_NOT_FOUND');
  });

  it('start returns SERVER_DIR_NOT_FOUND when the server path is missing', async () => {
    const deps = createTestDeps();
    const config = makeConfig();
    deps.fs.put('/usr/bin/java', '#!/bin/sh');
    deps.shell.mockRun('/usr/bin/java', { success: true, stdout: '', stderr: 'openjdk version "21"', exitCode: 0 });

    const result = await serverProcessManager.start(config);
    expect(result.success).toBe(false);
    expect(result.error).toBe('SERVER_DIR_NOT_FOUND');
  });

  it('start spawns java with jvm flags + jar path + nogui args, sets status to running', async () => {
    vi.useFakeTimers();
    const deps = createTestDeps();
    const config = makeConfig({ jvm_flags: '-XX:+UseG1GC' });
    seedHappyPath(deps.fs, deps.shell, config);

    const startPromise = serverProcessManager.start(config);

    // Let the async chain (fs.exists checks, shell.run, removeSessionLocks) drain.
    await vi.advanceTimersByTimeAsync(0);
    deps.shell.lastSpawnHandle()?.triggerSpawn();
    const result = await startPromise;

    expect(result.success).toBe(true);
    const spawnCall = deps.shell.calls.find((c) => c.kind === 'spawn');
    expect(spawnCall?.command).toBe('/usr/bin/java');
    expect(spawnCall?.args).toContain('-Xms1G');
    expect(spawnCall?.args).toContain('-Xmx2G');
    expect(spawnCall?.args).toContain('-XX:+UseG1GC');
    expect(spawnCall?.args).toContain('-jar');
    expect(spawnCall?.args).toContain(`${config.path}/${config.jar_file}`);
    expect(spawnCall?.args).toContain('nogui');

    expect(serverProcessManager.getStatus(config.id).status).toBe('running');
    expect(serverProcessManager.getRunningServers()).toContain(config.id);

    // Clean up: trigger exit so the singleton state resets for other tests.
    deps.shell.lastSpawnHandle()?.triggerExit(0);
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  });

  it('start on Java 25 adds --sun-misc-unsafe-memory-access=allow before -jar', async () => {
    const args = await spawnArgsFor('25.0.4.1');
    expect(args).toContain('--sun-misc-unsafe-memory-access=allow');
    expect(args.indexOf('--sun-misc-unsafe-memory-access=allow')).toBeLessThan(args.indexOf('-jar'));
  });

  it.each([
    ['24', true],
    ['21.0.5', false],
    ['17.0.12', false],
    ['1.8.0_412', false],
  ])('start on Java %s adds --sun-misc-unsafe-memory-access=allow: %s', async (javaVersion, expected) => {
    const args = await spawnArgsFor(javaVersion);
    expect(args.includes('--sun-misc-unsafe-memory-access=allow')).toBe(expected);
  });

  it('start does not duplicate --sun-misc-unsafe-memory-access when the user already set it', async () => {
    const args = await spawnArgsFor('25', '-XX:+UseG1GC --sun-misc-unsafe-memory-access=warn');
    expect(args.filter((a) => a.startsWith('--sun-misc-unsafe-memory-access'))).toEqual(['--sun-misc-unsafe-memory-access=warn']);
  });

  it('sendCommand writes "<cmd>\\n" to stdin when server is running', async () => {
    vi.useFakeTimers();
    const deps = createTestDeps();
    const config = makeConfig();
    seedHappyPath(deps.fs, deps.shell, config);

    const startPromise = serverProcessManager.start(config);
    await vi.advanceTimersByTimeAsync(0);
    deps.shell.lastSpawnHandle()?.triggerSpawn();
    await startPromise;

    const ok = serverProcessManager.sendCommand(config.id, 'say hello');
    expect(ok).toBe(true);

    const handle = deps.shell.lastSpawnHandle()!;
    expect(handle.stdinHistory()).toContain('say hello\n');

    deps.shell.lastSpawnHandle()?.triggerExit(0);
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  });

  it('stop writes "stop\\n" to stdin and resolves once the process exits', async () => {
    vi.useFakeTimers();
    const deps = createTestDeps();
    const config = makeConfig();
    seedHappyPath(deps.fs, deps.shell, config);

    const startPromise = serverProcessManager.start(config);
    await vi.advanceTimersByTimeAsync(0);
    deps.shell.lastSpawnHandle()?.triggerSpawn();
    await startPromise;

    const handle = deps.shell.lastSpawnHandle()!;
    const stopPromise = serverProcessManager.stop(config.id);
    handle.triggerExit(0);
    const result = await stopPromise;

    expect(result.success).toBe(true);
    expect(handle.stdinHistory()).toContain('stop\n');
    expect(serverProcessManager.getStatus(config.id).status).toBe('stopped');
    vi.useRealTimers();
  });

  it('start records a reboot marker once the process is up', async () => {
    vi.useFakeTimers();
    const deps = createTestDeps();
    const config = makeConfig();
    seedServer(deps, { id: config.id });
    seedHappyPath(deps.fs, deps.shell, config);

    const startPromise = serverProcessManager.start(config);
    await vi.advanceTimersByTimeAsync(0);
    deps.shell.lastSpawnHandle()?.triggerSpawn();
    await startPromise;

    expect(countRestarts(deps, config.id)).toBe(1);

    deps.shell.lastSpawnHandle()?.triggerExit(0);
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  });

  it('a failed start records no reboot marker', async () => {
    const deps = createTestDeps();
    const config = makeConfig();
    seedServer(deps, { id: config.id });
    deps.fs.put(`${config.path}/${config.jar_file}`, 'jar-bytes');
    deps.shell.mockRun('which', { success: false, stdout: '', stderr: 'not found', exitCode: 1 });

    const result = await serverProcessManager.start(config);
    expect(result.success).toBe(false);
    expect(countRestarts(deps, config.id)).toBe(0);
  });

  it('restart records one reboot marker for the new process', async () => {
    vi.useFakeTimers();
    const deps = createTestDeps();
    const config = makeConfig();
    seedServer(deps, { id: config.id });
    seedHappyPath(deps.fs, deps.shell, config);
    seedHappyPath(deps.fs, deps.shell, config);

    const startPromise = serverProcessManager.start(config);
    await vi.advanceTimersByTimeAsync(0);
    deps.shell.lastSpawnHandle()?.triggerSpawn();
    await startPromise;

    const restartPromise = serverProcessManager.restart(config);
    deps.shell.lastSpawnHandle()?.triggerExit(0);
    await vi.advanceTimersByTimeAsync(2000);
    await vi.advanceTimersByTimeAsync(0);
    deps.shell.lastSpawnHandle()?.triggerSpawn();
    const result = await restartPromise;

    expect(result.success).toBe(true);
    expect(deps.shell.spawnHistory()).toHaveLength(2);
    expect(countRestarts(deps, config.id)).toBe(2);

    deps.shell.lastSpawnHandle()?.triggerExit(0);
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  });

  it('auto-restart after a crash records a reboot marker for the new process', async () => {
    vi.useFakeTimers();
    const deps = createTestDeps();
    const config = makeConfig({ auto_restart_on_crash: true });
    seedServer(deps, { id: config.id });
    seedHappyPath(deps.fs, deps.shell, config);
    seedHappyPath(deps.fs, deps.shell, config);

    const startPromise = serverProcessManager.start(config);
    await vi.advanceTimersByTimeAsync(0);
    deps.shell.lastSpawnHandle()?.triggerSpawn();
    await startPromise;

    deps.shell.lastSpawnHandle()?.triggerExit(1);
    await vi.advanceTimersByTimeAsync(10_000);
    await vi.advanceTimersByTimeAsync(0);
    deps.shell.lastSpawnHandle()?.triggerSpawn();
    await vi.advanceTimersByTimeAsync(0);

    expect(deps.shell.spawnHistory()).toHaveLength(2);
    expect(countRestarts(deps, config.id)).toBe(2);

    deps.shell.lastSpawnHandle()?.triggerExit(0);
    await vi.advanceTimersByTimeAsync(0);
    vi.useRealTimers();
  });
});

function countRestarts(deps: AppDeps, serverId: string): number {
  const row = deps.sqlite.prepare('SELECT COUNT(*) AS count FROM server_restarts WHERE server_id = ?').get(serverId) as {
    count: number;
  };

  return row.count;
}
