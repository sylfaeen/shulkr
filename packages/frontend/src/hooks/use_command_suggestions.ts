import { useQuery } from '@tanstack/react-query';
import { useState, useEffect, useRef } from 'react';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useCommandSuggestions(serverId: string | undefined, input: string) {
  const [debouncedInput, setDebouncedInput] = useState('');
  const timerRef = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedInput(input), 200);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [input]);
  const query = useQuery({
    queryKey: ['command-suggestions', serverId, debouncedInput],
    queryFn: async () => {
      const result = await apiClient.console.suggestions({
        params: { serverId: serverId! },
        query: { q: debouncedInput },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId && debouncedInput.length >= 1,
    staleTime: 10_000,
  });
  return query.data ?? [];
}
