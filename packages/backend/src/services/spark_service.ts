import fs from 'fs';
import path from 'path';
import { serverService } from '@shulkr/backend/services/server_service';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';
const COMMAND_TIMEOUT_MS = 10_000;
const SPARK_URL_REGEX = /https:\/\/spark\.lucko\.me\/\S+/;

class SparkService {
  async isInstalled(serverId: string): Promise<boolean> {
    const server = await serverService.getServerById(serverId);
    if (!server) return false;

    const pluginsDir = path.join(server.path, 'plugins');
    if (!fs.existsSync(pluginsDir)) return false;

    const files = fs.readdirSync(pluginsDir);
    return files.some((f) => f.toLowerCase().includes('spark') && f.endsWith('.jar'));
  }

  async startProfiler(serverId: string): Promise<{ success: boolean; error?: string }> {
    if (serverProcessManager.getStatus(serverId).status !== 'running') {
      return { success: false, error: 'Server not running' };
    }

    const sent = serverProcessManager.sendCommand(serverId, 'spark profiler start');
    return { success: sent, error: sent ? undefined : 'Failed to send command' };
  }

  async stopProfiler(serverId: string): Promise<{ success: boolean; url?: string; error?: string }> {
    if (serverProcessManager.getStatus(serverId).status !== 'running') {
      return { success: false, error: 'Server not running' };
    }

    const url = await this.sendAndCapture(serverId, 'spark profiler stop', SPARK_URL_REGEX);
    return { success: true, url: url ?? undefined };
  }

  async getHealth(serverId: string): Promise<{ tps?: number; mspt?: number; raw: string }> {
    if (serverProcessManager.getStatus(serverId).status !== 'running') {
      return { raw: 'Server not running' };
    }

    const output = await this.sendAndCaptureLines(serverId, 'spark health', 5);

    let tps: number | undefined;
    let mspt: number | undefined;

    for (const line of output) {
      const tpsMatch = line.match(/TPS.*?(\d+\.?\d*)/i);
      if (tpsMatch) tps = parseFloat(tpsMatch[1]);

      const msptMatch = line.match(/MSPT.*?(\d+\.?\d*)/i) || line.match(/tick.*?(\d+\.?\d*)\s*ms/i);
      if (msptMatch) mspt = parseFloat(msptMatch[1]);
    }

    return { tps, mspt, raw: output.join('\n') };
  }

  private sendAndCapture(serverId: string, command: string, pattern: RegExp): Promise<string | null> {
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        cleanup();
        resolve(null);
      }, COMMAND_TIMEOUT_MS);

      const listener = (event: { serverId: string; data: string }) => {
        if (event.serverId !== serverId) return;
        const match = event.data.match(pattern);
        if (match) {
          cleanup();
          resolve(match[0]);
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        serverProcessManager.removeListener('console:output', listener);
      };

      serverProcessManager.on('console:output', listener);
      serverProcessManager.sendCommand(serverId, command);
    });
  }

  private sendAndCaptureLines(serverId: string, command: string, maxLines: number): Promise<Array<string>> {
    return new Promise((resolve) => {
      const lines: Array<string> = [];
      let started = false;

      const timeout = setTimeout(() => {
        cleanup();
        resolve(lines);
      }, COMMAND_TIMEOUT_MS);

      const listener = (event: { serverId: string; data: string }) => {
        if (event.serverId !== serverId) return;
        if (!started && event.data.includes(command.split(' ')[0])) {
          started = true;
          return;
        }
        if (started) {
          lines.push(event.data);
          if (lines.length >= maxLines) {
            cleanup();
            resolve(lines);
          }
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        serverProcessManager.removeListener('console:output', listener);
      };

      serverProcessManager.on('console:output', listener);
      serverProcessManager.sendCommand(serverId, command);
    });
  }
}

export const sparkService = new SparkService();
