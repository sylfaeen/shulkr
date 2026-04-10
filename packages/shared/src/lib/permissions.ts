/**
 * Hierarchical permission matching.
 * Supports group-level permissions (e.g., "server:backups") that grant
 * all action-level permissions under them (e.g., "server:backups:create").
 */
export function hasPermission(userPermissions: Array<string>, required: string): boolean {
  if (userPermissions.includes('*')) return true;
  if (userPermissions.includes(required)) return true;
  return userPermissions.some((p) => p !== '*' && required.startsWith(p + ':'));
}

/**
 * Check if user has ANY of the required permissions (OR logic).
 */
export function hasAnyPermission(userPermissions: Array<string>, ...required: Array<string>): boolean {
  return required.some((r) => hasPermission(userPermissions, r));
}

/**
 * Check if user has ALL of the required permissions (AND logic).
 */
export function hasAllPermissions(userPermissions: Array<string>, ...required: Array<string>): boolean {
  return required.every((r) => hasPermission(userPermissions, r));
}

export interface PermissionGroup {
  key: string;
  actions: Array<string>;
}

export interface PermissionSection {
  section: string;
  groups: Array<PermissionGroup>;
}

export const PERMISSION_TREE: Array<PermissionSection> = [
  {
    section: 'server',
    groups: [
      { key: 'server:power', actions: ['server:power:start', 'server:power:stop', 'server:power:restart'] },
      { key: 'server:console', actions: ['server:console:read', 'server:console:input'] },
      {
        key: 'server:general',
        actions: ['server:general:create', 'server:general:update', 'server:general:delete'],
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
        key: 'server:plugins',
        actions: [
          'server:plugins:list',
          'server:plugins:toggle',
          'server:plugins:delete',
          'server:plugins:upload',
          'server:plugins:install',
        ],
      },
      {
        key: 'server:jars',
        actions: ['server:jars:list', 'server:jars:download', 'server:jars:activate', 'server:jars:delete'],
      },
      { key: 'server:jvm', actions: ['server:jvm:read'] },
      {
        key: 'server:players',
        actions: ['server:players:history', 'server:players:whitelist', 'server:players:bans', 'server:players:pardon'],
      },
      {
        key: 'server:sftp',
        actions: ['server:sftp:list', 'server:sftp:create', 'server:sftp:update', 'server:sftp:delete'],
      },
      {
        key: 'server:domains',
        actions: [
          'server:domains:list',
          'server:domains:add',
          'server:domains:remove',
          'server:domains:ssl',
          'server:domains:panel',
        ],
      },
    ],
  },
  {
    section: 'files',
    groups: [
      {
        key: 'files:read',
        actions: ['files:read:list', 'files:read:content', 'files:read:download', 'files:read:logs'],
      },
      {
        key: 'files:write',
        actions: ['files:write:edit', 'files:write:delete', 'files:write:mkdir', 'files:write:rename', 'files:write:upload'],
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
      { key: 'settings:general', actions: ['settings:general:read'] },
      { key: 'settings:environment', actions: ['settings:environment:read', 'settings:environment:write'] },
      {
        key: 'settings:firewall',
        actions: ['settings:firewall:list', 'settings:firewall:add', 'settings:firewall:remove', 'settings:firewall:toggle'],
      },
      { key: 'settings:sftp', actions: ['settings:sftp:read'] },
    ],
  },
];

/** All valid permissions: groups + actions + wildcard */
export const ALL_PERMISSIONS: Array<string> = [
  '*',
  ...PERMISSION_TREE.flatMap((section) => section.groups.flatMap((group) => [group.key, ...group.actions])),
];
