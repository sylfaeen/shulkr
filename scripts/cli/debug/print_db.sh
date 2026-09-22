#!/bin/bash
# Print DB row counts, schema presence, and detected anomalies.
# Usage:
#   print_db.sh

set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_sqlite

if [[ ! -f "$DB_PATH" ]]; then
    die "Database not found at ${DB_PATH}"
fi

db_size=$(du -h "$DB_PATH" 2>/dev/null | cut -f1)

echo ""
echo -e "  ${WHITE}Database:${NC} ${DB_PATH} (${db_size})"
echo ""
echo -e "  ${WHITE}Row counts:${NC}"
sqlite3 "$DB_PATH" "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name;" 2>/dev/null \
    | while read -r table; do
        [[ -z "$table" ]] && continue
        count=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM \"${table}\";" 2>/dev/null || echo '?')
        printf "    %-30s %s\n" "$table" "$count"
    done

echo ""
echo -e "  ${WHITE}Anomalies:${NC}"

had_anomaly=0

# 1. Scheduled tasks pointing at non-existent servers
orphans=$(sqlite3 "$DB_PATH" \
    "SELECT COUNT(*) FROM scheduled_tasks t \
     LEFT JOIN servers s ON s.id = t.server_id \
     WHERE s.id IS NULL;" 2>/dev/null || echo 0)
if [[ "$orphans" -gt 0 ]]; then
    had_anomaly=1
    echo -e "    ${RED}✗${NC} ${orphans} scheduled_tasks reference a missing server"
    sqlite3 -separator ' | ' "$DB_PATH" \
        "SELECT t.id, t.name, t.server_id FROM scheduled_tasks t \
         LEFT JOIN servers s ON s.id = t.server_id \
         WHERE s.id IS NULL LIMIT 10;" 2>/dev/null | sed 's/^/        /'
fi

# 2. Executions stuck in 'running' for more than 1h
stuck=$(sqlite3 "$DB_PATH" \
    "SELECT COUNT(*) FROM task_executions \
     WHERE status = 'running' \
       AND started_at < datetime('now','-1 hour');" 2>/dev/null || echo 0)
if [[ "$stuck" -gt 0 ]]; then
    had_anomaly=1
    echo -e "    ${RED}✗${NC} ${stuck} task_executions stuck in 'running' >1h"
    sqlite3 -separator ' | ' "$DB_PATH" \
        "SELECT id, task_id, started_at FROM task_executions \
         WHERE status = 'running' \
           AND started_at < datetime('now','-1 hour') LIMIT 10;" 2>/dev/null | sed 's/^/        /'
fi

# 3. Deleting servers older than 1h (stuck deletion)
zombie=$(sqlite3 "$DB_PATH" \
    "SELECT COUNT(*) FROM servers \
     WHERE deleting = 1 \
       AND updated_at < datetime('now','-1 hour');" 2>/dev/null || echo 0)
if [[ "$zombie" -gt 0 ]]; then
    had_anomaly=1
    echo -e "    ${RED}✗${NC} ${zombie} servers stuck in 'deleting' >1h"
fi

# 4. Servers in DB but path does not exist on disk
missing_paths=0
while IFS=$'\t' read -r id path; do
    [[ -z "$id" ]] && continue
    if [[ ! -d "$path" ]]; then
        missing_paths=$((missing_paths + 1))
        had_anomaly=1
        echo -e "    ${RED}✗${NC} Server ${id} path missing on disk: ${path}"
    fi
done < <(sqlite3 -separator $'\t' "$DB_PATH" \
    "SELECT id, path FROM servers WHERE deleting = 0;" 2>/dev/null)

if [[ "$had_anomaly" -eq 0 ]]; then
    echo -e "    ${GREEN}✓${NC} No anomalies detected"
fi
echo ""
