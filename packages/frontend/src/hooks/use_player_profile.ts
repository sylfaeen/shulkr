import { useQuery } from '@tanstack/react-query';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function usePlayerProfile(serverId: string, playerName: string | null) {
  return useQuery({
    queryKey: ['player-profile', serverId, playerName],
    queryFn: async () => {
      const result = await apiClient.playerProfile.profile({ params: { serverId, playerName: playerName! } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!playerName,
  });
}

export function usePlayerSessions(serverId: string, playerName: string | null, limit = 50, offset = 0) {
  return useQuery({
    queryKey: ['player-profile', serverId, playerName, 'sessions', limit, offset],
    queryFn: async () => {
      const result = await apiClient.playerProfile.sessions({
        params: { serverId, playerName: playerName! },
        query: { limit, offset },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!playerName,
  });
}

export function usePlayerModeration(serverId: string, playerName: string | null) {
  return useQuery({
    queryKey: ['player-profile', serverId, playerName, 'moderation'],
    queryFn: async () => {
      const result = await apiClient.playerProfile.moderation({ params: { serverId, playerName: playerName! } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!playerName,
  });
}

export function usePlayerSearch(serverId: string, query: string) {
  return useQuery({
    queryKey: ['player-search', serverId, query],
    queryFn: async () => {
      const result = await apiClient.playerProfile.search({ params: { serverId }, query: { q: query } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: query.length >= 1,
  });
}
