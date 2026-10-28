#!/bin/bash

set -euo pipefail

if [[ -t 1 ]]; then
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m'
    WHITE='\033[1;37m' GRAY='\033[0;90m' NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' WHITE='' GRAY='' NC=''
fi

SHULKR_HOME="${SHULKR_HOME:-/opt/shulkr}"
SERVICE_NAME="shulkr"

echo ""
echo -e "  ${WHITE}Shulkr Status${NC}"
echo ""

if systemctl is-active --quiet "$SERVICE_NAME" 2>/dev/null; then
    uptime=$(systemctl show "$SERVICE_NAME" --property=ActiveEnterTimestamp --value 2>/dev/null)
    echo -e "  Service:  ${GREEN}● running${NC}"
    [[ -n "$uptime" ]] && echo -e "  Uptime:   ${WHITE}since ${uptime}${NC}"

    # An upgraded Node.js only reaches the panel at its next restart. A package install refreshes the binary's ctime, its mtime is the upstream build date.
    node_bin=$(readlink -f "$(command -v node || true)" 2>/dev/null || true)
    started=0
    [[ -n "$uptime" ]] && started=$(date -d "$uptime" +%s 2>/dev/null || echo 0)
    node_changed=$(stat -c %Z "$node_bin" 2>/dev/null || echo 0)
    if (( started > 0 && node_changed > started )); then
        echo -e "  Node.js:  ${YELLOW}$(node -v) installed, not running yet${NC} ${GRAY}(sudo shulkr restart)${NC}"
    fi
else
    echo -e "  Service:  ${RED}● stopped${NC}"
fi

port=$(grep -oP 'PORT=\K[0-9]+' "$SHULKR_HOME/app/.env" 2>/dev/null || echo "3001")
if ss -tlnp 2>/dev/null | grep -q ":${port} "; then
    echo -e "  Port:     ${GREEN}${port} (listening)${NC}"
else
    echo -e "  Port:     ${RED}${port} (not listening)${NC}"
fi

if systemctl is-active --quiet nginx 2>/dev/null; then
    echo -e "  Nginx:    ${GREEN}● running${NC}"
else
    echo -e "  Nginx:    ${RED}● stopped${NC}"
fi

# Unattended upgrades install kernel and core library fixes, only a reboot puts them in effect. RHEL-family reports it through needs-restarting when dnf-utils is installed.
if [[ -f /var/run/reboot-required ]] || { command -v needs-restarting &>/dev/null && ! needs-restarting -r &>/dev/null; }; then
    echo -e "  Reboot:   ${YELLOW}required to apply security updates${NC}"
fi

ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "your-server-ip")
echo ""
echo -e "  ${WHITE}Access:${NC}  http://${ip}"

if [[ -f /etc/nginx/sites-available/shulkr ]]; then
    domain=$(grep -oP 'server_name\s+\K[^;_\s]+' /etc/nginx/sites-available/shulkr 2>/dev/null | head -1)
    if [[ -n "$domain" ]]; then
        if [[ -f "/etc/letsencrypt/live/${domain}/fullchain.pem" ]]; then
            echo -e "  ${WHITE}HTTPS:${NC}   https://${domain} ${GREEN}(certificate active)${NC}"
        else
            echo -e "  ${WHITE}Domain:${NC}  http://${domain} ${YELLOW}(no HTTPS)${NC}"
        fi
    fi
fi
echo ""
