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
  useUpdateCloudDestination,
} from '@shulkr/frontend/hooks/use_cloud_destinations';
import { Switch } from '@shulkr/frontend/features/ui/shadcn/switch';
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
  const updateDest = useUpdateCloudDestination();
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
              <Button onClick={() => setCreateOpen(true)} icon={Plus}>
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
                <FeatureCard.Row key={dest.id} interactive={canUpdate} onClick={() => canUpdate && setEditingDest(dest)}>
                  <div className={'flex min-w-0 flex-1 items-center gap-3'}>
                    <Cloud className={'size-4 shrink-0 text-zinc-400'} />
                    <div className={'min-w-0'}>
                      <p className={'truncate text-sm font-medium'}>{dest.name}</p>
                      <p className={'font-jetbrains truncate text-xs text-zinc-500'}>
                        {dest.bucket} · {dest.region}
                      </p>
                    </div>
                  </div>
                  <div className={'flex shrink-0 items-center gap-2'} onClick={(e) => e.stopPropagation()}>
                    <Badge variant={'secondary'}>{t(`cloudDestinations.providers.${dest.provider}`)}</Badge>
                    {canUpdate && (
                      <Switch
                        checked={dest.enabled}
                        onCheckedChange={(enabled) => updateDest.mutate({ id: dest.id, body: { enabled } })}
                      />
                    )}
                    {canUpdate && (
                      <Button variant={'ghost'} size={'icon-sm'} onClick={() => setEditingDest(dest)} icon={Pencil} iconClass={'size-3.5'} />
                    )}
                    {canDelete && (
                      <Button variant={'ghost-destructive'} size={'icon-sm'} onClick={() => setGateDestId(dest.id)} icon={Trash2} />
                    )}
                  </div>
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
