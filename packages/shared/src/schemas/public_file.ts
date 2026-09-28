import { z } from 'zod';

export const PUBLIC_FILE_MAX_BYTES = 2 * 1024 * 1024 * 1024;
export const PUBLIC_FILE_CHUNK_BYTES = 32 * 1024 * 1024;
export const PUBLIC_FILE_EXPIRY_HOURS = [1, 24, 168, 720] as const;
export const PUBLIC_FILE_DEFAULT_EXPIRY_HOURS = 168;
export const PUBLIC_FILE_MAX_DOWNLOADS = 100_000;

const expiresInHoursSchema = z
  .number()
  .int()
  .refine((v) => (PUBLIC_FILE_EXPIRY_HOURS as ReadonlyArray<number>).includes(v))
  .nullable();

const maxDownloadsSchema = z.number().int().min(1).max(PUBLIC_FILE_MAX_DOWNLOADS).nullable();

export const publicFileDispositionSchema = z.enum(['inline', 'attachment']);

export const publicFileSchema = z.object({
  id: z.number(),
  name: z.string(),
  mimeType: z.string(),
  disposition: publicFileDispositionSchema,
  sizeBytes: z.number(),
  sha1: z.string(),
  url: z.string(),
  createdByUsername: z.string().nullable(),
  createdAt: z.string(),
  expiresAt: z.string().nullable(),
  maxDownloads: z.number().nullable(),
  downloadCount: z.number(),
  lastDownloadedAt: z.string().nullable(),
});

export const createPublicFileUploadSchema = z.object({
  name: z.string().min(1).max(255),
  sizeBytes: z.number().int().min(1).max(PUBLIC_FILE_MAX_BYTES),
  expiresInHours: expiresInHoursSchema,
  maxDownloads: maxDownloadsSchema,
});

export const replacePublicFileSchema = z.object({
  name: z.string().min(1).max(255),
  sizeBytes: z.number().int().min(1).max(PUBLIC_FILE_MAX_BYTES),
});

export const updatePublicFileSchema = z.object({
  expiresInHours: expiresInHoursSchema,
  maxDownloads: maxDownloadsSchema,
});

export type PublicFile = z.infer<typeof publicFileSchema>;
export type PublicFileDisposition = z.infer<typeof publicFileDispositionSchema>;
export type CreatePublicFileUploadInput = z.infer<typeof createPublicFileUploadSchema>;
export type ReplacePublicFileInput = z.infer<typeof replacePublicFileSchema>;
export type UpdatePublicFileInput = z.infer<typeof updatePublicFileSchema>;
