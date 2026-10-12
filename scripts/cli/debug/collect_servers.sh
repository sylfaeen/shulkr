#!/bin/bash
# Copy each server's latest.log (tail) and crash reports into <outDir>.
# Logs are redacted. Crash reports are copied as-is (no secrets).
#
# Usage:
#   collect_servers.sh <outDir>

set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"
require_sqlite

out_dir="${1:?usage: collect_servers.sh <outDir>}"
mkdir -p "$out_dir"

if [[ ! -f "$DB_PATH" ]]; then
    echo "DB_NOT_FOUND" > "${out_dir}/NO_DB"
    exit 0
fi

# Read server ids from DB. Only id + name + path (path is already non-secret).
sqlite3 -separator $'\t' "$DB_PATH" \
    "SELECT id, name, path FROM servers WHERE deleting = 0;" 2>/dev/null \
    | while IFS=$'\t' read -r id name path; do
        [[ -z "$id" ]] && continue
        server_dir="${out_dir}/${id}"
        mkdir -p "$server_dir"

        # latest.log (redacted)
        log_file="${path}/logs/latest.log"
        if [[ -r "$log_file" ]]; then
            tail -n 500 "$log_file" | redact_stdin > "${server_dir}/latest.log"
        else
            echo "NO_LOG: ${log_file}" > "${server_dir}/NO_LOG"
        fi

        # crash reports (all — no secrets in Minecraft crash reports)
        crash_dir="${path}/crash-reports"
        if [[ -d "$crash_dir" ]]; then
            mkdir -p "${server_dir}/crash-reports"
            # Only .txt files; skip if dir empty
            if compgen -G "${crash_dir}/*.txt" > /dev/null; then
                cp -p "${crash_dir}"/*.txt "${server_dir}/crash-reports/" 2>/dev/null || true
            fi
        fi

        # A small metadata file per server (non-secret only)
        {
            echo "id: ${id}"
            echo "name: ${name}"
            echo "path: ${path}"
        } > "${server_dir}/info.txt"
    done
