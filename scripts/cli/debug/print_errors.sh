#!/bin/bash
# Print recent ERROR / WARN entries from the systemd journal, redacted.
# Usage:
#   print_errors.sh [--since <duration>] [--count <n>]
#
# Defaults: --since 24h, --count 200

set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

since="24 hours ago"
count=200

while [[ $# -gt 0 ]]; do
    case "$1" in
        --since)
            # journalctl accepts: '1 hour ago', '2026-04-20', '2026-04-20 10:00:00'
            case "$2" in
                *h)   since="${2%h} hours ago" ;;
                *m)   since="${2%m} minutes ago" ;;
                *d)   since="${2%d} days ago" ;;
                *)    since="$2" ;;
            esac
            shift 2
            ;;
        --count)
            count="$2"
            shift 2
            ;;
        *)
            die "Unknown option: $1"
            ;;
    esac
done

echo ""
echo -e "  ${WHITE}Recent errors (since ${since}):${NC}"
echo ""

# Pull a wider slice, then filter. We match both plain-text ERROR/WARN tokens
# and pino numeric levels (40=warn, 50=error, 60=fatal).
journalctl -u "$SERVICE_NAME" --since "$since" -o short-iso --no-hostname --no-pager 2>/dev/null \
    | grep -E -i 'error|warn|fatal|"level":(40|50|60)' \
    | tail -n "$count" \
    | redact_stdin \
    | sed 's/^/  /'

echo ""
