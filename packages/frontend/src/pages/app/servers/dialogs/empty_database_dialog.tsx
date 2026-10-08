import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm, useFormContext } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { CircleStop, TriangleAlert } from 'lucide-react';
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
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@shulkr/frontend/features/ui/base/form';
import { useEmptyDatabase } from '@shulkr/frontend/hooks/use_databases';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { ApiError } from '@shulkr/frontend/lib/api';
import { ErrorCodes, type ServerDatabaseResponse } from '@shulkr/shared';

type EmptyDatabaseFormValues = {
  confirmation: string;
  password: string;
};

export function EmptyDatabaseDialog({
  open,
  onOpenChange,
  database,
  serverId,
}: {
  open: boolean;
  onOpenChange: () => void;
  database: ServerDatabaseResponse;
  serverId: string;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onOpenChange()}>
      <DialogContent className={'max-w-lg'}>
        <Content onClose={onOpenChange} {...{ database, serverId }} />
      </DialogContent>
    </Dialog>
  );
}

// Lives inside the popup, which unmounts on close: the step and the typed values never survive to the next opening.
function Content({ database, serverId, onClose }: { database: ServerDatabaseResponse; serverId: string; onClose: () => void }) {
  const { t } = useTranslation();
  const { data: server } = useServer(serverId);
  const emptyDatabase = useEmptyDatabase(serverId);
  const isStopped = server?.status === 'stopped';
  const [step, setStep] = useState<'warning' | 'name' | 'password'>('warning');

  const schema = z.object({
    confirmation: z.string(),
    password: z.string().min(1, t('passwordGate.prompt')),
  });

  const form = useForm<EmptyDatabaseFormValues>({
    resolver: zodResolver(schema),
    defaultValues: { confirmation: '', password: '' },
  });

  const handleEmpty = async (values: EmptyDatabaseFormValues) => {
    try {
      await emptyDatabase.mutateAsync({ id: database.id, ...values });
      onClose();
    } catch (error: unknown) {
      if (error instanceof ApiError && error.code === ErrorCodes.AUTH_INVALID_PASSWORD) {
        form.setError('password', { message: t('passwordGate.invalidPassword') });
      }
    }
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleEmpty)}>
        {step === 'warning' && <WarningStep onNext={() => setStep('name')} {...{ database, isStopped, onClose }} />}
        {step === 'name' && <NameStep onBack={() => setStep('warning')} onNext={() => setStep('password')} {...{ database }} />}
        {step === 'password' && (
          <PasswordStep onBack={() => setStep('name')} isPending={emptyDatabase.isPending} {...{ database, isStopped }} />
        )}
      </form>
    </Form>
  );
}

function WarningStep({
  database,
  isStopped,
  onClose,
  onNext,
}: {
  database: ServerDatabaseResponse;
  isStopped: boolean;
  onClose: () => void;
  onNext: () => void;
}) {
  const { t } = useTranslation();

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('databases.empty.title')}</DialogTitle>
        <DialogDescription>{t('databases.empty.description', { name: database.dbName })}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <div className={'space-y-4'}>
          <p
            className={
              'flex items-start gap-2 rounded-lg bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-400'
            }
          >
            <TriangleAlert className={'mt-0.5 size-4 shrink-0'} />
            <span>{t('databases.empty.warning')}</span>
          </p>
          {!isStopped && (
            <p
              className={
                'flex items-start gap-2 rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-400'
              }
            >
              <CircleStop className={'mt-0.5 size-4 shrink-0'} />
              <span>{t('databases.empty.serverRunning')}</span>
            </p>
          )}
          <p className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('databases.dialog.deleteDumpNotice')}</p>
        </div>
      </DialogBody>
      <DialogFooter>
        <Button type={'button'} onClick={onClose} variant={'ghost'}>
          {t('common.cancel')}
        </Button>
        <Button type={'button'} onClick={onNext} disabled={!isStopped}>
          {t('common.next')}
        </Button>
      </DialogFooter>
    </>
  );
}

function NameStep({ database, onBack, onNext }: { database: ServerDatabaseResponse; onBack: () => void; onNext: () => void }) {
  const { t } = useTranslation();
  const form = useFormContext<EmptyDatabaseFormValues>();
  const matches = form.watch('confirmation') === database.dbName;

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('databases.empty.title')}</DialogTitle>
        <DialogDescription>{t('databases.empty.nameStep')}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <FormField
          control={form.control}
          name={'confirmation'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('databases.dialog.deleteConfirmLabel', { name: database.dbName })}</FormLabel>
              <FormControl>
                <Input
                  autoFocus
                  autoComplete={'off'}
                  placeholder={database.dbName}
                  onKeyDown={(e) => {
                    // Enter would submit the whole form from here, skipping the password step.
                    if (e.key !== 'Enter') return;
                    e.preventDefault();
                    if (matches) onNext();
                  }}
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </DialogBody>
      <DialogFooter>
        <Button type={'button'} onClick={onBack} variant={'ghost'}>
          {t('common.back')}
        </Button>
        <Button type={'button'} onClick={onNext} disabled={!matches}>
          {t('common.next')}
        </Button>
      </DialogFooter>
    </>
  );
}

function PasswordStep({
  database,
  isStopped,
  isPending,
  onBack,
}: {
  database: ServerDatabaseResponse;
  isStopped: boolean;
  isPending: boolean;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const form = useFormContext<EmptyDatabaseFormValues>();

  return (
    <>
      <DialogHeader>
        <DialogTitle>{t('databases.empty.title')}</DialogTitle>
        <DialogDescription>{t('databases.empty.passwordStep', { name: database.dbName })}</DialogDescription>
      </DialogHeader>
      <DialogBody>
        <FormField
          control={form.control}
          name={'password'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('users.password')}</FormLabel>
              <FormControl>
                <Input autoFocus type={'password'} autoComplete={'current-password'} {...field} />
              </FormControl>
              <FormDescription>{t('passwordGate.prompt')}</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />
      </DialogBody>
      <DialogFooter>
        <Button type={'button'} onClick={onBack} variant={'ghost'} disabled={isPending}>
          {t('common.back')}
        </Button>
        <Button type={'submit'} variant={'destructive'} disabled={!isStopped} loading={isPending}>
          {t('databases.empty.confirm')}
        </Button>
      </DialogFooter>
    </>
  );
}
