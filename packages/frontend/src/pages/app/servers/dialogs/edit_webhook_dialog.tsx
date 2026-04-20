import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import type { WebhookLanguage } from '@shulkr/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@shulkr/frontend/features/ui/shadcn/alert-dialog';
import { useWebhook, useWebhookTemplates } from '@shulkr/frontend/hooks/use_webhooks';
import { WebhookFormFields, resolvePreview } from '@shulkr/frontend/pages/app/servers/dialogs/create_webhook_dialog';

export type EditWebhookInput = {
  name: string;
  url: string;
  format: 'discord' | 'generic';
  language: WebhookLanguage;
  events: Array<string>;
  messageTemplates: Record<string, string> | null;
};

export function EditWebhookDialog({
  serverId,
  webhookId,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  serverId: string;
  webhookId: number;
  onOpenChange: (open: boolean) => void;
  onSubmit: (webhookId: number, values: EditWebhookInput) => Promise<void>;
  isLoading: boolean;
}) {
  const { t } = useTranslation();
  const { data: webhook, isLoading: fetching } = useWebhook(serverId, webhookId);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<'discord' | 'generic'>('discord');
  const [language, setLanguage] = useState<WebhookLanguage>('en');
  const [events, setEvents] = useState<Array<string>>([]);
  const [messageOverrides, setMessageOverrides] = useState<Record<string, string>>({});
  const [focusedEvent, setFocusedEvent] = useState<string | null>(null);
  const [initialized, setInitialized] = useState(false);
  const [pendingLanguage, setPendingLanguage] = useState<WebhookLanguage | null>(null);
  const { data: defaultTemplates } = useWebhookTemplates(language);
  useEffect(() => {
    if (webhook && !initialized) {
      setName(webhook.name);
      setUrl(webhook.url);
      setFormat(webhook.format);
      setLanguage(webhook.language);
      setEvents([...webhook.events]);
      if (webhook.messageTemplates) {
        setMessageOverrides({ ...webhook.messageTemplates });
      }
      setInitialized(true);
    }
  }, [webhook, initialized]);
  const toggleEvent = (event: string) => {
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  };
  const getMessageValue = useCallback(
    (event: string): string => {
      if (messageOverrides[event] !== undefined) return messageOverrides[event];
      return defaultTemplates?.[event as keyof typeof defaultTemplates] ?? '';
    },
    [messageOverrides, defaultTemplates]
  );
  const setMessageValue = (event: string, value: string) => {
    setMessageOverrides((prev) => ({ ...prev, [event]: value }));
  };
  const resetMessage = (event: string) => {
    setMessageOverrides((prev) => {
      const next = { ...prev };
      delete next[event];
      return next;
    });
  };
  const isMessageCustom = (event: string): boolean => {
    if (messageOverrides[event] === undefined) return false;
    const defaultValue = defaultTemplates?.[event as keyof typeof defaultTemplates] ?? '';
    return messageOverrides[event] !== defaultValue;
  };
  const hasAnyCustomMessage = Object.keys(messageOverrides).some((event) => isMessageCustom(event));
  const getResolvedLength = (event: string): number => resolvePreview(getMessageValue(event)).length;
  const hasValidationError = events.some((event) => format === 'discord' && getResolvedLength(event) > 2000);
  const handleLanguageChange = (newLang: WebhookLanguage) => {
    if (newLang === language) return;
    if (hasAnyCustomMessage) {
      setPendingLanguage(newLang);
    } else {
      setLanguage(newLang);
      setMessageOverrides({});
    }
  };
  const confirmLanguageChange = () => {
    if (pendingLanguage) {
      setLanguage(pendingLanguage);
      setMessageOverrides({});
      setPendingLanguage(null);
    }
  };
  const buildMessageTemplates = (): Record<string, string> | null => {
    const customs: Record<string, string> = {};
    let hasCustom = false;
    for (const event of events) {
      if (isMessageCustom(event)) {
        customs[event] = messageOverrides[event];
        hasCustom = true;
      }
    }
    return hasCustom ? customs : null;
  };
  const handleSubmit = async () => {
    await onSubmit(webhookId, {
      name,
      url,
      format,
      language,
      events,
      messageTemplates: format === 'discord' ? buildMessageTemplates() : null,
    });
  };
  return (
    <>
      <Dialog open onOpenChange={onOpenChange}>
        <DialogContent className={'max-w-2xl'}>
          <DialogHeader>
            <DialogTitle>{t('webhooks.editTitle')}</DialogTitle>
          </DialogHeader>
          <DialogBody className={'space-y-4'}>
            {fetching ? (
              <div className={'flex items-center justify-center py-8'}>
                <Loader2 className={'size-5 animate-spin text-zinc-400'} />
              </div>
            ) : (
              <WebhookFormFields
                onNameChange={setName}
                onUrlChange={setUrl}
                onFormatChange={setFormat}
                onLanguageChange={handleLanguageChange}
                onToggleEvent={toggleEvent}
                onMessageChange={setMessageValue}
                onResetMessage={resetMessage}
                onFocusEvent={setFocusedEvent}
                {...{
                  name,
                  url,
                  format,
                  language,
                  events,
                  defaultTemplates,
                  getMessageValue,
                  isMessageCustom,
                  getResolvedLength,
                  focusedEvent,
                }}
              />
            )}
          </DialogBody>
          <DialogFooter>
            <Button variant={'ghost'} onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={fetching || !name || !url || events.length === 0 || isLoading || hasValidationError}
              loading={isLoading}
            >
              {t('common.save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog open={pendingLanguage !== null} onOpenChange={(open) => !open && setPendingLanguage(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('webhooks.language')}</AlertDialogTitle>
            <AlertDialogDescription>{t('webhooks.resetAllMessages')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingLanguage(null)}>{t('common.cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={confirmLanguageChange}>{t('webhooks.resetAllConfirm')}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
