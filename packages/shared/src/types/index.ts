export type Permission =
  | '*'
  | 'server:power'
  | 'server:console'
  | 'server:general'
  | 'server:backups'
  | 'server:tasks'
  | 'server:plugins'
  | 'server:jars'
  | 'server:jvm'
  | 'settings:firewall'
  | 'server:sftp'
  | 'server:domains'
  | 'files:read'
  | 'files:write'
  | 'users:manage'
  | 'settings:general'
  | 'settings:environment'
  | 'settings:sftp';

export interface User {
  id: number;
  username: string;
  permissions: Array<Permission>;
  locale: string | null;
  token_version: number;
  created_at: string;
  updated_at: string;
}

export interface Session {
  id: number;
  user_id: number;
  refresh_token: string;
  expires_at: string;
  created_at: string;
}

export interface ServerMetrics {
  cpu: number;
  cpu_raw: number;
  cpu_cores: number;
  memory: number;
  memory_total: number;
  memory_percent: number;
  uptime: number;
  timestamp: string;
}

export interface PlayerInfo {
  name: string;
  uuid: string | null;
  ip: string | null;
  joinedAt: number;
}

export interface PlayersUpdate {
  server_id: string;
  players: Array<string>;
  playerDetails: Array<PlayerInfo>;
  count: number;
  timestamp: string;
}
