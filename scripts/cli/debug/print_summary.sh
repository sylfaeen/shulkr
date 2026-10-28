#!/bin/bash
# One-page overview of the shulkr instance.
# Usage:
#   print_summary.sh

set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

echo ""
echo -e "  ${WHITE}Shulkr Debug Summary${NC}"
echo ""

# ---- Service ---------------------------------------------------------------
if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    uptime=$(systemctl show "$SERVICE_NAME" --property=ActiveEnterTimestamp --value 2>/dev/null)
    echo -e "  Service:     ${GREEN}● running${NC} ${GRAY}(since ${uptime})${NC}"
else
    echo -e "  Service:     ${RED}● stopped${NC}"
fi

# ---- Port ------------------------------------------------------------------
port=$(grep -oP 'PORT=\K[0-9]+' "$ENV_FILE" 2>/dev/null || echo "3001")
if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
    echo -e "  Port:        ${GREEN}${port} (listening)${NC}"
else
    echo -e "  Port:        ${RED}${port} (not listening)${NC}"
fi

# ---- Nginx -----------------------------------------------------------------
if systemctl is-active --quiet nginx 2>/dev/null; then
    echo -e "  Nginx:       ${GREEN}● running${NC}"
else
    echo -e "  Nginx:       ${GRAY}● not running${NC}"
fi

# ---- DB --------------------------------------------------------------------
if [[ -f "$DB_PATH" ]]; then
    db_size=$(du -h "$DB_PATH" 2>/dev/null | cut -f1)
    echo -e "  DB:          ${DB_PATH} ${GRAY}(${db_size})${NC}"
else
    echo -e "  DB:          ${RED}not found at ${DB_PATH}${NC}"
    echo ""
    exit 0
fi

# ---- Servers ---------------------------------------------------------------
total_servers=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM servers WHERE deleting = 0;" 2>/dev/null || echo 0)
echo ""
echo -e "  ${WHITE}Servers:${NC}     ${total_servers} total"
sqlite3 -separator $'\t' "$DB_PATH" \
    "SELECT id, name FROM servers WHERE deleting = 0 ORDER BY name;" 2>/dev/null \
    | while IFS=$'\t' read -r id name; do
        [[ -z "$id" ]] && continue
        if pgrep -f "$id" >/dev/null 2>&1; then
            echo -e "    ${GREEN}●${NC} ${name} ${GRAY}(${id})${NC}"
        else
            echo -e "    ${GRAY}○${NC} ${name} ${GRAY}(${id})${NC}"
        fi
    done

# ---- Tasks (24h) -----------------------------------------------------------
total=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM task_executions WHERE started_at >= datetime('now','-24 hours');" 2>/dev/null || echo 0)
failed=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM task_executions WHERE status='error' AND started_at >= datetime('now','-24 hours');" 2>/dev/null || echo 0)
ok=$(sqlite3 "$DB_PATH" "SELECT COUNT(*) FROM task_executions WHERE status='success' AND started_at >= datetime('now','-24 hours');" 2>/dev/null || echo 0)
echo ""
echo -e "  ${WHITE}Tasks (24h):${NC} ${total} executions, ${GREEN}${ok} ok${NC}, ${RED}${failed} failed${NC}"

# ---- Recent errors (top 3) -------------------------------------------------
echo ""
echo -e "  ${WHITE}Recent errors (24h):${NC}"
err_lines=$(journalctl -u "$SERVICE_NAME" --since '24 hours ago' -o short-iso --no-hostname --no-pager 2>/dev/null \
    | grep -E -i 'error|fatal|"level":(50|60)' \
    | tail -n 3 \
    | redact_stdin)
if [[ -z "$err_lines" ]]; then
    echo -e "    ${GREEN}✓${NC} No errors in the last 24h"
else
    echo "$err_lines" | sed 's/^/    /'
fi

echo ""
echo -e "  ${GRAY}Run 'shulkr debug tasks', 'shulkr debug errors' or 'shulkr debug server <id>' for details.${NC}"
echo ""
