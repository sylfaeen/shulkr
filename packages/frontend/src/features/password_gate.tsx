import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/base/dialog';
import { Input } from '@shulkr/frontend/features/ui/base/input';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { useVerifyPassword } from '@shulkr/frontend/hooks/use_verify_password';

const PASSWORD_SESSION_TTL = 10 * 60 * 1000; // 10 minutes
const DEFAULT_SCOPE = 'default';

// Freshness is tracked per scope. Without it, a verification made ten minutes ago to create an SFTP account would unlock the reveal of a database password, which is a different decision entirely.
const verifiedAt = new Map<string, number>();

function isPasswordSessionValid(scope: string): boolean {
  return Date.now() - (verifiedAt.get(scope) ?? 0) < PASSWORD_SESSION_TTL;
}

function markPasswordVerified(scope: string): void {
  verifiedAt.set(scope, Date.now());
}

export function PasswordGate({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  destructive = false,
  confirmLabel,
  scope = DEFAULT_SCOPE,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
  confirmLabel?: string;
  scope?: string;
}) {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const verifyPassword = useVerifyPassword();
  const skipRef = useRef(false);

  // When the gate opens, check if password was recently verified
  useEffect(() => {
    if (!open || skipRef.current) {
      skipRef.current = false;

      return;
    }

    if (isPasswordSessionValid(scope)) {
      // Skip the dialog: execute directly
      skipRef.current = true;
      onOpenChange(false);
      const result = onConfirm();

      if (result instanceof Promise) {
        result.catch(() => {});
      }
    }
  }, [open, onConfirm, onOpenChange, scope]);

  const handleSubmit = async () => {
    setError(null);

    try {
      await verifyPassword.mutateAsync(password);
      markPasswordVerified(scope);
      setConfirming(true);
      await onConfirm();
      setPassword('');
      onOpenChange(false);
    } catch {
      setError(t('passwordGate.invalidPassword'));
    } finally {
      setConfirming(false);
    }
  };

  const handleClose = (value: boolean) => {
    if (!value) {
      setPassword('');
      setError(null);
    }

    onOpenChange(value);
  };

  const isPending = verifyPassword.isPending || confirming;
  const showDialog = open && !isPasswordSessionValid(scope);

  return (
    <Dialog open={showDialog} onOpenChange={handleClose}>
      <DialogContent className={'max-w-md'}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className={'space-y-3'}>
            <p className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('passwordGate.prompt')}</p>
            <Input
              autoFocus
              type={'password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={t('users.password')}
              onKeyDown={(e) => e.key === 'Enter' && password && handleSubmit()}
            />
            {error && <p className={'text-sm text-red-600'}>{error}</p>}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => handleClose(false)} variant={'ghost'} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            variant={destructive ? 'destructive' : 'default'}
            disabled={!password || isPending}
            loading={isPending}
          >
            {confirmLabel ?? t('common.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
