import { randomBytes } from 'node:crypto';
import os from 'node:os';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(process.cwd(), '../..');
const ENV_PATH = resolve(PROJECT_ROOT, '.env');

function generateSecret(length = 48): string {
  return randomBytes(length).toString('base64url');
}

function detectIpAddress(): string {
  const interfaces = os.networkInterfaces();
  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;
    for (const entry of entries) {
      if (!entry.internal && entry.family === 'IPv4') {
        return entry.address;
      }
    }
  }
  return 'localhost';
}

function generateCorsOrigin(): string {
  const ip = detectIpAddress();
  return `http://${ip}:3001,http://${ip}:3000,http://localhost:3000,http://localhost:5173`;
}

const defaults: Record<string, () => string> = {
  JWT_SECRET: () => generateSecret(),
  COOKIE_SECRET: () => generateSecret(),
  TOTP_ENCRYPTION_KEY: () => generateSecret(),
  CORS_ORIGIN: () => generateCorsOrigin(),
};

function initializeEnv(): void {
  if (!existsSync(ENV_PATH)) {
    return;
  }

  const raw = readFileSync(ENV_PATH, 'utf-8');
  const lines = raw.split('\n');
  let modified = false;

  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();

    if (trimmed.startsWith('#') || !trimmed.includes('=')) {
      return line;
    }

    const eqIndex = line.indexOf('=');
    const key = line.slice(0, eqIndex).trim();
    const value = line.slice(eqIndex + 1).trim();

    if (value === '' && key in defaults) {
      const generated = defaults[key]();
      process.env[key] = generated;
      modified = true;
      return `${key}=${generated}`;
    }

    const resolved = value.replace(/\$(\w+)/g, (_, name: string) => process.env[name] ?? '');
    if (resolved !== value) {
      process.env[key] = resolved;
    }

    return line;
  });

  if (modified) {
    writeFileSync(ENV_PATH, updatedLines.join('\n'), 'utf-8');
  }
}

initializeEnv();
