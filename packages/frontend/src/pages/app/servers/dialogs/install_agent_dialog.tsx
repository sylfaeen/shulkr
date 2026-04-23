import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { CloudDownload, Server as ServerIcon, Network, Layers } from 'lucide-react';
import type { AgentPlatform } from '@shulkr/shared';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { cn } from '@shulkr/frontend/lib/cn';

type PlatformMeta = {
  id: AgentPlatform;
  icon: typeof ServerIcon;
  accentClass: string;
};

const PLATFORMS: Array<PlatformMeta> = [
  { id: 'paper', icon: ServerIcon, accentClass: 'border-emerald-500/40 bg-emerald-500/5' },
  { id: 'folia', icon: Layers, accentClass: 'border-violet-500/40 bg-violet-500/5' },
  { id: 'velocity', icon: Network, accentClass: 'border-sky-500/40 bg-sky-500/5' },
  { id: 'waterfall', icon: Network, accentClass: 'border-amber-500/40 bg-amber-500/5' },
];

export function InstallAgentDialog({
  open,
  isPending,
  onClose,
  onConfirm,
  currentPlatform,
}: {
  open: boolean;
  isPending: boolean;
  onClose: () => void;
  onConfirm: (platform: AgentPlatform) => void;
  currentPlatform?: AgentPlatform | null;
}) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<AgentPlatform>(currentPlatform ?? 'paper');
  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className={'max-w-2xl'}>
        <DialogHeader>
          <DialogTitle>{t('agent.install.title')}</DialogTitle>
          <DialogDescription>{t('agent.install.description')}</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <div className={'space-y-4'}>
            <div>
              <div className={'mb-2 text-xs font-medium text-zinc-600 dark:text-zinc-400'}>
                {t('agent.install.platformLabel')}
              </div>
              <div className={'grid grid-cols-2 gap-2'}>
                {PLATFORMS.map((p) => {
                  const Icon = p.icon;
                  const active = selected === p.id;
                  return (
                    <button
                      key={p.id}
                      type={'button'}
                      onClick={() => setSelected(p.id)}
                      disabled={isPending}
                      className={cn(
                        'rounded-lg border p-3 text-left transition-all',
                        active
                          ? p.accentClass
                          : 'border-black/6 bg-zinc-50/50 hover:border-black/12 hover:bg-zinc-50 dark:border-white/6 dark:bg-zinc-800/50 dark:hover:border-white/12 dark:hover:bg-zinc-800'
                      )}
                    >
                      <div className={'flex items-center gap-2'}>
                        <Icon className={'size-4 text-zinc-600 dark:text-zinc-400'} strokeWidth={2} />
                        <div className={'text-sm font-medium text-zinc-800 dark:text-zinc-200'}>
                          {t(`agent.platforms.${p.id}.name`)}
                        </div>
                      </div>
                      <div className={'mt-1 text-xs text-zinc-600 dark:text-zinc-400'}>
                        {t(`agent.platforms.${p.id}.tagline`)}
                      </div>
                      <div className={'font-jetbrains mt-2 text-[11px] text-zinc-500 dark:text-zinc-500'}>
                        {t('agent.install.versionsLabel')}: {t(`agent.platforms.${p.id}.versions`)}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            <div
              className={
                'rounded-md border border-black/6 bg-zinc-50 p-3 text-xs text-zinc-600 dark:border-white/6 dark:bg-zinc-800/50 dark:text-zinc-400'
              }
            >
              {t('agent.install.whatChanges', { platform: t(`agent.platforms.${selected}.name`) })}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant={'ghost'} onClick={onClose} disabled={isPending}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => onConfirm(selected)} loading={isPending} disabled={isPending} icon={CloudDownload}>
            {t('agent.install.confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
