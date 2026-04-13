import { useState } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ArrowRight, ArrowLeft, Server, Cpu, Zap, Check, Loader2 } from 'lucide-react';
import { useCreateServer } from '@shulkr/frontend/hooks/use_servers';
import { ApiError } from '@shulkr/frontend/lib/api';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Form, FormField, FormItem, FormLabel, FormControl, FormMessage } from '@shulkr/frontend/features/ui/shadcn/form';
import { cn } from '@shulkr/frontend/lib/cn';

type WizardStep = 'name' | 'ram' | 'flags' | 'summary';

const STEPS: Array<WizardStep> = ['name', 'ram', 'flags', 'summary'];

const RAM_PRESETS = [
  { players: '2-5', min_ram: '1G', max_ram: '2G' },
  { players: '5-15', min_ram: '2G', max_ram: '4G' },
  { players: '15-30', min_ram: '4G', max_ram: '6G' },
  { players: '30+', min_ram: '6G', max_ram: '8G' },
];

const wizardSchema = z.object({
  name: z.string().min(1),
  min_ram: z.string().default('2G'),
  max_ram: z.string().default('4G'),
  jvm_flags: z.string().default(''),
  auto_start: z.boolean().default(true),
});

type WizardFormValues = z.infer<typeof wizardSchema>;

