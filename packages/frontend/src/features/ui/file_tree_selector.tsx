import { useCallback, useEffect, useMemo, useState, type RefObject, type Dispatch, type SetStateAction } from 'react';
import { ChevronRight, File, Folder, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@shulkr/frontend/lib/cn';
import { apiClient, raise } from '@shulkr/frontend/lib/api';
import { Checkbox } from '@shulkr/frontend/features/ui/shadcn/checkbox';
import { Button } from '@shulkr/frontend/features/ui/shadcn/button';

type FileEntry = {
  name: string;
  path: string;
  type: 'file' | 'directory';
  size: number;
};

export type TreeNode = FileEntry & {
  children?: Array<TreeNode>;
  loaded?: boolean;
  expanded?: boolean;
};

export function FileTreeSelector({
  serverId,
  enabled,
  selectedPaths,
  onSelectedPathsChange,
  directoriesOnly,
  treeRef,
  initialPaths,
}: {
  serverId: string;
  enabled: boolean;
  selectedPaths: Set<string>;
  onSelectedPathsChange: (paths: Set<string>) => void;
  directoriesOnly?: boolean;
  treeRef?: RefObject<Array<TreeNode>>;
  initialPaths?: Array<string>;
}) {
  const { t } = useTranslation();
  const [tree, setTree] = useState<Array<TreeNode>>([]);
  const [loading, setLoading] = useState(true);
  const ancestorDirs = useMemo(() => {
    if (!initialPaths) return null;
    const ancestors = new Set<string>();
    for (const p of initialPaths) {
      const parts = p.split('/');
      let current = '';
      for (let i = 1; i < parts.length - 1; i++) {
        current += '/' + parts[i];
        ancestors.add(current);
      }
    }
    return ancestors;
  }, [initialPaths]);
  useEffect(() => {
    if (treeRef) treeRef.current = tree;
  }, [tree, treeRef]);
  const filesQuery = useQuery({
    queryKey: ['files', 'list', serverId, '/'],
    queryFn: async () => {
      const result = await apiClient.files.list({ params: { serverId: String(serverId) }, query: { path: '/' } });
      if (result.status !== 200) raise(result.body, result.status);
      return result.body.map((f) => ({ ...f, path: `/${f.name}` }));
    },
    enabled,
  });
  useEffect(() => {
    if (filesQuery.data && enabled) {
      const entries = directoriesOnly ? filesQuery.data.filter((f) => f.type === 'directory') : filesQuery.data;
      const nodes: Array<TreeNode> = entries.map((f) => ({
        ...f,
        loaded: f.type === 'file',
        expanded: false,
      }));
      setTree(nodes);
      if (initialPaths && initialPaths.length > 0 && ancestorDirs) {
        const initialSet = new Set(initialPaths);
        restoreSelection(entries, initialSet, ancestorDirs, serverId, setTree, !!directoriesOnly).then((selected) => {
          onSelectedPathsChange(selected);
          setLoading(false);
        });
      } else {
        const allPaths = new Set(entries.map((f) => f.path));
        onSelectedPathsChange(allPaths);
        setLoading(false);
      }
    }
  }, [filesQuery.data, enabled, directoriesOnly, onSelectedPathsChange, initialPaths, ancestorDirs, serverId]);
  useEffect(() => {
    if (!enabled) {
      setTree([]);
      onSelectedPathsChange(new Set());
      setLoading(true);
    }
  }, [enabled, onSelectedPathsChange]);
  const loadChildren = useCallback(
    async (dirPath: string) => {
      try {
        const result = await apiClient.files.list({ params: { serverId: String(serverId) }, query: { path: dirPath } });
        if (result.status !== 200) raise(result.body, result.status);
        const basePath = dirPath === '/' ? '' : dirPath;
        const children = result.body.map((f) => ({ ...f, path: `${basePath}/${f.name}` }));
        const filtered = directoriesOnly ? children.filter((c) => c.type === 'directory') : children;
        setTree((prev) =>
          updateTreeNode(prev, dirPath, (node) => ({
            ...node,
            loaded: true,
            expanded: true,
            children: filtered.map((c) => ({
              ...c,
              loaded: c.type === 'file',
              expanded: false,
            })),
          }))
        );
        onSelectedPathsChange(
          (() => {
            const next = new Set(selectedPaths);
            for (const child of filtered) {
              next.add(child.path);
            }
            return next;
          })()
        );
      } catch {
        setTree((prev) =>
          updateTreeNode(prev, dirPath, (node) => ({
            ...node,
            loaded: true,
            expanded: true,
            children: [],
          }))
        );
      }
    },
    [serverId, selectedPaths, onSelectedPathsChange, directoriesOnly]
  );
  const handleExpand = useCallback(
    (dirPath: string) => {
      const node = findTreeNode(tree, dirPath);
      if (!node) return;
      if (node.loaded) {
        setTree((prev) =>
          updateTreeNode(prev, dirPath, (n) => ({
            ...n,
            expanded: !n.expanded,
          }))
        );
      } else {
        loadChildren(dirPath).then();
      }
    },
    [tree, loadChildren]
  );
  const handleSelect = useCallback(
    (filePath: string, type: 'file' | 'directory') => {
      const next = new Set(selectedPaths);
      const isSelected = next.has(filePath);
      if (isSelected) {
        next.delete(filePath);
        if (type === 'directory') {
          deselectChildren(tree, filePath, next);
        }
      } else {
        next.add(filePath);
        if (type === 'directory') {
          selectChildren(tree, filePath, next);
        }
      }
      onSelectedPathsChange(next);
    },
    [tree, selectedPaths, onSelectedPathsChange]
  );
  const handleSelectAll = () => {
    const allPaths = new Set<string>();
    collectAllPaths(tree, allPaths);
    onSelectedPathsChange(allPaths);
  };
  const handleDeselectAll = () => {
    onSelectedPathsChange(new Set());
  };
  const totalCount = countAllNodes(tree);
  const allSelected = selectedPaths.size >= totalCount && totalCount > 0;
  return (
    <div>
      <div className={'flex items-center justify-between pb-2'}>
        <div className={'flex items-center gap-1'}>
          <Button onClick={handleSelectAll} variant={'ghost'} size={'xs'} disabled={allSelected}>
            {t('backups.selectAll')}
          </Button>
          <span className={'text-zinc-200 dark:text-zinc-700'}>|</span>
          <Button onClick={handleDeselectAll} variant={'ghost'} size={'xs'} disabled={selectedPaths.size === 0}>
            {t('backups.deselectAll')}
          </Button>
        </div>
        <span
          className={cn(
            'rounded-md px-2 py-0.5 text-sm font-medium tabular-nums transition-colors',
            selectedPaths.size > 0
              ? 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800/60 dark:text-zinc-400'
          )}
        >
          {selectedPaths.size} {t('backups.itemsSelected')}
        </span>
      </div>
      <div
        className={
          'max-h-80 overflow-y-auto rounded-lg border border-black/6 bg-zinc-50/80 p-1.5 dark:border-white/8 dark:bg-zinc-900/60'
        }
      >
        {loading ? (
          <div className={'flex flex-col items-center justify-center gap-2 py-12'}>
            <Loader2 className={'size-5 animate-spin text-zinc-600 dark:text-zinc-400'} />
            <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('common.loading')}</span>
          </div>
        ) : tree.length === 0 ? (
          <div className={'py-12 text-center'}>
            <Folder className={'mx-auto mb-2 size-8 text-zinc-300 dark:text-zinc-600'} strokeWidth={1.5} />
            <span className={'text-sm text-zinc-600 dark:text-zinc-400'}>{t('backups.noFiles')}</span>
          </div>
        ) : (
          <div className={'py-0.5'}>
            {tree.map((node) => (
              <FileTreeNode
                key={node.path}
                depth={0}
                onExpand={handleExpand}
                onSelect={handleSelect}
                {...{ node, selectedPaths }}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

FileTreeSelector.optimizeSelectedPaths = optimizeSelectedPaths;

function FileTreeNode({
  node,
  selectedPaths,
  depth,
  onExpand,
  onSelect,
}: {
  node: TreeNode;
  selectedPaths: Set<string>;
  depth: number;
  onExpand: (path: string) => void;
  onSelect: (path: string, type: 'file' | 'directory') => void;
}) {
  const isSelected = selectedPaths.has(node.path);
  const isDirectory = node.type === 'directory';
  const isPartiallySelected =
    isDirectory && node.children
      ? node.children.some((c) => selectedPaths.has(c.path)) && !node.children.every((c) => selectedPaths.has(c.path))
      : false;
  return (
    <div className={'relative'}>
      {depth > 0 && (
        <div
          className={'absolute top-0 bottom-0 border-l border-zinc-200/70 dark:border-zinc-700/50'}
          style={{ left: `${depth * 20 + 9}px` }}
        />
      )}
      <div
        className={cn(
          'group relative flex items-center gap-2 rounded-md py-1.5 pr-2 transition-colors hover:bg-zinc-100/80 dark:hover:bg-zinc-800/60',
          isSelected && 'bg-zinc-100/60 dark:bg-zinc-800/40'
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
      >
        {isDirectory ? (
          <button
            type={'button'}
            className={
              'flex size-4 shrink-0 items-center justify-center rounded text-zinc-600 transition-colors hover:text-zinc-600 dark:text-zinc-400 dark:hover:text-zinc-300'
            }
            onClick={() => onExpand(node.path)}
          >
            <ChevronRight className={cn('size-3.5 transition-transform duration-150', node.expanded && 'rotate-90')} />
          </button>
        ) : (
          <div className={'size-4'} />
        )}
        <Checkbox
          checked={isPartiallySelected ? 'indeterminate' : isSelected}
          onCheckedChange={() => onSelect(node.path, node.type)}
        />
        {isDirectory ? (
          <Folder
            className={cn(
              'size-4 shrink-0 transition-colors',
              isSelected ? 'text-zinc-600 dark:text-zinc-300' : 'text-zinc-400 dark:text-zinc-500'
            )}
            strokeWidth={2}
          />
        ) : (
          <File
            className={cn(
              'size-4 shrink-0 transition-colors',
              isSelected ? 'text-zinc-500 dark:text-zinc-400' : 'text-zinc-300 dark:text-zinc-600'
            )}
            strokeWidth={2}
          />
        )}
        <span
          className={cn(
            'truncate text-sm transition-colors',
            isSelected ? 'text-zinc-800 dark:text-zinc-200' : 'text-zinc-600 dark:text-zinc-400'
          )}
        >
          {node.name}
        </span>
        {!isDirectory && node.size > 0 && (
          <span
            className={
              'font-jetbrains ml-auto shrink-0 text-[11px] text-zinc-300 tabular-nums group-hover:text-zinc-600 dark:text-zinc-600 dark:group-hover:text-zinc-400'
            }
          >
            {formatFileSize(node.size)}
          </span>
        )}
        {isDirectory && !node.loaded && !node.expanded && (
          <span className={'ml-auto shrink-0 text-[10px] tracking-wide text-zinc-400 uppercase dark:text-zinc-600'}>dir</span>
        )}
      </div>
      {isDirectory && node.expanded && node.children && (
        <div>
          {node.children.map((child) => (
            <FileTreeNode
              key={child.path}
              node={child}
              depth={depth + 1}
              onExpand={onExpand}
              onSelect={onSelect}
              {...{ selectedPaths }}
            />
          ))}
          {node.children.length === 0 && (
            <div
              className={'py-1.5 text-[11px] text-zinc-300 italic dark:text-zinc-600'}
              style={{ paddingLeft: `${(depth + 1) * 20 + 32}px` }}
            >
              (empty)
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function findTreeNode(nodes: Array<TreeNode>, targetPath: string): TreeNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node;
    if (node.children) {
      const found = findTreeNode(node.children, targetPath);
      if (found) return found;
    }
  }
  return null;
}

function updateTreeNode(nodes: Array<TreeNode>, targetPath: string, updater: (node: TreeNode) => TreeNode): Array<TreeNode> {
  return nodes.map((node) => {
    if (node.path === targetPath) return updater(node);
    if (node.children) {
      return { ...node, children: updateTreeNode(node.children, targetPath, updater) };
    }
    return node;
  });
}

function selectChildren(nodes: Array<TreeNode>, parentPath: string, selected: Set<string>): void {
  const parent = findTreeNode(nodes, parentPath);
  if (!parent?.children) return;
  for (const child of parent.children) {
    selected.add(child.path);
    if (child.type === 'directory' && child.children) {
      selectChildren([child], child.path, selected);
    }
  }
}

function deselectChildren(nodes: Array<TreeNode>, parentPath: string, selected: Set<string>): void {
  const parent = findTreeNode(nodes, parentPath);
  if (!parent?.children) return;
  for (const child of parent.children) {
    selected.delete(child.path);
    if (child.type === 'directory' && child.children) {
      deselectChildren([child], child.path, selected);
    }
  }
}

function collectAllPaths(nodes: Array<TreeNode>, paths: Set<string>): void {
  for (const node of nodes) {
    paths.add(node.path);
    if (node.children) {
      collectAllPaths(node.children, paths);
    }
  }
}

function countAllNodes(nodes: Array<TreeNode>): number {
  let count = 0;
  for (const node of nodes) {
    count++;
    if (node.children) {
      count += countAllNodes(node.children);
    }
  }
  return count;
}

async function restoreSelection(
  nodes: Array<{ path: string; type: string; name: string }>,
  initialSet: Set<string>,
  ancestorDirs: Set<string>,
  serverId: string,
  setTree: Dispatch<SetStateAction<Array<TreeNode>>>,
  directoriesOnly: boolean
): Promise<Set<string>> {
  const selected = new Set<string>();
  for (const node of nodes) {
    if (initialSet.has(node.path)) {
      selected.add(node.path);
    } else if (node.type === 'directory' && ancestorDirs.has(node.path)) {
      try {
        const result = await apiClient.files.list({
          params: { serverId: String(serverId) },
          query: { path: node.path },
        });
        if (result.status !== 200) continue;
        const basePath = node.path === '/' ? '' : node.path;
        const children = result.body.map((f) => ({ ...f, path: `${basePath}/${f.name}` }));
        const filtered = directoriesOnly ? children.filter((c) => c.type === 'directory') : children;
        setTree((prev) =>
          updateTreeNode(prev, node.path, (n) => ({
            ...n,
            loaded: true,
            expanded: true,
            children: filtered.map((c) => ({
              ...c,
              loaded: c.type === 'file',
              expanded: false,
            })),
          }))
        );
        const childSelected = await restoreSelection(filtered, initialSet, ancestorDirs, serverId, setTree, directoriesOnly);
        for (const p of childSelected) selected.add(p);
      } catch {
        // Skip failed directory loads
      }
    }
  }
  return selected;
}

function allDescendantsSelected(node: TreeNode, selected: Set<string>): boolean {
  if (!node.children) return true;
  for (const child of node.children) {
    if (!selected.has(child.path)) return false;
    if (child.type === 'directory' && child.children) {
      if (!allDescendantsSelected(child, selected)) return false;
    }
  }
  return true;
}

function optimizeSelectedPaths(nodes: Array<TreeNode>, selected: Set<string>): Array<string> {
  const result: Array<string> = [];
  for (const node of nodes) {
    if (selected.has(node.path)) {
      if (node.type === 'directory') {
        if (!node.loaded || allDescendantsSelected(node, selected)) {
          result.push(node.path);
        } else if (node.children) {
          result.push(...optimizeSelectedPaths(node.children, selected));
        }
      } else {
        result.push(node.path);
      }
    } else if (node.type === 'directory' && node.children) {
      result.push(...optimizeSelectedPaths(node.children, selected));
    }
  }
  return result;
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
