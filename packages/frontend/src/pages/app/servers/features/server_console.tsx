import { useState, useRef, useEffect, type SubmitEvent, type KeyboardEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Terminal, Send, ArrowDown, Info, Loader2 } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import type { ConsoleMessage } from '@shulkr/frontend/hooks/use_console';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';
import { LogLine } from '@shulkr/frontend/features/ui/log_line';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';

export function ServerConsole({
  messages,
  isConnected,
  isConnecting,
  error,
  sendCommand,
  hasMore,
  isLoadingMore,
  loadMore,
  className,
}: {
  messages: Array<ConsoleMessage>;
  isConnected: boolean;
  isConnecting: boolean;
  error: string | null;
  sendCommand: (command: string) => boolean;
  hasMore?: boolean;
  isLoadingMore?: boolean;
  loadMore?: () => void;
  className?: string;
}) {
  const { t } = useTranslation();

  const can = useHasPermission();
  const canRead = can('server:console:read');
  const canSendCommand = can('server:console:input');

  const [inputValue, setInputValue] = useState('');
  const [commandHistory, setCommandHistory] = useState<Array<string>>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [autoScroll, setAutoScroll] = useState(true);

  const inputRef = useRef<HTMLInputElement>(null);
  const messagesContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (autoScroll && messagesContainerRef.current) {
      messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
    }
  }, [messages, autoScroll]);

  if (!canRead) return null;

  // Detect manual scroll to disable auto-scroll + load more on scroll up
  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = messagesContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
    setAutoScroll(isAtBottom);

    if (scrollTop < 50 && hasMore && !isLoadingMore && loadMore) {
      const prevScrollHeight = scrollHeight;
      loadMore();
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) {
          messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight - prevScrollHeight;
        }
      });
    }
  };

  const handleSubmit = (e: SubmitEvent<HTMLFormElement>) => {
    e.preventDefault();
    const command = inputValue.trim();
    if (!command) return;

    if (sendCommand(command)) {
      setCommandHistory((prev) => [...prev.slice(-99), command]);
      setHistoryIndex(-1);
      setInputValue('');
    }
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (commandHistory.length > 0) {
        const newIndex = historyIndex < commandHistory.length - 1 ? historyIndex + 1 : historyIndex;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[commandHistory.length - 1 - newIndex] || '');
      }
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (historyIndex > 0) {
        const newIndex = historyIndex - 1;
        setHistoryIndex(newIndex);
        setInputValue(commandHistory[commandHistory.length - 1 - newIndex] || '');
      } else if (historyIndex === 0) {
        setHistoryIndex(-1);
        setInputValue('');
      }
    }
  };

  return (
    <div className={cn('relative flex flex-col', className)}>
      {error && (
        <Alert variant={'destructive'} className={'mb-4'}>
          <Info className={'size-4'} />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <div className={'flex max-w-full flex-1 flex-col overflow-hidden rounded-xl border border-black/10 bg-zinc-950'}>
        <div className={'flex shrink-0 items-center justify-between border-b border-zinc-800 bg-zinc-900 px-4 py-2'}>
          <div className={'flex items-center gap-2'}>
            <Terminal className={'size-4 text-zinc-500 dark:text-zinc-300'} />
            <span className={'text-sm font-medium tracking-wider text-zinc-500 uppercase dark:text-zinc-300'}>
              {t('nav.console')}
            </span>
          </div>
          <div className={'flex items-center gap-2'}>
            <div
              className={cn(
                'size-2 rounded-full',
                isConnected ? 'bg-green-600' : isConnecting ? 'animate-pulse bg-amber-500' : 'bg-red-600'
              )}
            />
            <span className={'text-[10px] font-medium text-zinc-400 uppercase'}>
              {isConnected ? t('console.connected') : isConnecting ? t('console.connecting') : t('console.disconnected')}
            </span>
          </div>
        </div>
        <div
          ref={messagesContainerRef}
          onScroll={handleScroll}
          role={'log'}
          aria-label={'Server console output'}
          aria-live={'polite'}
          className={'custom-scrollbar min-h-0 flex-1 overflow-y-auto p-4'}
        >
          {isLoadingMore && (
            <div className={'flex items-center justify-center py-2'}>
              <Loader2 className={'size-4 animate-spin text-zinc-500'} />
            </div>
          )}
          {messages.length === 0 ? (
            <div className={'font-jetbrains py-8 text-center text-sm text-zinc-500 dark:text-zinc-300'}>
              {isConnected ? t('console.serverNotRunning') : t('console.startToViewLogs')}
            </div>
          ) : (
            messages.map((message) => {
              const typeStyles: Record<string, string> = {
                stderr: 'text-red-400',
                input: 'text-cyan-400',
                system: 'text-amber-400 italic',
              };

              const appTime = new Date(message.timestamp).toLocaleTimeString('en-US', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
                hour12: false,
              });

              return (
                <LogLine
                  key={message.id}
                  time={message.logTime || appTime}
                  level={message.level}
                  message={message.data}
                  className={typeStyles[message.type]}
                />
              );
            })
          )}
        </div>
        {canSendCommand && (
          <form
            onSubmit={handleSubmit}
            className={'flex gap-2 border-t border-zinc-800 bg-zinc-900 p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] sm:p-3'}
          >
            <div className={'relative flex-1'}>
              <span className={'font-jetbrains absolute top-1/2 left-3 -translate-y-1/2 font-bold text-green-600'}>&gt;</span>
              <input
                ref={inputRef}
                type={'text'}
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isConnected ? t('console.placeholder') : t('console.connecting')}
                disabled={!isConnected}
                className={
                  'font-jetbrains h-11 w-full rounded-lg border border-zinc-700 bg-zinc-950 py-2 pr-4 pl-8 text-sm text-zinc-100 placeholder-zinc-500 focus:border-zinc-400 focus:ring-2 focus:ring-zinc-400/50 focus:outline-none disabled:cursor-not-allowed disabled:opacity-50'
                }
                autoComplete={'off'}
                spellCheck={false}
              />
            </div>
            <Button type={'submit'} size={'sm'} disabled={!isConnected || !inputValue.trim()} className={'h-11 min-w-11'}>
              <Send className={'size-4'} />
            </Button>
          </form>
        )}
      </div>
      {!autoScroll && messages.length > 0 && (
        <Button
          size={'sm'}
          onClick={() => {
            setAutoScroll(true);
            if (messagesContainerRef.current) {
              messagesContainerRef.current.scrollTop = messagesContainerRef.current.scrollHeight;
            }
          }}
          className={
            'absolute bottom-16 left-1/2 h-10 -translate-x-1/2 rounded-full bg-green-600/90 px-4 shadow-lg backdrop-blur-sm hover:bg-green-600 sm:bottom-20'
          }
        >
          <ArrowDown className={'size-3'} />
          Auto-scroll
        </Button>
      )}
    </div>
  );
}
