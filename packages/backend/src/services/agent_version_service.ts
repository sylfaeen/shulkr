import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AgentPlatform } from '@shulkr/shared';
import { getAppDeps } from '@shulkr/backend/deps';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const versionCache = new Map<AgentPlatform, string>();

const ALL_PLATFORMS: Array<AgentPlatform> = ['paper', 'folia', 'velocity', 'waterfall'];

function candidateDirs(): Array<string> {
  return [
    path.resolve(__dirname, 'assets', 'plugins'),
    path.resolve(__dirname, '..', '..', 'dist', 'assets', 'plugins'),
    path.resolve(process.cwd(), 'dist', 'assets', 'plugins'),
    path.resolve(process.cwd(), 'packages', 'backend', 'dist', 'assets', 'plugins'),
  ];
}

function jarNameFor(platform: AgentPlatform): string {
  return `shulkr-core-${platform}.jar`;
}

async function readPlatformVersion(platform: AgentPlatform): Promise<string> {
  const { fs } = getAppDeps();
  for (const root of candidateDirs()) {
    const txt = path.join(root, platform, 'version.txt');
    try {
      if (await fs.exists(txt)) {
        return (await fs.readFileText(txt)).trim();
      }
    } catch {}
  }
  for (const root of candidateDirs()) {
    const shared = path.join(root, 'version.txt');
    try {
      if (await fs.exists(shared)) {
        return (await fs.readFileText(shared)).trim();
      }
    } catch {}
  }
  return '0.0.0';
}

export async function getExpectedPluginVersion(platform: AgentPlatform = 'paper'): Promise<string> {
  const cached = versionCache.get(platform);
  if (cached) return cached;
  const v = await readPlatformVersion(platform);
  versionCache.set(platform, v);
  return v;
}

export async function hasVersionMismatch(pluginVersion: string | null, platform: AgentPlatform | null): Promise<boolean> {
  if (!pluginVersion || !platform) return false;
  return pluginVersion !== (await getExpectedPluginVersion(platform));
}

export async function getEmbeddedJarPath(platform: AgentPlatform): Promise<string> {
  const { fs } = getAppDeps();
  const name = jarNameFor(platform);
  for (const root of candidateDirs()) {
    const candidate = path.join(root, platform, name);
    if (await fs.exists(candidate)) return candidate;
  }
  return path.join(candidateDirs()[0], platform, name);
}

export function getSupportedPlatforms(): Array<AgentPlatform> {
  return [...ALL_PLATFORMS];
}
