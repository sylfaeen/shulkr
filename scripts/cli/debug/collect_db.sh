#!/bin/bash
# Dump selected SQLite tables as CSV files + schema + row counts.
# Only whitelisted columns are exported — sensitive fields (password hashes,
# tokens, encrypted keys, webhook URLs) are NEVER read.
#
# Usage:
#   collect_db.sh <outDir>

set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_sqlite

out_dir="${1:?usage: collect_db.sh <outDir>}"
mkdir -p "$out_dir"

if [[ ! -f "$DB_PATH" ]]; then
    echo "DB_NOT_FOUND: ${DB_PATH}" > "${out_dir}/NO_DB"
    exit 0
fi

# ---- Column whitelists -----------------------------------------------------
# Any new table field that might carry secrets MUST be kept out of this list.
# Excluded by design: users (password_hash), sessions, user_totp,
# sftp_accounts, cloud_destinations (access keys), webhooks (urls),
# recovery_codes, scheduled_tasks.config (may contain webhook URLs or raw
# commands with tokens).

SERVERS_COLS='id,name,min_ram,max_ram,java_port,auto_start,auto_restart_on_crash,deleting,max_backups,created_at,updated_at'
TASKS_COLS='id,server_id,name,type,cron_expression,enabled,last_run,next_run,created_at,updated_at'
EXECS_COLS='id,task_id,status,duration_ms,started_at,retry_count,max_retries,created_at'

# ---- Schema ----------------------------------------------------------------
sqlite3 "$DB_PATH" '.schema' > "${out_dir}/schema.sql" 2>/dev/null || \
    echo "SCHEMA_DUMP_FAILED" > "${out_dir}/schema.sql"

# ---- Row counts ------------------------------------------------------------
{
    echo "# Row counts per table"
    sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" 2>/dev/null \
        | while read -r table; do
            [[ -z "$table" ]] && continue
            count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM \"${table}\";" 2>/dev/null || echo "?")
            printf "%-30s %s\n" "$table" "$count"
        done
} > "${out_dir}/counts.txt"

# ---- CSV dumps (whitelisted columns only) ----------------------------------
dump_csv() {
    local table="$1" cols="$2" where="${3:-}" outfile="$4"
    local sql="SELECT ${cols} FROM ${table}"
    [[ -n "$where" ]] && sql="${sql} WHERE ${where}"
    sql="${sql};"
    {
        echo "$cols"
        sqlite3 -csv "$DB_PATH" "$sql" 2>/dev/null || true
    } | redact_stdin > "$outfile"
}

dump_csv 'servers' "$SERVERS_COLS" '' "${out_dir}/servers.csv"
dump_csv 'scheduled_tasks' "$TASKS_COLS" '' "${out_dir}/scheduled_tasks.csv"
dump_csv 'task_executions' "$EXECS_COLS" \
    "started_at >= datetime('now','-24 hours')" \
    "${out_dir}/task_executions.csv"

# ---- Executions error messages (truncated, redacted) -----------------------
# The full `error` field is kept but capped at 500 chars per row to avoid
# runaway stack traces. Redacted via stdin pipeline.
{
    echo "id,task_id,status,started_at,error"
    sqlite3 -csv "$DB_PATH" \
        "SELECT id, task_id, status, started_at, substr(COALESCE(error,''), 1, 500) \
         FROM task_executions \
         WHERE started_at >= datetime('now','-24 hours') \
           AND (status = 'error' OR error IS NOT NULL) \
         ORDER BY started_at DESC;" 2>/dev/null || true
} | redact_stdin > "${out_dir}/task_execution_errors.csv"
