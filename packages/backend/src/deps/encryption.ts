import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { randomBytes } from 'node:crypto';
import type { AppConfig } from '@shulkr/backend/config';

const KEY_LENGTH = 32;

export interface Encryption {
  // 32-byte AES-256-GCM key, loaded from env or from disk (created on first run).
  readonly key: Buffer;
}

// Resolves the encryption key from (in order): SHULKR_ENCRYPTION_KEY env, SHULKR_ENCRYPTION_KEY_PATH on disk, or a freshly-generated key written to disk with mode 0600. Sync IO at boot is intentional, the cipher functions are sync and need the key in hand.
export function createEncryption(config: AppConfig): Encryption {
  const keyPath = config.SHULKR_ENCRYPTION_KEY_PATH ?? join(dirname(config.DATABASE_PATH), '.encryption-key');

  if (config.SHULKR_ENCRYPTION_KEY) {
    const fromEnv = Buffer.from(config.SHULKR_ENCRYPTION_KEY, 'base64');
    if (fromEnv.length !== KEY_LENGTH) {
      throw new Error(`SHULKR_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${fromEnv.length})`);
    }
    return { key: fromEnv };
  }

  if (existsSync(keyPath)) {
    const fromFile = Buffer.from(readFileSync(keyPath, 'utf8').trim(), 'base64');
    if (fromFile.length !== KEY_LENGTH) {
      throw new Error(`Encryption key file at ${keyPath} is corrupt (expected ${KEY_LENGTH} bytes, got ${fromFile.length})`);
    }
    return { key: fromFile };
  }

  const dir = dirname(keyPath);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const fresh = randomBytes(KEY_LENGTH);
  writeFileSync(keyPath, fresh.toString('base64'), { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(keyPath, 0o600);
  } catch {}
  return { key: fresh };
}
