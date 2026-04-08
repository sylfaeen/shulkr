import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ShieldCheck, Plus, Trash2, LoaderCircle } from 'lucide-react';
import { useWhitelist, useWhitelistAdd, useWhitelistRemove } from '@shulkr/frontend/hooks/use_whitelist';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';

export function WhitelistManager({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const [newName, setNewName] = useState('');

  const { data, isLoading } = useWhitelist(serverId);
  const addPlayer = useWhitelistAdd(serverId);
  const removePlayer = useWhitelistRemove(serverId);

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
        <div className={'flex items-center gap-2 px-4 py-3'}>
          <Input
            type={'text'}
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t('players.whitelistPlaceholder')}
            className={'h-8 text-sm'}
            onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
          />
          <Button size={'sm'} onClick={handleAdd} disabled={!newName.trim() || addPlayer.isPending} loading={addPlayer.isPending}>
            <Plus className={'size-3.5'} />
            {t('common.create')}
          </Button>
        </div>
        {isLoading ? (
          <div className={'py-6 text-center'}>
            <LoaderCircle className={'mx-auto size-6 animate-spin text-zinc-400'} />
          </div>
        ) : !data || data.entries.length === 0 ? (
          <div className={'p-6 text-sm text-zinc-400 dark:text-zinc-500'}>{t('players.noPlayers')}</div>
        ) : (
          data.entries.map((entry) => (
            <FeatureCard.Row key={entry.name}>
              <div className={'flex items-center gap-2'}>
                <ShieldCheck className={'size-4 text-green-600'} />
                <span className={'text-sm font-medium text-zinc-900 dark:text-zinc-100'}>{entry.name}</span>
                {entry.uuid && (
                  <span className={'font-jetbrains text-xs text-zinc-400 dark:text-zinc-500'}>{entry.uuid.slice(0, 8)}...</span>
                )}
              </div>
              <FeatureCard.RowControl>
                <Button
                  variant={'ghost-destructive'}
                  size={'icon-sm'}
                  onClick={() => removePlayer.mutateAsync(entry.name)}
                  disabled={removePlayer.isPending}
                >
                  <Trash2 className={'size-3.5'} />
                </Button>
              </FeatureCard.RowControl>
            </FeatureCard.Row>
          ))
        )}
      </FeatureCard.Body>
    </FeatureCard>
  );
}
