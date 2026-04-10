import { useState, useEffect, useCallback } from 'react';
import { Link, useParams, useSearch } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import Editor from '@monaco-editor/react';
import { FileCode, Save, AlertCircle, ArrowLeft } from 'lucide-react';
import { registerMonacoThemes, MONACO_THEME_LIGHT, MONACO_THEME_DARK, MONACO_CONTAINER_CLASS } from '@shulkr/frontend/lib/monaco';
import { cn } from '@shulkr/frontend/lib/cn';
import { PageLoader } from '@shulkr/frontend/features/ui/page_loader';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { useFileContent, useWriteFile, getFileExtension } from '@shulkr/frontend/hooks/use_files';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { ApiError } from '@shulkr/frontend/lib/api';
import { useThemeStore } from '@shulkr/frontend/stores/theme_store';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';

export function ServerFileEditorPage() {
  const { t } = useTranslation();

  const search: { path?: string } = useSearch({ strict: false });
  const filePath = search.path ?? null;

  const { id } = useParams({ strict: false });
  const { data: server, isLoading: serverLoading } = useServer(id || '');
  const { data: fileData, isLoading: fileLoading, error: fileError } = useFileContent(server?.id || null, filePath);

  const isDark = useThemeStore((s) => s.isDark);
  const writeFile = useWriteFile(server?.id || '');

  usePageTitle(server?.name ? `${server.name} • ${t('files.edit')}` : t('files.edit'));

  const [content, setContent] = useState<string>('');
  const [hasChanges, setHasChanges] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [_errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (fileData?.content !== undefined) {
      setContent(fileData.content);
      setHasChanges(false);
    }
  }, [fileData?.content]);

  const handleEditorChange = useCallback(
    (value: string | undefined) => {
      if (value !== undefined) {
        setContent(value);
        setHasChanges(value !== fileData?.content);
        setSaveStatus('idle');
      }
    },
    [fileData?.content]
  );

  const handleSave = useCallback(async () => {
    if (!filePath || !hasChanges) return;

    setSaveStatus('saving');
    setErrorMessage(null);

    try {
      await writeFile.mutateAsync({ path: filePath, content });
      setSaveStatus('saved');
      setHasChanges(false);
      setTimeout(() => setSaveStatus('idle'), 2000);
    } catch (err) {
      setSaveStatus('error');
      if (err instanceof ApiError) {
        setErrorMessage(err.message);
      } else {
        setErrorMessage(t('files.saveError'));
      }
    }
  }, [filePath, content, hasChanges, writeFile, t]);

  // Handle Ctrl+S keyboard shortcut
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave().then();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleSave]);

  const filename = filePath ? filePath.split('/').pop() || '' : '';
  const parentDir = filePath ? filePath.substring(0, filePath.lastIndexOf('/')) || '/' : '/';
  const language = getLanguageFromExtension(filename);

  if (!server) return <PageError message={t('files.invalidServerId')} />;
  if (!filePath) return <PageError message={t('files.missingFilePath')} />;
  if (serverLoading || fileLoading) return <PageLoader />;

  if (fileError) {
    return (
      <div className={'flex items-center justify-center py-20'}>
        <div className={'text-center'}>
          <AlertCircle className={'mx-auto mb-4 size-12 text-red-600'} strokeWidth={1.5} />
          <div className={'mb-4 text-red-600'}>{t('files.fileLoadError')}</div>
          <Link to={'/app/servers/$id/files'} params={{ id: String(server.id) }} search={{ path: parentDir }}>
            <Button variant={'secondary'}>
              <ArrowLeft className={'size-4'} />
              {t('files.backToFiles')}
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          <ServerPageHeader.Icon icon={FileCode} />
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{t('nav.files')}</ServerPageHeader.PageName>
            </ServerPageHeader.Heading>
            <div className={'font-jetbrains mt-0.5 flex items-center gap-1.5 text-sm text-zinc-600 dark:text-zinc-400'}>
              <span className={'truncate'}>{filePath}</span>
              {hasChanges && <span className={'text-amber-500'}>*</span>}
            </div>
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
        <ServerPageHeader.Actions>
          <Link to={'/app/servers/$id/files'} params={{ id: String(server.id) }} search={{ path: parentDir }}>
            <Button variant={'secondary'} size={'sm'}>
              <ArrowLeft className={'size-4'} />
              {t('files.backToFiles')}
            </Button>
          </Link>
          <Button
            size={'sm'}
            onClick={handleSave}
            disabled={!hasChanges || saveStatus === 'saving'}
            loading={saveStatus === 'saving'}
          >
            <Save className={'size-4'} />
            {t('common.save')}
          </Button>
        </ServerPageHeader.Actions>
      </ServerPageHeader>
      <PageContent>
        <div
          className={cn(
            'min-h-0 flex-1 overflow-hidden rounded-md border border-black/10 shadow-xs dark:border-white/10',
            MONACO_CONTAINER_CLASS
          )}
        >
          <Editor
            height={'100%'}
            language={language}
            value={content}
            onChange={handleEditorChange}
            theme={isDark ? MONACO_THEME_DARK : MONACO_THEME_LIGHT}
            beforeMount={registerMonacoThemes}
            options={{
              minimap: { enabled: true },
              fontSize: 14,
              lineNumbers: 'on',
              wordWrap: 'on',
              scrollBeyondLastLine: false,
              automaticLayout: true,
              tabSize: 2,
              insertSpaces: true,
              padding: { top: 12, bottom: 12 },
            }}
          />
        </div>
      </PageContent>
    </>
  );
}

// Map file extensions to Monaco language identifiers
function getLanguageFromExtension(filename: string): string {
  const ext = getFileExtension(filename);
  const languageMap: Record<string, string> = {
    js: 'javascript',
    ts: 'typescript',
    jsx: 'javascript',
    tsx: 'typescript',
    json: 'json',
    yml: 'yaml',
    yaml: 'yaml',
    xml: 'xml',
    html: 'html',
    css: 'css',
    md: 'markdown',
    py: 'python',
    java: 'java',
    sh: 'shell',
    bat: 'bat',
    cmd: 'bat',
    properties: 'ini',
    cfg: 'ini',
    conf: 'ini',
    ini: 'ini',
    toml: 'ini',
    txt: 'plaintext',
    log: 'plaintext',
    env: 'shell',
  };
  return languageMap[ext] || 'plaintext';
}
