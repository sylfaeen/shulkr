import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Bell, CheckCircle2, Clock, Loader2, Plus, Send, Trash2, XCircle } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import {
  useWebhooks,
  useCreateWebhook,
  useUpdateWebhook,
  useDeleteWebhook,
  useTestWebhook,
  useWebhookDeliveries,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';

const WEBHOOK_EVENTS = [
  { group: 'server', events: ['server:start', 'server:stop', 'server:crash'] },
  { group: 'backup', events: ['backup:success', 'backup:failure'] },
  { group: 'player', events: ['player:join', 'player:leave', 'player:ban'] },
  { group: 'task', events: ['task:success', 'task:failure'] },
] as const;

const ALL_EVENTS = WEBHOOK_EVENTS.flatMap((g) => g.events);

export function ServerWebhooksPage() {
  const { id } = useParams({ strict: false });
  const { t } = useTranslation();
  const { data: server, isLoading: serverLoading, error: serverError } = useServer(id ?? '');

  usePageTitle(server?.name ? `${server.name} — ${t('nav.webhooks')}` : t('nav.webhooks'));

  if (serverLoading) return <ServerPageSkeleton />;
  if (serverError || !server) return <PageError />;

  return (
    <PageContent>
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
      <WebhooksContent serverId={server.id} />
    </PageContent>
  );
}

function WebhooksContent({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { data: webhooks, isLoading } = useWebhooks(serverId);
  const updateWebhook = useUpdateWebhook(serverId);
  const deleteWebhook = useDeleteWebhook(serverId);
  const testWebhook = useTestWebhook(serverId);
  const can = useHasPermission();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);
  const [deliveriesFor, setDeliveriesFor] = useState<number | null>(null);

  if (isLoading) return <ServerPageSkeleton />;

  return (
    <>
      <FeatureCard.Stack>
        <FeatureCard>
          <FeatureCard.Header>
            <FeatureCard.Content>
              <FeatureCard.Title count={webhooks?.length}>{t('webhooks.title')}</FeatureCard.Title>
              <FeatureCard.Description>{t('webhooks.description')}</FeatureCard.Description>
            </FeatureCard.Content>
            {can('server:webhooks:create') && (
              <Button size={'sm'} onClick={() => setCreateOpen(true)}>
                <Plus className={'size-4'} />
                {t('webhooks.add')}
              </Button>
            )}
          </FeatureCard.Header>
          <FeatureCard.Body>
            {!webhooks?.length ? (
              <FeatureCard.Empty icon={Bell} title={t('webhooks.empty')} description={t('webhooks.emptyDescription')} />
            ) : (
              webhooks.map((wh) => (
                <FeatureCard.Row key={wh.id} interactive>
                  <div className={'flex min-w-0 flex-1 items-center gap-3'}>
                    <Bell className={'size-4 shrink-0 text-zinc-400'} />
                    <div className={'min-w-0'}>
                      <p className={'truncate text-sm font-medium'}>{wh.name}</p>
                      <p className={'truncate text-xs text-zinc-500'}>{wh.url}</p>
                    </div>
                  </div>
                  <div className={'flex shrink-0 items-center gap-2'}>
                    <Badge variant={'secondary'}>{wh.format}</Badge>
                    <Badge variant={'outline'}>
                      {wh.events.length} {t('webhooks.events')}
                    </Badge>
                    {can('server:webhooks:update') && (
                      <Switch
                        checked={wh.enabled}
                        onCheckedChange={(enabled) => updateWebhook.mutate({ webhookId: wh.id, body: { enabled } })}
                      />
                    )}
                    {can('server:webhooks:test') && (
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
                    {can('server:webhooks:delete') && (
                      <>
                        {deleteConfirm === wh.id ? (
                          <div className={'flex items-center gap-1.5'}>
                            <span className={'text-sm text-zinc-500'}>{t('common.confirm')}?</span>
                            <PasswordGate
                              onConfirm={() => {
                                deleteWebhook.mutate(wh.id);
                                setDeleteConfirm(null);
                              }}
                              onOpenChange={(open) => {
                                if (!open) setDeleteConfirm(null);
                              }}
                            >
                              <Button variant={'destructive'} size={'xs'} loading={deleteWebhook.isPending}>
                                {t('common.yes')}
                              </Button>
                            </PasswordGate>
                            <Button variant={'ghost'} size={'xs'} onClick={() => setDeleteConfirm(null)}>
                              {t('common.no')}
                            </Button>
                          </div>
                        ) : (
                          <Button variant={'ghost-destructive'} size={'icon-sm'} onClick={() => setDeleteConfirm(wh.id)}>
                            <Trash2 className={'size-4'} />
                          </Button>
                        )}
                      </>
                    )}
                  </div>
                </FeatureCard.Row>
              ))
            )}
          </FeatureCard.Body>
        </FeatureCard>
      </FeatureCard.Stack>

      <CreateWebhookDialog open={createOpen} onOpenChange={setCreateOpen} {...{ serverId }} />

      {deliveriesFor !== null && (
        <DeliveriesDialog webhookId={deliveriesFor} onClose={() => setDeliveriesFor(null)} {...{ serverId }} />
      )}
    </>
  );
}

function CreateWebhookDialog({
  serverId,
  open,
  onOpenChange,
}: {
  serverId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const createWebhook = useCreateWebhook(serverId);

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<'discord' | 'generic'>('discord');
  const [events, setEvents] = useState<Array<string>>([...ALL_EVENTS]);

  const toggleEvent = (event: string) => {
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  };

  const handleSubmit = async () => {
    await createWebhook.mutateAsync({ name, url, format, events });
    setName('');
    setUrl('');
    setFormat('discord');
    setEvents([...ALL_EVENTS]);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('webhooks.createTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody className={'space-y-4'}>
          <div className={'space-y-2'}>
            <Label>{t('webhooks.name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('webhooks.namePlaceholder')} />
          </div>
          <div className={'space-y-2'}>
            <Label>{t('webhooks.url')}</Label>
            <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder={'https://discord.com/api/webhooks/...'} />
          </div>
          <div className={'space-y-2'}>
            <Label>{t('webhooks.format')}</Label>
            <div className={'flex gap-2'}>
              <Button size={'sm'} variant={format === 'discord' ? 'default' : 'outline'} onClick={() => setFormat('discord')}>
                Discord
              </Button>
              <Button size={'sm'} variant={format === 'generic' ? 'default' : 'outline'} onClick={() => setFormat('generic')}>
                {t('webhooks.generic')}
              </Button>
            </div>
          </div>
          <div className={'space-y-2'}>
            <Label>{t('webhooks.events')}</Label>
            {WEBHOOK_EVENTS.map((group) => (
              <div key={group.group} className={'space-y-1'}>
                <p className={'text-xs font-medium text-zinc-500 uppercase'}>{t(`webhooks.group.${group.group}`)}</p>
                <div className={'flex flex-wrap gap-2'}>
                  {group.events.map((event) => (
                    <Label key={event} className={'flex items-center gap-1.5 text-sm'}>
                      <Checkbox checked={events.includes(event)} onCheckedChange={() => toggleEvent(event)} />
                      {t(`webhooks.event.${event}`)}
                    </Label>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant={'ghost'} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name || !url || events.length === 0 || createWebhook.isPending}
            loading={createWebhook.isPending}
          >
            {t('webhooks.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeliveriesDialog({ serverId, webhookId, onClose }: { serverId: string; webhookId: number; onClose: () => void }) {
  const { t } = useTranslation();
  const { data, isLoading } = useWebhookDeliveries(serverId, webhookId);

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent className={'max-w-lg'}>
        <DialogHeader>
          <DialogTitle>{t('webhooks.deliveries')}</DialogTitle>
        </DialogHeader>
        <DialogBody>
          {isLoading ? (
            <div className={'flex items-center justify-center py-8'}>
              <Loader2 className={'size-5 animate-spin text-zinc-400'} />
            </div>
          ) : !data?.deliveries.length ? (
            <p className={'py-8 text-center text-sm text-zinc-500'}>{t('webhooks.noDeliveries')}</p>
          ) : (
            <div className={'max-h-80 space-y-1 overflow-y-auto'}>
              {data.deliveries.map((d) => (
                <div
                  key={d.id}
                  className={'flex items-center justify-between rounded-lg px-3 py-2 hover:bg-zinc-50 dark:hover:bg-zinc-800/50'}
                >
                  <div className={'flex items-center gap-2'}>
                    {d.status === 'success' ? (
                      <CheckCircle2 className={'size-4 text-green-500'} />
                    ) : (
                      <XCircle className={'size-4 text-red-500'} />
                    )}
                    <span className={'text-sm'}>{d.event}</span>
                  </div>
                  <div className={'flex items-center gap-2'}>
                    {d.statusCode !== null && (
                      <Badge variant={d.status === 'success' ? 'secondary' : 'destructive'}>{d.statusCode}</Badge>
                    )}
                    {d.durationMs !== null && <span className={'text-xs text-zinc-500'}>{d.durationMs}ms</span>}
                    <span className={'text-xs text-zinc-400'}>{new Date(d.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant={'ghost'} onClick={onClose}>
            {t('common.close')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
