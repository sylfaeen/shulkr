import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { useAuthStore } from '@shulkr/frontend/stores/auth_store';
import { useToast } from '@shulkr/frontend/features/ui/toast';

export type FileInfo = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
  modified: string;
};

export function useFiles(serverId: string | null, currentPath: string) {
  return useQuery({
    queryKey: ['files', 'list', serverId, currentPath],
    queryFn: async () => {
      const result = await apiClient.files.list({ params: { serverId: String(serverId!) }, query: { path: currentPath } });
      if (result.status !== 200) raise(result.body, result.status);
      const basePath = currentPath === '/' ? '' : currentPath;
      return result.body.map((f): FileInfo => ({ ...f, path: `${basePath}/${f.name}` }));
    },
    enabled: !!serverId,
  });
}

export function useFileContent(serverId: string | null, path: string | null) {
  return useQuery({
    queryKey: ['files', 'read', serverId, path],
    queryFn: async () => {
      const result = await apiClient.files.read({ params: { serverId: String(serverId!) }, query: { path: path! } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    enabled: !!serverId && !!path,
  });
}

export function useWriteFile(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: { path: string; content: string }) => {
      const result = await apiClient.files.write({ params: { serverId: String(serverId) }, body: input });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['files', 'read', serverId, variables.path] }).then();
      const dirPath = variables.path.substring(0, variables.path.lastIndexOf('/')) || '/';
      queryClient.invalidateQueries({ queryKey: ['files', 'list', serverId, dirPath] }).then();
      addToast({ type: 'success', title: t('toast.fileSaved') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.fileSaveError') });
    },
  });

  return {
    ...mutation,
    mutateAsync: (input: { path: string; content: string }) => mutation.mutateAsync(input),
  };
}

export function useDeleteFile(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ path }: { path: string }) => {
      const result = await apiClient.files.delete({ params: { serverId: String(serverId) }, query: { path } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: (_, variables) => {
      const dirPath = variables.path.substring(0, variables.path.lastIndexOf('/')) || '/';
      queryClient.invalidateQueries({ queryKey: ['files', 'list', serverId, dirPath] }).then();
      addToast({ type: 'success', title: t('toast.fileDeleted') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.fileDeleteError') });
    },
  });

  return {
    ...mutation,
    mutateAsync: (path: string) => mutation.mutateAsync({ path }),
  };
}

export function useCreateDirectory(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async ({ path }: { path: string }) => {
      const result = await apiClient.files.mkdir({ params: { serverId: String(serverId) }, body: { path } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: (_, variables) => {
      const parentPath = variables.path.substring(0, variables.path.lastIndexOf('/')) || '/';
      queryClient.invalidateQueries({ queryKey: ['files', 'list', serverId, parentPath] }).then();
      addToast({ type: 'success', title: t('toast.directoryCreated') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.directoryCreateError') });
    },
  });

  return {
    ...mutation,
    mutateAsync: (path: string) => mutation.mutateAsync({ path }),
  };
}

export function useUploadFile(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((state) => state.accessToken);

  return useMutation({
    mutationFn: async ({ file, targetPath }: { file: File; targetPath: string }) => {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch(`/api/servers/${serverId}/files/upload?path=${encodeURIComponent(targetPath)}`, {
        method: 'POST',
        body: formData,
        credentials: 'include',
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error?.message || 'Upload failed');
      }

      return response.json();
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['files', 'list', serverId, variables.targetPath] }).then();
      addToast({ type: 'success', title: t('toast.fileUploaded') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.fileUploadError') });
    },
  });
}

export function useRenameFile(serverId: string) {
  const { t } = useTranslation();
  const { addToast } = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (input: { oldPath: string; newPath: string }) => {
      const result = await apiClient.files.rename({ params: { serverId: String(serverId) }, body: input });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
    },
    onSuccess: (_, variables) => {
      const oldDirPath = variables.oldPath.substring(0, variables.oldPath.lastIndexOf('/')) || '/';
      const newDirPath = variables.newPath.substring(0, variables.newPath.lastIndexOf('/')) || '/';
      queryClient.invalidateQueries({ queryKey: ['files', 'list', serverId, oldDirPath] }).then();
      if (oldDirPath !== newDirPath) {
        queryClient.invalidateQueries({ queryKey: ['files', 'list', serverId, newDirPath] }).then();
      }
      addToast({ type: 'success', title: t('toast.fileRenamed') });
    },
    onError: () => {
      addToast({ type: 'error', title: t('toast.fileRenameError') });
    },
  });

  return {
    ...mutation,
    mutateAsync: (input: { oldPath: string; newPath: string }) => mutation.mutateAsync(input),
  };
}

export function useDownloadFile(serverId: string) {
  const accessToken = useAuthStore((state) => state.accessToken);

  return {
    download(filePath: string) {
      const params = new URLSearchParams({ path: filePath, token: accessToken ?? '' });
      window.open(`/api/servers/${serverId}/files/download?${params.toString()}`, '_blank');
    },
  };
}

export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export function getFileExtension(filename: string): string {
  const lastDot = filename.lastIndexOf('.');
  if (lastDot === -1 || lastDot === 0) return '';
  return filename.substring(lastDot + 1).toLowerCase();
}

export function isEditableFile(filename: string): boolean {
  const editableExtensions = [
    'txt',
    'md',
    'json',
    'yml',
    'yaml',
    'xml',
    'properties',
    'cfg',
    'conf',
    'ini',
    'log',
    'sh',
    'bat',
    'cmd',
    'js',
    'ts',
    'java',
    'py',
    'html',
    'css',
    'toml',
    'env',
  ];
  const ext = getFileExtension(filename);
  return editableExtensions.includes(ext) || filename.startsWith('.');
}
