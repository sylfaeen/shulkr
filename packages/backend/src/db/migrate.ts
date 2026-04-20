import { sqlite } from '@shulkr/backend/db';

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
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 1,
      first_at INTEGER NOT NULL,
      reset_at INTEGER NOT NULL
    )
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_rate_limits_reset_at ON rate_limits(reset_at);
  `);
  // Epic 35: Webhooks
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS webhooks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      url TEXT NOT NULL,
      format TEXT NOT NULL DEFAULT 'discord',
      events TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      webhook_id INTEGER NOT NULL REFERENCES webhooks(id) ON DELETE CASCADE,
      event TEXT NOT NULL,
      status TEXT NOT NULL,
      status_code INTEGER,
      request_payload TEXT,
      response_body TEXT,
      duration_ms INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_webhooks_server_id ON webhooks(server_id);
    CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_webhook_id ON webhook_deliveries(webhook_id);
  `);
  // Epic 36: Alerts
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS alert_rules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      metric TEXT NOT NULL,
      operator TEXT NOT NULL,
      threshold INTEGER NOT NULL,
      actions TEXT NOT NULL DEFAULT '[]',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS alert_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      alert_rule_id INTEGER NOT NULL REFERENCES alert_rules(id) ON DELETE CASCADE,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      metric TEXT NOT NULL,
      value INTEGER NOT NULL,
      threshold INTEGER NOT NULL,
      actions_taken TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_alert_rules_server_id ON alert_rules(server_id);
    CREATE INDEX IF NOT EXISTS idx_alert_events_server_id ON alert_events(server_id);
  `);
  // Epic 37: Notifications
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      link TEXT,
      read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON notifications(user_id);
    CREATE INDEX IF NOT EXISTS idx_notifications_user_read ON notifications(user_id, read);
  `);
  // Epic 43: GC Events
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS gc_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      gc_type TEXT NOT NULL,
      duration_ms REAL NOT NULL,
      heap_before_mb INTEGER,
      heap_after_mb INTEGER,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_gc_events_server_time ON gc_events(server_id, created_at);
  `);
  // Epic 47: Command History
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS command_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      command TEXT NOT NULL,
      use_count INTEGER NOT NULL DEFAULT 1,
      last_used_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  sqlite.exec(`
    CREATE INDEX IF NOT EXISTS idx_command_history_user_server ON command_history(user_id, server_id);
  `);
  // Epic 52: Cloud Backups — cloud_destinations
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS cloud_destinations (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      provider TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      region TEXT NOT NULL,
      bucket TEXT NOT NULL,
      access_key_id TEXT NOT NULL,
      secret_access_key_encrypted TEXT NOT NULL,
      prefix TEXT NOT NULL DEFAULT '',
      enabled INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Epic 52: backup_metadata (tracks local + cloud backups)
  sqlite.exec(`
    CREATE TABLE IF NOT EXISTS backup_metadata (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      server_id TEXT NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
      filename TEXT NOT NULL UNIQUE,
      size INTEGER NOT NULL DEFAULT 0,
      location TEXT NOT NULL DEFAULT 'local',
      local_path TEXT,
      cloud_destination_id TEXT REFERENCES cloud_destinations(id) ON DELETE SET NULL,
      cloud_key TEXT,
      cloud_checksum TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      cloud_uploaded_at TEXT
    )
  `);
  sqlite.exec(`CREATE INDEX IF NOT EXISTS idx_backup_metadata_server ON backup_metadata(server_id)`);
  // Epic 52: servers.backup_strategy column
  const serversColumnsForBackup = sqlite.prepare("SELECT name FROM pragma_table_info('servers')").all() as Array<{
    name: string;
  }>;
  const serversColumnsBackupSet = new Set(serversColumnsForBackup.map((c) => c.name));
  if (!serversColumnsBackupSet.has('backup_strategy')) {
    sqlite.exec(`ALTER TABLE servers ADD COLUMN backup_strategy TEXT`);
  }
  // Schema migrations: metrics_history TPS columns (Epic 42)
  const metricsColumns = sqlite.prepare("SELECT name FROM pragma_table_info('metrics_history')").all() as Array<{
    name: string;
  }>;
  const metricsColumnNames = new Set(metricsColumns.map((c) => c.name));
  if (!metricsColumnNames.has('tps')) {
    sqlite.exec(`ALTER TABLE metrics_history ADD COLUMN tps REAL`);
  }
  if (!metricsColumnNames.has('mspt')) {
    sqlite.exec(`ALTER TABLE metrics_history ADD COLUMN mspt REAL`);
  }
  // Schema migrations: task_executions output column (Epic 44)
  if (!taskExecColumnNames.has('output')) {
    sqlite.exec(`ALTER TABLE task_executions ADD COLUMN output TEXT`);
  }
  // Schema migrations: webhooks language + message_templates columns (Epic 35.6)
  const webhookColumns = sqlite.prepare("SELECT name FROM pragma_table_info('webhooks')").all() as Array<{
    name: string;
  }>;
  const webhookColumnNames = new Set(webhookColumns.map((c) => c.name));
  if (!webhookColumnNames.has('language')) {
    sqlite.exec(`ALTER TABLE webhooks ADD COLUMN language TEXT NOT NULL DEFAULT 'en'`);
  }
  if (!webhookColumnNames.has('message_templates')) {
    sqlite.exec(`ALTER TABLE webhooks ADD COLUMN message_templates TEXT`);
  }
  // Data migrations
  sqlite.exec(`UPDATE custom_domains SET type = 'connection' WHERE type = 'tcp'`);
  console.log('Database tables initialized');
}
