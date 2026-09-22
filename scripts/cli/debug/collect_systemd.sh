#!/bin/bash
# Emit systemd state for the shulkr service.
# Usage:
#   collect_systemd.sh status              -> prints `systemctl status`
#   collect_systemd.sh journal [lines]     -> prints journalctl output (default 2000 lines), redacted

set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

mode="${1:-status}"

case "$mode" in
    status)
        systemctl status "$SERVICE_NAME" --no-pager 2>&1 || true
        echo ""
        echo "# is-enabled:"
        systemctl is-enabled "$SERVICE_NAME" 2>&1 || true
        ;;
    journal)
        lines="${2:-2000}"
        journalctl -u "$SERVICE_NAME" -n "$lines" --no-hostname -o short-iso --no-pager 2>&1 \
            | redact_stdin
        ;;
    *)
        die "collect_systemd.sh: unknown mode '${mode}' (expected: status|journal)"
        ;;
esac
