import { useTranslation } from 'react-i18next';
import { Zap } from 'lucide-react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { cn } from '@shulkr/frontend/lib/cn';
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
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@shulkr/frontend/features/ui/shadcn/form';
import {
  FIREWALL_PRESETS,
  PRESET_STYLES,
  PROTOCOL_STYLES,
  type Protocol,
} from '@shulkr/frontend/pages/app/settings/features/firewall_constants';

type ExistingRule = {
  port: number;
  protocol: Protocol;
};

type AddFirewallRuleDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (rule: { port: number; protocol: Protocol; label: string }) => void;
  existingRules?: Array<ExistingRule>;
};

export function AddFirewallRuleDialog({ open, onOpenChange, onAdd, existingRules }: AddFirewallRuleDialogProps) {
  const { t } = useTranslation();
  return (
    <Dialog {...{ open, onOpenChange }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('settings.firewall.addRule')}</DialogTitle>
          <DialogDescription>{t('settings.firewall.addRuleDescription')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <CreateFirewallForm {...{ onAdd, existingRules }} />
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

const addFirewallRuleSchema = z.object({
  port: z.coerce.number().min(1024).max(65535),
  label: z.string().min(1),
  protocol: z.enum(['tcp', 'udp', 'both']),
});

type AddFirewallRuleFormValues = z.infer<typeof addFirewallRuleSchema>;

function CreateFirewallForm({ onAdd, existingRules }: Pick<AddFirewallRuleDialogProps, 'onAdd' | 'existingRules'>) {
  const { t } = useTranslation();
  const form = useForm<AddFirewallRuleFormValues>({
    resolver: zodResolver(addFirewallRuleSchema),
    defaultValues: {
      port: undefined,
      label: '',
      protocol: 'tcp',
    },
  });
  const handleSubmit = (data: AddFirewallRuleFormValues) => {
    onAdd({ port: data.port, protocol: data.protocol, label: data.label.trim() });
    form.reset();
  };
  const handlePreset = (preset: (typeof FIREWALL_PRESETS)[number]) => {
    form.setValue('port', preset.port);
    form.setValue('label', `${preset.label} (${preset.description})`);
    form.setValue('protocol', preset.protocol);
  };
  const portValue = form.watch('port');
  const selectedProtocol = form.watch('protocol');
  return (
    <Form {...form}>
      <form id={'add-firewall-rule'} className={'space-y-6'} onSubmit={form.handleSubmit(handleSubmit)}>
        <div>
          <span className={'mb-2 block text-xs font-medium tracking-wider text-zinc-500 uppercase'}>
            {t('settings.firewall.presets')}
          </span>
          <div className={'flex flex-wrap gap-2'}>
            {FIREWALL_PRESETS.map((preset) => {
              const presetStyle = PRESET_STYLES[preset.protocol];
              const isActive = portValue === preset.port && selectedProtocol === preset.protocol;
              const isExisting = existingRules?.some((r) => r.port === preset.port && r.protocol === preset.protocol);
              return (
                <button
                  key={`${preset.port}-${preset.protocol}`}
                  type={'button'}
                  onClick={() => handlePreset(preset)}
                  disabled={isExisting}
                  className={cn(
                    'group/preset flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm transition-all',
                    isExisting
                      ? 'cursor-not-allowed border-black/6 text-zinc-300 dark:border-white/6 dark:text-zinc-600'
                      : isActive
                        ? presetStyle.active
                        : 'border-black/10 text-zinc-600 hover:border-black/10 hover:bg-zinc-50 dark:border-white/10 dark:text-zinc-400 dark:hover:border-white/10 dark:hover:bg-zinc-800'
                  )}
                >
                  <Zap
                    className={cn(
                      'size-3 transition-colors',
                      isExisting ? 'text-zinc-300 dark:text-zinc-600' : 'text-zinc-400',
                      !isExisting && presetStyle.icon
                    )}
                  />
                  <span className={'font-medium'}>{preset.label}</span>
                  <span className={'font-jetbrains text-xs text-zinc-400'}>
                    :{preset.port}/{preset.protocol}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={'grid grid-cols-2 gap-4'}>
          <FormField
            control={form.control}
            name={'port'}
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('settings.firewall.port')}</FormLabel>
                <FormControl>
                  <Input type={'number'} placeholder={'19132'} min={1024} max={65535} {...field} />
                </FormControl>
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
                  <div className={'flex gap-1 rounded-lg bg-zinc-100 p-1 dark:bg-zinc-800'}>
                    {(['tcp', 'udp', 'both'] as Array<Protocol>).map((p) => {
                      const style = PROTOCOL_STYLES[p];
                      return (
                        <button
                          key={p}
                          type={'button'}
                          onClick={() => field.onChange(p)}
                          className={cn(
                            'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-all',
                            field.value === p
                              ? 'bg-white text-zinc-900 shadow-sm dark:bg-zinc-900 dark:text-zinc-100'
                              : 'text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 dark:hover:text-zinc-300'
                          )}
                        >
                          <span className={cn(field.value === p && style.text)}>{style.label}</span>
                        </button>
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
          name={'label'}
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('settings.firewall.label')}</FormLabel>
              <FormControl>
                <Input type={'text'} placeholder={t('settings.firewall.labelPlaceholder')} {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </form>
    </Form>
  );
}
