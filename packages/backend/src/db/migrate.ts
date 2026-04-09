import { sqlite } from './index';

export async function initializeDatabase(): Promise<void> {
  console.log('Initializing database...');

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT '[]',
      locale TEXT,
      token_version INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      refresh_token TEXT NOT NULL UNIQUE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS servers (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      path TEXT NOT NULL,
      jar_file TEXT,
      min_ram TEXT NOT NULL DEFAULT '1G',
      max_ram TEXT NOT NULL DEFAULT '2G',
      jvm_flags TEXT NOT NULL DEFAULT '',
      java_port INTEGER NOT NULL DEFAULT 25565,
      java_path TEXT,
      auto_start INTEGER NOT NULL DEFAULT 0,
      deleting INTEGER NOT NULL DEFAULT 0,
      max_backups INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS scheduled_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      cron_expression TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      config TEXT,
      last_run TEXT,
      next_run TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS firewall_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      port INTEGER NOT NULL,
      protocol TEXT NOT NULL,
      label TEXT NOT NULL,
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS user_totp (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
      encrypted_secret TEXT NOT NULL,
      verified INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS recovery_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code_hash TEXT NOT NULL,
      used_at TEXT
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS task_executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      task_id INTEGER NOT NULL REFERENCES scheduled_tasks(id) ON DELETE CASCADE,
      status TEXT NOT NULL,
      duration_ms INTEGER NOT NULL,
      error TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS custom_domains (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT REFERENCES servers(id) ON DELETE CASCADE,
      domain TEXT NOT NULL UNIQUE,
      port INTEGER NOT NULL,
      type TEXT NOT NULL DEFAULT 'http',
      ssl_enabled INTEGER NOT NULL DEFAULT 0,
      ssl_expires_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS sftp_accounts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      username TEXT NOT NULL,
      password TEXT NOT NULL,
      permissions TEXT NOT NULL DEFAULT 'read-write',
      allowed_paths TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      username TEXT,
      action TEXT NOT NULL,
      resource_type TEXT NOT NULL,
      resource_id TEXT,
      details TEXT,
      ip TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_refresh_token ON sessions(refresh_token);
    CREATE INDEX IF NOT EXISTS idx_scheduled_tasks_server_id ON scheduled_tasks(server_id);
    CREATE INDEX IF NOT EXISTS idx_user_totp_user_id ON user_totp(user_id);
    CREATE INDEX IF NOT EXISTS idx_recovery_codes_user_id ON recovery_codes(user_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_java_port ON servers(java_port);
    CREATE INDEX IF NOT EXISTS idx_task_executions_task_id ON task_executions(task_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at);
    CREATE INDEX IF NOT EXISTS idx_custom_domains_server_id ON custom_domains(server_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_custom_domains_domain ON custom_domains(domain);
    CREATE INDEX IF NOT EXISTS idx_sftp_accounts_server_id ON sftp_accounts(server_id);
    CREATE UNIQUE INDEX IF NOT EXISTS idx_sftp_accounts_username ON sftp_accounts(username);
    CREATE INDEX IF NOT EXISTS idx_audit_logs_resource ON audit_logs(resource_type, resource_id);
  `);

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS metrics_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      cpu REAL NOT NULL,
      memory INTEGER NOT NULL,
      memory_percent REAL NOT NULL,
      player_count INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_metrics_history_server_time ON metrics_history(server_id, created_at);
  `);

  // Schema migrations: task_executions job queue columns
  const taskExecColumns = sqlite.prepare("SELECT name FROM pragma_table_info('task_executions')").all() as Array<{
    name: string;
  }>;
  const taskExecColumnNames = new Set(taskExecColumns.map((c) => c.name));

  if (!taskExecColumnNames.has('started_at')) {
    sqlite.exec(`ALTER TABLE task_executions ADD COLUMN started_at TEXT`);
  }
  if (!taskExecColumnNames.has('retry_count')) {
    sqlite.exec(`ALTER TABLE task_executions ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0`);
  }
  if (!taskExecColumnNames.has('max_retries')) {
    sqlite.exec(`ALTER TABLE task_executions ADD COLUMN max_retries INTEGER NOT NULL DEFAULT 0`);
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS player_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      player_name TEXT NOT NULL,
      player_uuid TEXT,
      ip_address TEXT,
      joined_at TEXT NOT NULL,
      left_at TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_player_sessions_server_time ON player_sessions(server_id, joined_at);
    CREATE INDEX IF NOT EXISTS idx_player_sessions_name ON player_sessions(player_name);
  `);

  // Schema migrations: servers auto_restart_on_crash column
  const serverColumns = sqlite.prepare("SELECT name FROM pragma_table_info('servers')").all() as Array<{ name: string }>;
  const serverColumnNames = new Set(serverColumns.map((c) => c.name));

  if (!serverColumnNames.has('auto_restart_on_crash')) {
    sqlite.exec(`ALTER TABLE servers ADD COLUMN auto_restart_on_crash INTEGER NOT NULL DEFAULT 0`);
  }

  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS backup_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      snapshot_data TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);

  sqlite.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_backup_snapshots_server ON backup_snapshots(server_id);
  `);

  // Data migrations
  sqlite.exec(`UPDATE custom_domains SET type = 'connection' WHERE type = 'tcp'`);

  console.log('Database tables initialized');
}
