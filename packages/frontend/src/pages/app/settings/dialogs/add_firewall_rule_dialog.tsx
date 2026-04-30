import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Shield, ShieldOff, Zap } from 'lucide-react';
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
import {
  Form,
  FormField,
  FormItem,
  FormLabel,
  FormControl,
  FormMessage,
  FormDescription,
} from '@shulkr/frontend/features/ui/base/form';
import {
  FIREWALL_PRESETS,
  PRESET_STYLES,
  PROTOCOL_STYLES,
  type Protocol,
} from '@shulkr/frontend/pages/app/settings/features/firewall_constants';
import type { CreateFirewallRuleRequest } from '@shulkr/shared';

const RESERVED_PORTS = [22, 80, 443, 3000, 3001];
const MIN_PORT = 1024;
const MAX_PORT = 65535;

type AddFirewallRuleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (rule: CreateFirewallRuleRequest) => void;
};

export function AddFirewallRuleDialog({ open, onOpenChange, onAdd }: AddFirewallRuleDialogProps) {
  const { t } = useTranslation();

  return (
    <Dialog {...{ open, onOpenChange }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.firewall.addRule')}</DialogTitle>
          <DialogDescription>{t('settings.firewall.addRuleDescription')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <CreateFirewallForm {...{ onAdd }} />
        </DialogBody>
        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} variant={'secondary'}>
            {t('common.cancel')}
          </Button>
          <Button type={'submit'} form={'add-firewall-rule'}>
            {t('settings.firewall.addRule')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CreateFirewallForm({ onAdd }: Pick<AddFirewallRuleDialogProps, 'onAdd'>) {
  const { t } = useTranslation();

  const portSpecSchema = z
    .string()
    .trim()
    .refine((v) => v === '' || /^\d+(:\d+)?$/.test(v), 'Use a number or a range like 1024:65535')
    .refine((v) => {
      if (v === '') return true;
      const [low, high] = v.split(':').map(Number);
      const hi = high ?? low;
      if (low < MIN_PORT || hi > MAX_PORT || low > hi) return false;

      return !RESERVED_PORTS.some((p) => p >= low && p <= hi);
    }, `Port must be in ${MIN_PORT}-${MAX_PORT} and not reserved`);

  const ipSchema = z
    .string()
    .trim()
    .refine((v) => {
      if (v === '') return true;
      if (v.includes(':')) return /^[0-9a-fA-F:]+$/.test(v);

      return /^(\d{1,3}\.){3}\d{1,3}$/.test(v) && v.split('.').every((o) => Number(o) <= 255);
    }, 'Invalid IP address');

  const schema = z
    .object({
      label: z.string().trim().min(1, t('settings.firewall.labelRequired')),
      port: portSpecSchema,
      from_ip: ipSchema,
      protocol: z.enum(['tcp', 'udp', 'both']),
      action: z.enum(['allow', 'deny']),
    })
    .refine((data) => data.port !== '' || data.from_ip !== '', {
      message: t('settings.firewall.atLeastOneRequired'),
      path: ['port'],
    });

  type FormValues = z.infer<typeof schema>;

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { label: '', port: '', from_ip: '', protocol: 'tcp', action: 'allow' },
  });

  const handleSubmit = (data: FormValues) => {
    onAdd({
      action: data.action,
      port: data.port === '' ? null : data.port,
      from_ip: data.from_ip === '' ? null : data.from_ip,
      protocol: data.protocol,
      label: data.label,
    });

    form.reset();
  };

  const handlePreset = (preset: (typeof FIREWALL_PRESETS)[number]) => {
    const isActive = form.getValues('port') === String(preset.port) && form.getValues('protocol') === preset.protocol;

    if (isActive) {
      form.setValue('port', '', { shouldDirty: true, shouldValidate: true });
      form.setValue('protocol', 'tcp', { shouldDirty: true });
      form.setValue('label', '', { shouldDirty: true, shouldValidate: true });

      return;
    }

    form.setValue('port', String(preset.port), { shouldDirty: true, shouldValidate: true });
    form.setValue('protocol', preset.protocol, { shouldDirty: true });
    form.setValue('label', `${preset.label} (${preset.description})`, { shouldDirty: true, shouldValidate: true });
    form.setValue('action', 'allow', { shouldDirty: true });
  };

  const action = form.watch('action');
  const port = form.watch('port');
  const fromIp = form.watch('from_ip');
  const protocol = form.watch('protocol');

  return (
    <Form {...form}>
      <form id={'add-firewall-rule'} className={'space-y-5'} onSubmit={form.handleSubmit(handleSubmit)}>
        <FormField
          control={form.control}
          name={'action'}
          render={({ field }) => (
            <FormItem>
              <SectionLabel>{t('settings.firewall.type')}</SectionLabel>
              <FormControl>
                <div className={'grid grid-cols-2 gap-2'}>
                  <ActionCard
                    icon={Shield}
                    label={t('settings.firewall.actionAllow')}
                    description={t('settings.firewall.actionAllowDesc')}
                    selected={field.value === 'allow'}
                    onSelect={() => field.onChange('allow')}
                    tone={'allow'}
                  />
                  <ActionCard
                    icon={ShieldOff}
                    label={t('settings.firewall.actionDeny')}
                    description={t('settings.firewall.actionDenyDesc')}
                    selected={field.value === 'deny'}
                    onSelect={() => field.onChange('deny')}
                    tone={'deny'}
                  />
                </div>
              </FormControl>
            </FormItem>
          )}
        />
        {action === 'allow' && (
          <div>
            <SectionLabel>{t('settings.firewall.presets')}</SectionLabel>
            <div className={'flex flex-wrap gap-1.5'}>
              {FIREWALL_PRESETS.map((preset) => {
                const presetStyle = PRESET_STYLES[preset.protocol];
                const isActive = port === String(preset.port) && protocol === preset.protocol;

                return (
                  <Button
                    key={`${preset.port}-${preset.protocol}`}
                    onClick={() => handlePreset(preset)}
                    className={cn(
                      'group/preset flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-sm transition-all',
                      isActive
                        ? presetStyle.active
                        : 'border-black/8 text-zinc-600 hover:border-black/14 hover:bg-zinc-50 dark:border-white/8 dark:text-zinc-400 dark:hover:border-white/14 dark:hover:bg-zinc-800'
                    )}
                  >
                    <Zap className={cn('size-3 text-zinc-400 transition-colors', presetStyle.icon)} />
                    <span className={'font-medium'}>{preset.label}</span>
                    <span className={'font-jetbrains text-xs text-zinc-400'}>
                      :{preset.port}/{preset.protocol}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>
        )}
        <FormField
          control={form.control}
          name={'label'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.firewall.name')}</FormLabel>
              <FormControl>
                <Input type={'text'} placeholder={t('settings.firewall.namePlaceholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <div className={'grid grid-cols-[1fr_auto] items-start gap-3'}>
          <FormField
            control={form.control}
            name={'port'}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.firewall.port')}</FormLabel>
                <FormControl>
                  <Input type={'text'} placeholder={'25565'} className={'font-jetbrains'} {...field} />
                </FormControl>
                <FormDescription>
                  <span>{t('settings.firewall.portHelpPrefix')} </span>
                  <code className={'font-jetbrains rounded-sm bg-zinc-100 px-1 py-px text-[11px] dark:bg-zinc-800'}>1:65535</code>
                  <span> {t('settings.firewall.portHelpSuffix')}</span>
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name={'protocol'}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.firewall.protocol')}</FormLabel>
                <FormControl>
                  <div className={'flex gap-1 rounded-md bg-zinc-100 p-1 dark:bg-zinc-800'}>
                    {(['tcp', 'udp', 'both'] as Array<Protocol>).map((p) => {
                      const style = PROTOCOL_STYLES[p];

                      return (
                        <Button
                          key={p}
                          onClick={() => field.onChange(p)}
                          className={cn(
                            'rounded-sm px-2.5 py-1 text-xs font-medium transition-all',
                            field.value === p
                              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
                          )}
                        >
                          <span className={cn(field.value === p && style.text)}>{style.label}</span>
                        </Button>
                      );
                    })}
                  </div>
                </FormControl>
              </FormItem>
            )}
          />
        </div>
        <FormField
          control={form.control}
          name={'from_ip'}
          render={({ field }) => (
            <FormItem>
              <FormLabel className={'flex items-baseline gap-2'}>
                <span>{t('settings.firewall.fromIp')}</span>
                <span className={'text-[10px] font-medium tracking-wider text-zinc-400 uppercase dark:text-zinc-500'}>
                  {t('common.optional')}
                </span>
              </FormLabel>
              <FormControl>
                <Input type={'text'} placeholder={'1.2.3.4'} className={'font-jetbrains'} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <RulePreview {...{ action, port, protocol, fromIp }} />
      </form>
    </Form>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <span className={'mb-2 block text-[10px] font-medium tracking-wider text-zinc-500 uppercase'}>{children}</span>;
}

function ActionCard({
  icon: Icon,
  label,
  description,
  selected,
  onSelect,
  tone,
}: {
  icon: typeof Shield;
  label: string;
  description: string;
  selected: boolean;
  onSelect: () => void;
  tone: 'allow' | 'deny';
}) {
  const palette =
    tone === 'allow'
      ? {
          cardBorder: 'border-emerald-600/40 dark:border-emerald-400/40',
          cardBg: 'bg-emerald-50/50 dark:bg-emerald-950/20',
          activeIcon: 'text-emerald-600 dark:text-emerald-400',
          activeRing: 'border-emerald-600 dark:border-emerald-400',
          activeDot: 'bg-emerald-600 dark:bg-emerald-400',
          inactiveIcon: 'text-zinc-400 dark:text-zinc-500',
        }
      : {
          cardBorder: 'border-red-600/40 dark:border-red-400/40',
          cardBg: 'bg-red-50/50 dark:bg-red-950/20',
          activeIcon: 'text-red-600 dark:text-red-400',
          activeRing: 'border-red-600 dark:border-red-400',
          activeDot: 'bg-red-600 dark:bg-red-400',
          inactiveIcon: 'text-zinc-400 dark:text-zinc-500',
        };

  return (
    <Button
      onClick={onSelect}
      className={cn(
        'flex flex-col items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-all',
        selected
          ? cn(palette.cardBorder, palette.cardBg)
          : 'border-black/8 hover:border-black/16 dark:border-white/8 dark:hover:border-white/16'
      )}
    >
      <div className={'flex w-full items-center justify-between'}>
        <Icon className={cn('size-4', selected ? palette.activeIcon : palette.inactiveIcon)} strokeWidth={2} />
        <span
          className={cn(
            'flex size-3.5 shrink-0 items-center justify-center rounded-full border',
            selected ? palette.activeRing : 'border-black/15 dark:border-white/15'
          )}
        >
          {selected && <span className={cn('size-1.5 rounded-full', palette.activeDot)} />}
        </span>
      </div>
      <div className={'flex flex-col gap-0.5'}>
        <span className={'text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{label}</span>
        <span className={'text-xs leading-snug text-zinc-500 dark:text-zinc-400'}>{description}</span>
      </div>
    </Button>
  );
}

function RulePreview({
  action,
  port,
  protocol,
  fromIp,
}: {
  action: 'allow' | 'deny';
  port: string;
  protocol: Protocol;
  fromIp: string;
}) {
  const { t } = useTranslation();
  const verb = action === 'allow' ? t('settings.firewall.actionAllow') : t('settings.firewall.actionDeny');
  const portText = port ? port : t('settings.firewall.anyPort');
  const fromText = fromIp || t('settings.firewall.previewAnySource');
  const tone = action === 'allow' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400';

  return (
    <div
      className={
        'rounded-md border border-dashed border-black/10 bg-zinc-50/50 px-3 py-2 dark:border-white/10 dark:bg-zinc-900/40'
      }
    >
      <div className={'mb-0.5 text-[10px] font-medium tracking-wider text-zinc-500 uppercase'}>
        {t('settings.firewall.previewLabel')}
      </div>
      <div className={'font-jetbrains text-xs text-zinc-600 dark:text-zinc-400'}>
        <span className={cn('font-semibold', tone)}>{verb.toUpperCase()}</span> <span>{protocol.toUpperCase()}</span>{' '}
        <span className={'text-zinc-400 dark:text-zinc-500'}>{t('settings.firewall.previewFrom')}</span> <span>{fromText}</span>{' '}
        <span className={'text-zinc-400 dark:text-zinc-500'}>{t('settings.firewall.previewToPort')}</span> <span>{portText}</span>
      </div>
    </div>
  );
}
