import { useState } from 'react';
import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, Pencil, Plus, ShieldAlert, Trash2, XCircle } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { SkeletonList } from '@shulkr/frontend/features/ui/skeleton_presets';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { useAlertRules, useCreateAlert, useUpdateAlert, useDeleteAlert, useAlertEvents } from '@shulkr/frontend/hooks/use_alerts';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { Switch } from '@shulkr/frontend/features/ui/shadcn/switch';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { CreateAlertDialog } from '@shulkr/frontend/pages/app/servers/dialogs/create_alert_dialog';
import { EditAlertDialog } from '@shulkr/frontend/pages/app/servers/dialogs/edit_alert_dialog';
import type { AlertFormValues, AlertMetric, AlertOperator } from '@shulkr/frontend/pages/app/servers/features/alert_form';

export function ServerAlertsPage() {
  const { id } = useParams({ strict: false });
  const { t } = useTranslation();
  const { data: server, isLoading: serverLoading, error: serverError } = useServer(id ?? '');
  usePageTitle(server?.name ? `${server.name} — ${t('alerts.title')}` : t('alerts.title'));
  if (serverLoading) return <ServerPageSkeleton />;
  if (serverError || !server) return <PageError />;
  return (
    <>
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
      <PageContent>
        <AlertsContent serverId={server.id} />
      </PageContent>
    </>
  );
}

type AlertRuleProps = {
  id: number;
  name: string;
  metric: AlertMetric;
  operator: AlertOperator;
  threshold: number;
  enabled: boolean;
  actions: Array<string>;
};

function AlertsContent({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { data: rules, isLoading } = useAlertRules(serverId);
  const { data: events } = useAlertEvents(serverId);
  const createAlert = useCreateAlert(serverId);
  const updateAlert = useUpdateAlert(serverId);
  const deleteAlert = useDeleteAlert(serverId);
  const can = useHasPermission();
  const canCreate = can('server:alerts:create');
  const canUpdate = can('server:alerts:update');
  const canDelete = can('server:alerts:delete');
  const [createOpen, setCreateOpen] = useState(false);
  const [editRule, setEditRule] = useState<AlertRuleProps | null>(null);
  const [gateAlertId, setGateAlertId] = useState<number | null>(null);
  const handleCreate = async (values: AlertFormValues) => {
    await createAlert.mutateAsync(values);
    setCreateOpen(false);
  };
  const handleEdit = async (alertId: number, values: AlertFormValues) => {
    await updateAlert.mutateAsync({ alertId, body: values });
    setEditRule(null);
  };
  return (
    <>
      <FeatureCard.Stack>
        <FeatureCard>
          <FeatureCard.Header>
            <FeatureCard.Content>
              <FeatureCard.Title count={rules?.length}>{t('alerts.rulesTitle')}</FeatureCard.Title>
              <FeatureCard.Description>{t('alerts.rulesDescription')}</FeatureCard.Description>
            </FeatureCard.Content>
            {canCreate && (
              <Button onClick={() => setCreateOpen(true)} icon={Plus}>
                {t('alerts.add')}
              </Button>
            )}
          </FeatureCard.Header>
          <FeatureCard.Body>
            {isLoading ? (
              <FeatureCard.Row className={'py-2'}>
                <SkeletonList rows={5} className={'w-full'} />
              </FeatureCard.Row>
            ) : !rules?.length ? (
              <FeatureCard.Empty icon={ShieldAlert} title={t('alerts.empty')} description={t('alerts.emptyDescription')} />
            ) : (
              rules.map((rule) => (
                <FeatureCard.Row key={rule.id} interactive onClick={() => canUpdate && setEditRule(rule as AlertRuleProps)}>
                  <div className={'flex min-w-0 flex-1 items-center gap-3'}>
                    <AlertTriangle className={'size-4 shrink-0 text-zinc-400'} />
                    <div className={'min-w-0'}>
                      <p className={'truncate text-sm font-medium'}>{rule.name}</p>
                      <p className={'text-xs text-zinc-500'}>
                        {t(`alerts.metric.${rule.metric}`)} {rule.operator} {rule.threshold}%
                      </p>
                    </div>
                  </div>
                  <div className={'flex shrink-0 items-center gap-2'} onClick={(e) => e.stopPropagation()}>
                    <Badge variant={'secondary'}>
                      {rule.actions.length} {t('alerts.actions')}
                    </Badge>
                    {canUpdate && (
                      <Switch
                        checked={rule.enabled}
                        onCheckedChange={(enabled) => updateAlert.mutate({ alertId: rule.id, body: { enabled } })}
                      />
                    )}
                    {canUpdate && (
                      <Button
                        size={'icon-sm'}
                        variant={'ghost'}
                        onClick={() => setEditRule(rule as AlertRuleProps)}
                        icon={Pencil}
                        iconClass={'size-3.5'}
                      />
                    )}
                    {canDelete && (
                      <Button
                        variant={'ghost-destructive'}
                        size={'icon-sm'}
                        onClick={() => setGateAlertId(rule.id)}
                        icon={Trash2}
                      />
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
      <PasswordGate
        open={gateAlertId !== null}
        onOpenChange={(open) => !open && setGateAlertId(null)}
        title={t('alerts.deleteTitle')}
        description={t('alerts.deleteDescription')}
        confirmLabel={t('common.delete')}
        destructive
        onConfirm={async () => {
          if (gateAlertId !== null) {
            await deleteAlert.mutateAsync(gateAlertId);
            setGateAlertId(null);
          }
        }}
      />
      <CreateAlertDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onSubmit={handleCreate}
        isLoading={createAlert.isPending}
        {...{ serverId }}
      />
      {editRule && (
        <EditAlertDialog
          rule={editRule}
          onOpenChange={(open) => {
            if (!open) setEditRule(null);
          }}
          onSubmit={handleEdit}
          isLoading={updateAlert.isPending}
          {...{ serverId }}
        />
      )}
    </>
  );
}
