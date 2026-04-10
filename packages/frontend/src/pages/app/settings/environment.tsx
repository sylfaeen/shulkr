import { useState, useEffect, useCallback, useRef } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import * as monaco from 'monaco-editor';
import { Eye, Info, Save } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Alert, AlertDescription } from '@shulkr/frontend/features/ui/shadcn/alert';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { useToast } from '@shulkr/frontend/features/ui/toast';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { PageLoader } from '@shulkr/frontend/features/ui/page_loader';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { useThemeStore } from '@shulkr/frontend/stores/theme_store';
import { cn } from '@shulkr/frontend/lib/cn';
import {
  registerMonacoThemes,
  SHARED_COLORS_LIGHT,
  SHARED_COLORS_DARK,
  type Monaco,
  MONACO_CONTAINER_CLASS,
} from '@shulkr/frontend/lib/monaco';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import Editor from '@monaco-editor/react';

const ENV_LANGUAGE_ID = 'env';
const ENV_THEME_LIGHT = 'env-light';
const ENV_THEME_DARK = 'env-dark';

let envRegistered = false;

export function SettingsEnvironmentPage() {
  const { t } = useTranslation();

  usePageTitle('shulkr • ' + t('environment.title'));

  return (
    <PageContent>
      <div className={'space-y-4'}>
        <Alert variant={'warning'}>
          <Info className={'size-4'} />
          <AlertDescription>
            <Trans i18nKey={'environment.restartWarning'} components={{ code: <code /> }} />
          </AlertDescription>
        </Alert>
        <FeatureCard.Stack>
          <EnvironmentSection />
        </FeatureCard.Stack>
      </div>
    </PageContent>
  );
}

function EnvironmentSection() {
  const { t } = useTranslation();

  const can = useHasPermission();
  const canWrite = can('settings:environment:write');

  const isDark = useThemeStore((s) => s.isDark);
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const editorRef = useRef<monaco.editor.IStandaloneCodeEditor | null>(null);

  const { data: envData, isLoading } = useQuery({
    queryKey: ['env', 'content'],
    queryFn: async () => {
      const result = await apiClient.env.getContent();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
  });
  const initialContent = envData?.content;

  const [content, setContent] = useState<string>('');
  const [hasChanges, setHasChanges] = useState<boolean>(false);
  const [revealed, setRevealed] = useState<boolean>(false);
  const [gateOpen, setGateOpen] = useState<boolean>(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');

  useEffect(() => {
    if (initialContent !== undefined) {
      setContent(initialContent);
      setHasChanges(false);
    }
  }, [initialContent]);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        setContent(value);
        setHasChanges(value !== initialContent);
        setSaveStatus('idle');
      }
    },
    [initialContent]
  );

  const saveMutation = useMutation({
    mutationFn: async (input: { content: string }) => {
      const result = await apiClient.env.saveContent({ body: input });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['env', 'content'] }).then();
      addToast({ type: 'success', title: t('toast.envUpdated') });
      setSaveStatus('saved');
      setHasChanges(false);
      setTimeout(() => setSaveStatus('idle'), 2000);
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.envUpdateError') });
      setSaveStatus('error');
    },
  });

  const handleSave = useCallback(() => {
    if (!hasChanges) return;
    setSaveStatus('saving');
    saveMutation.mutate({ content });
  }, [hasChanges, content, saveMutation]);

  const handleCancel = useCallback(() => {
    if (initialContent !== undefined) {
      setContent(initialContent);
      setHasChanges(false);
      setSaveStatus('idle');
    }
  }, [initialContent]);

  const handleEditorMount = useCallback((editor: monaco.editor.IStandaloneCodeEditor) => {
    editorRef.current = editor;
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  useEffect(() => {
    if (editorRef.current) {
      editorRef.current.updateOptions({ readOnly: !revealed || !canWrite });
    }
  }, [revealed, can]);

  return (
    <>
      {isLoading ? (
        <PageLoader />
      ) : (
        <FeatureCard>
          <FeatureCard.Header>
            <FeatureCard.Content>
              <FeatureCard.Title>{t('environment.title')}</FeatureCard.Title>
              <FeatureCard.Description>
                <Trans i18nKey={'environment.subtitle'} components={{ code: <code /> }} />
              </FeatureCard.Description>
            </FeatureCard.Content>
          </FeatureCard.Header>
          <FeatureCard.Body>
            <FeatureCard.Row>
              <FeatureCard.Stack>
                <FeatureCard.RowLabel description={"Your application's environment variables."}>
                  Environment variables
                </FeatureCard.RowLabel>
                <div
                  className={cn(
                    'relative min-h-0 flex-1 overflow-hidden rounded-md border border-black/10 shadow-xs dark:border-white/10',
                    MONACO_CONTAINER_CLASS
                  )}
                >
                  <Editor
                    height={'400px'}
                    language={ENV_LANGUAGE_ID}
                    value={content}
                    onChange={handleEditorChange}
                    theme={isDark ? ENV_THEME_DARK : ENV_THEME_LIGHT}
                    beforeMount={registerEnvLanguageAndThemes}
                    onMount={handleEditorMount}
                    options={{
                      minimap: { enabled: false },
                      fontSize: 13,
                      lineNumbers: 'on',
                      wordWrap: 'on',
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      tabSize: 2,
                      insertSpaces: true,
                      padding: { top: 12, bottom: 12 },
                      readOnly: !revealed || !canWrite,
                      lineHeight: 20,
                      glyphMargin: false,
                      folding: false,
                      lineDecorationsWidth: 0,
                      lineNumbersMinChars: 3,
                      renderLineHighlight: 'all',
                      overviewRulerLanes: 0,
                      hideCursorInOverviewRuler: true,
                      overviewRulerBorder: false,
                      scrollbar: {
                        vertical: 'auto',
                        horizontal: 'auto',
                        verticalScrollbarSize: 14,
                        horizontalScrollbarSize: 12,
                      },
                    }}
                  />
                  {!revealed && <RevealOverlay onReveal={() => setGateOpen(true)} />}
                </div>
              </FeatureCard.Stack>
            </FeatureCard.Row>
          </FeatureCard.Body>
          {revealed && (
            <FeatureCard.Footer>
              <div className={'flex items-center justify-end gap-2'}>
                <Button onClick={handleCancel} variant={'secondary'} size={'sm'} disabled={!hasChanges}>
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleSave}
                  size={'sm'}
                  disabled={!canWrite || !hasChanges || saveStatus === 'saving'}
                >
                  <Save className={'size-4'} />
                  {t('common.save')}
                </Button>
              </div>
            </FeatureCard.Footer>
          )}
        </FeatureCard>
      )}
      <PasswordGate
        open={gateOpen}
        onOpenChange={setGateOpen}
        title={t('environment.title')}
        description={t('environment.revealDescription')}
        confirmLabel={t('environment.reveal')}
        onConfirm={() => setRevealed(true)}
        destructive
      />
    </>
  );
}

