#!/bin/bash
# Print task_executions from the last 24h as an aligned table.
# Usage:
#   print_tasks.sh [--since <duration>]

set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_sqlite

since_sql="datetime('now','-24 hours')"
since_label="24 hours ago"

while [[ $# -gt 0 ]]; do
    case "$1" in
        --since)
            case "$2" in
                *h)   since_sql="datetime('now','-${2%h} hours')";   since_label="${2%h} hours ago" ;;
                *m)   since_sql="datetime('now','-${2%m} minutes')"; since_label="${2%m} minutes ago" ;;
                *d)   since_sql="datetime('now','-${2%d} days')";    since_label="${2%d} days ago" ;;
                *)    since_sql="datetime('$2')";                    since_label="$2" ;;
            esac
            shift 2
            ;;
        *)
            die "Unknown option: $1"
            ;;
    esac
done

if [[ ! -f "$DB_PATH" ]]; then
    die "Database not found at ${DB_PATH}"
fi

echo ""
echo -e "  ${WHITE}Task executions (since ${since_label}):${NC}"
echo ""

# Header + rows, aligned with `column`.
{
    printf 'STARTED_AT\tTASK_ID\tTYPE\tSERVER\tSTATUS\tDURATION\tERROR\n'
    sqlite3 -separator $'\t' "$DB_PATH" <<SQL 2>/dev/null
SELECT
    COALESCE(substr(e.started_at, 1, 19), '-'),
    e.task_id,
    COALESCE(t.type, '?'),
    COALESCE(substr(s.name, 1, 16), '?'),
    e.status,
    CASE WHEN e.duration_ms = 0 THEN '-'
         WHEN e.duration_ms < 1000 THEN e.duration_ms || 'ms'
         ELSE (e.duration_ms/1000) || 's' END,
    COALESCE(substr(REPLACE(REPLACE(e.error, CHAR(10), ' '), CHAR(9), ' '), 1, 60), '-')
FROM task_executions e
LEFT JOIN scheduled_tasks t ON t.id = e.task_id
LEFT JOIN servers s ON s.id = t.server_id
WHERE e.started_at >= ${since_sql}
ORDER BY e.started_at DESC
LIMIT 500;
SQL
} | redact_stdin \
  | column -t -s $'\t' \
  | sed 's/^/  /'

echo ""

# Summary counts
ok=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM task_executions WHERE status='success' AND started_at >= ${since_sql};" 2>/dev/null || echo 0)
err=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM task_executions WHERE status='error' AND started_at >= ${since_sql};" 2>/dev/null || echo 0)
run=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM task_executions WHERE status='running' AND started_at >= ${since_sql};" 2>/dev/null || echo 0)
skip=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM task_executions WHERE status='skipped' AND started_at >= ${since_sql};" 2>/dev/null || echo 0)

echo -e "  ${WHITE}Summary:${NC} ${GREEN}${ok} ok${NC}, ${RED}${err} failed${NC}, ${YELLOW}${run} running${NC}, ${GRAY}${skip} skipped${NC}"
echo ""
