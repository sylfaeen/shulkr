#!/bin/bash
# Print information for a single server: metadata, tail of latest.log, crash reports list.
# Usage:
#   print_server.sh <id-or-name>

set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_sqlite

target="${1:-}"
if [[ -z "$target" ]]; then
    echo -e "  ${RED}✗${NC} Missing argument: ${CYAN}shulkr debug server <id-or-name>${NC}" >&2
    echo "" >&2
    echo "  Available servers:" >&2
    sqlite3 -separator ' | ' "$DB_PATH" "SELECT id, name FROM servers WHERE deleting = 0;" 2>/dev/null \
        | sed 's/^/    /' >&2
    exit 1
fi

if [[ ! -f "$DB_PATH" ]]; then
    die "Database not found at ${DB_PATH}"
fi

# Resolve target → single row. Accept id prefix or full name.
row=$(sqlite3 -separator $'\t' "$DB_PATH" \
    "SELECT id, name, path, min_ram, max_ram, java_port, auto_start \
     FROM servers \
     WHERE deleting = 0 AND (id = '${target}' OR name = '${target}' OR id LIKE '${target}%') \
     LIMIT 1;" 2>/dev/null)

if [[ -z "$row" ]]; then
    echo -e "  ${RED}✗${NC} No server matches '${target}'." >&2
    echo "" >&2
    echo "  Available servers:" >&2
    sqlite3 -separator ' | ' "$DB_PATH" "SELECT id, name FROM servers WHERE deleting = 0;" 2>/dev/null \
        | sed 's/^/    /' >&2
    exit 1
fi

IFS=$'\t' read -r id name path min_ram max_ram java_port auto_start <<< "$row"

echo ""
echo -e "  ${WHITE}Server:${NC} ${name} (${GRAY}${id}${NC})"
echo -e "    path:       ${path}"
echo -e "    ram:        ${min_ram} — ${max_ram}"
echo -e "    java_port:  ${java_port}"
echo -e "    auto_start: ${auto_start}"

# Process check
if pgrep -f "${id}" >/dev/null 2>&1; then
    echo -e "    process:    ${GREEN}● running${NC}"
else
    echo -e "    process:    ${GRAY}○ not running${NC}"
fi

# latest.log tail
log_file="${path}/logs/latest.log"
echo ""
if [[ -r "$log_file" ]]; then
    echo -e "  ${WHITE}latest.log (last 100 lines, redacted):${NC}"
    echo ""
    tail -n 100 "$log_file" | redact_stdin | sed 's/^/  /'
else
    echo -e "  ${YELLOW}No latest.log found at ${log_file}${NC}"
fi

# Crash reports
crash_dir="${path}/crash-reports"
echo ""
if [[ -d "$crash_dir" ]] && compgen -G "${crash_dir}/*.txt" > /dev/null; then
    echo -e "  ${WHITE}Crash reports:${NC}"
    # shellcheck disable=SC2012
    ls -lh "${crash_dir}"/*.txt 2>/dev/null \
        | awk '{printf "    %s  %s %s %s  %s\n", $9, $6, $7, $8, $5}' \
        | sed "s|${crash_dir}/||"
else
    echo -e "  ${GRAY}No crash reports.${NC}"
fi
echo ""
