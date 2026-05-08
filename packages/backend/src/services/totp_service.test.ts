import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { TOTP, Secret } from 'otpauth';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { seedUser } from '@shulkr/backend/test/seed';
import {
  generateTotpSetup,
  verifyTotpCode,
  activateTotp,
  isTotpEnabled,
  disableTotp,
  verifyRecoveryCode,
  getRemainingRecoveryCodes,
} from '@shulkr/backend/services/totp_service';

describe('totp_service', () => {
  let deps: TestDeps;

  beforeAll(() => {
    // totp_service requires TOTP_ENCRYPTION_KEY in deps.config
    deps = createTestDeps({ env: { TOTP_ENCRYPTION_KEY: 'totp-test-key-deterministic-1234567890' } });
  });

  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('generateTotpSetup + activateTotp + isTotpEnabled round-trip', async () => {
    const user = await seedUser(deps);
    const setup = await generateTotpSetup(deps, user.id);
    expect(setup.secret).toBeTruthy();
    expect(setup.qr_code_uri).toContain('otpauth://');
    expect(setup.recovery_codes).toHaveLength(8);

    expect(await isTotpEnabled(deps, user.id)).toBe(false);

    // Generate a valid code from the secret to activate
    const totp = new TOTP({ secret: Secret.fromBase32(setup.secret), algorithm: 'SHA1', digits: 6, period: 30 });
    const validCode = totp.generate();

    expect(await verifyTotpCode(deps, user.id, validCode)).toBe(true);
    expect(await activateTotp(deps, user.id, validCode)).toBe(true);
    expect(await isTotpEnabled(deps, user.id)).toBe(true);
  });

  it('verifyRecoveryCode consumes a code (single use)', async () => {
    const user = await seedUser(deps);
    const setup = await generateTotpSetup(deps, user.id);
    const code = setup.recovery_codes[0];

    expect(await getRemainingRecoveryCodes(deps, user.id)).toBe(8);
    expect(await verifyRecoveryCode(deps, user.id, code)).toBe(true);
    expect(await verifyRecoveryCode(deps, user.id, code)).toBe(false); // already used
    expect(await getRemainingRecoveryCodes(deps, user.id)).toBe(7);
  });

  it('disableTotp clears the record', async () => {
    const user = await seedUser(deps);
    await generateTotpSetup(deps, user.id);
    await disableTotp(deps, user.id);
    expect(await isTotpEnabled(deps, user.id)).toBe(false);
  });
});
