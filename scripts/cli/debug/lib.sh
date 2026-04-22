#!/bin/bash
# Shared helpers for `shulkr debug` scripts.
# Sourced by do_debug.sh and each collect_*.sh / print_*.sh.

# Colors (only when stdout is a TTY)
if [[ -t 1 ]]; then
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m'
    CYAN='\033[0;36m' WHITE='\033[1;37m' GRAY='\033[0;90m' NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' CYAN='' WHITE='' GRAY='' NC=''
fi

SHULKR_HOME="${SHULKR_HOME:-/opt/shulkr}"
APP_DIR="${SHULKR_HOME}/app"
ENV_FILE="${APP_DIR}/.env"
SERVICE_NAME="shulkr"

# Resolve DATABASE_PATH from .env (falls back to default).
# Only reads the assignment — never exports secrets from .env.
resolve_db_path() {
    local default_path="${APP_DIR}/data/shulkr.db"
    if [[ -r "$ENV_FILE" ]]; then
        local v
        v=$(grep -E '^DATABASE_PATH=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"'"'"'')
        if [[ -n "$v" ]]; then
            echo "$v"
            return
        fi
    fi
    echo "$default_path"
}

resolve_servers_base_path() {
    local default_path="${SHULKR_HOME}/servers"
    if [[ -r "$ENV_FILE" ]]; then
        local v
        v=$(grep -E '^SERVERS_BASE_PATH=' "$ENV_FILE" 2>/dev/null | head -1 | cut -d'=' -f2- | tr -d '"'"'"'')
        if [[ -n "$v" ]]; then
            echo "$v"
            return
        fi
    fi
    echo "$default_path"
}

DB_PATH="$(resolve_db_path)"
SERVERS_BASE_PATH="$(resolve_servers_base_path)"
DEBUG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Abort with a clear message.
die() {
    echo -e "  ${RED}✗${NC} $*" >&2
    exit 1
}

# Run a collector step, printing a single line of feedback.
#   run_step "Label" command args...
# Never aborts the bundle — failures are logged to stderr.
run_step() {
    local label="$1"; shift
    if "$@"; then
        echo -e "  ${GREEN}✓${NC} ${label}"
    else
        echo -e "  ${RED}✗${NC} ${label} (collection failed)"
    fi
}

# Pipe stdin through redact.sh. Safe to call multiple times.
redact_stdin() {
    "${DEBUG_DIR}/redact.sh"
}

# Ensure sqlite3 binary is available.
require_sqlite() {
    command -v sqlite3 >/dev/null 2>&1 || die "sqlite3 is required (apt install sqlite3)"
}
