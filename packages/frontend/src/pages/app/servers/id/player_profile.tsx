import { useParams } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { Ban, Calendar, Clock, Loader2, User } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { usePlayerProfile, usePlayerSessions, usePlayerModeration } from '@shulkr/frontend/hooks/use_player_profile';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { ServerPageHeader } from '@shulkr/frontend/pages/app/servers/features/server_page_header';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';
import { formatPlaytime } from '@shulkr/frontend/lib/duration';

export function PlayerProfilePage() {
  const { id, playerName } = useParams({ strict: false });
  const { t } = useTranslation();
  const { data: server, isLoading: serverLoading, error: serverError } = useServer(id ?? '');

  usePageTitle(playerName ? `${playerName} — ${t('nav.players')}` : t('nav.players'));

  if (serverLoading) return <ServerPageSkeleton />;
  if (serverError || !server || !playerName) return <PageError />;

  return <ProfileContent serverId={server.id} {...{ playerName }} />;
}

function ProfileContent({ serverId, playerName }: { serverId: string; playerName: string }) {
  const { t, i18n } = useTranslation();
  const { data: profile, isLoading: profileLoading } = usePlayerProfile(serverId, playerName);
  const { data: sessionsData, isLoading: sessionsLoading } = usePlayerSessions(serverId, playerName);
  const { data: moderation } = usePlayerModeration(serverId, playerName);

  if (profileLoading) return <ServerPageSkeleton />;
  if (!profile) return <PageError />;

  return (
    <>
      <ServerPageHeader>
        <ServerPageHeader.Left>
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt={profile.name}
              className={'mt-0.5 size-10 shrink-0 rounded-xl border border-black/6 dark:border-white/6'}
            />
          ) : (
            <ServerPageHeader.Icon icon={User} />
          )}
          <ServerPageHeader.Info>
            <ServerPageHeader.Heading>
              <ServerPageHeader.ServerName />
              <ServerPageHeader.PageName>{profile.name}</ServerPageHeader.PageName>
              {profile.online ? (
                <Badge variant={'default'}>{t('playerProfile.online')}</Badge>
              ) : (
                <Badge variant={'secondary'}>{t('playerProfile.offline')}</Badge>
              )}
              {moderation?.banned && <Badge variant={'destructive'}>{t('playerProfile.banned')}</Badge>}
            </ServerPageHeader.Heading>
            {profile.uuid && <p className={'font-jetbrains mt-0.5 text-xs text-zinc-400 dark:text-zinc-500'}>{profile.uuid}</p>}
          </ServerPageHeader.Info>
        </ServerPageHeader.Left>
      </ServerPageHeader>
      <PageContent>
        <div className={'space-y-4'}>
          <div className={'grid grid-cols-2 gap-3 lg:grid-cols-4'}>
            <StatCard
              icon={Clock}
              label={t('playerProfile.totalPlaytime')}
              value={formatPlaytime(profile.totalPlaytimeMinutes)}
            />
            <StatCard icon={Calendar} label={t('playerProfile.sessions')} value={String(profile.sessionCount)} />
            <StatCard
              icon={Calendar}
              label={t('playerProfile.firstSeen')}
              value={new Date(profile.firstSeen).toLocaleDateString(i18n.language)}
            />
            <StatCard
              icon={Calendar}
              label={t('playerProfile.lastSeen')}
              value={new Date(profile.lastSeen).toLocaleDateString(i18n.language)}
            />
          </div>
          <FeatureCard.Stack>
            {moderation?.banned && (
              <FeatureCard>
                <FeatureCard.Header>
                  <FeatureCard.Content>
                    <FeatureCard.Title>{t('playerProfile.moderation')}</FeatureCard.Title>
                  </FeatureCard.Content>
                </FeatureCard.Header>
                <FeatureCard.Body>
                  <FeatureCard.Row>
                    <div className={'flex items-center gap-3'}>
                      <Ban className={'size-4 text-red-500'} />
                      <div>
                        <p className={'text-sm font-medium'}>{t('playerProfile.activeBan')}</p>
                        {moderation.banReason && <p className={'text-xs text-zinc-500'}>{moderation.banReason}</p>}
                        {moderation.banDate && (
                          <p className={'text-xs text-zinc-400 dark:text-zinc-500'}>
                            {t('playerProfile.bannedOn')} {new Date(moderation.banDate).toLocaleDateString(i18n.language)}
                            {moderation.banSource && ` — ${moderation.banSource}`}
                          </p>
                        )}
                      </div>
                    </div>
                  </FeatureCard.Row>
                </FeatureCard.Body>
              </FeatureCard>
            )}
            <FeatureCard>
              <FeatureCard.Header>
                <FeatureCard.Content>
                  <FeatureCard.Title count={sessionsData?.total}>{t('playerProfile.sessionHistory')}</FeatureCard.Title>
                </FeatureCard.Content>
              </FeatureCard.Header>
              <FeatureCard.Body>
                {sessionsLoading ? (
                  <div className={'flex items-center justify-center py-8'}>
                    <Loader2 className={'size-4 animate-spin text-zinc-400'} />
                  </div>
                ) : !sessionsData?.sessions.length ? (
                  <FeatureCard.Empty icon={Clock} title={t('playerProfile.noSessions')} description={''} />
                ) : (
                  sessionsData.sessions.map((session) => (
                    <FeatureCard.Row key={session.id}>
                      <div className={'flex w-full items-center gap-3'}>
                        <Calendar className={'size-4 shrink-0 text-zinc-400'} />
                        <div className={'flex w-full items-center justify-between'}>
                          <p className={'text-sm'}>{new Date(session.joinedAt).toLocaleString(i18n.language)}</p>
                          {session.durationMinutes !== null && (
                            <p className={'text-xs text-zinc-400 dark:text-zinc-500'}>
                              {formatPlaytime(session.durationMinutes)}
                            </p>
                          )}
                        </div>
                      </div>
                    </FeatureCard.Row>
                  ))
                )}
              </FeatureCard.Body>
            </FeatureCard>
          </FeatureCard.Stack>
        </div>
      </PageContent>
    </>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: typeof Clock; label: string; value: string }) {
  return (
    <div className={'rounded-xl border border-black/6 bg-white p-4 dark:border-white/6 dark:bg-zinc-900'}>
      <div className={'flex items-center gap-2 text-xs text-zinc-500'}>
        <Icon className={'size-3.5'} />
        {label}
      </div>
      <p className={'mt-1 text-lg font-semibold'}>{value}</p>
    </div>
  );
}
