#!/bin/bash
# Emit Nginx state and the shulkr site configuration.
# Usage:
#   collect_nginx.sh status     -> systemctl status nginx
#   collect_nginx.sh config     -> /etc/nginx/sites-available/shulkr

set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

mode="${1:-status}"

case "$mode" in
    status)
        if command -v systemctl >/dev/null 2>&1; then
            systemctl status nginx --no-pager 2>&1 || echo "NGINX_NOT_RUNNING_OR_NOT_INSTALLED"
        else
            echo "NGINX_NOT_INSTALLED"
        fi
        ;;
    config)
        local_config="/etc/nginx/sites-available/shulkr"
        if [[ -r "$local_config" ]]; then
            cat "$local_config"
        else
            echo "NGINX_CONFIG_NOT_FOUND: ${local_config}"
        fi
        ;;
    *)
        die "collect_nginx.sh: unknown mode '${mode}' (expected: status|config)"
        ;;
esac
