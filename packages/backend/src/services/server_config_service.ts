import fs from 'fs/promises';
import path from 'path';
import { eq } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { servers } from '@shulkr/backend/db/schema';

const FORMAT_VERSION = 1;

export interface ServerConfigExport {
  format_version: number;
  metadata: {
    name: string;
    description: string;
    author: string;
    exported_at: string;
  };
  server: {
    min_ram: string;
    max_ram: string;
    jvm_flags: string;
    auto_start: boolean;
    max_backups: number;
  };
  server_properties: Record<string, string>;
}

class ServerConfigService {
  async exportConfig(serverId: string, author: string, description: string): Promise<ServerConfigExport | null> {
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
    if (!server) return null;

    const serverProperties = await this.readServerProperties(server.path);

    return {
      format_version: FORMAT_VERSION,
      metadata: {
        name: server.name,
        description,
        author,
        exported_at: new Date().toISOString(),
      },
      server: {
        min_ram: server.min_ram,
        max_ram: server.max_ram,
        jvm_flags: server.jvm_flags,
        auto_start: server.auto_start,
        max_backups: server.max_backups,
      },
      server_properties: serverProperties,
    };
  }

  async importConfig(serverId: string, config: ServerConfigExport): Promise<{ success: boolean; error?: string }> {
    const [server] = await db.select().from(servers).where(eq(servers.id, serverId)).limit(1);
    if (!server) return { success: false, error: 'Server not found' };

    if (config.format_version !== FORMAT_VERSION) {
      return { success: false, error: `Unsupported format version: ${config.format_version}` };
    }

    await db
      .update(servers)
      .set({
        min_ram: config.server.min_ram,
        max_ram: config.server.max_ram,
        jvm_flags: config.server.jvm_flags,
        auto_start: config.server.auto_start,
        max_backups: config.server.max_backups,
        updated_at: new Date().toISOString(),
      })
      .where(eq(servers.id, serverId));

    if (Object.keys(config.server_properties).length > 0) {
      await this.writeServerProperties(server.path, config.server_properties);
    }

    return { success: true };
  }

  validateConfig(config: unknown): { valid: boolean; error?: string } {
    if (!config || typeof config !== 'object') {
      return { valid: false, error: 'Invalid format: expected JSON object' };
    }

    const c = config as Record<string, unknown>;

    if (c.format_version !== FORMAT_VERSION) {
      return { valid: false, error: `Unsupported format version: ${c.format_version}` };
    }

    if (!c.metadata || typeof c.metadata !== 'object') {
      return { valid: false, error: 'Missing metadata' };
    }

    if (!c.server || typeof c.server !== 'object') {
      return { valid: false, error: 'Missing server configuration' };
    }

    const server = c.server as Record<string, unknown>;
    if (typeof server.min_ram !== 'string' || typeof server.max_ram !== 'string') {
      return { valid: false, error: 'Invalid RAM configuration' };
    }

    return { valid: true };
  }

  private async readServerProperties(serverPath: string): Promise<Record<string, string>> {
    const filePath = path.join(serverPath, 'server.properties');
    const properties: Record<string, string> = {};

    try {
      const content = await fs.readFile(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIndex = trimmed.indexOf('=');
        if (eqIndex === -1) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (key) properties[key] = value;
      }
    } catch {
      // server.properties may not exist yet
    }

    return properties;
  }

  private async writeServerProperties(serverPath: string, properties: Record<string, string>): Promise<void> {
    const filePath = path.join(serverPath, 'server.properties');
    const lines = ['#Minecraft server properties', '#Imported via Shulkr config'];

    for (const [key, value] of Object.entries(properties)) {
      lines.push(`${key}=${value}`);
    }

    await fs.writeFile(filePath, lines.join('\n') + '\n', 'utf-8');
  }
}

export const serverConfigService = new ServerConfigService();
