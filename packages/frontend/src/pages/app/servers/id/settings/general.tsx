import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Settings, RotateCcw, Trash2 } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer, useUpdateServer, useDeleteServer } from '@shulkr/frontend/hooks/use_servers';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { DeleteServerDialog } from '@shulkr/frontend/pages/app/servers/dialogs/delete_server_dialog';
import { Form, FormField, FormItem, FormControl, FormMessage } from '@shulkr/frontend/features/ui/shadcn/form';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { AgentSection } from '@shulkr/frontend/pages/app/servers/features/agent_section';

export function ServerSettingsGeneralPage() {
  const { t } = useTranslation();
  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');
  const can = useHasPermission();
  const canDelete = can('server:general:delete');
  usePageTitle(server?.name ? `${server.name} • ${t('nav.settingsGeneral')}` : t('nav.settingsGeneral'));
  if (serverLoading) return <ServerPageSkeleton />;
  if (!server) return <PageError message={t('errors.generic')} />;
  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={Settings} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('nav.settingsGeneral')}</ServerPageHeader.PageName>
            </ServerPageHeader.Heading>
            <ServerPageHeader.Description>{t('settings.generalSubtitle')}</ServerPageHeader.Description>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent>
        <FeatureCard.Stack>
          <GeneralConfigSection serverId={server.id} />
          <AgentSection serverId={server.id} />
          {canDelete && <DangerZoneSection serverId={server.id} />}
        </FeatureCard.Stack>
      </PageContent>
    </>
  );
}

function GeneralConfigSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const { data: server } = useServer(serverId);
  const updateServer = useUpdateServer();
  const can = useHasPermission();
  const canUpdate = can('server:general:update');
  const generalConfigSchema = z.object({
    name: z.string().min(1).max(64),
  });
  type GeneralConfigFormValues = z.infer<typeof generalConfigSchema>;
  const form = useForm<GeneralConfigFormValues>({
    resolver: zodResolver(generalConfigSchema),
    defaultValues: { name: '' },
  });
  const defaultNameRef = useRef('');
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!server || initializedRef.current) return;
    initializedRef.current = true;
    defaultNameRef.current = server.name;
    form.reset({ name: server.name });
  }, [server, form]);
  const handleDiscard = useCallback(() => {
    form.reset({ name: defaultNameRef.current });
  }, [form]);
  const handleSave = useCallback(
    async (data: GeneralConfigFormValues) => {
      const trimmed = data.name.trim();
      if (!trimmed) return;
      await updateServer.mutateAsync({ id: serverId, name: trimmed });
      defaultNameRef.current = trimmed;
      form.reset({ name: trimmed });
    },
    [serverId, updateServer, form]
  );
  return (
    <FeatureCard>
      <FeatureCard.Header>
        <FeatureCard.Content>
          <FeatureCard.Title>{t('settings.generalConfig')}</FeatureCard.Title>
          <FeatureCard.Description>{t('settings.generalConfigDescription')}</FeatureCard.Description>
        </FeatureCard.Content>
      </FeatureCard.Header>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSave)}>
          <FeatureCard.Body className={'space-y-6'}>
            <FeatureCard.Row>
              <FeatureCard.Stack>
                <FeatureCard.RowLabel description={t('settings.serverNameHint')}>{t('servers.serverName')}</FeatureCard.RowLabel>
                <FormField
                  control={form.control}
                  name={'name'}
                  render={({ field }) => (
                    <FormItem className={'w-full sm:w-96'}>
                      <FormControl>
                        <Input type={'text'} placeholder={t('servers.serverNamePlaceholder')} readOnly={!canUpdate} {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </FeatureCard.Stack>
            </FeatureCard.Row>
          </FeatureCard.Body>
          {canUpdate && (
            <FeatureCard.Footer>
              <div className={'flex items-center justify-end gap-2'}>
                <Button
                  onClick={handleDiscard}
                  variant={'ghost'}
                  size={'sm'}
                  disabled={updateServer.isPending || !form.formState.isDirty}
                  icon={RotateCcw}
                >
                  {t('settings.cancel')}
                </Button>
                <Button
                  type={'submit'}
                  size={'sm'}
                  disabled={!canUpdate || updateServer.isPending || !form.formState.isDirty}
                  loading={updateServer.isPending}
                >
                  {updateServer.isPending ? t('files.saving') : t('settings.saveConfig')}
                </Button>
              </div>
            </FeatureCard.Footer>
          )}
        </form>
      </Form>
    </FeatureCard>
  );
}

function DangerZoneSection({ serverId }: { serverId: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: server } = useServer(serverId);
  const deleteServer = useDeleteServer();
  const [gateOpen, setGateOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const handleDeleteConfirm = useCallback(
    async (createBackup: boolean) => {
      await navigate({ to: '/app/servers' });
      deleteServer.mutateAsync(serverId, createBackup);
    },
    [serverId, deleteServer, navigate]
  );
  return (
    <>
      <FeatureCard>
        <FeatureCard.Header>
          <FeatureCard.Content>
            <FeatureCard.Title>{t('settings.dangerZone')}</FeatureCard.Title>
            <FeatureCard.Description>{t('settings.dangerZoneDescription')}</FeatureCard.Description>
          </FeatureCard.Content>
        </FeatureCard.Header>
        <FeatureCard.Body>
          <FeatureCard.Row>
            <FeatureCard.RowLabel description={t('settings.deleteServerDescription')}>
              {t('settings.deleteServerTitle')}
            </FeatureCard.RowLabel>
            <FeatureCard.RowControl>
              <Button onClick={() => setGateOpen(true)} variant={'destructive'} size={'sm'} icon={Trash2}>
                {t('servers.deleteServer')}
              </Button>
            </FeatureCard.RowControl>
          </FeatureCard.Row>
        </FeatureCard.Body>
      </FeatureCard>
      <PasswordGate
        open={gateOpen}
        onOpenChange={setGateOpen}
        title={t('settings.deleteServerTitle')}
        description={t('settings.deleteServerDescription')}
        confirmLabel={t('servers.deleteServer')}
        onConfirm={() => setDeleteDialogOpen(true)}
        destructive
      />
      {deleteDialogOpen && server && (
        <DeleteServerDialog
          isDeleting={deleteServer.isPending}
          onConfirm={handleDeleteConfirm}
          onCancel={() => setDeleteDialogOpen(false)}
          {...{ server }}
        />
      )}
    </>
  );
}
