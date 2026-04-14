import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Plus, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { useAlertRules, useCreateAlert, useUpdateAlert, useDeleteAlert, useAlertEvents } from '@shulkr/frontend/hooks/use_alerts';
import { useWebhooks } from '@shulkr/frontend/hooks/use_webhooks';
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/shadcn/select';

const METRICS = ['cpu', 'ram', 'disk', 'tps'] as const;
const OPERATORS = ['>', '<', '>=', '<='] as const;

export function ServerAlertsPage() {
  const { id } = useParams({ strict: false });
  const { t } = useTranslation();
  const { data: server, isLoading: serverLoading, error: serverError } = useServer(id ?? '');

  usePageTitle(server?.name ? `${server.name} — ${t('nav.alerts')}` : t('nav.alerts'));

  if (serverLoading) return <ServerPageSkeleton />;
  if (serverError || !server) return <PageError />;

  return (
    <PageContent>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={ShieldAlert} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('alerts.title')}</ServerPageHeader.PageName>
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('alerts.description')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <AlertsContent serverId={server.id} />
    </PageContent>
  );
}

function AlertsContent({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { data: rules, isLoading } = useAlertRules(serverId);
  const { data: events } = useAlertEvents(serverId);
  const updateAlert = useUpdateAlert(serverId);
  const deleteAlert = useDeleteAlert(serverId);
  const can = useHasPermission();

  const [createOpen, setCreateOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  if (isLoading) return <ServerPageSkeleton />;

  return (
    <>
      <FeatureCard.Stack>
        <FeatureCard>
          <FeatureCard.Header>
            <FeatureCard.Content>
              <FeatureCard.Title count={rules?.length}>{t('alerts.rulesTitle')}</FeatureCard.Title>
              <FeatureCard.Description>{t('alerts.rulesDescription')}</FeatureCard.Description>
            </FeatureCard.Content>
            {can('server:alerts:create') && (
              <Button size={'sm'} onClick={() => setCreateOpen(true)}>
                <Plus className={'size-4'} />
                {t('alerts.add')}
              </Button>
            )}
          </FeatureCard.Header>
          <FeatureCard.Body>
            {!rules?.length ? (
              <FeatureCard.Empty icon={ShieldAlert} title={t('alerts.empty')} description={t('alerts.emptyDescription')} />
            ) : (
              rules.map((rule) => (
                <FeatureCard.Row key={rule.id} interactive>
                  <div className={'flex min-w-0 flex-1 items-center gap-3'}>
                    <AlertTriangle className={'size-4 shrink-0 text-zinc-400'} />
                    <div className={'min-w-0'}>
                      <p className={'truncate text-sm font-medium'}>{rule.name}</p>
                      <p className={'text-xs text-zinc-500'}>
                        {t(`alerts.metric.${rule.metric}`)} {rule.operator} {rule.threshold}%
                      </p>
                    </div>
                  </div>
                  <div className={'flex shrink-0 items-center gap-2'}>
                    <Badge variant={'secondary'}>
                      {rule.actions.length} {t('alerts.actions')}
                    </Badge>
                    {can('server:alerts:update') && (
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(enabled) => updateAlert.mutate({ alertId: rule.id, body: { enabled } })}
                      />
                    )}
                    {can('server:alerts:delete') && (
                      <>
                        {deleteConfirm === rule.id ? (
                          <div className={'flex items-center gap-1.5'}>
                            <span className={'text-sm text-zinc-500'}>{t('common.confirm')}?</span>
                            <PasswordGate
                              onConfirm={() => {
                                deleteAlert.mutate(rule.id);
                                setDeleteConfirm(null);
                              }}
                              onOpenChange={(open) => {
                                if (!open) setDeleteConfirm(null);
                              }}
                            >
                              <Button variant={'destructive'} size={'xs'} loading={deleteAlert.isPending}>
                                {t('common.yes')}
                              </Button>
                            </PasswordGate>
                            <Button variant={'ghost'} size={'xs'} onClick={() => setDeleteConfirm(null)}>
                              {t('common.no')}
                            </Button>
                          </div>
                        ) : (
                          <Button variant={'ghost-destructive'} size={'icon-sm'} onClick={() => setDeleteConfirm(rule.id)}>
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

        {events && events.events.length > 0 && (
          <FeatureCard>
            <FeatureCard.Header>
              <FeatureCard.Content>
                <FeatureCard.Title count={events.total}>{t('alerts.eventsTitle')}</FeatureCard.Title>
                <FeatureCard.Description>{t('alerts.eventsDescription')}</FeatureCard.Description>
              </FeatureCard.Content>
            </FeatureCard.Header>
            <FeatureCard.Body>
              {events.events.map((event) => (
                <FeatureCard.Row key={event.id}>
                  <div className={'flex items-center gap-3'}>
                    <XCircle className={'size-4 shrink-0 text-red-500'} />
                    <div>
                      <p className={'text-sm font-medium'}>
                        {t(`alerts.metric.${event.metric}`)} = {event.value}% (seuil: {event.threshold}%)
                      </p>
                      <p className={'text-xs text-zinc-500'}>{new Date(event.createdAt).toLocaleString()}</p>
                    </div>
                  </div>
                  <div className={'flex items-center gap-1'}>
                    {event.actionsTaken.map((action, i) => (
                      <Badge key={i} variant={'outline'}>
                        {action}
                      </Badge>
                    ))}
                  </div>
                </FeatureCard.Row>
              ))}
            </FeatureCard.Body>
          </FeatureCard>
        )}
      </FeatureCard.Stack>

      <CreateAlertDialog open={createOpen} onOpenChange={setCreateOpen} {...{ serverId }} />
    </>
  );
}

function CreateAlertDialog({
  serverId,
  open,
  onOpenChange,
}: {
  serverId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { t } = useTranslation();
  const createAlert = useCreateAlert(serverId);
  const { data: webhooks } = useWebhooks(serverId);

  const [name, setName] = useState('');
  const [metric, setMetric] = useState<'cpu' | 'ram' | 'disk' | 'tps'>('cpu');
  const [operator, setOperator] = useState<'>' | '<' | '>=' | '<='>('>=');
  const [threshold, setThreshold] = useState(90);
  const [actions, setActions] = useState<Array<string>>(['notify']);

  const toggleAction = (action: string) => {
    setActions((prev) => (prev.includes(action) ? prev.filter((a) => a !== action) : [...prev, action]));
  };

  const handleSubmit = async () => {
    await createAlert.mutateAsync({ name, metric, operator, threshold, actions });
    setName('');
    setMetric('cpu');
    setOperator('>=');
    setThreshold(90);
    setActions(['notify']);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('alerts.createTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody className={'space-y-4'}>
          <div className={'space-y-2'}>
            <Label>{t('alerts.name')}</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={t('alerts.namePlaceholder')} />
          </div>
          <div className={'grid grid-cols-3 gap-2'}>
            <div className={'space-y-2'}>
              <Label>{t('alerts.metric.label')}</Label>
              <Select value={metric} onValueChange={(v) => setMetric(v as typeof metric)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {METRICS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {t(`alerts.metric.${m}`)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={'space-y-2'}>
              <Label>{t('alerts.operator')}</Label>
              <Select value={operator} onValueChange={(v) => setOperator(v as typeof operator)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op} value={op}>
                      {op}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className={'space-y-2'}>
              <Label>{t('alerts.threshold')}</Label>
              <Input type={'number'} min={0} max={100} value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} />
            </div>
          </div>
          <div className={'space-y-2'}>
            <Label>{t('alerts.actionsLabel')}</Label>
            <div className={'space-y-1.5'}>
              <Label className={'flex items-center gap-1.5 text-sm'}>
                <Checkbox checked={actions.includes('notify')} onCheckedChange={() => toggleAction('notify')} />
                {t('alerts.action.notify')}
              </Label>
              <Label className={'flex items-center gap-1.5 text-sm'}>
                <Checkbox checked={actions.includes('restart')} onCheckedChange={() => toggleAction('restart')} />
                {t('alerts.action.restart')}
              </Label>
              <Label className={'flex items-center gap-1.5 text-sm'}>
                <Checkbox checked={actions.includes('backup')} onCheckedChange={() => toggleAction('backup')} />
                {t('alerts.action.backup')}
              </Label>
              {webhooks?.map((wh) => (
                <Label key={wh.id} className={'flex items-center gap-1.5 text-sm'}>
                  <Checkbox
                    checked={actions.includes(`webhook:${wh.id}`)}
                    onCheckedChange={() => toggleAction(`webhook:${wh.id}`)}
                  />
                  {t('alerts.action.webhook')} — {wh.name}
                </Label>
              ))}
            </div>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant={'ghost'} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name || actions.length === 0 || createAlert.isPending}
            loading={createAlert.isPending}
          >
            {t('alerts.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
