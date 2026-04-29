import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { cipherEncrypt, cipherDecrypt, isEncryptedSecret } from '@shulkr/backend/services/encryption_service';

describe('encryption_service', () => {
  let deps: TestDeps;
  beforeAll(() => {
    deps = createTestDeps();
  });
  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('round-trips plaintext through cipherEncrypt/cipherDecrypt', () => {
    const ciphertext = cipherEncrypt(deps, 'hello world');
    expect(ciphertext).not.toBe('hello world');
    expect(cipherDecrypt(deps, ciphertext)).toBe('hello world');
  });

  it('produces a different ciphertext on each call (random IV)', () => {
    const a = cipherEncrypt(deps, 'same input');
    const b = cipherEncrypt(deps, 'same input');
    expect(a).not.toBe(b);
  });

  it('isEncryptedSecret returns true for valid ciphertext, false for plaintext', () => {
    const ciphertext = cipherEncrypt(deps, 'secret');
    expect(isEncryptedSecret(ciphertext)).toBe(true);
    expect(isEncryptedSecret('plain text')).toBe(false);
    expect(isEncryptedSecret('')).toBe(false);
  });
});
