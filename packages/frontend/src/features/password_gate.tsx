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
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { useVerifyPassword } from '@shulkr/frontend/hooks/use_verify_password';

const PASSWORD_SESSION_TTL = 10 * 60 * 1000; // 10 minutes
let lastVerifiedAt = 0;

function isPasswordSessionValid(): boolean {
  return Date.now() - lastVerifiedAt < PASSWORD_SESSION_TTL;
}

function markPasswordVerified(): void {
  lastVerifiedAt = Date.now();
}

export function PasswordGate({
  open,
  onOpenChange,
  title,
  description,
  onConfirm,
  destructive = false,
  confirmLabel,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  onConfirm: () => void | Promise<void>;
  destructive?: boolean;
  confirmLabel?: string;
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
    if (isPasswordSessionValid()) {
      // Skip the dialog: execute directly
      skipRef.current = true;
      onOpenChange(false);
      const result = onConfirm();
      if (result instanceof Promise) {
        result.catch(() => {});
      }
    }
  }, [open, onConfirm, onOpenChange]);
  const handleSubmit = async () => {
    setError(null);
    try {
      await verifyPassword.mutateAsync(password);
      markPasswordVerified();
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
  const showDialog = open && !isPasswordSessionValid();
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
