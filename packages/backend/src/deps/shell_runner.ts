import { execFile, spawn as nodeSpawn, type ChildProcess } from 'node:child_process';

export type RunResult = {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
};

export type RunOpts = {
  cwd?: string;
  env?: Record<string, string>;
  timeoutMs?: number;
  sudo?: boolean;
};

export type SpawnOpts = RunOpts & {
  onStdout?: (chunk: string) => void;
  onStderr?: (chunk: string) => void;
};

export type SpawnEvent = 'spawn' | 'exit' | 'error';

export type SpawnHandle = {
  pid: number;
  stdin: NodeJS.WritableStream | null;
  stdout: NodeJS.ReadableStream | null;
  stderr: NodeJS.ReadableStream | null;
  kill: (signal?: NodeJS.Signals) => boolean;
  on: {
    (event: 'spawn', listener: () => void): SpawnHandle;
    (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): SpawnHandle;
    (event: 'error', listener: (err: Error) => void): SpawnHandle;
  };
  once: {
    (event: 'spawn', listener: () => void): SpawnHandle;
    (event: 'exit', listener: (code: number | null, signal: NodeJS.Signals | null) => void): SpawnHandle;
    (event: 'error', listener: (err: Error) => void): SpawnHandle;
  };
  wait: () => Promise<RunResult>;
};

export interface ShellRunner {
  // Short-lived command, captures stdout/stderr, awaits exit.
  run(command: string, args: Array<string>, opts?: RunOpts): Promise<RunResult>;
  // Long-running interactive process. Returns a SpawnHandle exposing raw stdin/stdout/stderr streams plus event-based hooks (on/once for 'spawn', 'exit', 'error'). Use wait() for one-shot semantics with collected output.
  spawn(command: string, args: Array<string>, opts?: SpawnOpts): SpawnHandle;
}

function buildArgv(command: string, args: Array<string>, sudo: boolean | undefined): { cmd: string; argv: Array<string> } {
  if (sudo) return { cmd: 'sudo', argv: [command, ...args] };

  return { cmd: command, argv: args };
}

function fakeRunResult(): RunResult {
  return { success: true, stdout: '', stderr: '', exitCode: 0 };
}

function fakeSpawnHandle(): SpawnHandle {
  const handle: SpawnHandle = {
    pid: -1,
    stdin: null,
    stdout: null,
    stderr: null,
    kill: () => true,
    on: ((_event: SpawnEvent, _listener: (...args: Array<unknown>) => void) => handle) as SpawnHandle['on'],
    once: ((_event: SpawnEvent, _listener: (...args: Array<unknown>) => void) => handle) as SpawnHandle['once'],
    wait: () => Promise.resolve(fakeRunResult()),
  };

  return handle;
}

export function createShellRunner(opts: { dryRun: boolean }): ShellRunner {
  if (opts.dryRun) {
    return {
      run: (command, args) => {
        const { cmd, argv } = buildArgv(command, args, false);
        console.warn(`[SHELL DRY RUN] ${cmd} ${argv.join(' ')}`);

        return Promise.resolve(fakeRunResult());
      },
      spawn: (command, args) => {
        const { cmd, argv } = buildArgv(command, args, false);
        console.warn(`[SHELL DRY RUN spawn] ${cmd} ${argv.join(' ')}`);

        return fakeSpawnHandle();
      },
    };
  }

  return {
    run(command, args, runOpts = {}) {
      const { cmd, argv } = buildArgv(command, args, runOpts.sudo);

      return new Promise<RunResult>((resolve) => {
        execFile(
          cmd,
          argv,
          {
            cwd: runOpts.cwd,
            env: runOpts.env,
            timeout: runOpts.timeoutMs,
            shell: false,
            encoding: 'utf8',
          },
          (error, stdout, stderr) => {
            const exitCode =
              error && typeof (error as NodeJS.ErrnoException & { code?: number }).code === 'number'
                ? Number((error as NodeJS.ErrnoException & { code?: number }).code)
                : error
                  ? 1
                  : 0;

            resolve({
              success: !error,
              stdout,
              stderr,
              exitCode,
            });
          }
        );
      });
    },

    spawn(command, args, spawnOpts = {}) {
      const { cmd, argv } = buildArgv(command, args, spawnOpts.sudo);

      const child: ChildProcess = nodeSpawn(cmd, argv, {
        cwd: spawnOpts.cwd,
        env: spawnOpts.env,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const stdoutChunks: Array<string> = [];
      const stderrChunks: Array<string> = [];

      if (child.stdout) {
        child.stdout.on('data', (chunk: Buffer | string) => {
          const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
          stdoutChunks.push(text);
          spawnOpts.onStdout?.(text);
        });
      }

      if (child.stderr) {
        child.stderr.on('data', (chunk: Buffer | string) => {
          const text = typeof chunk === 'string' ? chunk : chunk.toString('utf8');
          stderrChunks.push(text);
          spawnOpts.onStderr?.(text);
        });
      }

      const wait = (): Promise<RunResult> =>
        new Promise<RunResult>((resolve) => {
          child.on('exit', (code, signal) => {
            const exitCode = code ?? (signal ? 1 : 0);

            resolve({
              success: exitCode === 0,
              stdout: stdoutChunks.join(''),
              stderr: stderrChunks.join(''),
              exitCode,
            });
          });

          child.on('error', (err) => {
            stderrChunks.push(err.message);

            resolve({
              success: false,
              stdout: stdoutChunks.join(''),
              stderr: stderrChunks.join(''),
              exitCode: 1,
            });
          });
        });

      const handle: SpawnHandle = {
        pid: child.pid ?? -1,
        stdin: child.stdin,
        stdout: child.stdout,
        stderr: child.stderr,
        kill: (signal) => child.kill(signal),
        on: ((event: SpawnEvent, listener: (...args: Array<unknown>) => void) => {
          (child as unknown as { on: (e: string, l: (...args: Array<unknown>) => void) => void }).on(event, listener);

          return handle;
        }) as SpawnHandle['on'],
        once: ((event: SpawnEvent, listener: (...args: Array<unknown>) => void) => {
          (child as unknown as { once: (e: string, l: (...args: Array<unknown>) => void) => void }).once(event, listener);

          return handle;
        }) as SpawnHandle['once'],
        wait,
      };

      return handle;
    },
  };
}
