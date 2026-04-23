import fs from 'node:fs';
import path from 'node:path';
import type { AgentPlatform } from '@shulkr/shared';

/**
 * Returns the version of the shulkr-core plugin jar embedded in the backend,
 * per platform. The plugin build writes one jar + version.txt per platform
 * into `dist/assets/plugins/<platform>/`.
 *
 * Versions are read once at boot and cached. Falls back to `0.0.0` when files
 * are missing (e.g. dev environment without the plugin built yet).
 */
const versionCache = new Map<AgentPlatform, string>();

const ALL_PLATFORMS: Array<AgentPlatform> = ['paper', 'folia', 'velocity', 'waterfall'];

function candidateDirs(): Array<string> {
  return [
    // Production bundle layout: <backend-dist>/assets/plugins/<platform>/
    path.resolve(__dirname, '..', '..', 'dist', 'assets', 'plugins'),
    path.resolve(process.cwd(), 'packages', 'backend', 'dist', 'assets', 'plugins'),
    // Dev layout: read directly from the plugin source tree
    path.resolve(process.cwd(), 'packages', 'shulkr-core-plugin'),
  ];
}

function jarNameFor(platform: AgentPlatform): string {
  return `shulkr-core-${platform}.jar`;
}

function readPlatformVersion(platform: AgentPlatform): string {
  for (const root of candidateDirs()) {
    const txt = path.join(root, platform, 'version.txt');
    try {
      if (fs.existsSync(txt)) {
        return fs.readFileSync(txt, 'utf8').trim();
      }
    } catch {
      // ignore
    }
  }
  // Fall back to a shared version.txt at the plugin root (dev env)
  for (const root of candidateDirs()) {
    const shared = path.join(root, 'version.txt');
    try {
      if (fs.existsSync(shared)) {
        return fs.readFileSync(shared, 'utf8').trim();
      }
    } catch {
      // ignore
    }
  }
  return '0.0.0';
}

export function getExpectedPluginVersion(platform: AgentPlatform = 'paper'): string {
  const cached = versionCache.get(platform);
  if (cached) return cached;
  const v = readPlatformVersion(platform);
  versionCache.set(platform, v);
  return v;
}

export function hasVersionMismatch(pluginVersion: string | null, platform: AgentPlatform | null): boolean {
  if (!pluginVersion || !platform) return false;
  return pluginVersion !== getExpectedPluginVersion(platform);
}

export function getEmbeddedJarPath(platform: AgentPlatform): string {
  const name = jarNameFor(platform);
  for (const root of candidateDirs()) {
    const candidate = path.join(root, platform, name);
    if (fs.existsSync(candidate)) return candidate;
  }
  // Return the most likely production path even if missing — caller handles the error.
  return path.join(candidateDirs()[0], platform, name);
}

export function getSupportedPlatforms(): Array<AgentPlatform> {
  return [...ALL_PLATFORMS];
}
