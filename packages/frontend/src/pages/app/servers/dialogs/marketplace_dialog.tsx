import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, ArrowUpRight, Check, Download, HardDrive, LoaderCircle, Package, Search, X } from 'lucide-react';
import { cn } from '@shulkr/frontend/lib/cn';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Dialog, DialogContent } from '@shulkr/frontend/features/ui/shadcn/dialog';
import {
  useMarketplaceSearch,
  useMarketplacePopular,
  useMarketplaceProject,
  useMarketplaceVersions,
  useInstallPlugin,
  type MarketplaceSource,
} from '@shulkr/frontend/hooks/use_marketplace';
import { timeAgo } from '@shulkr/frontend/lib/date';
import { Input } from '@shulkr/frontend/features/ui/shadcn/input';
import { formatPluginSize } from '@shulkr/frontend/hooks/use_plugins';

type MarketplaceView = { type: 'search' } | { type: 'detail'; idOrSlug: string };

export function MarketplaceDialog({
  open,
  onOpenChange,
  serverId,
  initialSlug,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  serverId: string;
  initialSlug?: string | null;
}) {
  const [view, setView] = useState<MarketplaceView>(initialSlug ? { type: 'detail', idOrSlug: initialSlug } : { type: 'search' });
  const [source, setSource] = useState<MarketplaceSource>('modrinth');
  useEffect(() => {
    if (open && initialSlug) {
      setView({ type: 'detail', idOrSlug: initialSlug });
    } else if (open && !initialSlug) {
      setView({ type: 'search' });
    }
  }, [open, initialSlug]);
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) setView({ type: 'search' });
      }}
    >
      <DialogContent className={'max-w-3xl'} showCloseButton={false}>
        <MarketplaceHeader
          showBack={view.type === 'detail'}
          onBack={() => setView({ type: 'search' })}
          onClose={() => onOpenChange(false)}
          onSourceChange={(s) => {
            setSource(s);
            setView({ type: 'search' });
          }}
          {...{ source }}
        />
        {view.type === 'detail' ? (
          <PluginDetail idOrSlug={view.idOrSlug} onBack={() => setView({ type: 'search' })} {...{ serverId, source }} />
        ) : (
          <div className={'max-h-[70vh] overflow-y-auto p-5'}>
            <MarketplaceSearch onSelectPlugin={(slug) => setView({ type: 'detail', idOrSlug: slug })} {...{ source }} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function MarketplaceHeader({
  showBack,
  source,
  onBack,
  onClose,
  onSourceChange,
}: {
  showBack: boolean;
  source: MarketplaceSource;
  onBack: () => void;
  onClose: () => void;
  onSourceChange: (source: MarketplaceSource) => void;
}) {
  return (
    <div className={'flex items-center justify-between border-b border-black/10 px-5 py-3 dark:border-white/10'}>
      <div className={'flex items-center gap-3'}>
        {showBack && (
          <Button variant={'ghost'} size={'icon-sm'} onClick={onBack} icon={ArrowLeft} />
        )}
        <div className={'flex items-center gap-1 rounded-lg bg-zinc-100 p-0.5 dark:bg-zinc-800'}>
          <button
            onClick={() => onSourceChange('modrinth')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors',
              source === 'modrinth'
                ? 'bg-white shadow-sm dark:bg-zinc-700'
                : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
            )}
          >
            <ModrinthLogo compact />
            <span className={'text-xs font-medium'}>Modrinth</span>
          </button>
          <button
            onClick={() => onSourceChange('hangar')}
            className={cn(
              'flex items-center gap-1.5 rounded-md px-2.5 py-1.5 transition-colors',
              source === 'hangar'
                ? 'bg-white shadow-sm dark:bg-zinc-700'
                : 'text-zinc-400 hover:text-zinc-600 dark:text-zinc-500 dark:hover:text-zinc-300'
            )}
          >
            <img src={'/hangar.svg'} alt={'Hangar'} className={'size-4'} />
            <span className={'text-xs font-medium'}>Hangar</span>
          </button>
        </div>
      </div>
      <Button variant={'ghost'} size={'icon-sm'} onClick={onClose} icon={X} />
    </div>
  );
}

function MarketplaceSearch({ onSelectPlugin, source }: { onSelectPlugin: (slug: string) => void; source: MarketplaceSource }) {
  const { t } = useTranslation();
  const [query, setQuery] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const { data, isLoading } = useMarketplaceSearch({ source, q: searchQuery, limit: 30 });
  const { data: popular, isLoading: popularLoading } = useMarketplacePopular(source, 15);
  const handleSearch = useCallback((value: string) => {
    setQuery(value);
    if (searchTimeout) clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => setSearchQuery(value), 300);
  }, []);
  return (
    <div className={'flex flex-col gap-4'}>
      <div className={'relative'}>
        <Search
          className={'pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-zinc-400'}
          strokeWidth={2}
        />
        <Input
          type={'text'}
          value={query}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={t('marketplace.searchPlaceholder')}
          className={'pl-10'}
          autoFocus
        />
        {isLoading && (
          <LoaderCircle
            className={'absolute top-1/2 right-3.5 size-4 -translate-y-1/2 animate-spin text-green-600'}
            strokeWidth={2}
          />
        )}
      </div>
      {!searchQuery.trim() && (
        <div className={'flex flex-col gap-3'}>
          <span className={'text-[11px] font-semibold tracking-wide text-zinc-400 uppercase dark:text-zinc-500'}>
            {t('marketplace.popular')}
          </span>
          {popularLoading ? (
            <div className={'flex items-center justify-center py-10'}>
              <LoaderCircle className={'size-5 animate-spin text-zinc-400'} strokeWidth={2} />
            </div>
          ) : popular && popular.hits.length > 0 ? (
            <div className={'flex flex-col'}>
              {popular.hits.map((hit) => (
                <PluginRow key={hit.project_id} hit={hit} onSelect={() => onSelectPlugin(hit.slug)} />
              ))}
            </div>
          ) : (
            <p className={'py-10 text-center text-sm text-zinc-400'}>{t('marketplace.searchHint')}</p>
          )}
        </div>
      )}
      {data && data.hits.length === 0 && searchQuery.trim() && (
        <div className={'flex flex-col items-center gap-3 py-14 text-center'}>
          <Package className={'size-8 text-zinc-300 dark:text-zinc-600'} strokeWidth={1.5} />
          <p className={'text-sm text-zinc-500 dark:text-zinc-400'}>{t('marketplace.noResults', { query: searchQuery })}</p>
        </div>
      )}
      {data && data.hits.length > 0 && (
        <div className={'flex flex-col gap-3'}>
          <div className={'flex items-center justify-between'}>
            <span className={'font-jetbrains text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500'}>
              {data.totalHits.toLocaleString()} {t('marketplace.results')}
            </span>
          </div>
          <div className={'flex flex-col'}>
            {data.hits.map((hit) => (
              <PluginRow key={hit.project_id} hit={hit} onSelect={() => onSelectPlugin(hit.slug)} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

let searchTimeout: ReturnType<typeof setTimeout> | undefined;

function PluginRow({
  hit,
  onSelect,
}: {
  hit: {
    project_id: string;
    slug: string;
    title: string;
    description: string;
    author: string;
    icon_url: string | null;
    downloads: number;
  };
  onSelect: () => void;
}) {
  return (
    <button
      onClick={onSelect}
      className={cn(
        'group/plugin flex items-center gap-3.5 rounded-xl px-2 py-1.5 text-left transition-all',
        'hover:bg-zinc-100 dark:hover:bg-zinc-800/60'
      )}
    >
      {hit.icon_url ? (
        <img src={hit.icon_url} alt={hit.title} className={'size-10 shrink-0 rounded-lg object-cover'} />
      ) : (
        <div className={'flex size-10 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-zinc-800'}>
          <Package className={'size-5 text-zinc-400'} strokeWidth={1.5} />
        </div>
      )}
      <div className={'min-w-0 flex-1'}>
        <div className={'flex items-center gap-2'}>
          <span
            className={
              'text-sm font-medium text-zinc-800 group-hover/plugin:text-zinc-900 dark:text-zinc-200 dark:group-hover/plugin:text-zinc-100'
            }
          >
            {hit.title}
          </span>
          <span className={'text-xs text-zinc-400 dark:text-zinc-500'}>{hit.author}</span>
        </div>
        <p className={'mt-0.5 line-clamp-1 text-xs leading-relaxed text-zinc-500 dark:text-zinc-400'}>{hit.description}</p>
      </div>
      <div className={'flex shrink-0 items-center gap-3'}>
        <span className={'font-jetbrains text-[11px] text-zinc-400 tabular-nums dark:text-zinc-500'}>
          <Download className={'mr-0.5 inline size-3 opacity-60'} />
          {formatDownloads(hit.downloads)}
        </span>
        <ArrowUpRight
          className={
            'size-3.5 text-zinc-300 transition-colors group-hover/plugin:text-green-600 dark:text-zinc-600 dark:group-hover/plugin:text-green-600'
          }
        />
      </div>
    </button>
  );
}

function PluginDetail({
  idOrSlug,
  serverId,
  source,
  onBack,
}: {
  idOrSlug: string;
  serverId: string;
  source: MarketplaceSource;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { data: project, isLoading: projectLoading } = useMarketplaceProject(idOrSlug, source);
  const { data: versions, isLoading: versionsLoading } = useMarketplaceVersions(idOrSlug, source);
  const installMutation = useInstallPlugin(serverId);
  const [sessionInstalled, setSessionInstalled] = useState<Set<string>>(() => new Set());
  const handleInstall = useCallback(
    (version: {
      id: string;
      version_number: string;
      files: Array<{ url: string; filename: string; hashes: { sha512: string }; primary: boolean }>;
    }) => {
      if (!project) return;
      const file = version.files.find((f) => f.primary) ?? version.files[0];
      if (!file) return;
      installMutation.mutate(
        {
          source,
          projectId: project.id,
          versionId: version.id,
          filename: file.filename,
          fileUrl: file.url,
          fileHash: file.hashes.sha512,
        },
        { onSuccess: () => setSessionInstalled((prev) => new Set(prev).add(version.version_number)) }
      );
    },
    [project, source, installMutation]
  );
  if (projectLoading) {
    return (
      <div className={'flex items-center justify-center py-20'}>
        <LoaderCircle className={'size-6 animate-spin text-green-600'} strokeWidth={2} />
      </div>
    );
  }
  if (!project) {
    return (
      <div className={'flex flex-col items-center gap-3 py-16 text-center'}>
        <p className={'text-sm text-zinc-500'}>{t('marketplace.pluginNotFound')}</p>
        <Button variant={'secondary'} size={'sm'} onClick={onBack} icon={ArrowLeft}>
          {t('common.back')}
        </Button>
      </div>
    );
  }
  return (
    <div className={'flex max-h-[70vh] flex-col'}>
      <div className={'shrink-0 border-b border-black/10 p-5 dark:border-white/10'}>
        <div className={'flex items-start gap-4'}>
          {project.icon_url ? (
            <img src={project.icon_url} alt={project.title} className={'size-14 shrink-0 rounded-2xl object-cover shadow-sm'} />
          ) : (
            <div className={'flex size-14 shrink-0 items-center justify-center rounded-2xl bg-zinc-100 dark:bg-zinc-800'}>
              <Package className={'size-7 text-zinc-400'} strokeWidth={1.5} />
            </div>
          )}
          <div className={'min-w-0 flex-1'}>
            <div className={'flex items-center gap-2.5'}>
              <h2 className={'text-lg font-semibold text-zinc-900 dark:text-zinc-100'}>{project.title}</h2>
              <a
                href={
                  source === 'hangar'
                    ? `https://hangar.papermc.io/${project.slug}`
                    : `https://modrinth.com/plugin/${project.slug}`
                }
                target={'_blank'}
                rel={'noopener noreferrer'}
                className={cn(
                  'flex items-center gap-1 rounded-md px-2 py-0.5 text-xs transition-colors',
                  source === 'hangar' ? 'text-blue-500 hover:bg-blue-500/10' : 'text-green-600 hover:bg-green-600/10'
                )}
              >
                {source === 'hangar' ? 'hangar' : 'modrinth'}
                <ArrowUpRight className={'size-3'} />
              </a>
            </div>
            <p className={'mt-1 text-sm leading-relaxed text-zinc-500 dark:text-zinc-400'}>{project.description}</p>
            <div className={'mt-2.5 flex flex-wrap items-center gap-2'}>
              <span
                className={'font-jetbrains inline-flex items-center gap-1 text-xs text-zinc-500 tabular-nums dark:text-zinc-400'}
              >
                <Download className={'size-3 opacity-60'} />
                {project.downloads.toLocaleString()}
              </span>
              <span className={'text-zinc-200 dark:text-zinc-700'}>&middot;</span>
              <span className={'font-jetbrains text-xs text-zinc-400 dark:text-zinc-500'}>{project.license.id}</span>
              {project.categories.slice(0, 5).map((cat) => (
                <span
                  key={cat}
                  className={
                    'rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-medium text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                  }
                >
                  {cat}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div className={'min-h-0 flex-1 overflow-y-auto p-5'}>
        <div>
          <div className={'mb-3 flex items-center justify-between'}>
            <h3 className={'text-[11px] font-semibold tracking-wide text-zinc-400 uppercase dark:text-zinc-500'}>
              {t('marketplace.versions')}
              {versions && <span className={'ml-1.5 text-zinc-300 dark:text-zinc-600'}>{versions.length}</span>}
            </h3>
          </div>
          {versionsLoading ? (
            <div className={'flex items-center justify-center py-8'}>
              <LoaderCircle className={'size-5 animate-spin text-zinc-400'} strokeWidth={2} />
            </div>
          ) : versions && versions.length > 0 ? (
            <div className={'flex flex-col'}>
              {versions.slice(0, 15).map((version, idx) => {
                const primaryFile = version.files.find((f) => f.primary) ?? version.files[0];
                const isInstalled = sessionInstalled.has(version.version_number);
                const isInstalling = installMutation.isPending && installMutation.variables?.versionId === version.id;
                return (
                  <div
                    key={version.id}
                    className={cn(
                      'flex items-center gap-4 rounded-xl px-2 py-1.5 transition-colors',
                      idx === 0
                        ? 'bg-green-600/5 ring-1 ring-green-600/15 dark:bg-green-300/10 dark:ring-green-300/10'
                        : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/40'
                    )}
                  >
                    <div className={'min-w-0 flex-1'}>
                      <div className={'flex items-center gap-2'}>
                        <span className={'font-jetbrains text-sm font-semibold text-zinc-800 tabular-nums dark:text-zinc-200'}>
                          {version.version_number}
                        </span>
                        {idx === 0 && (
                          <span
                            className={
                              'rounded-full bg-green-600/15 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-green-600 uppercase'
                            }
                          >
                            Latest
                          </span>
                        )}
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase',
                            version.version_type === 'release' &&
                              'bg-green-50 text-green-600 dark:bg-green-900/20 dark:text-green-400',
                            version.version_type === 'beta' &&
                              'bg-orange-50 text-orange-600 dark:bg-orange-900/20 dark:text-orange-400',
                            version.version_type === 'alpha' && 'bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400'
                          )}
                        >
                          {version.version_type}
                        </span>
                      </div>
                      <div className={'mt-1.5 flex flex-wrap items-center gap-1'}>
                        {version.game_versions.slice(0, 4).map((gv) => (
                          <span
                            key={gv}
                            className={
                              'font-jetbrains rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400'
                            }
                          >
                            {gv}
                          </span>
                        ))}
                        {version.game_versions.length > 4 && (
                          <span className={'font-jetbrains text-[10px] text-zinc-400'}>+{version.game_versions.length - 4}</span>
                        )}
                        {version.loaders.map((l) => (
                          <span
                            key={l}
                            className={
                              'font-jetbrains rounded bg-blue-600/8 px-1.5 py-0.5 text-[10px] text-blue-600 dark:bg-blue-600/10'
                            }
                          >
                            {l}
                          </span>
                        ))}
                        <span className={'font-jetbrains ml-1 text-[10px] text-zinc-600 dark:text-zinc-400'}>
                          {timeAgo(version.date_published)}
                        </span>
                      </div>
                    </div>
                    <div className={'flex shrink-0 items-center gap-6'}>
                      {primaryFile && (
                        <div className={'flex items-center gap-1.5 text-xs text-zinc-600 dark:text-zinc-400'}>
                          <HardDrive className={'size-3'} strokeWidth={2} />
                          <span>{formatPluginSize(primaryFile.size)}</span>
                        </div>
                      )}
                      {isInstalled ? (
                        <span
                          className={
                            'inline-flex items-center gap-1 rounded-lg bg-green-600/10 px-3 py-1.5 text-xs font-medium text-green-600'
                          }
                        >
                          <Check className={'size-3.5'} strokeWidth={2.5} />
                          {t('marketplace.installed')}
                        </span>
                      ) : (
                        <Button
                          variant={'success'}
                          size={'sm'}
                          onClick={() => handleInstall(version)}
                          disabled={installMutation.isPending}
                        >
                          {isInstalling ? (
                            <LoaderCircle className={'size-3.5 animate-spin'} strokeWidth={2.5} />
                          ) : (
                            <Download className={'size-3.5'} strokeWidth={2.5} />
                          )}
                          {t('marketplace.install')}
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className={'py-8 text-center text-sm text-zinc-400'}>{t('marketplace.noVersions')}</p>
          )}
        </div>
      </div>
    </div>
  );
}

function ModrinthLogo({ compact }: { compact?: boolean }) {
  if (compact) {
    return (
      <svg className={'size-4'} viewBox={'0 0 593 593'} fill={'none'} aria-hidden={'true'}>
        <g fill={'#1bd96a'}>
          <path
            d={
              'm29 424.4 188.2-112.95-17.15-45.48 53.75-55.21 67.93-14.64 19.67 24.21-31.32 31.72-27.3 8.6-19.52 20.05 9.56 26.6 19.4 20.6 27.36-7.28 19.47-21.38 42.51-13.47 12.67 28.5-43.87 53.78-73.5 23.27-32.97-36.7L55.06 467.94C46.1 456.41 35.67 440.08 29 424.4Zm543.03-230.25-149.5 40.32c8.24 21.92 10.95 34.8 13.23 49l149.23-40.26c-2.38-15.94-6.65-32.17-12.96-49.06Z'
            }
          />
          <path
            d={
              'M51.28 316.13c10.59 125 115.54 223.3 243.27 223.3 96.51 0 180.02-56.12 219.63-137.46l48.61 16.83c-46.78 101.34-149.35 171.75-268.24 171.75C138.6 590.55 10.71 469.38 0 316.13h51.28ZM.78 265.24C15.86 116.36 141.73 0 294.56 0c162.97 0 295.28 132.31 295.28 295.28 0 26.14-3.4 51.49-9.8 75.63l-48.48-16.78a244.28 244.28 0 0 0 7.15-58.85c0-134.75-109.4-244.15-244.15-244.15-124.58 0-227.49 93.5-242.32 214.11H.8Z'
            }
          />
          <path
            d={
              'M293.77 153.17c-78.49.07-142.2 63.83-142.2 142.34 0 78.56 63.79 142.34 142.35 142.34 3.98 0 7.93-.16 11.83-.49l14.22 49.76a194.65 194.65 0 0 1-26.05 1.74c-106.72 0-193.36-86.64-193.36-193.35 0-106.72 86.64-193.35 193.36-193.35 2.64 0 5.28.05 7.9.16l-8.05 50.85Zm58.2-42.13c78.39 24.67 135.3 97.98 135.3 184.47 0 80.07-48.77 148.83-118.2 178.18l-14.17-49.55c48.08-22.85 81.36-71.89 81.36-128.63 0-60.99-38.44-113.07-92.39-133.32l8.1-51.15Z'
            }
          />
        </g>
      </svg>
    );
  }
  return (
    <svg
      className={'h-5 w-auto text-zinc-800 dark:text-zinc-200'}
      viewBox={'0 0 3307 593'}
      fill={'none'}
      fillRule={'evenodd'}
      clipRule={'evenodd'}
      aria-hidden={'true'}
    >
      <path
        fill={'currentColor'}
        fillRule={'nonzero'}
        d={
          'M1053.02 205.51c35.59 0 64.27 10.1 84.98 30.81 20.72 21.25 31.34 52.05 31.34 93.48v162.53h-66.4V338.3c0-24.96-5.3-43.55-16.46-56.3-11.15-12.22-26.55-18.6-47.27-18.6-22.3 0-40.37 7.45-53.65 21.79-13.27 14.87-20.18 36.11-20.18 63.2v143.94h-66.4V338.3c0-24.96-5.3-43.55-16.46-56.3-11.15-12.22-26.56-18.6-47.27-18.6-22.84 0-40.37 7.45-53.65 21.79-13.27 14.34-20.18 35.58-20.18 63.2v143.94h-66.4V208.7h63.21v36.12c10.63-12.75 23.9-22.3 39.84-29.21 15.93-6.9 33.46-10.1 53.11-10.1 21.25 0 40.37 3.72 56.84 11.69 16.46 8.5 29.21 20.18 38.77 35.59 11.69-14.88 26.56-26.56 45.15-35.06 18.59-7.97 38.77-12.22 61.08-12.22Zm329.84 290.54c-28.68 0-54.7-6.37-77.54-18.59a133.19 133.19 0 0 1-53.65-52.05c-13.28-21.78-19.65-46.74-19.65-74.9 0-28.14 6.37-53.1 19.65-74.88a135.4 135.4 0 0 1 53.65-51.53c22.84-12.21 48.86-18.59 77.54-18.59 29.22 0 55.24 6.38 78.08 18.6 22.84 12.21 40.9 29.74 54.18 51.52 12.75 21.77 19.12 46.74 19.12 74.89s-6.37 53.11-19.12 74.89c-13.28 22.3-31.34 39.83-54.18 52.05-22.84 12.22-48.86 18.6-78.08 18.6Zm0-56.83c24.44 0 44.62-7.97 60.55-24.43 15.94-16.47 23.9-37.72 23.9-64.27 0-26.56-7.96-47.8-23.9-64.27-15.93-16.47-36.11-24.43-60.55-24.43-24.43 0-44.61 7.96-60.02 24.43-15.93 16.46-23.9 37.71-23.9 64.27 0 26.55 7.97 47.8 23.9 64.27 15.4 16.46 35.6 24.43 60.02 24.43Zm491.32-341v394.11h-63.74v-36.65a108.02 108.02 0 0 1-40.37 30.28c-16.46 6.9-34 10.1-53.65 10.1-27.08 0-51.52-5.85-73.3-18.07-21.77-12.21-39.3-29.21-51.52-51.52-12.21-21.78-18.59-47.27-18.59-75.95s6.38-54.18 18.6-75.96c12.21-21.77 29.74-38.77 51.52-50.99 21.77-12.21 46.2-18.06 73.3-18.06 18.59 0 36.11 3.2 51.52 9.56a106.35 106.35 0 0 1 39.83 28.69V98.22h66.4Zm-149.79 341c15.94 0 30.28-3.72 43.03-11.16 12.74-6.9 22.83-17.52 30.27-30.8 7.44-13.28 11.15-29.21 11.15-46.74s-3.71-33.46-11.15-46.74c-7.44-13.28-17.53-23.9-30.27-31.34-12.75-6.9-27.1-10.62-43.03-10.62s-30.27 3.71-43.02 10.62c-12.75 7.43-22.84 18.06-30.28 31.34-7.43 13.28-11.15 29.2-11.15 46.74 0 17.53 3.72 33.46 11.15 46.74 7.44 13.28 17.53 23.9 30.28 30.8 12.75 7.44 27.09 11.16 43.02 11.16Zm298.51-189.09c19.12-29.74 52.58-44.62 100.92-44.62v63.21a84.29 84.29 0 0 0-15.4-1.6c-26.03 0-46.22 7.44-60.56 22.32-14.34 15.4-21.78 37.18-21.78 65.33v137.56h-66.39V208.7h63.2v41.43Zm155.63-41.43h66.39v283.63h-66.4V208.7Zm33.46-46.74c-12.22 0-22.31-3.72-30.28-11.68a37.36 37.36 0 0 1-12.21-28.16c0-11.15 4.25-20.71 12.21-28.68 7.97-7.43 18.06-11.15 30.28-11.15 12.21 0 22.3 3.72 30.27 10.62 7.97 7.44 12.22 16.47 12.22 27.62 0 11.69-3.72 21.25-11.69 29.21-7.96 7.97-18.59 12.22-30.8 12.22Zm279.38 43.55c35.59 0 64.27 10.63 86.05 31.34 21.78 20.72 32.4 52.05 32.4 92.95v162.53h-66.4V338.3c0-24.96-5.84-43.55-17.52-56.3-11.69-12.22-28.15-18.6-49.93-18.6-24.43 0-43.55 7.45-57.9 21.79-14.34 14.87-21.24 36.11-21.24 63.73v143.41h-66.4V208.7h63.21v36.65c11.16-13.28 24.97-22.84 41.43-29.74 16.47-6.9 35.59-10.1 56.3-10.1Zm371.81 271.42a78.34 78.34 0 0 1-28.15 14.34 130.83 130.83 0 0 1-35.6 4.78c-31.33 0-55.23-7.97-72.23-24.43-17-16.47-25.5-39.84-25.5-71.17V263.94h-46.73v-53.11h46.74v-64.8h66.4v64.8h75.95v53.11h-75.96v134.91c0 13.81 3.19 24.43 10.1 31.34 6.9 7.44 16.46 11.15 29.2 11.15 14.88 0 27.1-3.71 37.19-11.68l18.59 47.27Zm214.05-271.42c35.59 0 64.27 10.63 86.05 31.34 21.77 20.72 32.4 52.05 32.4 92.95v162.53h-66.4V338.3c0-24.96-5.84-43.55-17.53-56.3-11.68-12.22-28.15-18.6-49.92-18.6-24.44 0-43.56 7.45-57.9 21.79-14.34 14.87-21.24 36.11-21.24 63.73v143.41h-66.4V98.23h66.4v143.4c11.15-11.68 24.43-20.71 40.9-27.09 15.93-5.84 33.99-9.03 53.64-9.03Z'
        }
      />
      <g fill={'#1bd96a'}>
        <path
          d={
            'm29 424.4 188.2-112.95-17.15-45.48 53.75-55.21 67.93-14.64 19.67 24.21-31.32 31.72-27.3 8.6-19.52 20.05 9.56 26.6 19.4 20.6 27.36-7.28 19.47-21.38 42.51-13.47 12.67 28.5-43.87 53.78-73.5 23.27-32.97-36.7L55.06 467.94C46.1 456.41 35.67 440.08 29 424.4Zm543.03-230.25-149.5 40.32c8.24 21.92 10.95 34.8 13.23 49l149.23-40.26c-2.38-15.94-6.65-32.17-12.96-49.06Z'
          }
        />
        <path
          d={
            'M51.28 316.13c10.59 125 115.54 223.3 243.27 223.3 96.51 0 180.02-56.12 219.63-137.46l48.61 16.83c-46.78 101.34-149.35 171.75-268.24 171.75C138.6 590.55 10.71 469.38 0 316.13h51.28ZM.78 265.24C15.86 116.36 141.73 0 294.56 0c162.97 0 295.28 132.31 295.28 295.28 0 26.14-3.4 51.49-9.8 75.63l-48.48-16.78a244.28 244.28 0 0 0 7.15-58.85c0-134.75-109.4-244.15-244.15-244.15-124.58 0-227.49 93.5-242.32 214.11H.8Z'
          }
        />
        <path
          d={
            'M293.77 153.17c-78.49.07-142.2 63.83-142.2 142.34 0 78.56 63.79 142.34 142.35 142.34 3.98 0 7.93-.16 11.83-.49l14.22 49.76a194.65 194.65 0 0 1-26.05 1.74c-106.72 0-193.36-86.64-193.36-193.35 0-106.72 86.64-193.35 193.36-193.35 2.64 0 5.28.05 7.9.16l-8.05 50.85Zm58.2-42.13c78.39 24.67 135.3 97.98 135.3 184.47 0 80.07-48.77 148.83-118.2 178.18l-14.17-49.55c48.08-22.85 81.36-71.89 81.36-128.63 0-60.99-38.44-113.07-92.39-133.32l8.1-51.15Z'
          }
        />
      </g>
    </svg>
  );
}

function formatDownloads(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}
