import { useState, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { RotateCcw, Smile } from 'lucide-react';
import Picker from '@emoji-mart/react';
import emojiData from '@emoji-mart/data';
import { cn } from '@shulkr/frontend/lib/cn';
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
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { Label } from '@shulkr/frontend/features/ui/shadcn/label';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { Textarea } from '@shulkr/frontend/features/ui/shadcn/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@shulkr/frontend/features/ui/shadcn/select';
import { Popover, PopoverContent, PopoverTrigger } from '@shulkr/frontend/features/ui/shadcn/popover';
import { useWebhookTemplates } from '@shulkr/frontend/hooks/use_webhooks';

const WEBHOOK_EVENTS = [
  { group: 'server', events: ['server:start', 'server:ready', 'server:stop', 'server:crash'] },
  { group: 'backup', events: ['backup:success', 'backup:failure'] },
  { group: 'player', events: ['player:join', 'player:leave', 'player:ban'] },
  { group: 'task', events: ['task:success', 'task:failure'] },
] as const;

const ALL_EVENTS = WEBHOOK_EVENTS.flatMap((g) => g.events);

const LANGUAGES: Array<{ code: WebhookLanguage; name: string; flagCode: string }> = [
  { code: 'en', name: 'English', flagCode: 'gb' },
  { code: 'fr', name: 'Français', flagCode: 'fr' },
  { code: 'es', name: 'Español', flagCode: 'es' },
  { code: 'de', name: 'Deutsch', flagCode: 'de' },
];

const EVENT_VARIABLES: Record<string, Array<string>> = {
  'server:start': ['server'],
  'server:ready': ['server'],
  'server:stop': ['server'],
  'server:crash': ['server', 'error'],
  'backup:success': ['server', 'filename'],
  'backup:failure': ['server', 'error'],
  'player:join': ['server', 'player'],
  'player:leave': ['server', 'player'],
  'player:ban': ['server', 'player'],
  'task:success': ['server', 'task'],
  'task:failure': ['server', 'task', 'error'],
  'alert:triggered': ['server', 'alert', 'detail'],
};

const PREVIEW_DATA: Record<string, string> = {
  server: 'SurvivalSMP',
  player: 'Steve',
  filename: 'backup-2026-04-15.tar.gz',
  task: 'Restart quotidien',
  alert: 'CPU élevé',
  detail: 'CPU > 90% pendant 5 min',
  error: 'Processus arrêté (exit code 1)',
};

export function resolvePreview(template: string): string {
  return template
    .replace(/\{\{(\w+)\}\}/g, (_match, variable: string) => PREVIEW_DATA[variable] ?? '')
    .replace(/: $/g, '.')
    .replace(/ {2,}/g, ' ')
    .trim();
}

export type CreateWebhookInput = {
  name: string;
  url: string;
  format: 'discord' | 'generic';
  language: WebhookLanguage;
  events: Array<string>;
  messageTemplates: Record<string, string> | null;
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
  const { t, i18n } = useTranslation();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [format, setFormat] = useState<'discord' | 'generic'>('discord');
  const [language, setLanguage] = useState<WebhookLanguage>((i18n.language as WebhookLanguage) || 'en');
  const [events, setEvents] = useState<Array<string>>([...ALL_EVENTS]);
  const [messageOverrides, setMessageOverrides] = useState<Record<string, string>>({});
  const [focusedEvent, setFocusedEvent] = useState<string | null>(null);
  const { data: defaultTemplates } = useWebhookTemplates(language);
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
  const getResolvedLength = (event: string): number => resolvePreview(getMessageValue(event)).length;
  const hasValidationError = events.some((event) => format === 'discord' && getResolvedLength(event) > 2000);
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
    await onSubmit({
      name,
      url,
      format,
      language,
      events,
      messageTemplates: format === 'discord' ? buildMessageTemplates() : null,
    });
    setName('');
    setUrl('');
    setFormat('discord');
    setLanguage((i18n.language as WebhookLanguage) || 'en');
    setEvents([...ALL_EVENTS]);
    setMessageOverrides({});
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={'max-w-2xl'}>
        <DialogHeader>
          <DialogTitle>{t('webhooks.createTitle')}</DialogTitle>
        </DialogHeader>
        <DialogBody className={'space-y-4'}>
          <WebhookFormFields
            onNameChange={setName}
            onUrlChange={setUrl}
            onFormatChange={setFormat}
            onLanguageChange={setLanguage}
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
        </DialogBody>
        <DialogFooter>
          <Button variant={'ghost'} onClick={() => onOpenChange(false)}>
            {t('common.cancel')}
          </Button>
          <Button
            onClick={handleSubmit}
            disabled={!name || !url || events.length === 0 || isLoading || hasValidationError}
            loading={isLoading}
          >
            {t('webhooks.create')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function WebhookFormFields({
  name,
  onNameChange,
  url,
  onUrlChange,
  format,
  onFormatChange,
  language,
  onLanguageChange,
  events,
  onToggleEvent,
  defaultTemplates,
  getMessageValue,
  onMessageChange,
  onResetMessage,
  isMessageCustom,
  getResolvedLength,
  focusedEvent,
  onFocusEvent,
}: {
  name: string;
  onNameChange: (value: string) => void;
  url: string;
  onUrlChange: (value: string) => void;
  format: 'discord' | 'generic';
  onFormatChange: (format: 'discord' | 'generic') => void;
  language: WebhookLanguage;
  onLanguageChange: (language: WebhookLanguage) => void;
  events: Array<string>;
  onToggleEvent: (event: string) => void;
  defaultTemplates: Record<string, string> | undefined;
  getMessageValue: (event: string) => string;
  onMessageChange: (event: string, value: string) => void;
  onResetMessage: (event: string) => void;
  isMessageCustom: (event: string) => boolean;
  getResolvedLength: (event: string) => number;
  focusedEvent: string | null;
  onFocusEvent: (event: string | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <>
      <div className={'space-y-2'}>
        <Label>{t('webhooks.name')}</Label>
        <Input value={name} onChange={(e) => onNameChange(e.target.value)} placeholder={t('webhooks.namePlaceholder')} />
      </div>
      <div className={'space-y-2'}>
        <Label>{t('webhooks.url')}</Label>
        <Input value={url} onChange={(e) => onUrlChange(e.target.value)} placeholder={'https://discord.com/api/webhooks/...'} />
      </div>
      <div className={'flex items-end gap-4'}>
        <div className={'space-y-2'}>
          <Label>{t('webhooks.format')}</Label>
          <div className={'flex gap-2'}>
            <Button size={'sm'} variant={format === 'discord' ? 'default' : 'outline'} onClick={() => onFormatChange('discord')}>
              Discord
            </Button>
            <Button size={'sm'} variant={format === 'generic' ? 'default' : 'outline'} onClick={() => onFormatChange('generic')}>
              {t('webhooks.generic')}
            </Button>
          </div>
        </div>
        {format === 'discord' && (
          <div className={'space-y-2'}>
            <Label>{t('webhooks.language')}</Label>
            <Select value={language} onValueChange={(v) => onLanguageChange(v as WebhookLanguage)}>
              <SelectTrigger className={'w-40'}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {LANGUAGES.map((lang) => (
                  <SelectItem key={lang.code} value={lang.code}>
                    <span className={cn(`fi fi-${lang.flagCode}`, 'size-4! rounded-sm')} />
                    {lang.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>
      <div className={'space-y-2'}>
        <Label>{t('webhooks.eventsLabel')}</Label>
        {WEBHOOK_EVENTS.map((group) => (
          <div key={group.group} className={'space-y-1'}>
            <p className={'text-xs font-medium text-zinc-500 uppercase'}>{t(`webhooks.group.${group.group}`)}</p>
            <div className={'flex flex-wrap gap-2'}>
              {group.events.map((event) => (
                <Label key={event} className={'flex items-center gap-1.5 text-sm'}>
                  <Checkbox checked={events.includes(event)} onCheckedChange={() => onToggleEvent(event)} />
                  {t(`webhooks.event.${event}`)}
                </Label>
              ))}
            </div>
          </div>
        ))}
      </div>
      {format === 'discord' && defaultTemplates && (
        <MessageEditor
          onMessageChange={onMessageChange}
          onResetMessage={onResetMessage}
          onFocusEvent={onFocusEvent}
          {...{ events, getMessageValue, isMessageCustom, getResolvedLength, focusedEvent }}
        />
      )}
      {format === 'generic' && events.length > 0 && <GenericPreview event={events[0]} />}
    </>
  );
}

function MessageEditor({
  events,
  getMessageValue,
  onMessageChange,
  onResetMessage,
  isMessageCustom,
  getResolvedLength,
  focusedEvent,
  onFocusEvent,
}: {
  events: Array<string>;
  getMessageValue: (event: string) => string;
  onMessageChange: (event: string, value: string) => void;
  onResetMessage: (event: string) => void;
  isMessageCustom: (event: string) => boolean;
  getResolvedLength: (event: string) => number;
  focusedEvent: string | null;
  onFocusEvent: (event: string | null) => void;
}) {
  const { t } = useTranslation();
  const selectedEvents = WEBHOOK_EVENTS.flatMap((g) => g.events).filter((e) => events.includes(e));
  const activeEvent = focusedEvent && events.includes(focusedEvent) ? focusedEvent : (selectedEvents[0] ?? null);
  if (selectedEvents.length === 0) return null;
  return (
    <div className={'space-y-2'}>
      <div>
        <Label>{t('webhooks.messages')}</Label>
        <p className={'text-xs text-zinc-500'}>{t('webhooks.messagesDescription')}</p>
      </div>
      <div className={'flex overflow-hidden rounded-lg border border-black/6 dark:border-white/6'}>
        <div className={'w-44 shrink-0 border-r border-black/6 bg-zinc-50/50 py-1 dark:border-white/6 dark:bg-zinc-900/30'}>
          {WEBHOOK_EVENTS.map((group) => {
            const groupEvents = group.events.filter((e) => events.includes(e));
            if (groupEvents.length === 0) return null;
            return (
              <div key={group.group} className={'py-0.5'}>
                <p className={'px-3 py-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500'}>
                  {t(`webhooks.group.${group.group}`)}
                </p>
                {groupEvents.map((event) => (
                  <button
                    key={event}
                    type={'button'}
                    onClick={() => onFocusEvent(event)}
                    className={cn(
                      'flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm transition-colors',
                      activeEvent === event
                        ? 'bg-zinc-200/70 font-medium text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100'
                        : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:bg-zinc-800/50'
                    )}
                  >
                    <span className={'flex-1 truncate'}>{t(`webhooks.eventLabel.${event}`)}</span>
                    {isMessageCustom(event) && <span className={'size-1.5 shrink-0 rounded-full bg-blue-500'} />}
                  </button>
                ))}
              </div>
            );
          })}
        </div>
        {activeEvent && (
          <EventEditor
            key={activeEvent}
            event={activeEvent}
            value={getMessageValue(activeEvent)}
            onChange={(v) => onMessageChange(activeEvent, v)}
            onReset={() => onResetMessage(activeEvent)}
            isCustom={isMessageCustom(activeEvent)}
            resolvedLength={getResolvedLength(activeEvent)}
          />
        )}
      </div>
    </div>
  );
}

function EventEditor({
  event,
  value,
  onChange,
  onReset,
  isCustom,
  resolvedLength,
}: {
  event: string;
  value: string;
  onChange: (value: string) => void;
  onReset: () => void;
  isCustom: boolean;
  resolvedLength: number;
}) {
  const { t } = useTranslation();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const variables = EVENT_VARIABLES[event] ?? [];
  const tooLong = resolvedLength > 2000;
  const insertAtCursor = useCallback(
    (text: string) => {
      const textarea = textareaRef.current;
      if (!textarea) {
        onChange(value + text);
        return;
      }
      const start = textarea.selectionStart ?? value.length;
      const end = textarea.selectionEnd ?? value.length;
      const newValue = value.slice(0, start) + text + value.slice(end);
      onChange(newValue);
      requestAnimationFrame(() => {
        const pos = start + text.length;
        textarea.setSelectionRange(pos, pos);
        textarea.focus();
      });
    },
    [value, onChange]
  );
  return (
    <div className={'flex flex-1 flex-col gap-2.5 p-3'}>
      <div className={'flex items-center justify-between'}>
        <span className={'text-sm font-medium'}>{t(`webhooks.eventLabel.${event}`)}</span>
        <div className={'flex items-center gap-0.5'}>
          {isCustom && (
            <button
              type={'button'}
              onClick={onReset}
              className={
                'rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'
              }
              title={t('webhooks.resetMessage')}
            >
              <RotateCcw className={'size-3.5'} />
            </button>
          )}
          <EmojiPickerButton onSelect={(emoji) => insertAtCursor(emoji.native)} />
        </div>
      </div>
      <Textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cn(tooLong && 'border-red-500')}
      />
      {variables.length > 0 && (
        <div className={'flex flex-wrap items-center gap-1.5'}>
          {variables.map((v) => (
            <button
              key={v}
              type={'button'}
              onClick={() => insertAtCursor(`{{${v}}}`)}
              className={
                'font-jetbrains rounded bg-zinc-100 px-1.5 py-0.5 text-xs transition-colors hover:bg-zinc-200 dark:bg-zinc-800 dark:hover:bg-zinc-700'
              }
            >
              {`{{${v}}}`}
            </button>
          ))}
        </div>
      )}
      <div className={'rounded-md border border-black/6 bg-zinc-50/50 p-2.5 dark:border-white/6 dark:bg-zinc-900/50'}>
        <p className={'mb-1 text-[10px] font-semibold tracking-wider text-zinc-400 uppercase dark:text-zinc-500'}>
          {t('webhooks.preview')}
        </p>
        <p className={'text-sm break-all'}>{resolvePreview(value) || '\u00A0'}</p>
      </div>
      <div className={'flex items-center justify-end gap-2'}>
        {tooLong && <p className={'flex-1 text-xs text-red-500'}>{t('webhooks.messageTooLong')}</p>}
        <span className={cn('font-jetbrains text-xs tabular-nums', tooLong ? 'text-red-500' : 'text-zinc-400')}>
          {resolvedLength} / 2,000
        </span>
      </div>
    </div>
  );
}

function EmojiPickerButton({ onSelect }: { onSelect: (emoji: { native: string }) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type={'button'}
          className={
            'rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-300'
          }
          title={t('webhooks.emoji')}
        >
          <Smile className={'size-3.5'} />
        </button>
      </PopoverTrigger>
      <PopoverContent className={'w-auto border-0 p-0'} side={'top'} align={'end'}>
        <Picker
          data={emojiData}
          onEmojiSelect={(emoji: { native: string }) => {
            onSelect(emoji);
            setOpen(false);
          }}
          theme={'auto'}
          previewPosition={'none'}
          skinTonePosition={'none'}
        />
      </PopoverContent>
    </Popover>
  );
}

function GenericPreview({ event }: { event: string }) {
  const { t } = useTranslation();
  const sample = {
    event,
    serverId: 'clx9f2k...',
    serverName: PREVIEW_DATA.server,
    timestamp: new Date().toISOString(),
    data: Object.fromEntries(
      (EVENT_VARIABLES[event] ?? [])
        .filter((v) => v !== 'server')
        .map((v) => {
          const keyMap: Record<string, string> = {
            player: 'playerName',
            filename: 'backupFilename',
            task: 'taskName',
            alert: 'alertName',
            detail: 'alertDetail',
            error: 'error',
          };
          return [keyMap[v] ?? v, PREVIEW_DATA[v] ?? ''];
        })
    ),
  };
  return (
    <div className={'rounded-md border border-zinc-200 bg-zinc-50 p-3 dark:border-zinc-700 dark:bg-zinc-900'}>
      <p className={'mb-1 text-xs font-medium text-zinc-500'}>{t('webhooks.genericPreview')}</p>
      <pre className={'overflow-x-auto text-xs leading-relaxed'}>{JSON.stringify(sample, null, 2)}</pre>
    </div>
  );
}
