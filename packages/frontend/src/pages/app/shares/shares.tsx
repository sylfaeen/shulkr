import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Check, Copy, File, FileArchive, FileUp, Globe, Image, KeyRound, Pencil, Trash2, Upload } from 'lucide-react';
import type { PublicFile } from '@shulkr/shared';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { Badge } from '@shulkr/frontend/features/ui/base/badge';
import { Button } from '@shulkr/frontend/features/ui/base/button';
import { Input } from '@shulkr/frontend/features/ui/base/input';
import { SkeletonList } from '@shulkr/frontend/features/ui/skeleton_presets';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@shulkr/frontend/features/ui/base/tooltip';
import { PasswordGate } from '@shulkr/frontend/features/password_gate';
import { useHasPermission } from '@shulkr/frontend/hooks/use_permissions';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import {
  publicFileLink,
  useDeletePublicFile,
  usePublicFiles,
  useRotatePublicFile,
} from '@shulkr/frontend/hooks/use_public_files';
import { copyToClipboard } from '@shulkr/frontend/lib/copy';
import { cn } from '@shulkr/frontend/lib/cn';
import { formatRelativeDate } from '@shulkr/frontend/lib/date';
import { UploadPublicFileDialog } from '@shulkr/frontend/pages/app/shares/dialogs/upload_public_file_dialog';
import { EditPublicFileDialog } from '@shulkr/frontend/pages/app/shares/dialogs/edit_public_file_dialog';
import { formatBytes } from '@shulkr/frontend/pages/app/shares/features/expiry';

type PendingAction = { kind: 'rotate' | 'delete'; file: PublicFile };

export function SharesPage() {
  const { t } = useTranslation();
  const can = useHasPermission();
  const canList = can('shares:files:list');
  const canUpload = can('shares:files:upload');
  const canManage = can('shares:files:manage');

  usePageTitle(`shulkr • ${t('shares.title')}`);

  const { data, isLoading, error } = usePublicFiles();
  const rotate = useRotatePublicFile();
  const remove = useDeletePublicFile();
  const [uploadOpen, setUploadOpen] = useState(false);
  const [replacing, setReplacing] = useState<PublicFile | null>(null);
  const [editing, setEditing] = useState<PublicFile | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const files = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    return q ? data?.files.filter((f) => f.name.toLowerCase().includes(q)) : data?.files;
  }, [data, searchQuery]);

  if (!canList) return <PageError message={t('errors.forbidden')} />;
  if (error) return <PageError message={t('errors.generic')} />;

  return (
    <>
      <PageContent>
        <FeatureCard>
          <FeatureCard.Header>
            <FeatureCard.Content>
              <FeatureCard.Title count={data?.files.length}>{t('shares.title')}</FeatureCard.Title>
              <FeatureCard.Description>
                {t('shares.subtitle')}
                {data && (
                  <span className={'block text-xs'}>
                    {t('shares.quota', { used: formatBytes(data.usedBytes), total: formatBytes(data.quotaBytes) })}
                  </span>
                )}
              </FeatureCard.Description>
            </FeatureCard.Content>
            <FeatureCard.Actions>
              {canUpload && (
                <Button onClick={() => setUploadOpen(true)} icon={Upload}>
                  {t('shares.upload.button')}
                </Button>
              )}
            </FeatureCard.Actions>
          </FeatureCard.Header>
          <FeatureCard.Body>
            {isLoading ? (
              <FeatureCard.Row className={'py-2'}>
                <SkeletonList rows={3} className={'w-full'} />
              </FeatureCard.Row>
            ) : !data?.files.length ? (
              <FeatureCard.Empty icon={Globe} title={t('shares.empty.title')} description={t('shares.empty.description')} />
            ) : (
              <>
                <FeatureCard.Search value={searchQuery} onChange={setSearchQuery} />
                {files?.map((file) => (
                  <PublicFileRow
                    key={file.id}
                    link={publicFileLink(data.baseUrl, file)}
                    onEdit={() => setEditing(file)}
                    onReplace={() => setReplacing(file)}
                    onRotate={() => setPending({ kind: 'rotate', file })}
                    onDelete={() => setPending({ kind: 'delete', file })}
                    canReplace={canManage && canUpload}
                    {...{ file, canManage }}
                  />
                ))}
              </>
            )}
          </FeatureCard.Body>
        </FeatureCard>
      </PageContent>
      {uploadOpen && <UploadPublicFileDialog onClose={() => setUploadOpen(false)} />}
      {replacing && <UploadPublicFileDialog replaceFile={replacing} onClose={() => setReplacing(null)} />}
      {editing && <EditPublicFileDialog file={editing} onClose={() => setEditing(null)} />}
      <PasswordGate
        open={pending !== null}
        onOpenChange={(open) => !open && setPending(null)}
        title={pending?.kind === 'rotate' ? t('shares.rotate.title') : t('shares.delete.title')}
        description={
          pending?.kind === 'rotate'
            ? t('shares.rotate.description', { name: pending.file.name })
            : t('shares.delete.description', { name: pending?.file.name ?? '' })
        }
        confirmLabel={pending?.kind === 'rotate' ? t('shares.rotate.confirm') : t('common.delete')}
        destructive={true}
        scope={'public-files'}
        onConfirm={async () => {
          if (!pending) return;
          const action = pending.kind === 'rotate' ? rotate : remove;
          await action.mutateAsync(pending.file.id).catch(() => {});
        }}
      />
    </>
  );
}

