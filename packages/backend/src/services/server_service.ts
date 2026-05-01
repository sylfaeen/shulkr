import { and, eq, ne } from 'drizzle-orm';
import { join } from 'node:path';
import { servers, backupMetadata } from '@shulkr/backend/db/schema';
import { serverProcessManager } from '@shulkr/backend/services/server_process_manager';
import { initializeServer, updateServerPort } from '@shulkr/backend/services/server_setup_service';
import { getServerMetrics } from '@shulkr/backend/services/metrics_service';
import { playersService } from '@shulkr/backend/services/players_service';
import {
  backupService,
  createFullBackup,
  createIncrementalBackup,
  createSelectiveBackup,
  deleteBackupFile,
  deleteServerDirectory,
  listServerBackups as listBackupFiles,
  renameBackupFile,
  type BackupProgress,
  type BackupResult,
  type BackupSource,
} from '@shulkr/backend/services/backup_service';
import { DEFAULT_JAVA_PORT, ErrorCodes } from '@shulkr/shared';
import { SERVERS_BASE_PATH } from '@shulkr/backend/services/paths';
import { ensureAllowPort, removeAllowPort } from '@shulkr/backend/services/firewall_service';
import { type AppDeps, getAppDeps } from '@shulkr/backend/deps';

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

type Deps = Pick<AppDeps, 'db' | 'clock'>;

export async function getNextAvailablePort(deps: Deps): Promise<number> {
  const allServers = await deps.db.select({ java_port: servers.java_port }).from(servers);
  const usedPorts = new Set(allServers.map((s) => s.java_port));
  let port = DEFAULT_JAVA_PORT;
  while (usedPorts.has(port)) port++;

  return port;
}

export async function isPortAvailable(deps: Deps, port: number, excludeServerId?: string): Promise<boolean> {
  const conditions = excludeServerId
    ? and(eq(servers.java_port, port), ne(servers.id, excludeServerId))
    : eq(servers.java_port, port);

  const existing = await deps.db.select({ id: servers.id }).from(servers).where(conditions).limit(1);

  return existing.length === 0;
}

