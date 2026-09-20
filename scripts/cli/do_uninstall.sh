#!/bin/bash

set -euo pipefail

# Colors

if [[ -t 1 ]]; then
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m'
    WHITE='\033[1;37m' GRAY='\033[0;90m' NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' WHITE='' GRAY='' NC=''
fi

SHULKR_HOME="${SHULKR_HOME:-/opt/shulkr}"

fail() {
    echo ""
    echo -e "  ${RED}✗ ERROR:${NC} $1"
    echo ""
    exit 1
}

if [[ $EUID -ne 0 ]] || [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
    fail "This script must be run as root (not via sudo). Log in as root first: su -"
fi

# Confirmation

echo ""
echo -e "  ${RED}⚠  UNINSTALL SHULKR${NC}"
echo ""
echo -e "  ${RED}This will permanently remove:${NC}"
echo -e "    ${RED}✗${NC} Shulkr application       ${WHITE}${SHULKR_HOME}/app${NC}"
echo -e "    ${RED}✗${NC} All Minecraft servers      ${WHITE}${SHULKR_HOME}/servers${NC}"
echo -e "    ${RED}✗${NC} All backups                ${WHITE}${SHULKR_HOME}/backups${NC}"
echo -e "    ${RED}✗${NC} Database, config, systemd service, Nginx site, CLI, user"
echo ""
echo -e "  ${GREEN}Packages will NOT be removed:${NC} Node.js, pnpm, Java, Nginx, Certbot"
echo ""
read -p "   Type 'DELETE' to confirm uninstall: " CONFIRM < /dev/tty
[[ "$CONFIRM" == "DELETE" ]] || { echo -e "\n  ${WHITE}Cancelled.${NC}\n"; exit 0; }

echo ""

# Stop Minecraft servers

java_pids=$(pgrep -f "java.*-jar.*${SHULKR_HOME}/servers" 2>/dev/null || true)
if [[ -n "$java_pids" ]]; then
    echo "$java_pids" | xargs kill 2>/dev/null || true
    sleep 2
    echo "$java_pids" | xargs kill -9 2>/dev/null || true
fi
echo -e "  ${GREEN}✓${NC} Servers stopped"

# Systemd

sudo systemctl stop shulkr 2>/dev/null || true
sudo systemctl disable shulkr 2>/dev/null || true
sudo rm -f /etc/systemd/system/shulkr.service
sudo systemctl daemon-reload 2>/dev/null || true
echo -e "  ${GREEN}✓${NC} Systemd service removed"

# Read shulkr-managed domains from DB before cleanup

db_path="${SHULKR_HOME}/app/data/shulkr.db"
managed_domains=""
if command -v sqlite3 &>/dev/null && [[ -f "$db_path" ]]; then
    managed_domains=$(sqlite3 "$db_path" "SELECT domain FROM custom_domains;" 2>/dev/null || true)
fi

# SSL certificates (only shulkr-managed)

if command -v certbot &>/dev/null && [[ -n "$managed_domains" ]]; then
    while IFS= read -r domain; do
        [[ -z "$domain" ]] && continue
        if [[ -d "/etc/letsencrypt/live/${domain}" ]]; then
            sudo certbot delete --cert-name "$domain" --non-interactive 2>/dev/null || true
        fi
    done <<< "$managed_domains"
    echo -e "  ${GREEN}✓${NC} SSL certificates removed"
fi

# Nginx (only shulkr vhost + managed domain vhosts)

sudo rm -f /etc/nginx/sites-enabled/shulkr /etc/nginx/sites-available/shulkr
sudo rm -f /etc/nginx/sites-enabled/shulkr-fallback /etc/nginx/sites-available/shulkr-fallback
if [[ -n "$managed_domains" ]]; then
    while IFS= read -r domain; do
        [[ -z "$domain" ]] && continue
        sudo rm -f "/etc/nginx/sites-enabled/${domain}" "/etc/nginx/sites-available/${domain}"
        sudo rm -f "/etc/nginx/streams-enabled/${domain}" "/etc/nginx/streams-available/${domain}" 2>/dev/null || true
    done <<< "$managed_domains"
fi

if [[ -d "/etc/nginx/streams-available" ]] && [[ -z "$(ls -A /etc/nginx/streams-available 2>/dev/null)" ]]; then
    sudo rm -rf /etc/nginx/streams-available /etc/nginx/streams-enabled
    sudo sed -i '/^stream {/,/^}/d' /etc/nginx/nginx.conf 2>/dev/null || true
fi
if systemctl is-active --quiet nginx 2>/dev/null; then
    sudo nginx -t 2>/dev/null && sudo systemctl reload nginx 2>/dev/null
fi
echo -e "  ${GREEN}✓${NC} Nginx configuration removed"

# Sudoers

sudo rm -f /etc/sudoers.d/shulkr
echo -e "  ${GREEN}✓${NC} Sudoers removed"

# Files

sudo rm -rf "$SHULKR_HOME"
echo -e "  ${GREEN}✓${NC} ${SHULKR_HOME} removed"

# User

if id "shulkr" &>/dev/null; then
    sudo userdel "shulkr" 2>/dev/null || true
    echo -e "  ${GREEN}✓${NC} User 'shulkr' removed"
fi

echo ""
echo -e "  ${GREEN}✓ Shulkr has been completely uninstalled.${NC}"
echo ""

# Remove CLI last (we're running from it)
sudo rm -f /usr/local/bin/shulkr
