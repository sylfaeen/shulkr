import { useQuery } from '@tanstack/react-query';
import { apiClient, raise } from '@shulkr/frontend/lib/api';

export function useInstalledJava() {
  return useQuery({
    queryKey: ['java', 'installedVersions'],
    queryFn: async () => {
      const result = await apiClient.java.getInstalledVersions();
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    staleTime: 60 * 1000,
  });
}
