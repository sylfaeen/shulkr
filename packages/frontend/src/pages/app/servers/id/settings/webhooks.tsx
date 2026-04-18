import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Bell, Clock, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { SkeletonList } from '@shulkr/frontend/features/ui/skeleton_presets';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
} from '@shulkr/frontend/hooks/use_webhooks';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { Switch } from '@shulkr/frontend/features/ui/shadcn/switch';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { CreateWebhookDialog, type CreateWebhookInput } from '@shulkr/frontend/pages/app/servers/dialogs/create_webhook_dialog';
import { EditWebhookDialog, type EditWebhookInput } from '@shulkr/frontend/pages/app/servers/dialogs/edit_webhook_dialog';
import { DeliveriesDialog } from '@shulkr/frontend/pages/app/servers/dialogs/deliveries_dialog';

export function ServerWebhooksPage() {
  const { id } = useParams({ strict: false });
  const { t } = useTranslation();
  const { data: server, isLoading: serverLoading, error: serverError } = useServer(id ?? '');

  usePageTitle(server?.name ? `${server.name} — ${t('webhooks.title')}` : t('webhooks.title'));

  if (serverLoading) return <ServerPageSkeleton />;
  if (serverError || !server) return <PageError />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Bell} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('webhooks.title')}</ServerPageHeader.PageName>
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('webhooks.description')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent>
        <WebhooksContent serverId={server.id} />
      </PageContent>
    </>
  );
}

function WebhooksContent({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { data: webhooks, isLoading } = useWebhooks(serverId);
  const createWebhook = useCreateWebhook(serverId);
  const updateWebhook = useUpdateWebhook(serverId);
  const deleteWebhook = useDeleteWebhook(serverId);
  const testWebhook = useTestWebhook(serverId);

  const can = useHasPermission();
  const canCreate = can('server:webhooks:create');
  const canUpdate = can('server:webhooks:update');
  const canTest = can('server:webhooks:test');
  const canDelete = can('server:webhooks:delete');

  const [createOpen, setCreateOpen] = useState(false);
  const [editingWebhookId, setEditingWebhookId] = useState<number | null>(null);
  const [gateWebhookId, setGateWebhookId] = useState<number | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<number | null>(null);

  const handleCreate = async (values: CreateWebhookInput) => {
    await createWebhook.mutateAsync(values);
    setCreateOpen(false);
  };

  const handleEdit = async (webhookId: number, values: EditWebhookInput) => {
    await updateWebhook.mutateAsync({ webhookId, body: values });
    setEditingWebhookId(null);
  };

  return (
    <>
      <FeatureCard.Stack>
        <FeatureCard>
          <FeatureCard.Header>
            <FeatureCard.Content>
              <FeatureCard.Title count={webhooks?.length}>{t('webhooks.title')}</FeatureCard.Title>
              <FeatureCard.Description>{t('webhooks.description')}</FeatureCard.Description>
            </FeatureCard.Content>
            {canCreate && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus className={'size-4'} />
                {t('webhooks.add')}
              </Button>
            )}
          </FeatureCard.Header>
          <FeatureCard.Body>
            {isLoading ? (
              <FeatureCard.Row className={'py-2'}>
                <SkeletonList rows={5} className={'w-full'} />
              </FeatureCard.Row>
            ) : !webhooks?.length ? (
              <FeatureCard.Empty icon={Bell} title={t('webhooks.empty')} description={t('webhooks.emptyDescription')} />
            ) : (
              webhooks.map((wh) => (
                <FeatureCard.Row key={wh.id} interactive onClick={() => canUpdate && setEditingWebhookId(wh.id)}>
                  <div className={'flex min-w-0 flex-1 items-center gap-3'}>
                    {wh.format === 'discord' ? (
                      <img src={'/discord.svg'} alt={'Discord'} className={'size-4 shrink-0'} />
                    ) : (
                      <Bell className={'size-4 shrink-0 text-zinc-400'} />
                    )}
                    <div className={'min-w-0'}>
                      <p className={'truncate text-sm font-medium'}>{wh.name}</p>
                      <p className={'truncate text-xs text-zinc-500'}>{wh.url}</p>
                    </div>
                  </div>
                  <div className={'flex shrink-0 items-center gap-2'} onClick={(e) => e.stopPropagation()}>
                    <Badge variant={'secondary'}>{wh.format}</Badge>
                    <Badge variant={'outline'}>
                      {wh.events.length} {t('webhooks.events')}
                    </Badge>
                    {canUpdate && (
                      <Switch
                        checked={wh.enabled}
                        onCheckedChange={(enabled) => updateWebhook.mutate({ webhookId: wh.id, body: { enabled } })}
                      />
                    )}
                    {canUpdate && (
                      <Button size={'icon-sm'} variant={'ghost'} onClick={() => setEditingWebhookId(wh.id)}>
                        <Pencil className={'size-3.5'} />
                      </Button>
                    )}
                    {canTest && (
                      <Button
                        size={'icon-sm'}
                        variant={'ghost'}
                        onClick={() => testWebhook.mutate(wh.id)}
                        disabled={testWebhook.isPending}
                      >
                        <Send className={'size-3.5'} />
                      </Button>
                    )}
                    <Button size={'icon-sm'} variant={'ghost'} onClick={() => setDeliveriesFor(wh.id)}>
                      <Clock className={'size-3.5'} />
                    </Button>
                    {canDelete && (
                      <Button variant={'ghost-destructive'} size={'icon-sm'} onClick={() => setGateWebhookId(wh.id)}>
                        <Trash2 className={'size-4'} />
                      </Button>
                    )}
                  </div>
                </FeatureCard.Row>
              ))
            )}
          </FeatureCard.Body>
        </FeatureCard>
      </FeatureCard.Stack>
      <PasswordGate
        open={gateWebhookId !== null}
        onOpenChange={(open) => !open && setGateWebhookId(null)}
        title={t('webhooks.deleteTitle')}
        description={t('webhooks.deleteDescription')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={async () => {
          if (gateWebhookId !== null) {
            await deleteWebhook.mutateAsync(gateWebhookId);
            setGateWebhookId(null);
          }
        }}
      />
      <CreateWebhookDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isLoading={createWebhook.isPending}
      />
      {editingWebhookId !== null && (
        <EditWebhookDialog
          webhookId={editingWebhookId}
          onOpenChange={(open) => {
            if (!open) setEditingWebhookId(null);
          }}
          onSubmit={handleEdit}
          isLoading={updateWebhook.isPending}
          {...{ serverId }}
        />
      )}
      {deliveriesFor !== null && (
        <DeliveriesDialog webhookId={deliveriesFor} onClose={() => setDeliveriesFor(null)} {...{ serverId }} />
      )}
    </>
  );
}
