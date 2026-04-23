import fs from 'node:fs/promises';
import path from 'node:path';
import { eq } from 'drizzle-orm';
import { serverService } from '@shulkr/backend/services/server_service';
import { setServerStrategy } from '@shulkr/backend/services/cloud_backup_strategy';
import { db } from '@shulkr/backend/db';
import { servers, webhooks } from '@shulkr/backend/db/schema';
import { MC_SETTINGS_BY_TYPE, clampRam, getSizePresets } from '@shulkr/backend/services/wizard_presets';
import { computeAikarFlags, type CreateFirstServerInput } from '@shulkr/shared';

export type ProvisionResult = {
  serverId: string;
  name: string;
};

export async function provisionFirstServer(input: CreateFirstServerInput): Promise<ProvisionResult> {
  const sizePreset = getSizePresets().find((p) => p.size === input.size);
  if (!sizePreset) throw new Error('Invalid size');
  const maxRamMb = clampRam(sizePreset.maxRamMb);
  const minRamMb = Math.max(1024, Math.floor(maxRamMb / 2));
  const aikar = computeAikarFlags({ ramMb: maxRamMb, serverType: 'paper' });
  const server = await serverService.createServer({
    name: input.name,
    min_ram: `${minRamMb}M`,
    max_ram: `${maxRamMb}M`,
    jvm_flags: aikar.flags.join(' '),
    auto_start: false,
  });
  await applyMcSettings(server.path, MC_SETTINGS_BY_TYPE[input.type]);
  if (input.backup.frequency !== 'off') {
    await db.update(servers).set({ max_backups: input.backup.maxBackups }).where(eq(servers.id, server.id));
    if (input.backup.destination === 'cloud' && input.backup.cloudDestinationId) {
      await setServerStrategy(server.id, {
        mode: 'hybrid',
        cloudDestinationId: input.backup.cloudDestinationId,
      });
    } else {
      await setServerStrategy(server.id, { mode: 'local-only' });
    }
  }
  if (input.webhook) {
    await db.insert(webhooks).values({
      server_id: server.id,
      name: 'Discord',
      url: input.webhook.url,
      format: 'discord',
      events: JSON.stringify(input.webhook.events),
      enabled: true,
    });
  }
  return { serverId: server.id, name: server.name };
}

async function applyMcSettings(serverPath: string, settings: Record<string, string>): Promise<void> {
  const propsPath = path.join(serverPath, 'server.properties');
  let content: string;
  try {
    content = await fs.readFile(propsPath, 'utf8');
  } catch {
    return;
  }
  for (const [key, value] of Object.entries(settings)) {
    const regex = new RegExp(`^${key.replace(/\./g, '\\.')}\\s*=.*$`, 'm');
    if (regex.test(content)) {
      content = content.replace(regex, `${key}=${value}`);
    } else {
      content += `\n${key}=${value}`;
    }
  }
  await fs.writeFile(propsPath, content, 'utf8');
}
