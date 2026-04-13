import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { TOTP, Secret } from 'otpauth';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '@shulkr/backend/db';
import { users, userTotp, recoveryCodes } from '@shulkr/backend/db/schema';

const BCRYPT_ROUNDS = 12;
const RECOVERY_CODE_COUNT = 8;
const RECOVERY_CODE_BYTES = 10;
const TOTP_WINDOW = 1;

function getEncryptionKey(): Buffer {
  if (!process.env.TOTP_ENCRYPTION_KEY) throw new Error('TOTP_ENCRYPTION_KEY environment variable is required');
  return crypto.createHash('sha256').update(process.env.TOTP_ENCRYPTION_KEY).digest();
}

function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

function decrypt(ciphertext: string): string {
  const key = getEncryptionKey();
  const [ivHex, tagHex, encryptedHex] = ciphertext.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const encrypted = Buffer.from(encryptedHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

function generateRecoveryCode(): string {
  const hex = crypto.randomBytes(RECOVERY_CODE_BYTES).toString('hex').toUpperCase();
  return hex.match(/.{1,4}/g)!.join('-');
}

export class TotpService {
  async generateTotpSetup(userId: number): Promise<{
    qr_code_uri: string;
    secret: string;
    recovery_codes: Array<string>;
  }> {
    const [user] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    if (!user) throw new Error('User not found');

    const [existing] = await db.select().from(userTotp).where(eq(userTotp.user_id, userId)).limit(1);
    if (existing?.verified) throw new Error('TOTP_ALREADY_ENABLED');

    if (existing) {
      await db.delete(userTotp).where(eq(userTotp.user_id, userId));
      await db.delete(recoveryCodes).where(eq(recoveryCodes.user_id, userId));
    }

    const secret = new Secret({ size: 20 });
    const totp = new TOTP({
      issuer: 'Shulkr',
      label: user.username,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret,
    });

    const encryptedSecret = encrypt(secret.base32);
    await db.insert(userTotp).values({
      user_id: userId,
      encrypted_secret: encryptedSecret,
      verified: 0,
    });

    const plainCodes: Array<string> = [];
    for (let i = 0; i < RECOVERY_CODE_COUNT; i++) {
      plainCodes.push(generateRecoveryCode());
    }

    const codeInserts = await Promise.all(
      plainCodes.map(async (code) => ({
        user_id: userId,
        code_hash: await bcrypt.hash(code, BCRYPT_ROUNDS),
      }))
    );
    for (const insert of codeInserts) {
      await db.insert(recoveryCodes).values(insert);
    }

    return {
      qr_code_uri: totp.toString(),
      secret: secret.base32,
      recovery_codes: plainCodes,
    };
  }

  async verifyTotpCode(userId: number, code: string): Promise<boolean> {
    const [totpRecord] = await db.select().from(userTotp).where(eq(userTotp.user_id, userId)).limit(1);
    if (!totpRecord) return false;

    const secretBase32 = decrypt(totpRecord.encrypted_secret);
    const totp = new TOTP({
      issuer: 'Shulkr',
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
      secret: Secret.fromBase32(secretBase32),
    });

    const delta = totp.validate({ token: code, window: TOTP_WINDOW });
    return delta !== null;
  }

  async activateTotp(userId: number, code: string): Promise<boolean> {
    const isValid = await this.verifyTotpCode(userId, code);
    if (!isValid) return false;

    await db.update(userTotp).set({ verified: 1 }).where(eq(userTotp.user_id, userId));

    return true;
  }

  async verifyRecoveryCode(userId: number, code: string): Promise<boolean> {
    const normalized =
      code
        .replace(/-/g, '')
        .toUpperCase()
        .match(/.{1,4}/g)
        ?.join('-') ?? code;

    const codes = await db
      .select()
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.user_id, userId), isNull(recoveryCodes.used_at)));

    for (const record of codes) {
      const matches = await bcrypt.compare(normalized, record.code_hash);
      if (matches) {
        await db.update(recoveryCodes).set({ used_at: new Date().toISOString() }).where(eq(recoveryCodes.id, record.id));
        return true;
      }
    }

    return false;
  }

  async getRemainingRecoveryCodes(userId: number): Promise<number> {
    const codes = await db
      .select()
      .from(recoveryCodes)
      .where(and(eq(recoveryCodes.user_id, userId), isNull(recoveryCodes.used_at)));
    return codes.length;
  }

  async disableTotp(userId: number): Promise<void> {
    await db.delete(userTotp).where(eq(userTotp.user_id, userId));
    await db.delete(recoveryCodes).where(eq(recoveryCodes.user_id, userId));
  }

  async isTotpEnabled(userId: number): Promise<boolean> {
    const [record] = await db
      .select()
      .from(userTotp)
      .where(and(eq(userTotp.user_id, userId), eq(userTotp.verified, 1)))
      .limit(1);
    return !!record;
  }
}

export const totpService = new TotpService();
