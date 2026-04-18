import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Cloud, Pencil, Plus, Trash2 } from 'lucide-react';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { SkeletonList } from '@shulkr/frontend/features/ui/skeleton_presets';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import {
  useCloudDestinations,
  useDeleteCloudDestination,
} from '@shulkr/frontend/hooks/use_cloud_destinations';
import { CloudDestinationDialog } from '@shulkr/frontend/pages/app/settings/dialogs/cloud_destination_dialog';
import type { CloudDestinationResponse } from '@shulkr/shared';

export function CloudDestinationsPage() {
  const { t } = useTranslation();
  const can = useHasPermission();
  const canList = can('settings:cloud-destinations:list');
  const canCreate = can('settings:cloud-destinations:create');
  const canUpdate = can('settings:cloud-destinations:update');
  const canDelete = can('settings:cloud-destinations:delete');

  usePageTitle(`shulkr • ${t('cloudDestinations.title')}`);

  const { data: destinations, isLoading, error } = useCloudDestinations();
  const deleteDest = useDeleteCloudDestination();

  const [createOpen, setCreateOpen] = useState(false);
  const [editingDest, setEditingDest] = useState<CloudDestinationResponse | null>(null);
  const [gateDestId, setGateDestId] = useState<string | null>(null);

  if (!canList) return <PageError message={t('errors.forbidden')} />;
  if (error) return <PageError message={t('errors.generic')} />;

  return (
    <>
      <PageContent>
        <FeatureCard>
          <FeatureCard.Header>
            <FeatureCard.Content>
              <FeatureCard.Title count={destinations?.length}>{t('cloudDestinations.title')}</FeatureCard.Title>
              <FeatureCard.Description>{t('cloudDestinations.subtitle')}</FeatureCard.Description>
            </FeatureCard.Content>
            {canCreate && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className={'size-4'} />
                {t('cloudDestinations.add')}
              </Button>
            )}
          </FeatureCard.Header>
          <FeatureCard.Body>
            {isLoading ? (
              <FeatureCard.Row className={'py-2'}>
                <SkeletonList rows={3} className={'w-full'} />
              </FeatureCard.Row>
            ) : !destinations?.length ? (
              <FeatureCard.Empty
                icon={Cloud}
                title={t('cloudDestinations.empty.title')}
                description={t('cloudDestinations.empty.description')}
              />
            ) : (
              destinations.map((dest) => (
                <FeatureCard.Row key={dest.id}>
                  <div className={'flex min-w-0 flex-1 items-center gap-3'}>
                    <div className={'flex size-9 shrink-0 items-center justify-center rounded-lg bg-sky-500/10'}>
                      <Cloud className={'size-4 text-sky-600 dark:text-sky-400'} strokeWidth={2} />
                    </div>
                    <div className={'min-w-0 flex-1'}>
                      <div className={'flex items-center gap-2'}>
                        <span className={'font-medium text-zinc-800 dark:text-zinc-200'}>{dest.name}</span>
                        <Badge variant={'outline'}>{t(`cloudDestinations.providers.${dest.provider}`)}</Badge>
                        {!dest.enabled && <Badge variant={'secondary'}>{t('common.disabled')}</Badge>}
                      </div>
                      <div className={'font-jetbrains text-xs text-zinc-600 dark:text-zinc-400'}>
                        {dest.bucket} · {dest.region}
                      </div>
                    </div>
                  </div>
                  <FeatureCard.RowControl>
                    {canUpdate && (
                      <Button variant={'ghost'} size={'icon-sm'} onClick={() => setEditingDest(dest)}>
                        <Pencil className={'size-4'} />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant={'ghost-destructive'} size={'icon-sm'} onClick={() => setGateDestId(dest.id)}>
                        <Trash2 className={'size-4'} />
                      </Button>
                    )}
                  </FeatureCard.RowControl>
                </FeatureCard.Row>
              ))
            )}
          </FeatureCard.Body>
        </FeatureCard>
      </PageContent>

      {createOpen && <CloudDestinationDialog onClose={() => setCreateOpen(false)} />}
      {editingDest && <CloudDestinationDialog destination={editingDest} onClose={() => setEditingDest(null)} />}

      <PasswordGate
        open={gateDestId !== null}
        onOpenChange={(open) => !open && setGateDestId(null)}
        title={t('cloudDestinations.delete.title')}
        description={t('cloudDestinations.delete.description')}
        confirmLabel={t('common.delete')}
        destructive={true}
        onConfirm={async () => {
          if (gateDestId) await deleteDest.mutateAsync(gateDestId).catch(() => {});
        }}
      />
    </>
  );
}
