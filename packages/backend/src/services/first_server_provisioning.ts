import { join } from 'node:path';
import { eq } from 'drizzle-orm';
import { createServer } from '@shulkr/backend/services/server_service';
import { setServerStrategy } from '@shulkr/backend/services/cloud_backup_strategy';
import { servers, webhooks } from '@shulkr/backend/db/schema';
import { MC_SETTINGS_BY_TYPE, clampRam, getSizePresets } from '@shulkr/backend/services/wizard_presets';
import { computeAikarFlags, type CreateFirstServerInput } from '@shulkr/shared';
import { type AppDeps, getAppDeps } from '@shulkr/backend/deps';

export type ProvisionResult = {
  serverId: string;
  name: string;
};

type Deps = Pick<AppDeps, 'db' | 'fs'>;

async function applyMcSettings(deps: Deps, serverPath: string, settings: Record<string, string>): Promise<void> {
  const propsPath = join(serverPath, 'server.properties');
  let content: string;

  try {
    content = await deps.fs.readFileText(propsPath);
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

  await deps.fs.writeFile(propsPath, content);
}

export async function provisionFirstServerWithDeps(deps: Deps, input: CreateFirstServerInput): Promise<ProvisionResult> {
  const sizePreset = getSizePresets().find((p) => p.size === input.size);
  if (!sizePreset) throw new Error('Invalid size');

  const maxRamMb = clampRam(sizePreset.maxRamMb);
  const minRamMb = Math.max(1024, Math.floor(maxRamMb / 2));
  const aikar = computeAikarFlags({ ramMb: maxRamMb, serverType: 'paper' });

  // serverService is still on its legacy facade; threading deps into createServer is part of the api/wizard.ts route migration in story 58.7.
  const server = await createServer(getAppDeps(), {
    name: input.name,
    min_ram: `${minRamMb}M`,
    max_ram: `${maxRamMb}M`,
    jvm_flags: aikar.flags.join(' '),
    auto_start: false,
  });

  await applyMcSettings(deps, server.path, MC_SETTINGS_BY_TYPE[input.type]);

  if (input.backup.frequency !== 'off') {
    await deps.db.update(servers).set({ max_backups: input.backup.maxBackups }).where(eq(servers.id, server.id));

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
    await deps.db.insert(webhooks).values({
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

export function provisionFirstServer(input: CreateFirstServerInput): Promise<ProvisionResult> {
  return provisionFirstServerWithDeps(getAppDeps(), input);
}
