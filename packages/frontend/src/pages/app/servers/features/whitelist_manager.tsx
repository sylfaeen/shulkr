import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ListChecks, Plus, Trash2 } from 'lucide-react';
import { useWhitelist, useWhitelistAdd, useWhitelistRemove } from '@shulkr/frontend/hooks/use_whitelist';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { SkeletonList } from '@shulkr/frontend/features/ui/skeleton_presets';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { PlayerLink } from '@shulkr/frontend/features/ui/player_link';

export function WhitelistManager({ serverId }: { serverId: string }) {
  const { t } = useTranslation();

  const [newName, setNewName] = useState('');

  const { data, isLoading } = useWhitelist(serverId);
  const addPlayer = useWhitelistAdd(serverId);
  const removePlayer = useWhitelistRemove(serverId);

  const can = useHasPermission();
  const canWhitelist = can('server:players:whitelist');

  const handleAdd = () => {
    if (!newName.trim()) return;
    addPlayer.mutateAsync(newName.trim()).then(() => setNewName(''));
  };

  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <div className={'flex items-center justify-start gap-4'}>
            <FeatureCard.Title count={data && data.entries.length > 0 && data.entries.length}>
              {t('players.whitelist')}
            </FeatureCard.Title>
            {data && (
              <Badge variant={data.enabled ? 'success' : 'warning'}>
                {data.enabled ? t('players.whitelistEnabled') : t('players.whitelistDisabled')}
              </Badge>
            )}
          </div>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <FeatureCard.Body>
        {canWhitelist && (
          <div className={'flex items-center gap-2 px-4 py-3'}>
            <Input
              type={'text'}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder={t('players.whitelistPlaceholder')}
              className={'h-8 text-sm'}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
            />
            <Button
              size={'sm'}
              onClick={handleAdd}
              disabled={!newName.trim() || addPlayer.isPending}
              loading={addPlayer.isPending}
            >
              <Plus className={'size-3.5'} />
              {t('common.create')}
            </Button>
          </div>
        )}
        {isLoading ? (
          <div className={'p-3'}>
            <SkeletonList rows={3} />
          </div>
        ) : !data || data.entries.length === 0 ? (
          <FeatureCard.Empty
            icon={ListChecks}
            title={t('whitelist.empty.title')}
            description={t('whitelist.empty.description')}
          />
        ) : (
          data.entries.map((entry) => (
            <FeatureCard.Row className={'py-1'} key={entry.name}>
              <div className={'flex items-center gap-2'}>
                <PlayerLink name={entry.name} {...{ serverId }} />
                {entry.uuid && <span className={'font-jetbrains text-xs text-zinc-400 dark:text-zinc-500'}>{entry.uuid}</span>}
              </div>
              {canWhitelist && (
                <FeatureCard.RowControl>
                  <Button
                    variant={'ghost-destructive'}
                    size={'icon-xs'}
                    onClick={() => removePlayer.mutateAsync(entry.name)}
                    disabled={removePlayer.isPending}
                  >
                    <Trash2 className={'size-3.5'} />
                  </Button>
                </FeatureCard.RowControl>
              )}
            </FeatureCard.Row>
          ))
        )}
      </FeatureCard.Body>
    </FeatureCard>
  );
}
