import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, chmodSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { DATA_DIR } from '@shulkr/backend/services/paths';

const ALGORITHM = 'aes-256-gcm';
const KEY_LENGTH = 32;
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

const KEY_PATH = process.env.SHULKR_ENCRYPTION_KEY_PATH ?? join(DATA_DIR, '.encryption-key');
const ENV_KEY = process.env.SHULKR_ENCRYPTION_KEY;

let cachedKey: Buffer | null = null;

function loadOrCreateKey(): Buffer {
  if (cachedKey) return cachedKey;
  if (ENV_KEY) {
    const fromEnv = Buffer.from(ENV_KEY, 'base64');
    if (fromEnv.length !== KEY_LENGTH) {
      throw new Error(`SHULKR_ENCRYPTION_KEY must decode to ${KEY_LENGTH} bytes (got ${fromEnv.length})`);
    }
    cachedKey = fromEnv;
    return cachedKey;
  }
  if (existsSync(KEY_PATH)) {
    const fromFile = Buffer.from(readFileSync(KEY_PATH, 'utf8').trim(), 'base64');
    if (fromFile.length !== KEY_LENGTH) {
      throw new Error(`Encryption key file at ${KEY_PATH} is corrupt (expected ${KEY_LENGTH} bytes, got ${fromFile.length})`);
    }
    cachedKey = fromFile;
    return cachedKey;
  }
  const dir = dirname(KEY_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  const fresh = randomBytes(KEY_LENGTH);
  writeFileSync(KEY_PATH, fresh.toString('base64'), { encoding: 'utf8', mode: 0o600 });
  try {
    chmodSync(KEY_PATH, 0o600);
  } catch {}
  cachedKey = fresh;
  return cachedKey;
}

export function encryptSecret(plaintext: string): string {
  const key = loadOrCreateKey();
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function decryptSecret(ciphertext: string): string {
  const key = loadOrCreateKey();
  const buffer = Buffer.from(ciphertext, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);
  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString('utf8');
}

export function isEncryptedSecret(value: string): boolean {
  if (!value) return false;
  try {
    const buffer = Buffer.from(value, 'base64');
    return buffer.length >= IV_LENGTH + AUTH_TAG_LENGTH + 1;
  } catch {
    return false;
  }
}
