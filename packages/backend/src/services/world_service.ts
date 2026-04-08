import fs from 'fs/promises';
import path from 'path';
import { existsSync } from 'fs';
import { eq } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { servers } from '@shulkr/backend/db/schema';
import { backupService } from '@shulkr/backend/services/backup_service';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';

export interface WorldInfo {
  name: string;
  type: 'overworld' | 'nether' | 'end' | 'custom';
  size: number;
  isActive: boolean;
}

function detectWorldType(name: string): WorldInfo['type'] {
  const lower = name.toLowerCase();
  if (lower.includes('nether')) return 'nether';
  if (lower.includes('the_end') || lower.includes('end')) return 'end';
  return 'overworld';
}

class WorldService {
  async listWorlds(serverId: string): Promise<{ worlds: Array<WorldInfo>; activeLevelName: string } | null> {
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
    if (!server) return null;

    if (!existsSync(server.path)) {
      return { worlds: [], activeLevelName: 'world' };
    }

    const activeLevelName = await this.readLevelName(server.path);

    let entries: Array<{ name: string; isDirectory: () => boolean }>;
    try {
      entries = await fs.readdir(server.path, { withFileTypes: true });
    } catch {
      return { worlds: [], activeLevelName };
    }

    const worlds: Array<WorldInfo> = [];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const worldDir = path.join(server.path, entry.name);
      if (!existsSync(path.join(worldDir, 'level.dat'))) continue;

      let size = 0;
      try {
        size = await this.getDirectorySize(worldDir);
      } catch {
        // May fail on locked files (session.lock) when server is running
      }

      worlds.push({
        name: entry.name,
        type: detectWorldType(entry.name),
        size,
        isActive: entry.name === activeLevelName,
      });
    }

    return { worlds, activeLevelName };
  }

  async setActiveWorld(serverId: string, worldName: string): Promise<{ success: boolean; error?: string }> {
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
    if (!server) return { success: false, error: 'Server not found' };

    const worldPath = path.join(server.path, worldName, 'level.dat');
    if (!existsSync(worldPath)) {
      return { success: false, error: 'World not found' };
    }

    await this.writeLevelName(server.path, worldName);
    return { success: true };
  }

  async resetWorld(serverId: string, worldName: string, createBackup: boolean): Promise<{ success: boolean; error?: string }> {
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
    if (!server) return { success: false, error: 'Server not found' };

    const status = serverProcessManager.getStatus(serverId);
    if (status.status !== 'stopped') {
      return { success: false, error: 'Server must be stopped' };
    }

    const worldPath = path.join(server.path, worldName);
    if (!existsSync(worldPath)) {
      return { success: false, error: 'World not found' };
    }

    if (createBackup) {
      const result = await backupService.createSelectiveBackup(server.path, server.name, [worldName], 'manual');
      if (!result.success) {
        return { success: false, error: `Backup failed: ${result.error}` };
      }
    }

    await fs.rm(worldPath, { recursive: true, force: true });
    return { success: true };
  }

  async importWorld(serverId: string, worldName: string, extractedPath: string): Promise<{ success: boolean; error?: string }> {
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
    if (!server) return { success: false, error: 'Server not found' };

    const status = serverProcessManager.getStatus(serverId);
    if (status.status !== 'stopped') {
      return { success: false, error: 'Server must be stopped' };
    }

    const destPath = path.join(server.path, worldName);
    if (existsSync(destPath)) {
      await fs.rm(destPath, { recursive: true, force: true });
    }

    await fs.rename(extractedPath, destPath);
    return { success: true };
  }

  private async readLevelName(serverPath: string): Promise<string> {
    const propsPath = path.join(serverPath, 'server.properties');
    if (!existsSync(propsPath)) return 'world';

    try {
      const content = await fs.readFile(propsPath, 'utf-8');
      const match = content.match(/^level-name=(.*)$/m);
      return match ? match[1].trim() : 'world';
    } catch {
      return 'world';
    }
  }

  private async writeLevelName(serverPath: string, levelName: string): Promise<void> {
    const propsPath = path.join(serverPath, 'server.properties');
    if (!existsSync(propsPath)) return;

    let content = await fs.readFile(propsPath, 'utf-8');
    content = content.replace(/^level-name=.*$/m, `level-name=${levelName}`);
    await fs.writeFile(propsPath, content, 'utf-8');
  }

  private async getDirectorySize(dirPath: string): Promise<number> {
    let total = 0;
    const entries = await fs.readdir(dirPath, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      if (entry.isDirectory()) {
        total += await this.getDirectorySize(fullPath);
      } else {
        const stat = await fs.stat(fullPath);
        total += stat.size;
      }
    }
    return total;
  }
}

export const worldService = new WorldService();
