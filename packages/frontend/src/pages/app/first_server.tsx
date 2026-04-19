import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from '@tanstack/react-router';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Gamepad2,
  Hammer,
  Loader2,
  Swords,
  Users,
  Webhook as WebhookIcon,
  Cloud,
  HardDrive,
} from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/shadcn/select';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { useWizardPresets, useCreateFirstServer, markWizardSkipped } from '@shulkr/frontend/hooks/use_wizard';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import { useCloudDestinations } from '@shulkr/frontend/hooks/use_cloud_destinations';
import type { ServerType, CommunitySize, BackupFrequency } from '@shulkr/shared';

type WizardStep = 1 | 2 | 3 | 4;

type WizardState = {
  name: string;
  type: ServerType;
  size: CommunitySize;
  backup: {
    frequency: BackupFrequency;
    maxBackups: number;
    destination: 'local' | 'cloud';
    cloudDestinationId?: string;
  };
  webhook: { url: string; events: Array<string> } | null;
};

const TOTAL_STEPS: WizardStep = 4;

const TYPE_META: Record<ServerType, { icon: typeof Gamepad2; labelKey: string; descKey: string }> = {
  survival: {
    icon: Swords,
    labelKey: 'wizard.firstServer.type.survival.title',
    descKey: 'wizard.firstServer.type.survival.description',
  },
  creative: {
    icon: Hammer,
    labelKey: 'wizard.firstServer.type.creative.title',
    descKey: 'wizard.firstServer.type.creative.description',
  },
  minigames: {
    icon: Gamepad2,
    labelKey: 'wizard.firstServer.type.minigames.title',
    descKey: 'wizard.firstServer.type.minigames.description',
  },
};

const DEFAULT_WEBHOOK_EVENTS = ['server:crash', 'server:start', 'server:stop', 'backup:success', 'backup:failure'];

const STORAGE_KEY = 'shulkr_wizard_first_server_state';

type SerializedState = WizardState & { step?: WizardStep };

function loadPersistedState(): SerializedState | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SerializedState;
  } catch {
    return null;
  }
}

function persistState(step: WizardStep, state: WizardState): void {
  if (typeof window === 'undefined') return;
  const serialized: SerializedState = { ...state, step };
  sessionStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
}