function RevealOverlay({ onReveal }: { onReveal: () => void }) {
  const { t } = useTranslation();

  return (
    <div
      className={cn(
        'absolute inset-0 z-10 flex flex-col items-center justify-center gap-4',
        'bg-white/30 backdrop-blur-md dark:bg-zinc-900/30'
      )}
    >
      <p className={'text-sm font-medium text-zinc-700 dark:text-zinc-300'}>{t('environment.revealDescription')}</p>
      <Button onClick={onReveal}>
        <Eye className={'size-4'} />
        {t('environment.reveal')}
      </Button>
    </div>
  );
}

function registerEnvLanguageAndThemes(instance: Monaco): void {
  registerMonacoThemes(instance);

  if (envRegistered) return;
  envRegistered = true;

  instance.languages.register({ id: ENV_LANGUAGE_ID });
  instance.languages.setMonarchTokensProvider(ENV_LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/#.*$/, 'comment'],
        [/^[A-Z_][A-Z0-9_]*/, 'variable'],
        [/=/, 'delimiter'],
        [/"[^"]*"/, 'string'],
        [/'[^']*'/, 'string'],
        [/https?:\/\/[^\s]+/, 'link'],
      ],
    },
  });

  instance.editor.defineTheme(ENV_THEME_LIGHT, {
    base: 'vs',
    inherit: true,
    rules: [
      { token: 'variable', foreground: '8e4ec6' },
      { token: 'comment', foreground: '80838D' },
      { token: 'string', foreground: '1a7f37' },
      { token: 'delimiter', foreground: '1e1e1e' },
      { token: 'link', foreground: '1e1e1e' },
    ],
    colors: SHARED_COLORS_LIGHT,
  });

  instance.editor.defineTheme(ENV_THEME_DARK, {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'variable', foreground: 'bf7af0' },
      { token: 'comment', foreground: '6a9955' },
      { token: 'string', foreground: 'ce9178' },
      { token: 'delimiter', foreground: 'd4d4d4' },
      { token: 'link', foreground: 'd4d4d4' },
    ],
    colors: SHARED_COLORS_DARK,
  });
}
