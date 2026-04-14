import { useParams, Link } from '@tanstack/react-router';
import { useTranslation } from 'react-i18next';
import { ArrowLeft, Ban, Calendar, Clock, Loader2, User } from 'lucide-react';
import { ServerPageSkeleton } from '@shulkr/frontend/pages/app/servers/features/server_page_skeleton';
import { PageError } from '@shulkr/frontend/features/ui/page_error';
import { useServer } from '@shulkr/frontend/hooks/use_servers';
import { usePlayerProfile, usePlayerSessions, usePlayerModeration } from '@shulkr/frontend/hooks/use_player_profile';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';
import { Badge } from '@shulkr/frontend/features/ui/shadcn/badge';
import { FeatureCard } from '@shulkr/frontend/pages/app/features/card';
import { PageContent } from '@shulkr/frontend/pages/app/features/page_content';
import { usePageTitle } from '@shulkr/frontend/hooks/use_page_title';

export function PlayerProfilePage() {
  const { id, playerName } = useParams({ strict: false });
  const { t } = useTranslation();
  const { data: server, isLoading: serverLoading, error: serverError } = useServer(id ?? '');

  usePageTitle(playerName ? `${playerName} — ${t('nav.players')}` : t('nav.players'));

  if (serverLoading) return <ServerPageSkeleton />;
  if (serverError || !server || !playerName) return <PageError />;

  return (
    <PageContent>
      <ProfileContent serverId={server.id} {...{ playerName }} />
    </PageContent>
  );
}

function ProfileContent({ serverId, playerName }: { serverId: string; playerName: string }) {
  const { t, i18n } = useTranslation();
  const { data: profile, isLoading: profileLoading } = usePlayerProfile(serverId, playerName);
  const { data: sessionsData, isLoading: sessionsLoading } = usePlayerSessions(serverId, playerName);
  const { data: moderation } = usePlayerModeration(serverId, playerName);

  if (profileLoading) return <ServerPageSkeleton />;
  if (!profile) return <PageError />;

  return (
    <div className={'space-y-6'}>
      <Link to={`/app/servers/${serverId}/players`}>
        <Button variant={'ghost'} size={'sm'}>
          <ArrowLeft className={'size-4'} />
          {t('playerProfile.backToPlayers')}
        </Button>
      </Link>

      <div className={'flex items-center gap-4'}>
        {profile.avatarUrl ? (
          <img
            src={profile.avatarUrl}
            alt={profile.name}
            className={'size-16 rounded-xl border border-black/6 dark:border-white/6'}
          />
        ) : (
          <div className={'flex size-16 items-center justify-center rounded-xl bg-zinc-100 dark:bg-zinc-800'}>
            <User className={'size-8 text-zinc-400'} />
          </div>
        )}
        <div>
          <div className={'flex items-center gap-2'}>
            <h1 className={'text-2xl font-bold'}>{profile.name}</h1>
            {profile.online ? (
              <Badge variant={'default'}>{t('playerProfile.online')}</Badge>
            ) : (
              <Badge variant={'secondary'}>{t('playerProfile.offline')}</Badge>
            )}
            {moderation?.banned && <Badge variant={'destructive'}>{t('playerProfile.banned')}</Badge>}
          </div>
          {profile.uuid && <p className={'font-jetbrains mt-0.5 text-xs text-zinc-500'}>{profile.uuid}</p>}
        </div>
      </div>

      <div className={'grid grid-cols-2 gap-3 lg:grid-cols-4'}>
        <StatCard icon={Clock} label={t('playerProfile.totalPlaytime')} value={formatPlaytime(profile.totalPlaytimeMinutes)} />
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
                    <p className={'text-xs text-zinc-400'}>
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
            <FeatureCard.Empty icon={Clock} title={t('playerProfile.noSessions')} />
          ) : (
            sessionsData.sessions.map((session) => (
              <FeatureCard.Row key={session.id}>
                <div className={'flex items-center gap-3'}>
                  <Calendar className={'size-4 shrink-0 text-zinc-400'} />
                  <div>
                    <p className={'text-sm'}>{new Date(session.joinedAt).toLocaleString(i18n.language)}</p>
                    {session.durationMinutes !== null && (
                      <p className={'text-xs text-zinc-500'}>{formatPlaytime(session.durationMinutes)}</p>
                    )}
                  </div>
                </div>
              </FeatureCard.Row>
            ))
          )}
        </FeatureCard.Body>
      </FeatureCard>
    </div>
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

function formatPlaytime(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const hours = Math.floor(minutes / 60);
  const mins = Math.round(minutes % 60);
  if (hours < 24) return `${hours}h ${mins}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return `${days}d ${remainingHours}h`;
}
