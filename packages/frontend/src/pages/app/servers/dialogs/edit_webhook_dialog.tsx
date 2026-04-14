import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2 } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@shulkr/frontend/features/ui/shadcn/dialog';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { useWebhook } from '@shulkr/frontend/hooks/use_webhooks';

const WEBHOOK_EVENTS = [
  { group: 'server', events: ['server:start', 'server:stop', 'server:crash'] },
  { group: 'backup', events: ['backup:success', 'backup:failure'] },
  { group: 'player', events: ['player:join', 'player:leave', 'player:ban'] },
  { group: 'task', events: ['task:success', 'task:failure'] },
] as const;

export type EditWebhookInput = {
  name: string;
  url: string;
  format: 'discord' | 'generic';
  events: Array<string>;
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
  const [events, setEvents] = useState<Array<string>>([]);
  const [initialized, setInitialized] = useState(false);

  useEffect(() => {
    if (webhook && !initialized) {
      setName(webhook.name);
      setUrl(webhook.url);
      setFormat(webhook.format);
      setEvents([...webhook.events]);
      setInitialized(true);
    }
  }, [webhook, initialized]);

  const toggleEvent = (event: string) => {
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  };

  const handleSubmit = async () => {
    await onSubmit(webhookId, { name, url, format, events });
  };

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('webhooks.editTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody className={'space-y-4'}>
          {fetching ? (
            <div className={'flex items-center justify-center py-8'}>
              <Loader2 className={'size-5 animate-spin text-zinc-400'} />
            </div>
          ) : (
            <>
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
            </>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant={'ghost'} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={fetching || !name || !url || events.length === 0 || isLoading}
            loading={isLoading}
          >
            {t('common.save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
