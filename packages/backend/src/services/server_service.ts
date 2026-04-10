import { and, eq, ne } from 'drizzle-orm';
import { join } from 'node:path';
import { db } from '@shulkr/backend/db';
import { servers } from '@shulkr/backend/db/schema';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';
import { serverSetupService } from '@shulkr/backend/services/server_setup_service';
import { metricsService } from '@shulkr/backend/services/metrics_service';
import { playersService } from '@shulkr/backend/services/players_service';
import {
  type BackupProgress,
  type BackupResult,
  backupService,
  type BackupSource,
} from '@shulkr/backend/services/backup_service';
import { DEFAULT_JAVA_PORT, ErrorCodes } from '@shulkr/shared';
import { SERVERS_BASE_PATH } from '@shulkr/backend/services/paths';
import { firewallService } from '@shulkr/backend/services/firewall_service';

export interface CreateServerRequest {
  name: string;
  min_ram?: string;
  max_ram?: string;
  jvm_flags?: string;
  java_port?: number;
  auto_start?: boolean;
}

export interface UpdateServerRequest {
  name?: string;
  path?: string;
  jar_file?: string;
  min_ram?: string;
  max_ram?: string;
  jvm_flags?: string;
  java_port?: number;
  java_path?: string | null;
  auto_start?: boolean;
  auto_restart_on_crash?: boolean;
  max_backups?: number;
}

export class ServerService {
  async getNextAvailablePort(): Promise<number> {
    const allServers = await db.select({ java_port: servers.java_port }).from(servers);
    const usedPorts = new Set(allServers.map((s) => s.java_port));

    let port = DEFAULT_JAVA_PORT;
    while (usedPorts.has(port)) {
      port++;
    }
    return port;
  }

  async isPortAvailable(port: number, excludeServerId?: string): Promise<boolean> {
    const conditions = excludeServerId
      ? and(eq(servers.java_port, port), ne(servers.id, excludeServerId))
      : eq(servers.java_port, port);

    const existing = await db.select({ id: servers.id }).from(servers).where(conditions).limit(1);
    return existing.length === 0;
  }

  async getAllServers() {
    const allServers = await db.select().from(servers);

    return await Promise.all(
      allServers.map(async (server) => {
        const processStatus = serverProcessManager.getStatus(server.id);
        const metrics = processStatus.status === 'running' ? await metricsService.getServerMetrics(server.id) : null;
        const playerCount = playersService.getPlayerCount(server.id);

        return {
          ...server,
          ...processStatus,
          status: server.deleting ? ('deleting' as const) : processStatus.status,
          cpu: metrics?.cpu ?? null,
          player_count: playerCount,
        };
      })
    );
  }

  async getServerById(id: string) {
    const [server] = await db.select().from(servers).where(eq(servers.id, id)).limit(1);
    if (!server) return null;

    const processStatus = serverProcessManager.getStatus(server.id);
    const metrics = processStatus.status === 'running' ? await metricsService.getServerMetrics(server.id) : null;

    return {
      ...server,
      ...processStatus,
      status: server.deleting ? ('deleting' as const) : processStatus.status,
      cpu: metrics?.cpu ?? null,
      player_count: playersService.getPlayerCount(server.id),
      players: playersService.getPlayers(server.id),
    };
  }

  async createServer(data: CreateServerRequest) {
    // Generate a slug from the server name for the directory
    const slug = data.name
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');

    const serverPath = join(SERVERS_BASE_PATH, slug);

    // Auto-assign next available port if none specified, or validate the requested one
    let javaPort: number;
    if (data.java_port) {
      const available = await this.isPortAvailable(data.java_port);
      if (!available) throw new Error(ErrorCodes.SERVER_PORT_ALREADY_IN_USE);
      javaPort = data.java_port;
    } else {
      javaPort = await this.getNextAvailablePort();
    }

    await serverSetupService.initializeServer({
      serverPath,
      serverName: data.name,
      javaPort,
    });

    const [newServer] = await db
      .insert(servers)
      .values({
        name: data.name,
        path: serverPath,
        min_ram: data.min_ram || '2G',
        max_ram: data.max_ram || '4G',
        jvm_flags: data.jvm_flags || '',
        java_port: javaPort,
        auto_start: data.auto_start ?? true,
      })
      .returning();

    // Automatically open the server port on the firewall
    await firewallService.addRule(javaPort, 'tcp', `${data.name} (Minecraft)`);

    return {
      ...newServer,
      ...serverProcessManager.getStatus(newServer.id),
    };
  }

