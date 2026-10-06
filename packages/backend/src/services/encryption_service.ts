import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { AppDeps } from '@shulkr/backend/deps';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

type Deps = Pick<AppDeps, 'encryption'>;

export function cipherEncrypt(deps: Deps, plaintext: string): string {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, deps.encryption.key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

export function cipherDecrypt(deps: Deps, ciphertext: string): string {
  const buffer = Buffer.from(ciphertext, 'base64');
  const iv = buffer.subarray(0, IV_LENGTH);
  const authTag = buffer.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
  const encrypted = buffer.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, deps.encryption.key, iv);
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

import { createEncryption } from '@shulkr/backend/deps/encryption';
import { parseConfig } from '@shulkr/backend/config';

let _legacyDeps: Deps | null = null;

function legacyDeps(): Deps {
  if (!_legacyDeps) {
    _legacyDeps = { encryption: createEncryption(parseConfig(process.env)) };
  }

  return _legacyDeps;
}

export function encryptSecret(plaintext: string): string {
  return cipherEncrypt(legacyDeps(), plaintext);
}

export function decryptSecret(ciphertext: string): string {
  return cipherDecrypt(legacyDeps(), ciphertext);
}
