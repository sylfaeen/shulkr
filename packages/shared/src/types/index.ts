export type Permission = string;

export interface User {
  id: number;
  username: string;
  permissions: Array<string>;
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
  tps?: number;
  mspt?: number;
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
