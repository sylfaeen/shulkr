import { useTranslation } from 'react-i18next';
import { PUBLIC_FILE_EXPIRY_HOURS } from '@shulkr/shared';

export const NEVER = 'never';

export function useExpiryPresets(): Array<{ value: string; label: string }> {
  const { t } = useTranslation();

  return [
    ...PUBLIC_FILE_EXPIRY_HOURS.map((hours) => ({ value: String(hours), label: t(`shares.expiry.h${hours}`) })),
    { value: NEVER, label: t('shares.expiry.never') },
  ];
}

export function parseExpiry(value: string): number | null {
  return value === NEVER ? null : Number(value);
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;

  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