  async updateServer(id: string, data: UpdateServerRequest) {
    const [existing] = await db.select().from(servers).where(eq(servers.id, id)).limit(1);
    if (!existing) {
      return { success: false as const, error: 'SERVER_NOT_FOUND' };
    }

    // Validate port uniqueness if changing port
    if (data.java_port !== undefined && data.java_port !== existing.java_port) {
      const available = await this.isPortAvailable(data.java_port, id);
      if (!available) {
        return { success: false as const, error: ErrorCodes.SERVER_PORT_ALREADY_IN_USE };
      }
    }

    const updateData: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (data.name !== undefined) updateData.name = data.name;
    if (data.jar_file !== undefined) updateData.jar_file = data.jar_file;
    if (data.min_ram !== undefined) updateData.min_ram = data.min_ram;
    if (data.max_ram !== undefined) updateData.max_ram = data.max_ram;
    if (data.jvm_flags !== undefined) updateData.jvm_flags = data.jvm_flags;
    if (data.java_port !== undefined) updateData.java_port = data.java_port;
    if (data.java_path !== undefined) updateData.java_path = data.java_path;
    if (data.auto_start !== undefined) updateData.auto_start = data.auto_start;
    if (data.auto_restart_on_crash !== undefined) updateData.auto_restart_on_crash = data.auto_restart_on_crash;
    if (data.max_backups !== undefined) updateData.max_backups = data.max_backups;

    const [updatedServer] = await db.update(servers).set(updateData).where(eq(servers.id, id)).returning();

    // Regenerate server.properties if port changed
    if (data.java_port !== undefined && data.java_port !== existing.java_port) {
      await serverSetupService.updateServerPort(updatedServer.path, data.java_port);
    }

    return {
      success: true as const,
      server: {
        ...updatedServer,
        ...serverProcessManager.getStatus(updatedServer.id),
      },
    };
  }

  async deleteServer(
    id: string,
    options?: {
      createBackup?: boolean;
      onBackupProgress?: (progress: BackupProgress) => void;
    }
  ): Promise<{
    success: boolean;
    error?: string;
    backup?: BackupResult;
  }> {
    const [existing] = await db.select().from(servers).where(eq(servers.id, id)).limit(1);
    if (!existing) {
      return { success: false, error: 'SERVER_NOT_FOUND' };
    }

    // Check if the server is running
    const processStatus = serverProcessManager.getStatus(id);
    if (processStatus.status !== 'stopped') {
      return { success: false, error: 'SERVER_MUST_BE_STOPPED' };
    }

    // Mark as deleting before starting the operation
    await db.update(servers).set({ deleting: true }).where(eq(servers.id, id));

    let backupResult: BackupResult | undefined;

    if (options?.createBackup) {
      backupResult = await backupService.createFullBackup(existing.path, existing.name, 'manual', options.onBackupProgress);

      if (!backupResult.success) {
        return {
          success: false,
          error: `BACKUP_FAILED: ${backupResult.error}`,
          backup: backupResult,
        };
      }
    }

    const deleteResult = await backupService.deleteServerDirectory(existing.path);
    if (!deleteResult.success) {
      return {
        success: false,
        error: `DELETE_DIRECTORY_FAILED: ${deleteResult.error}`,
        backup: backupResult,
      };
    }

    await db.delete(servers).where(eq(servers.id, id));

    return {
      success: true,
      backup: backupResult,
    };
  }

  async startServer(id: string) {
    const server = await this.getServerById(id);
    if (!server) return { success: false as const, error: 'SERVER_NOT_FOUND' };

    return await serverProcessManager.start({
      id: server.id,
      name: server.name,
      path: server.path,
      jar_file: server.jar_file,
      min_ram: server.min_ram,
      max_ram: server.max_ram,
      jvm_flags: server.jvm_flags,
      java_port: server.java_port,
      java_path: server.java_path,
      auto_restart_on_crash: server.auto_restart_on_crash,
    });
  }