export async function getAllServers(deps: Deps) {
  const allServers = await deps.db.select().from(servers);

  return await Promise.all(
    allServers.map(async (server) => {
      const processStatus = serverProcessManager.getStatus(server.id);
      const metrics = processStatus.status === 'running' ? await getServerMetrics(getAppDeps(), server.id) : null;
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

export async function getServerById(deps: Deps, id: string) {
  const [server] = await deps.db.select().from(servers).where(eq(servers.id, id)).limit(1);
  if (!server) return null;

  const processStatus = serverProcessManager.getStatus(server.id);
  const metrics = processStatus.status === 'running' ? await getServerMetrics(getAppDeps(), server.id) : null;

  return {
    ...server,
    ...processStatus,
    status: server.deleting ? ('deleting' as const) : processStatus.status,
    cpu: metrics?.cpu ?? null,
    player_count: playersService.getPlayerCount(server.id),
    players: playersService.getPlayers(server.id),
  };
}

export async function createServer(deps: Deps, data: CreateServerRequest) {
  const slug = data.name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const serverPath = join(SERVERS_BASE_PATH, slug);

  let javaPort: number;

  if (data.java_port) {
    const available = await isPortAvailable(deps, data.java_port);
    if (!available) throw new Error(ErrorCodes.SERVER_PORT_ALREADY_IN_USE);
    javaPort = data.java_port;
  } else {
    javaPort = await getNextAvailablePort(deps);
  }

  await initializeServer(getAppDeps(), { serverPath, serverName: data.name, javaPort });

  const [newServer] = await deps.db
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

  await ensureAllowPort(getAppDeps(), javaPort, 'tcp', `${data.name} (Minecraft)`);

  return { ...newServer, ...serverProcessManager.getStatus(newServer.id) };
}

export async function updateServer(deps: Deps, id: string, data: UpdateServerRequest) {
  const [existing] = await deps.db.select().from(servers).where(eq(servers.id, id)).limit(1);
  if (!existing) return { success: false as const, error: 'SERVER_NOT_FOUND' };

  if (data.java_port !== undefined && data.java_port !== existing.java_port) {
    const available = await isPortAvailable(deps, data.java_port, id);
    if (!available) return { success: false as const, error: ErrorCodes.SERVER_PORT_ALREADY_IN_USE };
  }

  const updateData: Record<string, unknown> = { updated_at: deps.clock().toISOString() };
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

  const [updatedServer] = await deps.db.update(servers).set(updateData).where(eq(servers.id, id)).returning();

  if (data.java_port !== undefined && data.java_port !== existing.java_port) {
    await updateServerPort(getAppDeps(), updatedServer.path, data.java_port);
  }

  return { success: true as const, server: { ...updatedServer, ...serverProcessManager.getStatus(updatedServer.id) } };
}

export async function deleteServer(
  deps: Deps,
  id: string,
  options?: { createBackup?: boolean; onBackupProgress?: (progress: BackupProgress) => void }
): Promise<{ success: boolean; error?: string; backup?: BackupResult }> {
  const [existing] = await deps.db.select().from(servers).where(eq(servers.id, id)).limit(1);
  if (!existing) return { success: false, error: 'SERVER_NOT_FOUND' };

  const processStatus = serverProcessManager.getStatus(id);
  if (processStatus.status !== 'stopped') return { success: false, error: 'SERVER_MUST_BE_STOPPED' };

  await deps.db.update(servers).set({ deleting: true }).where(eq(servers.id, id));

  let backupResult: BackupResult | undefined;

  if (options?.createBackup) {
    backupResult = await createFullBackup(getAppDeps(), existing.path, existing.name, 'manual', options.onBackupProgress);

    if (!backupResult.success) {
      return { success: false, error: `BACKUP_FAILED: ${backupResult.error}`, backup: backupResult };
    }
  }

  const deleteResult = await deleteServerDirectory(getAppDeps(), existing.path);

  if (!deleteResult.success) {
    return { success: false, error: `DELETE_DIRECTORY_FAILED: ${deleteResult.error}`, backup: backupResult };
  }

  try {
    await removeAllowPort(getAppDeps(), existing.java_port, 'tcp');
  } catch (error) {
    console.warn(`Failed to remove firewall rule for port ${existing.java_port}:`, error);
  }

  await deps.db.delete(servers).where(eq(servers.id, id));

  return { success: true, backup: backupResult };
}

export async function startServer(deps: Deps, id: string) {
  const server = await getServerById(deps, id);
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

export async function stopServer(deps: Deps, id: string) {
  const server = await getServerById(deps, id);
  if (!server) return { success: false as const, error: 'SERVER_NOT_FOUND' };

  return serverProcessManager.stop(id);
}

export async function restartServer(deps: Deps, id: string) {
  const server = await getServerById(deps, id);
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

export async function listServerBackups(deps: Deps, id: string) {
  const [existing] = await deps.db.select().from(servers).where(eq(servers.id, id)).limit(1);
  if (!existing) return { success: false as const, error: 'SERVER_NOT_FOUND', backups: [] };

  const backups = await listBackupFiles(getAppDeps(), existing.name);

  return {
    success: true as const,
    backups: backups.map((b) => ({ name: b.name, size: b.size, date: b.date.toISOString() })),
  };
}

export async function renameServerBackup(_deps: Deps, filename: string, newFilename: string) {
  return renameBackupFile(getAppDeps(), filename, newFilename);
}

export async function deleteServerBackup(deps: Deps, filename: string) {
  const result = await deleteBackupFile(getAppDeps(), filename);

  if (result.success) {
    await deps.db.delete(backupMetadata).where(eq(backupMetadata.filename, filename));
  }

  return result;
}

async function enforceBackupRetention(deps: Deps, serverName: string, maxBackups: number): Promise<void> {
  const backups = await listBackupFiles(getAppDeps(), serverName);
  if (backups.length <= maxBackups) return;
  const toDelete = backups.slice(maxBackups);

  for (const backup of toDelete) {
    const result = await deleteBackupFile(getAppDeps(), backup.name);

    if (result.success) {
      await deps.db.delete(backupMetadata).where(eq(backupMetadata.filename, backup.name));
    }
  }
}

export async function backupServer(
  deps: Deps,
  id: string,
  paths?: Array<string>,
  source: BackupSource = 'manual'
): Promise<{ success: boolean; error?: string; backup?: BackupResult }> {
  const [existing] = await deps.db.select().from(servers).where(eq(servers.id, id)).limit(1);
  if (!existing) return { success: false, error: 'SERVER_NOT_FOUND' };

  const result =
    paths && paths.length > 0
      ? await createSelectiveBackup(getAppDeps(), existing.path, existing.name, paths, source)
      : await createIncrementalBackup(getAppDeps(), existing.path, existing.name, id, source);

  if (!result.success) return { success: false, error: `BACKUP_FAILED: ${result.error}` };

  if (existing.max_backups > 0) {
    await enforceBackupRetention(deps, existing.name, existing.max_backups);
  }

  return { success: true, backup: result };
}

export async function backupServerAsync(
  deps: Deps,
  id: string,
  paths?: Array<string>,
  source: BackupSource = 'manual'
): Promise<{ success: boolean; error?: string; filename?: string }> {
  const [existing] = await deps.db.select().from(servers).where(eq(servers.id, id)).limit(1);
  if (!existing) return { success: false, error: 'SERVER_NOT_FOUND' };

  const slug = existing.name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  const timestamp = deps.clock().toISOString().replace(/[:.]/g, '-');
  const filename = `${slug}-${source}-${timestamp}.zip`;
  backupService.addPending(filename, id);

  const onProgress = (p: { percentage: number }) => {
    backupService.updateProgress(filename, p.percentage);
  };

  const doBackup = async () => {
    try {
      const result =
        paths && paths.length > 0
          ? await createSelectiveBackup(getAppDeps(), existing.path, existing.name, paths, source, onProgress, filename)
          : await createIncrementalBackup(getAppDeps(), existing.path, existing.name, id, source, onProgress, filename);

      if (!result.success) {
        console.error(`Async backup failed for server ${existing.name}: ${result.error}`);

        return;
      }

      if (existing.max_backups > 0) {
        await enforceBackupRetention(deps, existing.name, existing.max_backups);
      }

      try {
        const { applyPostBackup } = await import('@shulkr/backend/services/cloud_backup_strategy');
        const post = await applyPostBackup(id, filename);
        if (post.error) console.warn(`Cloud post-backup for ${filename}: ${post.error}`);
      } catch (error: unknown) {
        console.error(`Cloud upload failed for ${filename}:`, error);
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

export function sendCommand(_deps: Deps, id: string, command: string) {
  return serverProcessManager.sendCommand(id, command);
}
