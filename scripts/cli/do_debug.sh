#!/bin/bash
# Entry point for `shulkr debug`.
# Dispatches between:
#   - bundle mode (no args): produce a tar.gz under /tmp
#   - sub-commands: summary, tasks, errors, server <id>, db, help
#
# Called from scripts/cli/cli.sh as:
#   sudo SHULKR_HOME=<path> bash do_debug.sh [subcommand] [args...]

set -uo pipefail

# shellcheck source=debug/lib.sh
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "${SCRIPT_DIR}/debug/lib.sh"

show_debug_help() {
    cat <<EOF

  ${WHITE}Shulkr Debug${NC}

  ${WHITE}Usage:${NC}
    ${CYAN}shulkr debug${NC}                Generate a diagnostic bundle (.tar.gz in /tmp)
    ${CYAN}shulkr debug summary${NC}        Show a one-page overview
    ${CYAN}shulkr debug tasks${NC}          Show task executions (last 24h)
    ${CYAN}shulkr debug errors${NC}         Show recent errors from the journal
    ${CYAN}shulkr debug server${NC} <id>    Show log and crash reports for a server
    ${CYAN}shulkr debug db${NC}             Show DB counts and detected anomalies
    ${CYAN}shulkr debug help${NC}           Show this help

  ${WHITE}Options:${NC}
    --since <duration>          Restrict time window (ex: 1h, 30m, 2026-04-20)

  ${GRAY}Secrets (.env, keys, password hashes, tokens) are never included in any output.${NC}

EOF
}

require_root() {
    if [[ $EUID -ne 0 ]]; then
        echo -e "  ${RED}✗${NC} Debug requires root — retry with: ${CYAN}sudo shulkr debug${NC}" >&2
        exit 1
    fi
}

run_bundle_mode() {
    require_root

    local ts build_dir out_root archive
    ts="$(date -u +%Y%m%d-%H%M%S)"
    build_dir="/tmp/shulkr-debug-build-${ts}"
    out_root="${build_dir}/shulkr-debug-${ts}"
    archive="/tmp/shulkr-debug-${ts}.tar.gz"

    # Always clean the temp build dir on exit.
    trap 'rm -rf "$build_dir"' EXIT

    mkdir -p "$out_root/systemd" "$out_root/nginx" "$out_root/db" "$out_root/servers"

    echo ""
    echo -e "  ${WHITE}Collecting diagnostic bundle...${NC}"
    echo ""

    run_step "Meta"                bash -c "'${DEBUG_DIR}/collect_meta.sh' > '${out_root}/meta.txt'"
    run_step "Systemd status"      bash -c "'${DEBUG_DIR}/collect_systemd.sh' status  > '${out_root}/systemd/status.txt'"
    run_step "Systemd journal"     bash -c "'${DEBUG_DIR}/collect_systemd.sh' journal > '${out_root}/systemd/journal.txt'"
    run_step "Nginx status"        bash -c "'${DEBUG_DIR}/collect_nginx.sh' status > '${out_root}/nginx/status.txt'"
    run_step "Nginx config"        bash -c "'${DEBUG_DIR}/collect_nginx.sh' config > '${out_root}/nginx/config.txt'"
    run_step "SQLite dump"         "${DEBUG_DIR}/collect_db.sh" "${out_root}/db"
    run_step "Server logs"         "${DEBUG_DIR}/collect_servers.sh" "${out_root}/servers"
    run_step "Disk usage"          bash -c "df -h > '${out_root}/disk.txt' 2>&1"

    # Manifest: one line per file, with size and line count for text files.
    (
        cd "$out_root"
        {
            echo "# Manifest — shulkr-debug-${ts}"
            echo "# format: <path>  <size>  <lines>"
            find . -type f ! -name MANIFEST.txt | sort | while read -r f; do
                size=$(du -h "$f" 2>/dev/null | cut -f1)
                case "$f" in
                    *.txt|*.csv|*.log|*.sql|*.conf)
                        lines=$(wc -l < "$f" 2>/dev/null | tr -d ' ')
                        ;;
                    *)  lines="-" ;;
                esac
                printf '%s  %s  %s\n' "$f" "$size" "$lines"
            done
        } > MANIFEST.txt
    )

    # Final anti-leak check before producing the archive.
    echo ""
    if ! "${DEBUG_DIR}/check_exclusions.sh" "$out_root"; then
        die "Sensitive patterns detected — archive discarded. Please report this to the maintainer."
    fi

    # Produce the archive.
    tar -czf "$archive" -C "$build_dir" "shulkr-debug-${ts}"
    chmod 600 "$archive"
    chown root:root "$archive" 2>/dev/null || true

    local size
    size=$(du -h "$archive" 2>/dev/null | cut -f1)
    echo ""
    echo -e "  ${WHITE}Bundle:${NC} ${archive} (${size})"
    echo -e "  ${GRAY}Send this file to the Shulkr maintainer.${NC}"
    echo ""
}

# ---- Dispatch --------------------------------------------------------------

case "${1:-}" in
    ""|bundle)
        run_bundle_mode
        ;;
    summary)    shift; "${DEBUG_DIR}/print_summary.sh" "$@" ;;
    tasks)      shift; "${DEBUG_DIR}/print_tasks.sh"   "$@" ;;
    errors)     shift; "${DEBUG_DIR}/print_errors.sh"  "$@" ;;
    server)     shift; "${DEBUG_DIR}/print_server.sh"  "$@" ;;
    db)         shift; "${DEBUG_DIR}/print_db.sh"      "$@" ;;
    help|-h|--help) show_debug_help ;;
    *)
        echo -e "  ${RED}Unknown debug subcommand:${NC} $1" >&2
        show_debug_help
        exit 1
        ;;
esac
