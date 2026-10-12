import { useCallback, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import type { PublicFile, UpdatePublicFileInput } from '@shulkr/shared';
import { apiClient, ApiError, authorizedFetch, raise } from '@shulkr/frontend/lib/api';
import { useToast } from '@shulkr/frontend/features/ui/toast';

const QUERY_KEY = ['publicFiles'];

export function usePublicFiles() {
  return useQuery({
    queryKey: QUERY_KEY,
    queryFn: async () => {
      const result = await apiClient.publicFiles.list();
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
  });
}

// Absolute link shown and copied in the panel. The panel domain wins when one is configured; otherwise the origin the administrator is using is the only address known to reach this machine.
export function publicFileLink(baseUrl: string | null, file: Pick<PublicFile, 'url'>): string {
  return `${baseUrl ?? window.location.origin}${file.url}`;
}

type UploadTarget =
  { kind: 'new'; expiresInHours: number | null; maxDownloads: number | null } | { kind: 'replace'; fileId: number };

type UploadState = { name: string; sentBytes: number; totalBytes: number } | null;

// Sends the file in fixed-size chunks, strictly in order: the backend only accepts the chunk that starts exactly where the previous one ended. Cancelling aborts the chunk in flight and closes the session so the partial file is removed.
export function usePublicFileUpload() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const [state, setState] = useState<UploadState>(null);
  const controllerRef = useRef<AbortController | null>(null);
  const uploadIdRef = useRef<string | null>(null);

  const upload = useCallback(
    async (file: File, target: UploadTarget): Promise<PublicFile | null> => {
      const abort = new AbortController();
      controllerRef.current = abort;
      setState({ name: file.name, sentBytes: 0, totalBytes: file.size });

      try {
        const opened =
          target.kind === 'new'
            ? await apiClient.publicFiles.createUpload({
                body: {
                  name: file.name,
                  sizeBytes: file.size,
                  expiresInHours: target.expiresInHours,
                  maxDownloads: target.maxDownloads,
                },
              })
            : await apiClient.publicFiles.replace({
                params: { id: target.fileId },
                body: { name: file.name, sizeBytes: file.size },
              });

        if (opened.status !== 201) raise(opened.body, opened.status);

        const { uploadId: id, chunkBytes } = opened.body;
        uploadIdRef.current = id;

        for (let offset = 0; offset < file.size; offset += chunkBytes) {
          const chunk = file.slice(offset, Math.min(offset + chunkBytes, file.size));

          const response = await authorizedFetch(`/api/public-files/uploads/${encodeURIComponent(id)}/chunks?offset=${offset}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/octet-stream' },
            body: chunk,
            signal: abort.signal,
          });

          if (!response.ok) raise(await response.json().catch(() => null), response.status);
          setState({ name: file.name, sentBytes: offset + chunk.size, totalBytes: file.size });
        }

        const completed = await apiClient.publicFiles.completeUpload({ params: { id } });
        if (completed.status !== 201) raise(completed.body, completed.status);

        uploadIdRef.current = null;
        await queryClient.invalidateQueries({ queryKey: QUERY_KEY });
        addToast({ type: 'success', title: t(target.kind === 'new' ? 'shares.upload.success' : 'shares.replace.success') });

        return completed.body;
      } catch (error: unknown) {
        const pending = uploadIdRef.current;
        uploadIdRef.current = null;
        if (pending) await apiClient.publicFiles.cancelUpload({ params: { id: pending } }).catch(() => {});

        if (!abort.signal.aborted) {
          const code = error instanceof ApiError ? error.code : 'unknown';

          addToast({
            type: 'error',
            title: t('shares.upload.error'),
            description: t(`shares.errors.${code}`, { defaultValue: '' }),
          });
        }

        return null;
      } finally {
        controllerRef.current = null;
        setState(null);
      }
    },
    [addToast, queryClient, t]
  );

  const cancel = useCallback(() => {
    controllerRef.current?.abort();
  }, []);

  return { upload, cancel, state };
}

export function useUpdatePublicFile() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, body }: { id: number; body: UpdatePublicFileInput }) => {
      const result = await apiClient.publicFiles.update({ params: { id }, body });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }).then();
      addToast({ type: 'success', title: t('shares.edit.success') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('shares.edit.error') });
    },
  });
}

export function useRotatePublicFile() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const result = await apiClient.publicFiles.rotate({ params: { id } });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }).then();
      addToast({ type: 'success', title: t('shares.rotate.success') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('shares.rotate.error') });
    },
  });
}

export function useDeletePublicFile() {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (id: number) => {
      const result = await apiClient.publicFiles.remove({ params: { id } });
      if (result.status !== 200) raise(result.body, result.status);

      return result.body;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEY }).then();
      addToast({ type: 'success', title: t('shares.delete.success') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('shares.delete.error') });
    },
  });
}
