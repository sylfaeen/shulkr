import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Zap } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
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
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@shulkr/frontend/features/ui/base/form';
import {
  DOMAIN_PRESETS,
  DomainPresetGuide,
  type DomainPreset,
} from '@shulkr/frontend/pages/app/servers/features/domain_preset_guide';
import type { DomainType } from '@shulkr/shared';

type AddDomainDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (domain: { domain: string; port: number; type: DomainType }) => void;
  serverPort: number;
};

export function AddDomainDialog({ open, onOpenChange, ...rest }: AddDomainDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog {...{ open, onOpenChange }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.domains.addDomain')}</DialogTitle>
          <DialogDescription>{t('settings.domains.addDomainDescription')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <AddDomainForm onAdd={rest.onAdd} serverPort={rest.serverPort} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant={'ghost'}>
            {t('common.cancel')}
          </Button>
          <Button type={'submit'} form={'add-domain'}>
            {t('settings.domains.addDomain')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function AddDomainForm({ onAdd, serverPort }: Pick<AddDomainDialogProps, 'onAdd' | 'serverPort'>) {
  const { t } = useTranslation();

  const addDomainSchema = z.object({
    domain: z
      .string()
      .regex(/^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$/),
    port: z.coerce.number().min(1024).max(65535),
    type: z.enum(['http', 'tcp']),
  });

  type AddDomainFormValues = z.infer<typeof addDomainSchema>;

  const [preset, setPreset] = useState<DomainPreset | null>(null);

  const form = useForm<AddDomainFormValues>({
    resolver: zodResolver(addDomainSchema),
    defaultValues: {
      domain: '',
      port: serverPort,
      type: 'http',
    },
  });

  const handleSubmit = (data: AddDomainFormValues) => {
    onAdd({ domain: data.domain.trim().toLowerCase(), port: data.port, type: data.type });
    form.reset();
    setPreset(null);
  };

  const handlePreset = (next: DomainPreset) => {
    if (preset?.key === next.key) {
      setPreset(null);
      form.setValue('port', serverPort, { shouldDirty: true, shouldValidate: true });

      return;
    }

    setPreset(next);
    form.setValue('port', next.port, { shouldDirty: true, shouldValidate: true });
    form.setValue('type', 'http', { shouldDirty: true });
  };

  const selectedType = form.watch('type');
  const domain = form.watch('domain');
  const port = form.watch('port');
  const placeholder = preset ? `${preset.subdomain}.example.com` : 'play.example.com';

  return (
    <Form {...form}>
      <form id={'add-domain'} className={'space-y-6'} onSubmit={form.handleSubmit(handleSubmit)}>
        <PresetPicker active={preset} onSelect={handlePreset} />
        <FormField
          control={form.control}
          name={'domain'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.domains.domainName')}</FormLabel>
              <FormControl>
                <Input type={'text'} placeholder={placeholder} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className={'grid grid-cols-2 gap-4'}>
          <FormField
            control={form.control}
            name={'port'}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.domains.port')}</FormLabel>
                <FormControl>
                  <Input type={'number'} placeholder={'8100'} min={1024} max={65535} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={'type'}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.domains.type')}</FormLabel>
                <FormControl>
                  <div className={'flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800'}>
                    {(['http', 'tcp'] as Array<DomainType>).map((dt) => (
                      <Button
                        key={dt}
                        variant={'ghost'}
                        onClick={() => field.onChange(dt)}
                        className={cn(
                          'h-auto flex-1 rounded-md px-3 py-1.5 text-sm font-medium uppercase transition-all',
                          selectedType === dt
                            ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                            : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
                        )}
                      >
                        {dt === 'http' ? 'HTTP' : 'TCP'}
                      </Button>
                    ))}
                  </div>
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        {preset && selectedType === 'http' && (
          <DomainPresetGuide domain={domain.trim().toLowerCase() || placeholder} sslState={'notAdded'} {...{ preset, port }} />
        )}
      </form>
    </Form>
  );
}

function PresetPicker({ active, onSelect }: { active: DomainPreset | null; onSelect: (preset: DomainPreset) => void }) {
  const { t } = useTranslation();

  return (
    <div className={'space-y-2'}>
      <p className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('settings.domains.presets')}</p>
      <div className={'flex flex-wrap gap-1.5'}>
        {DOMAIN_PRESETS.map((preset) => (
          <Button
            key={preset.key}
            variant={'outline'}
            size={'sm'}
            icon={Zap}
            iconClass={'size-3 text-zinc-400'}
            aria-pressed={active?.key === preset.key}
            onClick={() => onSelect(preset)}
            className={cn(
              'h-7 gap-1.5 px-2.5',
              active?.key === preset.key && 'border-emerald-600/30 bg-emerald-600/5 text-emerald-700 dark:text-emerald-400'
            )}
          >
            <span className={'font-medium'}>{preset.label}</span>
            <span className={'font-jetbrains text-xs text-zinc-400'}>:{preset.port}</span>
          </Button>
        ))}
      </div>
    </div>
  );
}
