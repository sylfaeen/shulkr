import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Ban, Plus, ShieldOff, Trash2 } from 'lucide-react';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { useGlobalIpBans, useAddGlobalIpBan, useRemoveGlobalIpBan } from '@shulkr/frontend/hooks/use_global_ip_bans';
import { AddIpBanDialog } from '@shulkr/frontend/pages/app/settings/dialogs/add_ip_ban_dialog';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/base/tooltip';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import type { GlobalIpBanResponse } from '@shulkr/shared';

export function GlobalIpBansSection() {
  const { t } = useTranslation();

  const can = useHasPermission();
  const canAdd = can('settings:globalIpBans:add');

  const { data: bans } = useGlobalIpBans();
  const addBan = useAddGlobalIpBan();
  const removeBan = useRemoveGlobalIpBan();
  const list: Array<GlobalIpBanResponse> = bans ?? [];

  const [dialogOpen, setDialogOpen] = useState(false);
  const [gateOpen, setGateOpen] = useState(false);
  const [pendingBan, setPendingBan] = useState<{ ip: string; reason?: string; player_name?: string } | null>(null);

  function handleAddRequest(input: { ip: string; reason?: string; player_name?: string }) {
    setPendingBan(input);
    setDialogOpen(false);
    setGateOpen(true);
  }

  return (
    <>
      <FeatureCard>
        <FeatureCard.Header>
          <FeatureCard.Content>
            <FeatureCard.Title count={list.length > 0 && String(list.length)}>{t('settings.ipBans.title')}</FeatureCard.Title>
            <FeatureCard.Description>{t('settings.ipBans.description')}</FeatureCard.Description>
          </FeatureCard.Content>
          {canAdd && (
            <FeatureCard.Actions>
              <Button onClick={() => setDialogOpen(true)} icon={Plus}>
                {t('settings.ipBans.addBan')}
              </Button>
            </FeatureCard.Actions>
          )}
        </FeatureCard.Header>
        <FeatureCard.Body>
          {list.length === 0 ? (
            <FeatureCard.Empty
              icon={ShieldOff}
              title={t('settings.ipBans.noBans')}
              description={t('settings.ipBans.noBansHint')}
            />
          ) : (
            <>
              {list.map((ban) => (
                <BanRow key={ban.id} {...{ ban }} onDelete={(id) => removeBan.mutateAsync(id)} />
              ))}
            </>
          )}
        </FeatureCard.Body>
      </FeatureCard>
      <AddIpBanDialog open={dialogOpen} onOpenChange={setDialogOpen} onAdd={handleAddRequest} />
      <PasswordGate
        open={gateOpen}
        onOpenChange={(open) => {
          if (!open) {
            setGateOpen(false);
            setPendingBan(null);
          }
        }}
        title={t('settings.ipBans.addBan')}
        description={t('settings.ipBans.addBanGateDescription')}
        confirmLabel={t('settings.ipBans.addBan')}
        destructive
        onConfirm={async () => {
          if (pendingBan) await addBan.mutateAsync(pendingBan);
          setGateOpen(false);
          setPendingBan(null);
        }}
      />
    </>
  );
}

function BanRow({ ban, onDelete }: { ban: GlobalIpBanResponse; onDelete: (id: number) => void | Promise<unknown> }) {
  const { t } = useTranslation();

  const can = useHasPermission();
  const canRemove = can('settings:globalIpBans:remove');

  const [gateBanId, setGateBanId] = useState<number | null>(null);

  return (
    <>
      <FeatureCard.Row interactive className={'items-center py-3'}>
        <div className={'flex items-center gap-3'}>
          <div className={'flex size-8 shrink-0 items-center justify-center rounded-lg bg-red-600 text-white'}>
            <Ban className={'size-4'} strokeWidth={2} />
          </div>
          <div className={'min-w-0'}>
            <div className={'flex items-center gap-2'}>
              <span className={'font-jetbrains text-sm font-medium text-zinc-800 tabular-nums dark:text-zinc-200'}>{ban.ip}</span>
              {ban.player_name && <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{ban.player_name}</span>}
            </div>
            {ban.reason && (
              <div className={'mt-0.5 truncate text-xs text-zinc-500 dark:text-zinc-400'} title={ban.reason}>
                {ban.reason}
              </div>
            )}
            <div className={'mt-0.5 text-xs text-zinc-400 dark:text-zinc-500'}>
              {t('settings.ipBans.bannedBy', { user: ban.banned_by })} · {new Date(ban.created_at).toLocaleString()}
            </div>
          </div>
        </div>
        <FeatureCard.RowControl>
          {canRemove && (
            <TooltipProvider delay={300}>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button onClick={() => setGateBanId(ban.id)} variant={'ghost-destructive'} size={'icon'} icon={Trash2} />
                  }
                />
                <TooltipContent className={'rounded-lg px-2.5 py-1.5 text-sm'}>{t('settings.ipBans.removeBan')}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </FeatureCard.RowControl>
      </FeatureCard.Row>
      <PasswordGate
        open={gateBanId !== null}
        onOpenChange={(open) => !open && setGateBanId(null)}
        title={t('settings.ipBans.removeBan')}
        description={t('settings.ipBans.removeBanDescription')}
        confirmLabel={t('settings.ipBans.removeBan')}
        destructive
        onConfirm={async () => {
          if (gateBanId !== null) await onDelete(gateBanId);
        }}
      />
    </>
  );
}
