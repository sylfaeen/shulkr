import { z } from 'zod';

const totpCodeSchema = z.string().regex(/^\d{6}$/, 'Code must be exactly 6 digits');

export const totpSetupResponseSchema = z.object({
  qr_code_uri: z.string(),
  secret: z.string(),
  recovery_codes: z.array(z.string()),
});

export type TotpSetupResponse = z.infer<typeof totpSetupResponseSchema>;

export const totpVerifyRequestSchema = z.object({
  code: totpCodeSchema,
});

export type TotpVerifyRequest = z.infer<typeof totpVerifyRequestSchema>;

export const totpDisableRequestSchema = z.object({
  code: totpCodeSchema,
});

export type TotpDisableRequest = z.infer<typeof totpDisableRequestSchema>;

export const totpStatusResponseSchema = z.object({
  enabled: z.boolean(),
});

export type TotpStatusResponse = z.infer<typeof totpStatusResponseSchema>;

const recoveryCodeSchema = z.string().regex(/^[0-9A-F]{4}(-[0-9A-F]{4}){4}$/, 'Invalid recovery code format');

export const verifyTotpLoginRequestSchema = z.object({
  totp_token: z.string(),
  code: z.union([totpCodeSchema, recoveryCodeSchema]),
});

export type VerifyTotpLoginRequest = z.infer<typeof verifyTotpLoginRequestSchema>;

export const loginTotpRequiredResponseSchema = z.object({
  requires_totp: z.literal(true),
  totp_token: z.string(),
});

export type LoginTotpRequiredResponse = z.infer<typeof loginTotpRequiredResponseSchema>;
