import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldX, Trash2 } from 'lucide-react';
import { SkeletonList } from '@shulkr/frontend/features/ui/skeleton_presets';
import { useBannedPlayers, useBannedIps, usePardon, usePardonIp } from '@shulkr/frontend/hooks/use_bans';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { PlayerLink } from '@shulkr/frontend/features/ui/player_link';

export function BanManager({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { data: playersData, isLoading: playersLoading } = useBannedPlayers(serverId);
  const { data: ipsData, isLoading: ipsLoading } = useBannedIps(serverId);
  const pardon = usePardon(serverId);
  const pardonIp = usePardonIp(serverId);

  const isLoading = playersLoading || ipsLoading;
  const playerEntries = playersData?.entries ?? [];
  const ipEntries = ipsData?.entries ?? [];
  const totalCount = playerEntries.length + ipEntries.length;

  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title count={totalCount > 0 && totalCount}>{t('players.banList')}</FeatureCard.Title>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <FeatureCard.Body>
        {isLoading ? (
          <div className={'p-3'}>
            <SkeletonList rows={3} />
          </div>
        ) : totalCount === 0 ? (
          <FeatureCard.Empty icon={ShieldX} title={t('players.noBans')} description={t('players.noBansDescription')} />
        ) : (
          <>
            {playerEntries.map((entry) => (
              <BannedPlayerRow
                key={entry.uuid || entry.name}
                onPardon={() => pardon.mutateAsync(entry.name)}
                isPending={pardon.isPending}
                {...{ entry, serverId }}
              />
            ))}
            {ipEntries.map((entry) => (
              <BannedIpRow
                key={entry.ip}
                onPardon={() => pardonIp.mutateAsync(entry.ip)}
                isPending={pardonIp.isPending}
                {...{ entry }}
              />
            ))}
          </>
        )}
      </FeatureCard.Body>
    </FeatureCard>
  );
}

function BannedPlayerRow({
  entry,
  serverId,
  onPardon,
  isPending,
}: {
  entry: { uuid: string; name: string; source: string; reason: string };
  serverId: string;
  onPardon: () => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();

  const can = useHasPermission();
  const canPardon = can('server:players:pardon');

  const [confirm, setConfirm] = useState(false);

  const hasReason = entry.reason && entry.reason !== 'Banned by an operator.';

  return (
    <FeatureCard.Row className={'py-1'}>
      <div className={'flex items-center gap-2'}>
        <Badge variant={'destructive'}>{t('players.banTypePlayer')}</Badge>
        <PlayerLink name={entry.name} {...{ serverId }} />
        {entry.uuid && <span className={'font-jetbrains text-xs text-zinc-400 dark:text-zinc-500'}>{entry.uuid}</span>}
        {entry.source && <span className={'text-xs text-zinc-400 dark:text-zinc-500'}>{entry.source}</span>}
        {hasReason && <span className={'text-xs text-zinc-400 dark:text-zinc-500'}>{entry.reason}</span>}
      </div>
      {canPardon && (
        <FeatureCard.RowControl>
          {confirm ? (
            <div className={'flex items-center gap-1.5'}>
              <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
              <Button onClick={onPardon} variant={'destructive'} size={'xs'} disabled={isPending} loading={isPending}>
                {t('common.yes')}
              </Button>
              <Button onClick={() => setConfirm(false)} variant={'ghost'} size={'xs'}>
                {t('common.no')}
              </Button>
            </div>
          ) : (
            <Button variant={'ghost-destructive'} size={'icon-xs'} onClick={() => setConfirm(true)}>
              <Trash2 className={'size-3.5'} />
            </Button>
          )}
        </FeatureCard.RowControl>
      )}
    </FeatureCard.Row>
  );
}

function BannedIpRow({
  entry,
  onPardon,
  isPending,
}: {
  entry: { ip: string; source: string; reason: string };
  onPardon: () => void;
  isPending: boolean;
}) {
  const { t } = useTranslation();
  const can = useHasPermission();
  const canPardon = can('server:players:pardon');
  const [confirm, setConfirm] = useState(false);
  const hasReason = entry.reason && entry.reason !== 'Banned by an operator.';

  return (
    <FeatureCard.Row className={'py-1'}>
      <div className={'flex items-center gap-2'}>
        <Badge variant={'warning'}>{t('players.banTypeIp')}</Badge>
        <span className={'font-jetbrains text-sm font-medium text-zinc-900 dark:text-zinc-100'}>{entry.ip}</span>
        {entry.source && <span className={'text-xs text-zinc-400 dark:text-zinc-500'}>{entry.source}</span>}
        {hasReason && <span className={'text-xs text-zinc-400 dark:text-zinc-500'}>{entry.reason}</span>}
      </div>
      {canPardon && (
        <FeatureCard.RowControl>
          {confirm ? (
            <div className={'flex items-center gap-1.5'}>
              <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.confirm')}?</span>
              <Button onClick={onPardon} variant={'destructive'} size={'xs'} disabled={isPending} loading={isPending}>
                {t('common.yes')}
              </Button>
              <Button onClick={() => setConfirm(false)} variant={'ghost'} size={'xs'}>
                {t('common.no')}
              </Button>
            </div>
          ) : (
            <Button variant={'ghost-destructive'} size={'icon-xs'} onClick={() => setConfirm(true)}>
              <Trash2 className={'size-3.5'} />
            </Button>
          )}
        </FeatureCard.RowControl>
      )}
    </FeatureCard.Row>
  );
}
