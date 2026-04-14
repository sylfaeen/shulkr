import { useState } from 'react';
import { useTranslation } from 'react-i18next';
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

const WEBHOOK_EVENTS = [
  { group: 'server', events: ['server:start', 'server:stop', 'server:crash'] },
  { group: 'backup', events: ['backup:success', 'backup:failure'] },
  { group: 'player', events: ['player:join', 'player:leave', 'player:ban'] },
  { group: 'task', events: ['task:success', 'task:failure'] },
] as const;

const ALL_EVENTS = WEBHOOK_EVENTS.flatMap((g) => g.events);

export type CreateWebhookInput = {
  name: string;
  url: string;
  format: 'discord' | 'generic';
  events: Array<string>;
};

export function CreateWebhookDialog({
  open,
  onOpenChange,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateWebhookInput) => Promise<void>;
  isLoading: boolean;
}) {
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<'discord' | 'generic'>('discord');
  const [events, setEvents] = useState<Array<string>>([...ALL_EVENTS]);

  const toggleEvent = (event: string) => {
    setEvents((prev) => (prev.includes(event) ? prev.filter((e) => e !== event) : [...prev, event]));
  };

  const handleSubmit = async () => {
    await onSubmit({ name, url, format, events });
    setName('');
    setUrl('');
    setFormat('discord');
    setEvents([...ALL_EVENTS]);
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
          <Button onClick={handleSubmit} disabled={!name || !url || events.length === 0 || isLoading} loading={isLoading}>
            {t('webhooks.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
