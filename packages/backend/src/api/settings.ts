import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { initServer } from '@ts-rest/fastify';
import { contract } from '@shulkr/shared';
import { authenticate, assertPermissions, isMiddlewareError } from './middleware';

const s = initServer();

const GITHUB_REPO = 'sylfaeen/shulkr';
const VERSION_CACHE_TTL = 60 * 60 * 1000;

let cachedLatestVersion: string | null = null;
let lastVersionCheck = 0;

function getCurrentVersion(): string {
  try {
    const pkgPath = path.resolve(process.cwd(), '..', '..', 'package.json');
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')) as { version?: string };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

async function fetchLatestVersion(): Promise<string | null> {
  const now = Date.now();
  if (cachedLatestVersion && now - lastVersionCheck < VERSION_CACHE_TTL) {
    return cachedLatestVersion;
  }

  try {
    const response = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/releases/latest`, {
      headers: { Accept: 'application/vnd.github.v3+json' },
    });

    if (!response.ok) return cachedLatestVersion;

    const data = (await response.json()) as { tag_name: string };
    cachedLatestVersion = data.tag_name.replace(/^v/, '');
    lastVersionCheck = now;
    return cachedLatestVersion;
  } catch {
    return cachedLatestVersion;
  }
}

function getIpAddress(): string | null {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (!entry.internal && entry.family === 'IPv4') {
        return entry.address;
      }
    }
  }
  return null;
}

export const settingsRoutes = s.router(contract.settings, {
  getVersionInfo: async ({ request }) => {
    try {
      const user = await authenticate(request);
      assertPermissions(user, 'settings:general');

      const currentVersion = getCurrentVersion();
      const latestVersion = await fetchLatestVersion();
      const ipAddress = getIpAddress();

      return { status: 200 as const, body: { currentVersion, latestVersion, ipAddress } };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },

  getSystemdUnit: async ({ request }) => {
    try {
      const authUser = await authenticate(request);
      assertPermissions(authUser, 'settings:general');

      const nodePath = process.execPath;
      const workingDirectory = process.cwd();
      const systemUser = process.env.USER ?? os.userInfo().username;

      return {
        status: 200 as const,
        body: {
          content: [
            '[Unit]',
            'Description=Shulkr - Minecraft Server Management Panel',
            'After=network.target',
            '',
            '[Service]',
            'Type=simple',
            `User=${systemUser}`,
            `WorkingDirectory=${workingDirectory}`,
            `ExecStart=${nodePath} dist/index.js`,
            'Environment=NODE_ENV=production',
            `EnvironmentFile=${workingDirectory}/../../.env`,
            'Restart=always',
            'RestartSec=10',
            'StandardOutput=journal',
            'StandardError=journal',
            'SyslogIdentifier=shulkr',
            '',
            '# Security hardening',
            'NoNewPrivileges=true',
            'PrivateTmp=true',
            'ProtectSystem=strict',
            'ProtectHome=true',
            `ReadWritePaths=${workingDirectory}/../..`,
            '',
            '[Install]',
            'WantedBy=multi-user.target',
          ].join('\n'),
        },
      };
    } catch (error: unknown) {
      if (isMiddlewareError(error)) return error;
      throw error;
    }
  },
});
