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

export function useDirectorySizes(serverId: string | null, currentPath: string) {
  return useQuery({
    queryKey: ['files', 'directorySizes', serverId, currentPath],
    queryFn: async () => {
      const result = await apiClient.files.directorySizes({
        params: { serverId: String(serverId!) },
        query: { path: currentPath },
      });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body;
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
    onMutate: async ({ path }) => {
      const parentPath = path.substring(0, path.lastIndexOf('/')) || '/';
      const queryKey = ['files', 'list', serverId, parentPath];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Array<FileInfo>>(queryKey);
      if (previous) {
        const name = path.substring(path.lastIndexOf('/') + 1);
        const placeholder: FileInfo = { name, path, type: 'directory', size: 0, modified: new Date().toISOString() };
        queryClient.setQueryData<Array<FileInfo>>(queryKey, [...previous, placeholder]);
      }
      return { previous, queryKey };
    },
    onSuccess: () => {
      addToast({ type: 'success', title: t('toast.directoryCreated') });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
      addToast({ type: 'error', title: t('toast.directoryCreateError') });
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) queryClient.invalidateQueries({ queryKey: context.queryKey }).then();
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
    onMutate: async ({ oldPath, newPath }) => {
      const oldDirPath = oldPath.substring(0, oldPath.lastIndexOf('/')) || '/';
      const newDirPath = newPath.substring(0, newPath.lastIndexOf('/')) || '/';
      const isSameDir = oldDirPath === newDirPath;
      const queryKey = ['files', 'list', serverId, oldDirPath];
      await queryClient.cancelQueries({ queryKey });
      const previous = queryClient.getQueryData<Array<FileInfo>>(queryKey);
      if (previous && isSameDir) {
        const newName = newPath.substring(newPath.lastIndexOf('/') + 1);
        queryClient.setQueryData<Array<FileInfo>>(
          queryKey,
          previous.map((f) => (f.path === oldPath ? { ...f, name: newName, path: newPath } : f))
        );
      }
      return { previous, queryKey, isSameDir, newDirPath };
    },
    onSuccess: () => {
      addToast({ type: 'success', title: t('toast.fileRenamed') });
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) queryClient.setQueryData(context.queryKey, context.previous);
      addToast({ type: 'error', title: t('toast.fileRenameError') });
    },
    onSettled: (_data, _err, _vars, context) => {
      if (context?.queryKey) queryClient.invalidateQueries({ queryKey: context.queryKey }).then();
      if (context && !context.isSameDir) {
        queryClient.invalidateQueries({ queryKey: ['files', 'list', serverId, context.newDirPath] }).then();
      }
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

export function isSqliteFile(filename: string): boolean {
  const sqliteExtensions = ['db', 'sqlite', 'sqlite3'];
  const ext = getFileExtension(filename);
  return sqliteExtensions.includes(ext);
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