function PublicFileRow({
  file,
  link,
  canManage,
  canReplace,
  onEdit,
  onReplace,
  onRotate,
  onDelete,
}: {
  file: PublicFile;
  link: string;
  canManage: boolean;
  canReplace: boolean;
  onEdit: () => void;
  onReplace: () => void;
  onRotate: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  const Icon = file.disposition === 'inline' ? Image : file.mimeType === 'application/zip' ? FileArchive : File;
  const expired = file.expiresAt !== null && new Date(file.expiresAt).getTime() <= Date.now();
  const exhausted = file.maxDownloads !== null && file.downloadCount >= file.maxDownloads;

  return (
    <FeatureCard.Row className={cn('flex-col items-stretch sm:gap-4', (expired || exhausted) && 'opacity-60')}>
      <div className={'flex min-w-0 items-center gap-3'}>
        <Icon className={'size-4 shrink-0 text-zinc-400'} />
        <div className={'min-w-0 flex-1'}>
          <p className={'truncate text-sm font-medium'}>{file.name}</p>
          <p className={'flex flex-wrap gap-x-2 text-xs text-zinc-500 dark:text-zinc-400'}>
            <span>{formatBytes(file.sizeBytes)}</span>
            <span>·</span>
            <span>
              {file.expiresAt ? t('shares.expiresOn', { date: formatRelativeDate(file.expiresAt) }) : t('shares.neverExpires')}
            </span>
            <span>·</span>
            <span>
              {file.maxDownloads === null
                ? t('shares.downloads', { count: file.downloadCount })
                : t('shares.downloadsCapped', { count: file.downloadCount, max: file.maxDownloads })}
            </span>
            {file.lastDownloadedAt && (
              <>
                <span>·</span>
                <span>{t('shares.lastDownload', { date: formatRelativeDate(file.lastDownloadedAt) })}</span>
              </>
            )}
          </p>
        </div>
        {expired && <Badge variant={'outline'}>{t('shares.status.expired')}</Badge>}
        {!expired && exhausted && <Badge variant={'outline'}>{t('shares.status.exhausted')}</Badge>}
        <TooltipProvider delay={300}>
          <div className={'flex shrink-0 items-center gap-1'}>
            {canManage && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant={'ghost'}
                      size={'icon'}
                      onClick={onEdit}
                      icon={Pencil}
                      iconClass={'size-3.5'}
                      aria-label={t('shares.edit.title')}
                    />
                  }
                />
                <TooltipContent>{t('shares.edit.title')}</TooltipContent>
              </Tooltip>
            )}
            {canReplace && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant={'ghost'}
                      size={'icon'}
                      onClick={onReplace}
                      icon={FileUp}
                      aria-label={t('shares.replace.title')}
                    />
                  }
                />
                <TooltipContent>{t('shares.replace.title')}</TooltipContent>
              </Tooltip>
            )}
            {canManage && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant={'ghost'}
                      size={'icon'}
                      onClick={onRotate}
                      icon={KeyRound}
                      aria-label={t('shares.rotate.title')}
                    />
                  }
                />
                <TooltipContent>{t('shares.rotate.title')}</TooltipContent>
              </Tooltip>
            )}
            {canManage && (
              <Tooltip>
                <TooltipTrigger
                  render={
                    <Button
                      variant={'ghost-destructive'}
                      size={'icon'}
                      onClick={onDelete}
                      icon={Trash2}
                      aria-label={t('shares.delete.title')}
                    />
                  }
                />
                <TooltipContent>{t('shares.delete.title')}</TooltipContent>
              </Tooltip>
            )}
          </div>
        </TooltipProvider>
      </div>
      <TooltipProvider delay={300}>
        <div className={'space-y-2'}>
          <CopyField label={t('shares.link')} copyLabel={t('shares.copyLink')} value={link} />
          <CopyField label={'SHA-1'} copyLabel={t('shares.copySha1')} value={file.sha1} />
        </div>
      </TooltipProvider>
    </FeatureCard.Row>
  );
}

function CopyField({ label, copyLabel, value }: { label: string; copyLabel: string; value: string }) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={'flex items-center gap-2'}>
      <span className={'w-12 shrink-0 text-xs text-zinc-500 dark:text-zinc-400'}>{label}</span>
      <Input readOnly value={value} className={'font-jetbrains h-8 text-xs'} onFocusCapture={(e) => e.currentTarget.select()} />
      <Tooltip>
        <TooltipTrigger
          render={
            <Button
              type={'button'}
              variant={'secondary'}
              size={'icon-sm'}
              onClick={handleCopy}
              icon={copied ? Check : Copy}
              iconClass={cn(copied && 'text-green-600')}
              aria-label={copyLabel}
            />
          }
        />
        <TooltipContent>{copied ? t('common.copied') : copyLabel}</TooltipContent>
      </Tooltip>
    </div>
  );
}