export function WelcomeWizard({ onSkip }: { onSkip: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const createServer = useCreateServer();

  const [step, setStep] = useState<WizardStep>('name');
  const [error, setError] = useState<string | null>(null);
  const [selectedPreset, setSelectedPreset] = useState(1);

  const form = useForm<WizardFormValues>({
    resolver: zodResolver(wizardSchema),
    defaultValues: {
      name: '',
      min_ram: '2G',
      max_ram: '4G',
      jvm_flags: '',
      auto_start: true,
    },
  });

  const currentIndex = STEPS.indexOf(step);

  const goNext = () => {
    if (step === 'name' && !form.getValues('name').trim()) {
      form.setError('name', { message: t('wizard.nameRequired') });
      return;
    }
    const nextIndex = currentIndex + 1;
    if (nextIndex < STEPS.length) setStep(STEPS[nextIndex]);
  };

  const goBack = () => {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) setStep(STEPS[prevIndex]);
  };

  const handleCreate = async () => {
    setError(null);
    try {
      const values = form.getValues();
      const server = await createServer.mutateAsync({
        name: values.name,
        min_ram: values.min_ram,
        max_ram: values.max_ram,
        jvm_flags: values.jvm_flags,
        java_port: 25565,
        auto_start: values.auto_start,
      });
      navigate({ to: '/app/servers/$id', params: { id: String(server.id) } }).then();
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
      } else {
        setError(t('errors.generic'));
      }
    }
  };

  const selectRamPreset = (index: number) => {
    setSelectedPreset(index);
    form.setValue('min_ram', RAM_PRESETS[index].min_ram);
    form.setValue('max_ram', RAM_PRESETS[index].max_ram);
  };

  return (
    <div className={'mx-auto w-full max-w-lg'}>
      <div className={'rounded-xl border border-black/10 bg-white p-8 dark:border-white/10 dark:bg-zinc-900'}>
        <div className={'mb-6 text-center'}>
          <div className={'mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-green-600/10'}>
            <Server className={'size-8 text-green-600'} strokeWidth={1.5} />
          </div>
          <h2 className={'text-xl font-bold text-zinc-900 dark:text-zinc-100'}>{t('wizard.title')}</h2>
          <p className={'mt-1 text-sm text-zinc-600 dark:text-zinc-400'}>{t('wizard.subtitle')}</p>
        </div>

        <StepIndicator current={currentIndex} total={STEPS.length} />

        <Form {...form}>
          <div className={'mt-6 min-h-[220px]'}>
            {step === 'name' && <NameStep {...{ form, t }} />}
            {step === 'ram' && <RamStep {...{ selectedPreset }} onSelect={selectRamPreset} />}
            {step === 'flags' && <FlagsStep {...{ form, t }} />}
            {step === 'summary' && <SummaryStep values={form.getValues()} {...{ error, t }} />}
          </div>
        </Form>

        <div className={'mt-6 flex items-center justify-between'}>
          <div>
            {currentIndex > 0 ? (
              <Button variant={'ghost'} onClick={goBack}>
                <ArrowLeft className={'size-4'} />
                {t('common.back')}
              </Button>
            ) : (
              <Button variant={'ghost'} onClick={onSkip} className={'text-zinc-500'}>
                {t('wizard.skip')}
              </Button>
            )}
          </div>
          <div>
            {step !== 'summary' ? (
              <Button onClick={goNext}>
                {t('common.next')}
                <ArrowRight className={'size-4'} />
              </Button>
            ) : (
              <Button onClick={handleCreate} loading={createServer.isPending} disabled={createServer.isPending}>
                {createServer.isPending ? (
                  <>
                    <Loader2 className={'size-4 animate-spin'} />
                    {t('wizard.creating')}
                  </>
                ) : (
                  <>
                    <Check className={'size-4'} />
                    {t('wizard.createServer')}
                  </>
                )}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className={'flex justify-center gap-2'}>
      {Array.from({ length: total }).map((_, i) => (
        <div
          key={`step-${i}`}
          className={cn(
            'h-1.5 w-8 rounded-full transition-colors',
            i <= current ? 'bg-green-600' : 'bg-zinc-200 dark:bg-zinc-700'
          )}
        />
      ))}
    </div>
  );
}

function NameStep({
  form,
  t,
}: {
  form: ReturnType<typeof useForm<WizardFormValues>>;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <FormField
      control={form.control}
      name={'name'}
      render={({ field }) => (
        <FormItem>
          <FormLabel className={'text-base font-semibold'}>{t('wizard.nameLabel')}</FormLabel>
          <p className={'mb-3 text-sm text-zinc-500 dark:text-zinc-400'}>{t('wizard.nameDescription')}</p>
          <FormControl>
            <Input type={'text'} placeholder={t('wizard.namePlaceholder')} autoFocus {...field} />
          </FormControl>
          <FormMessage />
        </FormItem>
      )}
    />
  );
}

function RamStep({ selectedPreset, onSelect }: { selectedPreset: number; onSelect: (i: number) => void }) {
  const { t } = useTranslation();

  return (
    <div>
      <h3 className={'text-base font-semibold text-zinc-900 dark:text-zinc-100'}>
        <Cpu className={'mr-2 inline size-4'} />
        {t('wizard.ramLabel')}
      </h3>
      <p className={'mb-4 text-sm text-zinc-500 dark:text-zinc-400'}>{t('wizard.ramDescription')}</p>
      <div className={'grid grid-cols-2 gap-3'}>
        {RAM_PRESETS.map((preset, i) => (
          <button
            key={preset.players}
            type={'button'}
            onClick={() => onSelect(i)}
            className={cn(
              'rounded-lg border p-3 text-left transition-colors',
              selectedPreset === i
                ? 'border-green-600 bg-green-600/5'
                : 'border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20'
            )}
          >
            <div className={'text-sm font-medium text-zinc-900 dark:text-zinc-100'}>
              {t('wizard.players', { count: preset.players })}
            </div>
            <div className={'text-xs text-zinc-500 dark:text-zinc-400'}>
              {preset.min_ram} — {preset.max_ram}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

function FlagsStep({
  form,
  t,
}: {
  form: ReturnType<typeof useForm<WizardFormValues>>;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <div>
      <h3 className={'text-base font-semibold text-zinc-900 dark:text-zinc-100'}>
        <Zap className={'mr-2 inline size-4'} />
        {t('wizard.flagsLabel')}
      </h3>
      <p className={'mb-4 text-sm text-zinc-500 dark:text-zinc-400'}>{t('wizard.flagsDescription')}</p>
      <div className={'rounded-lg border border-green-600/30 bg-green-600/5 p-4'}>
        <div className={'flex items-center gap-2'}>
          <Check className={'size-4 text-green-600'} />
          <span className={'text-sm font-medium text-zinc-900 dark:text-zinc-100'}>{t('wizard.aikarEnabled')}</span>
        </div>
        <p className={'mt-1 text-xs text-zinc-500 dark:text-zinc-400'}>{t('wizard.aikarDescription')}</p>
      </div>
      <FormField
        control={form.control}
        name={'jvm_flags'}
        render={({ field }) => (
          <FormItem className={'mt-4'}>
            <FormLabel>{t('wizard.extraFlags')}</FormLabel>
            <FormControl>
              <Input type={'text'} placeholder={t('wizard.extraFlagsPlaceholder')} {...field} />
            </FormControl>
          </FormItem>
        )}
      />
    </div>
  );
}

function SummaryStep({
  values,
  error,
  t,
}: {
  values: WizardFormValues;
  error: string | null;
  t: ReturnType<typeof useTranslation>['t'];
}) {
  return (
    <div>
      <h3 className={'mb-4 text-base font-semibold text-zinc-900 dark:text-zinc-100'}>{t('wizard.summaryLabel')}</h3>
      {error && <div className={'mb-4 rounded-lg border border-red-500/30 bg-red-500/5 p-3 text-sm text-red-500'}>{error}</div>}
      <div className={'space-y-3'}>
        <SummaryRow label={t('servers.serverName')} value={values.name} />
        <SummaryRow label={t('servers.minRam')} value={values.min_ram} />
        <SummaryRow label={t('servers.maxRam')} value={values.max_ram} />
        <SummaryRow label={'JVM Flags'} value={values.jvm_flags || t('wizard.aikarDefault')} />
        <SummaryRow label={t('servers.autoStartDesc')} value={values.auto_start ? t('common.yes') : t('common.no')} />
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className={'flex items-center justify-between rounded-lg bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50'}>
      <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{label}</span>
      <span className={'text-sm font-medium text-zinc-900 dark:text-zinc-100'}>{value}</span>
    </div>
  );
}