  async stopServer(id: string) {
    const server = await this.getServerById(id);
    if (!server) return { success: false as const, error: 'SERVER_NOT_FOUND' };
    return serverProcessManager.stop(id);
  }

  async restartServer(id: string) {
    const server = await this.getServerById(id);
    if (!server) return { success: false as const, error: 'SERVER_NOT_FOUND' };
    return serverProcessManager.restart({
      id: server.id,
      name: server.name,
      path: server.path,
      jar_file: server.jar_file,
      min_ram: server.min_ram,
      max_ram: server.max_ram,
      jvm_flags: server.jvm_flags,
      java_port: server.java_port,
      java_path: server.java_path,
      auto_restart_on_crash: server.auto_restart_on_crash,
    });
  }

  async listBackups(id: string) {
    const [existing] = await db.select().from(servers).where(eq(servers.id, id)).limit(1);
    if (!existing) return { success: false as const, error: 'SERVER_NOT_FOUND', backups: [] };

    const backups = await backupService.listBackups(existing.name);
    return {
      success: true as const,
      backups: backups.map((b) => ({
        name: b.name,
        size: b.size,
        date: b.date.toISOString(),
      })),
    };
  }

  async deleteBackup(filename: string) {
    return backupService.deleteBackup(filename);
  }

  async backupServer(
    id: string,
    paths?: Array<string>,
    source: BackupSource = 'manual'
  ): Promise<{ success: boolean; error?: string; backup?: BackupResult }> {
    const [existing] = await db.select().from(servers).where(eq(servers.id, id)).limit(1);
    if (!existing) {
      return { success: false, error: 'SERVER_NOT_FOUND' };
    }

    const result =
      paths && paths.length > 0
        ? await backupService.createSelectiveBackup(existing.path, existing.name, paths, source)
        : await backupService.createIncrementalBackup(existing.path, existing.name, id, source);

    if (!result.success) {
      return { success: false, error: `BACKUP_FAILED: ${result.error}` };
    }

    if (existing.max_backups > 0) {
      await this.enforceBackupRetention(existing.name, existing.max_backups);
    }

    return { success: true, backup: result };
  }

  async backupServerAsync(
    id: string,
    paths?: Array<string>,
    source: BackupSource = 'manual'
  ): Promise<{ success: boolean; error?: string; filename?: string }> {
    const [existing] = await db.select().from(servers).where(eq(servers.id, id)).limit(1);
    if (!existing) {
      return { success: false, error: 'SERVER_NOT_FOUND' };
    }

    // Generate filename upfront and register as pending
    const slug = existing.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${slug}-${source}-${timestamp}.zip`;

    backupService.addPending(filename, id);

    // Fire and forget: run backup in background
    const onProgress = (p: { percentage: number }) => {
      backupService.updateProgress(filename, p.percentage);
    };

    const doBackup = async () => {
      try {
        const result =
          paths && paths.length > 0
            ? await backupService.createSelectiveBackup(existing.path, existing.name, paths, source, onProgress, filename)
            : await backupService.createIncrementalBackup(existing.path, existing.name, id, source, onProgress, filename);

        if (!result.success) {
          console.error(`Async backup failed for server ${existing.name}: ${result.error}`);
        } else if (existing.max_backups > 0) {
          await this.enforceBackupRetention(existing.name, existing.max_backups);
        }
      } catch (error: unknown) {
        console.error(`Async backup error for server ${existing.name}:`, error);
      } finally {
        backupService.removePending(filename);
      }
    };

    doBackup();

    return { success: true, filename };
  }

  sendCommand(id: string, command: string) {
    return serverProcessManager.sendCommand(id, command);
  }

  private async enforceBackupRetention(serverName: string, maxBackups: number): Promise<void> {
    const backups = await backupService.listBackups(serverName);
    if (backups.length <= maxBackups) return;

    const toDelete = backups.slice(maxBackups);
    for (const backup of toDelete) {
      await backupService.deleteBackup(backup.name);
    }
  }
}
