import { EventEmitter } from 'node:events';
import { Readable, Writable } from 'node:stream';
import type { ShellRunner, RunResult, RunOpts, SpawnOpts, SpawnHandle } from '@shulkr/backend/deps/shell_runner';

export type RecordedCall = {
  kind: 'run' | 'spawn';
  command: string;
  args: Array<string>;
  opts: RunOpts | SpawnOpts;
};

// Fake handle test helpers. Tests drive the lifecycle by calling pushStdout / pushStderr / triggerExit / triggerError, and inspect what the system-under-test wrote to stdin via stdinHistory().
export interface FakeSpawnHandle extends SpawnHandle {
  pushStdout(data: string): void;
  pushStderr(data: string): void;
  triggerExit(code: number | null, signal?: NodeJS.Signals | null): void;
  triggerError(err: Error): void;
  triggerSpawn(): void;
  stdinHistory(): Array<string>;
  killed: boolean;
  killSignal: NodeJS.Signals | null;
}

export interface FakeShellRunner extends ShellRunner {
  // Records every run/spawn invocation in invocation order.
  readonly calls: ReadonlyArray<RecordedCall>;
  // Programmatically queue the next run() result for a given command.
  mockRun(command: string, result: RunResult): void;
  // Programmatically queue the next spawn() outcome for a given command. The handle then exits on its own, so a test driving a service that writes to stdin does not have to trigger the lifecycle by hand.
  mockSpawn(command: string, result: RunResult): void;
  // Returns the most recent FakeSpawnHandle, or null if no spawn yet.
  lastSpawnHandle(): FakeSpawnHandle | null;
  // Returns all FakeSpawnHandles in order they were created.
  spawnHistory(): ReadonlyArray<FakeSpawnHandle>;
  // Reset all recorded calls, queued mocks, and spawn handles.
  reset(): void;
}

const ok = (): RunResult => ({ success: true, stdout: '', stderr: '', exitCode: 0 });

function createFakeSpawnHandle(programmed?: RunResult): FakeSpawnHandle {
  const emitter = new EventEmitter();
  const stdinWrites: Array<string> = [];

  const stdin = new Writable({
    write(chunk, _encoding, callback) {
      const text = typeof chunk === 'string' ? chunk : (chunk as Buffer).toString('utf8');
      stdinWrites.push(text);
      callback();
    },
  });

  const stdout = new Readable({ read() {} });
  const stderr = new Readable({ read() {} });

  let killed = false;
  let killSignal: NodeJS.Signals | null = null;

  const handle: FakeSpawnHandle = {
    pid: 12345,
    stdin,
    stdout,
    stderr,
    kill: (signal) => {
      killed = true;
      killSignal = (signal ?? 'SIGTERM') as NodeJS.Signals;
      // Auto-trigger exit unless test overrides via triggerExit explicitly first
      setImmediate(() => emitter.emit('exit', null, killSignal));

      return true;
    },
    on: ((event, listener) => {
      emitter.on(event, listener as (...a: Array<unknown>) => void);

      return handle;
    }) as SpawnHandle['on'],
    once: ((event, listener) => {
      emitter.once(event, listener as (...a: Array<unknown>) => void);

      return handle;
    }) as SpawnHandle['once'],
    // Symmetrical with run(): resolves with the programmed result, or with a success when nothing was programmed. A test that needs to drive the lifecycle emits 'exit' through triggerExit and listens via on('exit') instead.
    wait: () => Promise.resolve(programmed ?? ok()),

    pushStdout(data) {
      stdout.push(data);
    },
    pushStderr(data) {
      stderr.push(data);
    },
    triggerExit(code, signal = null) {
      emitter.emit('exit', code, signal);
    },
    triggerError(err) {
      emitter.emit('error', err);
    },
    triggerSpawn() {
      emitter.emit('spawn');
    },
    stdinHistory() {
      return [...stdinWrites];
    },
    get killed() {
      return killed;
    },
    get killSignal() {
      return killSignal;
    },
  };

  return handle;
}

export function createFakeShell(): FakeShellRunner {
  const calls: Array<RecordedCall> = [];
  const queued = new Map<string, Array<RunResult>>();
  const queuedSpawns = new Map<string, Array<RunResult>>();
  const handles: Array<FakeSpawnHandle> = [];

  return {
    calls,

    mockRun(command, result) {
      const list = queued.get(command) ?? [];
      list.push(result);
      queued.set(command, list);
    },

    mockSpawn(command, result) {
      const list = queuedSpawns.get(command) ?? [];
      list.push(result);
      queuedSpawns.set(command, list);
    },

    lastSpawnHandle() {
      return handles.length > 0 ? handles[handles.length - 1] : null;
    },

    spawnHistory() {
      return handles;
    },

    reset() {
      calls.length = 0;
      queued.clear();
      queuedSpawns.clear();
      handles.length = 0;
    },

    run(command, args, opts = {}) {
      calls.push({ kind: 'run', command, args, opts });
      const list = queued.get(command);

      if (list && list.length > 0) {
        return Promise.resolve(list.shift()!);
      }

      return Promise.resolve(ok());
    },

    spawn(command, args, opts = {}): SpawnHandle {
      calls.push({ kind: 'spawn', command, args, opts });
      const programmed = queuedSpawns.get(command)?.shift();
      const handle = createFakeSpawnHandle(programmed);
      handles.push(handle);

      return handle;
    },
  };
}
