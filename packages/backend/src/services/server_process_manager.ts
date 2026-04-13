import { spawn, execSync, spawnSync, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import path from 'path';
import fs from 'fs';
import { ErrorCodes, AIKAR_FLAGS_STRING } from '@shulkr/shared';
import { parseConsoleLine } from '@shulkr/backend/lib/log_parser';

export type ServerStatus = 'stopped' | 'starting' | 'running' | 'stopping';

interface ServerConfig {
  id: string;
  name: string;
  path: string;
  jar_file: string | null;
  min_ram: string;
  max_ram: string;
  jvm_flags: string;
  java_port: number;
  java_path: string | null;
  auto_restart_on_crash?: boolean;
}

interface ManagedServer {
  config: ServerConfig;
  process: ChildProcess | null;
  status: ServerStatus;
  pid: number | null;
  startedAt: Date | null;
}

const STOP_TIMEOUT_MS = 30000;

interface ConsoleLogEntry {
  type: 'stdout' | 'stderr';
  data: string;
  timestamp: number;
  level?: string;
  logTime?: string;
}

const CONSOLE_HISTORY_LIMIT = 2000;

const CRASH_RESTART_DELAY_MS = 10_000;
const CRASH_MAX_RESTARTS = 3;
const CRASH_WINDOW_MS = 5 * 60_000;

class ServerProcessManager extends EventEmitter {
  private servers: Map<string, ManagedServer> = new Map();
  private lineBuffers: Map<string, { stdout: string; stderr: string }> = new Map();
  private consoleHistory: Map<string, Array<ConsoleLogEntry>> = new Map();
  private crashCounts: Map<string, { count: number; firstAt: number }> = new Map();

  private getLineBuffer(serverId: string) {
    if (!this.lineBuffers.has(serverId)) {
      this.lineBuffers.set(serverId, { stdout: '', stderr: '' });
    }
    return this.lineBuffers.get(serverId)!;
  }

  private addToHistory(serverId: string, entry: ConsoleLogEntry) {
    if (!this.consoleHistory.has(serverId)) {
      this.consoleHistory.set(serverId, []);
    }
    const history = this.consoleHistory.get(serverId)!;
    history.push(entry);
    if (history.length > CONSOLE_HISTORY_LIMIT) {
      history.splice(0, history.length - CONSOLE_HISTORY_LIMIT);
    }
  }

  getConsoleHistory(serverId: string): Array<ConsoleLogEntry> {
    return this.consoleHistory.get(serverId) ?? [];
  }

  getConsoleHistoryPage(serverId: string, offset: number, limit: number): { lines: Array<ConsoleLogEntry>; total: number } {
    const history = this.consoleHistory.get(serverId) ?? [];
    const total = history.length;
    // offset counts from the end: 0 = most recent, 100 = skip 100 most recent
    const end = total - offset;
    const start = Math.max(0, end - limit);
    return { lines: history.slice(start, Math.max(0, end)), total };
  }

  getStatus(serverId: string): { status: ServerStatus; pid: number | null; uptime: number | null } {
    const server = this.servers.get(serverId);
    if (!server) {
      return { status: 'stopped', pid: null, uptime: null };
    }

    const uptime = server.startedAt ? Math.floor((Date.now() - server.startedAt.getTime()) / 1000) : null;

    return {
      status: server.status,
      pid: server.pid,
      uptime,
    };
  }

  private findJava(): string | null {
    const paths = [
      '/usr/lib/jvm/temurin-25-jre/bin/java',
      '/usr/lib/jvm/temurin-25-jdk/bin/java',
      '/usr/lib/jvm/temurin-21-jre/bin/java',
      '/usr/lib/jvm/temurin-21-jdk/bin/java',
      '/usr/lib/jvm/temurin-17-jre/bin/java',
      '/usr/lib/jvm/temurin-17-jdk/bin/java',
      '/usr/lib/jvm/java-25-openjdk-amd64/bin/java',
      '/usr/lib/jvm/java-25-openjdk-arm64/bin/java',
      '/usr/lib/jvm/java-21-openjdk-amd64/bin/java',
      '/usr/lib/jvm/java-21-openjdk-arm64/bin/java',
      '/usr/lib/jvm/java-17-openjdk-amd64/bin/java',
      '/usr/lib/jvm/java-17-openjdk-arm64/bin/java',
      '/usr/bin/java',
    ];

    for (const p of paths) {
      if (fs.existsSync(p)) return p;
    }

    try {
      const result = execSync('which java', { encoding: 'utf-8' }).trim();
      if (result && fs.existsSync(result)) return result;
    } catch {}

    return null;
  }

  private isJavaBinary(binaryPath: string): boolean {
    try {
      const result = spawnSync(binaryPath, ['-version'], {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const combined = (result.stdout || '') + (result.stderr || '');
      return /java|openjdk|jdk|jre/i.test(combined);
    } catch {
      return false;
    }
  }

  async start(config: ServerConfig): Promise<{ success: boolean; error?: string }> {
    const existing = this.servers.get(config.id);
    if (existing && existing.status !== 'stopped') {
      return { success: false, error: ErrorCodes.SERVER_ALREADY_RUNNING };
    }

    const javaPath = config.java_path && fs.existsSync(config.java_path) ? config.java_path : this.findJava();
    if (!javaPath) {
      return { success: false, error: ErrorCodes.SERVER_JAVA_NOT_FOUND };
    }

    if (!this.isJavaBinary(javaPath)) {
      return { success: false, error: ErrorCodes.SERVER_JAVA_NOT_FOUND };
    }

    if (!config.jar_file) {
      return { success: false, error: ErrorCodes.SERVER_JAR_NOT_FOUND };
    }

    const serverDir = config.path;
    const jarPath = path.join(serverDir, config.jar_file);

    if (!fs.existsSync(serverDir)) {
      return { success: false, error: ErrorCodes.SERVER_DIR_NOT_FOUND };
    }

    if (!fs.existsSync(jarPath)) {
      return { success: false, error: ErrorCodes.SERVER_JAR_NOT_FOUND };
    }

    const flagsSource = config.jvm_flags || AIKAR_FLAGS_STRING;
    const jvmFlags = flagsSource.split(' ').filter((f) => f.trim());

    const jvmArgs: Array<string> = [
      `-Xms${config.min_ram}`,
      `-Xmx${config.max_ram}`,
      ...jvmFlags,
      '-Djline.terminal=dumb',
      '-Dterminal.jline=false',
      '-Dterminal.ansi=true',
    ];

    jvmArgs.push('-jar', jarPath, 'nogui');

    const managedServer: ManagedServer = {
      config,
      process: null,
      status: 'starting',
      pid: null,
      startedAt: null,
    };
    this.servers.set(config.id, managedServer);

    try {
      const proc = spawn(javaPath, jvmArgs, {
        cwd: serverDir,
        shell: false,
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      const spawnResult = await new Promise<{ success: boolean; error?: string }>((resolve) => {
        const timeout = setTimeout(() => {
          if (proc.pid) {
            resolve({ success: true });
          } else {
            resolve({ success: false, error: ErrorCodes.SERVER_START_FAILED });
          }
        }, 500);

        proc.on('error', (error) => {
          clearTimeout(timeout);
          this.lineBuffers.delete(config.id);
          managedServer.status = 'stopped';
          managedServer.process = null;
          managedServer.pid = null;
          this.emit('server:error', { serverId: config.id, error: error.message });
          resolve({ success: false, error: error.message });
        });

        proc.on('spawn', () => {
          clearTimeout(timeout);
          resolve({ success: true });
        });
      });

      if (!spawnResult.success) {
        managedServer.status = 'stopped';
        return spawnResult;
      }

      managedServer.process = proc;
      managedServer.pid = proc.pid || null;
      managedServer.status = 'running';
      managedServer.startedAt = new Date();

      proc.stdout?.on('data', (data: Buffer) => {
        const buffer = this.getLineBuffer(config.id);
        buffer.stdout += data.toString();
        const lines = buffer.stdout.split(/\r?\n/);

        buffer.stdout = lines.pop() || '';

        lines.forEach((line) => {
          if (line.trim()) {
            const parsed = parseConsoleLine(line);
            this.addToHistory(config.id, {
              type: 'stdout',
              data: parsed.content,
              timestamp: Date.now(),
              level: parsed.level,
              logTime: parsed.time,
            });
            this.emit('console:output', {
              serverId: config.id,
              type: 'stdout',
              data: parsed.content,
              level: parsed.level,
              logTime: parsed.time,
            });
          }
        });
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const buffer = this.getLineBuffer(config.id);
        buffer.stderr += data.toString();
        const lines = buffer.stderr.split(/\r?\n/);

        buffer.stderr = lines.pop() || '';

        lines.forEach((line) => {
          if (line.trim()) {
            const parsed = parseConsoleLine(line);
            this.addToHistory(config.id, {
              type: 'stderr',
              data: parsed.content,
              timestamp: Date.now(),
              level: parsed.level,
              logTime: parsed.time,
            });
            this.emit('console:output', {
              serverId: config.id,
              type: 'stderr',
              data: parsed.content,
              level: parsed.level,
              logTime: parsed.time,
            });
          }
        });
      });

      proc.on('exit', (code, signal) => {
        const wasStopping = managedServer.status === 'stopping';
        this.lineBuffers.delete(config.id);
        managedServer.status = 'stopped';
        managedServer.process = null;
        managedServer.pid = null;
        managedServer.startedAt = null;
        this.emit('server:stopped', { serverId: config.id, code, signal });

        // Crash recovery: auto-restart if crash (non-zero exit, not a normal stop)
        if (config.auto_restart_on_crash && code !== 0 && !wasStopping) {
          const crashes = this.crashCounts.get(config.id);
          if (crashes && crashes.count >= CRASH_MAX_RESTARTS && Date.now() - crashes.firstAt < CRASH_WINDOW_MS) {
            this.emit('console:output', {
              serverId: config.id,
              type: 'stderr',
              data: `[Shulkr] Too many crashes (${crashes.count} in 5 min). Auto-restart disabled.`,
              level: 'ERROR',
            });
            return;
          }

          if (!crashes || Date.now() - crashes.firstAt >= CRASH_WINDOW_MS) {
            this.crashCounts.set(config.id, { count: 1, firstAt: Date.now() });
          } else {
            crashes.count++;
          }

          const attempt = this.crashCounts.get(config.id)?.count ?? 1;
          this.emit('console:output', {
            serverId: config.id,
            type: 'stderr',
            data: `[Shulkr] Server crashed (exit code ${code}). Auto-restarting in 10s... (attempt ${attempt}/${CRASH_MAX_RESTARTS})`,
            level: 'WARN',
          });

          setTimeout(() => {
            this.start(config).catch((err) => {
              console.error(`Crash recovery failed for ${config.name}:`, err);
            });
          }, CRASH_RESTART_DELAY_MS);
        }
      });

      proc.on('error', (error) => {
        this.lineBuffers.delete(config.id);
        managedServer.status = 'stopped';
        managedServer.process = null;
        managedServer.pid = null;
        this.emit('server:error', { serverId: config.id, error: error.message });
      });

      this.emit('server:started', { serverId: config.id, pid: proc.pid });
      return { success: true };
    } catch {
      managedServer.status = 'stopped';
      return { success: false, error: ErrorCodes.SERVER_START_FAILED };
    }
  }

  async stop(serverId: string): Promise<{ success: boolean; error?: string }> {
    const server = this.servers.get(serverId);
    if (!server || server.status === 'stopped' || !server.process) {
      return { success: false, error: ErrorCodes.SERVER_NOT_RUNNING };
    }

    if (server.status === 'stopping') {
      return { success: false, error: ErrorCodes.SERVER_ALREADY_STOPPING };
    }

    server.status = 'stopping';

    return new Promise((resolve) => {
      const proc = server.process!;

      const killTimeout = setTimeout(() => {
        if (server.status === 'stopping') {
          proc.kill('SIGKILL');
        }
      }, STOP_TIMEOUT_MS);

      proc.once('exit', () => {
        clearTimeout(killTimeout);
        resolve({ success: true });
      });

      if (proc.stdin?.writable) {
        proc.stdin.write('stop\n');
      }

      setTimeout(() => {
        if (server.status === 'stopping' && proc.pid) {
          proc.kill('SIGTERM');
        }
      }, 5000);
    });
  }

  async restart(config: ServerConfig): Promise<{ success: boolean; error?: string }> {
    const server = this.servers.get(config.id);

    if (server && server.status !== 'stopped') {
      const stopResult = await this.stop(config.id);
      if (!stopResult.success) {
        return stopResult;
      }

      await new Promise((resolve) => setTimeout(resolve, 2000));
    }

    return this.start(config);
  }

  sendCommand(serverId: string, command: string): boolean {
    const server = this.servers.get(serverId);
    if (!server || server.status !== 'running' || !server.process?.stdin?.writable) {
      return false;
    }

    server.process.stdin.write(command + '\n');
    return true;
  }

  getRunningServers(): Array<string> {
    const running: Array<string> = [];
    this.servers.forEach((server, id) => {
      if (server.status === 'running') {
        running.push(id);
      }
    });
    return running;
  }

  async shutdownAll(): Promise<void> {
    const stopPromises: Array<Promise<unknown>> = [];
    this.servers.forEach((server, id) => {
      if (server.status !== 'stopped') {
        stopPromises.push(this.stop(id));
      }
    });
    await Promise.all(stopPromises);
  }
}

export const serverProcessManager = new ServerProcessManager();
