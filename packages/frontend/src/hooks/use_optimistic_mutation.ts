import { useMutation, useQueryClient, type QueryKey, type UseMutationOptions } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useToast } from '@shulkr/frontend/features/ui/toast';

type OptimisticMutationOptions<TData, TVariables, TQueryData> = {
  mutationFn: (variables: TVariables) => Promise<TData>;
  queryKey: QueryKey;
  updater: (previous: TQueryData | undefined, variables: TVariables) => TQueryData | undefined;
  successToastKey?: string;
  errorToastKey?: string;
  mutationOptions?: Omit<UseMutationOptions<TData, Error, TVariables, { previous: TQueryData | undefined }>, 'mutationFn' | 'onMutate' | 'onError' | 'onSettled'>;
};

export function useOptimisticMutation<TData, TVariables, TQueryData>({
  mutationFn,
  queryKey,
  updater,
  successToastKey,
  errorToastKey = 'toast.genericError',
  mutationOptions,
}: OptimisticMutationOptions<TData, TVariables, TQueryData>) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    ...mutationOptions,
    mutationFn,
    onMutate: async (variables) => {
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<TQueryData>(queryKey);
      const next = updater(previous, variables);
      if (next !== undefined) queryClient.setQueryData(queryKey, next);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous !== undefined) queryClient.setQueryData(queryKey, context.previous);
      addToast({ type: 'error', title: t(errorToastKey) });
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey }).then();
    },
    onSuccess: successToastKey
      ? () => {
          addToast({ type: 'success', title: t(successToastKey) });
        }
      : undefined,
  });
}