function clearPersistedState(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function FirstServerWizardPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);

  usePageTitle(`shulkr • ${t('wizard.firstServer.title')}`);

  const { data: presets } = useWizardPresets();
  const { data: destinations } = useCloudDestinations();
  const createServer = useCreateFirstServer();

  const [step, setStep] = useState<WizardStep>(() => {
    const persisted = loadPersistedState();
    return persisted?.step && persisted.step <= TOTAL_STEPS ? (persisted.step as WizardStep) : 1;
  });
  const [state, setState] = useState<WizardState>(() => {
    const persisted = loadPersistedState();
    if (persisted) {
      const { step: _step, ...rest } = persisted;
      return rest;
    }
    return {
      name: t('wizard.firstServer.defaultName'),
      type: 'survival',
      size: '5-20',
      backup: { frequency: 'daily', maxBackups: 7, destination: 'local' },
      webhook: null,
    };
  });

  useEffect(() => {
    persistState(step, state);
  }, [step, state]);

  const sizePreset = presets?.sizes.find((s) => s.size === state.size);
  const ramMb = sizePreset?.maxRamMb ?? 4096;
  const ramExceedsHost = presets ? ramMb > presets.recommendedMaxRamMb : false;

  const enabledDestinations = destinations?.filter((d) => d.enabled) ?? [];
  const canUseCloud = enabledDestinations.length > 0;

  const updateBackup = (patch: Partial<WizardState['backup']>) => setState((s) => ({ ...s, backup: { ...s.backup, ...patch } }));

  const goNext = () => setStep((s) => (s < TOTAL_STEPS ? ((s + 1) as WizardStep) : s));
  const goPrev = () => setStep((s) => (s > 1 ? ((s - 1) as WizardStep) : s));

  const handleSkip = () => {
    if (user) markWizardSkipped(user.id);
    clearPersistedState();
    navigate({ to: '/app/servers' });
  };

  const handleCreate = async () => {
    const result = await createServer
      .mutateAsync({
        name: state.name.trim() || t('wizard.firstServer.defaultName'),
        type: state.type,
        size: state.size,
        backup: state.backup,
        webhook: state.webhook,
      })
      .catch(() => null);
    if (result) {
      clearPersistedState();
      navigate({ to: '/app/servers/$id', params: { id: result.serverId } });
    }
  };

  const canAdvance = useMemo(() => {
    if (step === 4 && state.webhook) {
      try {
        new URL(state.webhook.url);
        return true;
      } catch {
        return false;
      }
    }
    return true;
  }, [step, state.webhook]);

  return (
    <PageContent>
      <div className={'mx-auto w-full max-w-3xl space-y-6'}>
        <Stepper current={step} />

        <FeatureCard>
          <FeatureCard.Body className={'space-y-6 p-6'}>
            {step === 1 && (
              <StepType
                value={state.type}
                name={state.name}
                onTypeChange={(type) => setState((s) => ({ ...s, type }))}
                onNameChange={(name) => setState((s) => ({ ...s, name }))}
              />
            )}
            {step === 2 && (
              <StepSize
                value={state.size}
                ramMb={ramMb}
                exceeds={ramExceedsHost}
                presets={presets?.sizes ?? []}
                hostRamMb={presets?.hostRamMb ?? 0}
                onChange={(size) => setState((s) => ({ ...s, size }))}
              />
            )}
            {step === 3 && (
              <StepBackup
                value={state.backup}
                canUseCloud={canUseCloud}
                destinations={enabledDestinations}
                onUpdate={updateBackup}
              />
            )}
            {step === 4 && (
              <StepWebhook
                value={state.webhook}
                onToggle={(enabled) =>
                  setState((s) => ({
                    ...s,
                    webhook: enabled ? { url: '', events: DEFAULT_WEBHOOK_EVENTS } : null,
                  }))
                }
                onChange={(webhook) => setState((s) => ({ ...s, webhook }))}
              />
            )}
          </FeatureCard.Body>
          <FeatureCard.Footer>
            <div className={'flex items-center justify-between'}>
              <Button variant={'ghost'} onClick={handleSkip} disabled={createServer.isPending}>
                {t('wizard.firstServer.skip')}
              </Button>
              <div className={'flex items-center gap-2'}>
                {step > 1 && (
                  <Button variant={'ghost'} onClick={goPrev} disabled={createServer.isPending}>
                    {t('common.back')}
                  </Button>
                )}
                {step < TOTAL_STEPS ? (
                  <Button onClick={goNext}>
                    {t('common.next')}
                    <ArrowRight className={'size-4'} />
                  </Button>
                ) : (
                  <Button onClick={handleCreate} disabled={!canAdvance || createServer.isPending}>
                    {createServer.isPending ? <Loader2 className={'size-4 animate-spin'} /> : <Check className={'size-4'} />}
                    {t('wizard.firstServer.create')}
                  </Button>
                )}
              </div>
            </div>
          </FeatureCard.Footer>
        </FeatureCard>
      </div>
    </PageContent>
  );
}

function Stepper({ current }: { current: WizardStep }) {
  const { t } = useTranslation();
  const steps: Array<{ id: WizardStep; labelKey: string }> = [
    { id: 1, labelKey: 'wizard.firstServer.stepper.type' },
    { id: 2, labelKey: 'wizard.firstServer.stepper.size' },
    { id: 3, labelKey: 'wizard.firstServer.stepper.backup' },
    { id: 4, labelKey: 'wizard.firstServer.stepper.webhook' },
  ];
  return (
    <div className={'flex items-center gap-2 overflow-x-auto'}>
      {steps.map((s, i) => {
        const isActive = s.id === current;
        const isDone = s.id < current;
        return (
          <div key={s.id} className={'flex flex-1 items-center gap-2'}>
            <div
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition',
                isDone && 'border-green-500/50 bg-green-500/10 text-green-700 dark:text-green-400',
                isActive && 'border-sky-500/50 bg-sky-500/10 text-sky-700 dark:text-sky-400',
                !isActive && !isDone && 'border-black/10 bg-white text-zinc-400 dark:border-white/10 dark:bg-zinc-900'
              )}
            >
              {isDone ? <Check className={'size-3.5'} /> : s.id}
            </div>
            <span
              className={cn(
                'hidden text-xs sm:inline',
                isActive ? 'font-medium text-zinc-800 dark:text-zinc-200' : 'text-zinc-500 dark:text-zinc-500'
              )}
            >
              {t(s.labelKey)}
            </span>
            {i < steps.length - 1 && <div className={'h-px flex-1 bg-black/8 dark:bg-white/8'} />}
          </div>
        );
      })}
    </div>
  );
}

