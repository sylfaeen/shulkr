#!/bin/bash
# Emit instance metadata to stdout.
# Hostname is anonymised. No secrets are read.

set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

echo "# Shulkr Debug — Meta"
echo "collected_at: $(date -u +%Y-%m-%dT%H:%M:%SZ)"

# Shulkr version
local_version="unknown"
if [[ -f "${APP_DIR}/package.json" ]]; then
    local_version=$(grep '"version"' "${APP_DIR}/package.json" 2>/dev/null | head -1 \
        | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/' || echo "unknown")
fi
echo "shulkr_version: ${local_version}"

# Runtimes
echo "node_version: $(node -v 2>/dev/null || echo 'not installed')"
echo "java_version: $(java -version 2>&1 | head -1 || echo 'not installed')"

# OS
if command -v lsb_release >/dev/null 2>&1; then
    echo "os: $(lsb_release -ds 2>/dev/null)"
else
    echo "os: $(uname -s -r)"
fi
echo "kernel: $(uname -r)"
echo "arch: $(uname -m)"

# Uptime
echo "uptime: $(uptime -p 2>/dev/null || uptime)"

# Hostname anonymised
echo "hostname: <host>"

# Paths (non-sensitive)
echo "shulkr_home: ${SHULKR_HOME}"
echo "app_dir: ${APP_DIR}"
echo "db_path: ${DB_PATH}"
echo "servers_base_path: ${SERVERS_BASE_PATH}"
