export function hasPermission(userPermissions: Array<string>, required: PermissionId): boolean {
  if (userPermissions.includes('*')) return true;
  if (userPermissions.includes(required)) return true;
  return userPermissions.some((p) => p !== '*' && required.startsWith(p + ':'));
}

export function hasAnyPermission(userPermissions: Array<string>, ...required: Array<PermissionId>): boolean {
  return required.some((r) => hasPermission(userPermissions, r));
}

export function hasAllPermissions(userPermissions: Array<string>, ...required: Array<PermissionId>): boolean {
  return required.every((r) => hasPermission(userPermissions, r));
}

export function hasGroupAccess(userPermissions: Array<string>, ...groups: Array<PermissionId>): boolean {
  if (userPermissions.includes('*')) return true;
  return groups.some((group) => {
    if (userPermissions.includes(group)) return true;
    const prefix = group + ':';
    return userPermissions.some((p) => p === group || p.startsWith(prefix));
  });
}

export const PERMISSION_TREE = [
  {
    section: 'server',
    groups: [
      // Sidebar order: Console → Files → Plugins → Backups → Players → Logs → Tasks → Settings
      { key: 'servers', actions: ['servers:create'] },
      { key: 'server:power', actions: ['server:power:start', 'server:power:stop', 'server:power:restart'] },
      { key: 'server:console', actions: ['server:console:read', 'server:console:input'] },
      {
        key: 'server:plugins',
        actions: [
          'server:plugins:list',
          'server:plugins:toggle',
          'server:plugins:delete',
          'server:plugins:upload',
          'server:plugins:marketplace',
        ],
      },
      {
        key: 'server:backups',
        actions: [
          'server:backups:list',
          'server:backups:create',
          'server:backups:download',
          'server:backups:rename',
          'server:backups:delete',
        ],
      },
      {
        key: 'server:players',
        actions: ['server:players:history', 'server:players:whitelist', 'server:players:bans', 'server:players:pardon'],
      },
      {
        key: 'server:tasks',
        actions: [
          'server:tasks:list',
          'server:tasks:create',
          'server:tasks:update',
          'server:tasks:delete',
          'server:tasks:toggle',
        ],
      },
      {
        key: 'server:general',
        actions: ['server:general:update', 'server:general:delete'],
      },
      {
        key: 'server:jars',
        actions: ['server:jars:list', 'server:jars:download', 'server:jars:activate', 'server:jars:delete'],
      },
      { key: 'server:jvm', actions: ['server:jvm:read', 'server:jvm:update'] },
      {
        key: 'server:sftp',
        actions: ['server:sftp:list', 'server:sftp:create', 'server:sftp:update', 'server:sftp:delete'],
      },
      {
        key: 'server:domains',
        actions: ['server:domains:list', 'server:domains:add', 'server:domains:remove', 'server:domains:ssl'],
      },
      {
        key: 'server:files:read',
        actions: ['server:files:read:list', 'server:files:read:content', 'server:files:read:download', 'server:files:read:logs'],
      },
      {
        key: 'server:files:write',
        actions: [
          'server:files:write:edit',
          'server:files:write:delete',
          'server:files:write:mkdir',
          'server:files:write:rename',
          'server:files:write:upload',
        ],
      },
    ],
  },
  {
    section: 'users',
    groups: [
      {
        key: 'users:manage',
        actions: ['users:manage:list', 'users:manage:create', 'users:manage:update', 'users:manage:delete', 'users:manage:audit'],
      },
    ],
  },
  {
    section: 'settings',
    groups: [
      { key: 'settings:general', actions: ['settings:general:read', 'settings:general:domain'] },
      { key: 'settings:environment', actions: ['settings:environment:read', 'settings:environment:write'] },
      {
        key: 'settings:firewall',
        actions: ['settings:firewall:list', 'settings:firewall:add', 'settings:firewall:remove', 'settings:firewall:toggle'],
      },
      { key: 'settings:sftp', actions: ['settings:sftp:read'] },
    ],
  },
] as const;

export type PermissionSection = (typeof PERMISSION_TREE)[number];
export type PermissionGroup = PermissionSection['groups'][number];

type GroupKey = PermissionGroup['key'];
type ActionKey = PermissionGroup['actions'][number];

export type PermissionId = '*' | GroupKey | ActionKey;

export const ALL_PERMISSIONS: Array<PermissionId> = [
  '*',
  ...PERMISSION_TREE.flatMap((section) =>
    section.groups.flatMap((group) => [group.key, ...group.actions] as Array<PermissionId>)
  ),
];