function StepType({
  value,
  name,
  onTypeChange,
  onNameChange,
}: {
  value: ServerType;
  name: string;
  onTypeChange: (type: ServerType) => void;
  onNameChange: (name: string) => void;
}) {
  const { t } = useTranslation();
  const types: Array<ServerType> = ['survival', 'creative', 'minigames'];
  return (
    <div className={'space-y-5'}>
      <div>
        <h2 className={'text-lg font-medium text-zinc-800 dark:text-zinc-200'}>{t('wizard.firstServer.stepType.heading')}</h2>
        <p className={'mt-1 text-sm text-zinc-600 dark:text-zinc-400'}>{t('wizard.firstServer.stepType.description')}</p>
      </div>
      <div>
        <Label className={'mb-1.5 block text-xs font-medium'}>
          {t('wizard.firstServer.stepType.nameLabel')}
        </Label>
        <Input value={name} onChange={(e) => onNameChange(e.target.value)} maxLength={64} />
      </div>
      <div className={'grid gap-3 sm:grid-cols-3'}>
        {types.map((type) => {
          const meta = TYPE_META[type];
          const Icon = meta.icon;
          const active = value === type;
          return (
            <button
              key={type}
              type={'button'}
              onClick={() => onTypeChange(type)}
              className={cn(
                'rounded-lg border p-4 text-left transition',
                active
                  ? 'border-sky-500/50 bg-sky-500/5'
                  : 'border-black/8 bg-white hover:border-black/15 dark:border-white/8 dark:bg-zinc-900/40'
              )}
            >
              <Icon className={'mb-3 size-5 text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
              <div className={'text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{t(meta.labelKey)}</div>
              <div className={'mt-1 text-xs text-zinc-600 dark:text-zinc-400'}>{t(meta.descKey)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function StepSize({
  value,
  ramMb,
  exceeds,
  presets,
  hostRamMb,
  onChange,
}: {
  value: CommunitySize;
  ramMb: number;
  exceeds: boolean;
  presets: Array<{ size: CommunitySize; maxRamMb: number; label: string }>;
  hostRamMb: number;
  onChange: (size: CommunitySize) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={'space-y-5'}>
      <div>
        <h2 className={'text-lg font-medium text-zinc-800 dark:text-zinc-200'}>{t('wizard.firstServer.stepSize.heading')}</h2>
        <p className={'mt-1 text-sm text-zinc-600 dark:text-zinc-400'}>{t('wizard.firstServer.stepSize.description')}</p>
      </div>
      <div className={'grid gap-3 sm:grid-cols-2 md:grid-cols-4'}>
        {presets.map((p) => {
          const active = value === p.size;
          return (
            <button
              key={p.size}
              type={'button'}
              onClick={() => onChange(p.size)}
              className={cn(
                'rounded-lg border p-3 text-left transition',
                active
                  ? 'border-sky-500/50 bg-sky-500/5'
                  : 'border-black/8 bg-white hover:border-black/15 dark:border-white/8 dark:bg-zinc-900/40'
              )}
            >
              <Users className={'mb-2 size-4 text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
              <div className={'text-sm font-medium text-zinc-800 dark:text-zinc-200'}>
                {t(`wizard.firstServer.stepSize.${p.size}`)}
              </div>
              <div className={'font-jetbrains mt-0.5 text-xs text-zinc-600 tabular-nums dark:text-zinc-400'}>
                {formatRam(p.maxRamMb)}
              </div>
            </button>
          );
        })}
      </div>
      {exceeds && (
        <Alert variant={'warning'}>
          <AlertTriangle className={'size-4'} />
          <AlertDescription>
            {t('wizard.firstServer.stepSize.exceedsHost', {
              ram: formatRam(ramMb),
              host: formatRam(hostRamMb),
            })}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}

function StepBackup({
  value,
  canUseCloud,
  destinations,
  onUpdate,
}: {
  value: WizardState['backup'];
  canUseCloud: boolean;
  destinations: Array<{ id: string; name: string; bucket: string }>;
  onUpdate: (patch: Partial<WizardState['backup']>) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className={'space-y-5'}>
      <div>
        <h2 className={'text-lg font-medium text-zinc-800 dark:text-zinc-200'}>{t('wizard.firstServer.stepBackup.heading')}</h2>
        <p className={'mt-1 text-sm text-zinc-600 dark:text-zinc-400'}>{t('wizard.firstServer.stepBackup.description')}</p>
      </div>
      <div className={'grid gap-3 sm:grid-cols-3'}>
        {(['daily', 'weekly', 'off'] as const).map((freq) => {
          const active = value.frequency === freq;
          return (
            <button
              key={freq}
              type={'button'}
              onClick={() => onUpdate({ frequency: freq })}
              className={cn(
                'rounded-lg border p-3 text-left transition',
                active
                  ? 'border-sky-500/50 bg-sky-500/5'
                  : 'border-black/8 bg-white hover:border-black/15 dark:border-white/8 dark:bg-zinc-900/40'
              )}
            >
              <div className={'text-sm font-medium text-zinc-800 dark:text-zinc-200'}>
                {t(`wizard.firstServer.stepBackup.frequency.${freq}`)}
              </div>
            </button>
          );
        })}
      </div>
      {value.frequency !== 'off' && (
        <>
          <div>
            <Label className={'mb-1 block text-xs font-medium'}>
              {t('wizard.firstServer.stepBackup.maxBackups')}
            </Label>
            <Input
              type={'number'}
              min={1}
              max={100}
              className={'w-32'}
              value={value.maxBackups}
              onChange={(e) => onUpdate({ maxBackups: Number(e.target.value) })}
            />
          </div>

          <div>
            <Label className={'mb-1 block text-xs font-medium'}>
              {t('wizard.firstServer.stepBackup.destination')}
            </Label>
            <div className={'grid gap-2 sm:grid-cols-2'}>
              <DestinationCard
                icon={HardDrive}
                label={t('wizard.firstServer.stepBackup.local')}
                active={value.destination === 'local'}
                onClick={() => onUpdate({ destination: 'local', cloudDestinationId: undefined })}
              />
              <DestinationCard
                icon={Cloud}
                label={t('wizard.firstServer.stepBackup.cloud')}
                active={value.destination === 'cloud'}
                disabled={!canUseCloud}
                onClick={() => onUpdate({ destination: 'cloud' })}
              />
            </div>
            {!canUseCloud && (
              <p className={'mt-1.5 text-xs text-zinc-500 dark:text-zinc-500'}>{t('wizard.firstServer.stepBackup.noCloud')}</p>
            )}
          </div>
          {value.destination === 'cloud' && canUseCloud && (
            <Select value={value.cloudDestinationId ?? ''} onValueChange={(v) => onUpdate({ cloudDestinationId: v })}>
              <SelectTrigger>
                <SelectValue placeholder={t('wizard.firstServer.stepBackup.selectDestination')} />
              </SelectTrigger>
              <SelectContent>
                {destinations.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} ({d.bucket})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </>
      )}
    </div>
  );
}

function StepWebhook({
  value,
  onToggle,
  onChange,
}: {
  value: WizardState['webhook'];
  onToggle: (enabled: boolean) => void;
  onChange: (webhook: WizardState['webhook']) => void;
}) {
  const { t } = useTranslation();
  const enabled = value !== null;

  return (
    <div className={'space-y-5'}>
      <div>
        <h2 className={'text-lg font-medium text-zinc-800 dark:text-zinc-200'}>{t('wizard.firstServer.stepWebhook.heading')}</h2>
        <p className={'mt-1 text-sm text-zinc-600 dark:text-zinc-400'}>{t('wizard.firstServer.stepWebhook.description')}</p>
      </div>
      <Label className={'flex cursor-pointer items-center gap-3'} light={true}>
        <Checkbox checked={enabled} onCheckedChange={(checked) => onToggle(Boolean(checked))} />
        <WebhookIcon className={'size-4 text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
        <span className={'text-sm'}>{t('wizard.firstServer.stepWebhook.enable')}</span>
      </Label>
      {value && (
        <div>
          <Label className={'mb-1 block text-xs font-medium'}>
            {t('wizard.firstServer.stepWebhook.url')}
          </Label>
          <Input
            type={'url'}
            className={'font-jetbrains'}
            placeholder={'https://discord.com/api/webhooks/...'}
            value={value.url}
            onChange={(e) => onChange({ ...value, url: e.target.value })}
          />
          <p className={'mt-1 text-[11px] text-zinc-500 dark:text-zinc-500'}>{t('wizard.firstServer.stepWebhook.hint')}</p>
        </div>
      )}
    </div>
  );
}

function DestinationCard({
  icon: Icon,
  label,
  active,
  disabled = false,
  onClick,
}: {
  icon: typeof HardDrive;
  label: string;
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type={'button'}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'rounded-lg border p-3 text-left transition',
        disabled && 'cursor-not-allowed opacity-50',
        active
          ? 'border-sky-500/50 bg-sky-500/5'
          : 'border-black/8 bg-white hover:border-black/15 dark:border-white/8 dark:bg-zinc-900/40'
      )}
    >
      <Icon className={'mb-1 size-4 text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
      <div className={'text-sm font-medium text-zinc-800 dark:text-zinc-200'}>{label}</div>
    </button>
  );
}

function formatRam(mb: number): string {
  if (mb >= 1024) return `${(mb / 1024).toFixed(mb % 1024 === 0 ? 0 : 1)} GB`;
  return `${mb} MB`;
}
