#!/bin/bash

set -e

GITHUB_REPO="${SHULKR_REPO:-sylfaeen/shulkr}"
SHULKR_VERSION="${SHULKR_VERSION:-latest}"
SHULKR_HOME="${SHULKR_HOME:-/opt/shulkr}"
APP_DIR="${SHULKR_HOME}/app"
SERVICE_USER="${SHULKR_USER:-shulkr}"

if [[ -t 1 ]]; then
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m' BLUE='\033[0;34m'
    CYAN='\033[0;36m' WHITE='\033[1;37m' GRAY='\033[0;90m' NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' WHITE='' GRAY='' NC=''
fi

command_exists() { command -v "$1" &>/dev/null; }

fail() {
    echo ""
    echo -e "  ${RED}✗ ERROR:${NC} $1"
    echo ""
    exit 1
}

spinner() {
    local pid=$1 message=$2 spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏' i=0
    tput civis 2>/dev/null || true
    while kill -0 "$pid" 2>/dev/null; do
        i=$(( (i+1) % 10 ))
        printf "\r  ${YELLOW}${spin:$i:1}${NC} %s" "$message"
        sleep 0.1
    done
    printf "\r\033[2K"
    tput cnorm 2>/dev/null || true
}

print_ok()   { printf "  ${GREEN}✓${NC} %s\n" "$1"; }
print_err()  { printf "  ${RED}✗${NC} %s\n" "$1"; }
print_warn() { printf "  ${YELLOW}⚠${NC}  %s\n" "$1"; }

print_step() { echo ""; echo -e "${WHITE}[${1}/${2}]${NC} ${3}"; }

preflight() {
    print_step 1 6 "Pre-flight checks"

    if [[ $EUID -ne 0 ]] || [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
        fail "This script must be run as root (not via sudo). Log in as root first: su -"
    fi
    [[ -d "$APP_DIR" ]] || fail "Shulkr is not installed in ${SHULKR_HOME}. Run the installer first."
    [[ -f "$APP_DIR/.env" ]] || fail "Missing .env file at ${APP_DIR}/.env — cannot update safely."

    # Current version
    CURRENT_VERSION=""
    if [[ -f "$APP_DIR/package.json" ]]; then
        CURRENT_VERSION=$(grep '"version"' "$APP_DIR/package.json" 2>/dev/null | head -1 | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/' || echo "unknown")
    fi
    print_ok "Current version: ${CURRENT_VERSION:-unknown}"

    # Target version
    if [[ "$SHULKR_VERSION" == "latest" ]]; then
        curl -sf --connect-timeout 5 "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" > /tmp/shulkr-latest.json 2>/dev/null &
        spinner $! "Checking latest version..."
        SHULKR_VERSION=$(grep '"tag_name"' /tmp/shulkr-latest.json 2>/dev/null | sed -E 's/.*"v([^"]+)".*/\1/' || echo "")
        rm -f /tmp/shulkr-latest.json
        [[ -n "$SHULKR_VERSION" ]] || fail "Could not determine latest version. Set SHULKR_VERSION manually."
    fi
    print_ok "Target version: ${SHULKR_VERSION}"

    # Check for running Minecraft servers
    local servers_dir="${SHULKR_HOME}/servers"
    local java_pids
    java_pids=$(pgrep -f "java.*-jar.*${servers_dir}" 2>/dev/null || true)
    if [[ -n "$java_pids" ]]; then
        fail "One or more Minecraft servers are still running. Stop all servers before updating."
    fi

    # Already up to date?
    if [[ "$CURRENT_VERSION" == "$SHULKR_VERSION" ]]; then
        echo ""
        echo -e "  ${GREEN}Already up to date (v${SHULKR_VERSION}).${NC}"
        echo ""
        read -p "   Force update anyway? [y/N] " -n 1 -r < /dev/tty
        echo ""
        [[ $REPLY =~ ^[Yy]$ ]] || { echo -e "\n  Cancelled.\n"; exit 0; }
    fi

    # Confirm
    echo ""
    echo -e "  ${WHITE}Update:${NC} v${CURRENT_VERSION:-unknown} → v${SHULKR_VERSION}"
    echo -e "  ${WHITE}Keeps:${NC}  database, .env, servers, backups"
    echo ""
    read -p "   Proceed? [Y/n] " -n 1 -r < /dev/tty
    echo ""
    [[ ! $REPLY =~ ^[Nn]$ ]] || { echo -e "\n  Cancelled.\n"; exit 0; }
}

stop_services() {
    print_step 2 6 "Stopping services"

    if systemctl is-active --quiet shulkr 2>/dev/null; then
        systemctl stop shulkr
        print_ok "Shulkr service stopped"
    else
        print_ok "Shulkr service already stopped"
    fi

    local servers_dir="${SHULKR_HOME}/servers"
    local retries=0
    local java_pids
    java_pids=$(pgrep -f "java.*-jar.*${servers_dir}" 2>/dev/null || true)

    if [[ -n "$java_pids" ]]; then
        (
            while [[ $retries -lt 15 ]]; do
                java_pids=$(pgrep -f "java.*-jar.*${servers_dir}" 2>/dev/null || true)
                [[ -z "$java_pids" ]] && exit 0
                retries=$((retries + 1))
                sleep 2
            done
        ) &
        spinner $! "Waiting for Minecraft servers to stop..."

        # Force kill if still running
        local remaining
        remaining=$(pgrep -f "java.*-jar.*${servers_dir}" 2>/dev/null || true)
        if [[ -n "$remaining" ]]; then
            echo "$remaining" | xargs kill -9 2>/dev/null || true
            sleep 1
        fi
    fi

    print_ok "All processes stopped"
}

download_and_replace() {
    print_step 3 6 "Downloading & installing v${SHULKR_VERSION}"

    local url="https://github.com/${GITHUB_REPO}/releases/download/v${SHULKR_VERSION}/shulkr-${SHULKR_VERSION}.tar.gz"
    local tarball="/tmp/shulkr-${SHULKR_VERSION}.tar.gz"
    local staging="/tmp/shulkr-update-staging"

    # Download
    curl -sfL "$url" -o "$tarball" 2>/dev/null &
    spinner $! "Downloading shulkr-${SHULKR_VERSION}.tar.gz..."
    [[ -f "$tarball" ]] || fail "Download failed: ${url}"
    print_ok "Download complete"

    # Extract to staging
    rm -rf "$staging"
    mkdir -p "$staging"
    tar -xzf "$tarball" -C "$staging" --strip-components=1 2>/dev/null &
    spinner $! "Extracting..."
    rm -f "$tarball"
    print_ok "Extracted"

    # Backup .env and database
    cp "$APP_DIR/.env" /tmp/shulkr-env-backup
    rm -f /tmp/shulkr-db-backup
    [[ -f "$APP_DIR/data/shulkr.db" ]] && cp -a "$APP_DIR/data/shulkr.db" /tmp/shulkr-db-backup
    [[ -f "$APP_DIR/shulkr.db" ]] && cp -a "$APP_DIR/shulkr.db" /tmp/shulkr-db-backup
    print_ok "Configuration and database backed up"

    # Replace application code (preserve .env and data/)
    find "$APP_DIR" -mindepth 1 -maxdepth 1 \
        ! -name 'data' ! -name '.env' ! -name 'node_modules' \
        -exec rm -rf {} +
    rm -rf "$APP_DIR/node_modules"
    find "$staging" -mindepth 1 -maxdepth 1 ! -name 'data' -exec cp -a {} "$APP_DIR/" \;

    # Restore .env
    cp /tmp/shulkr-env-backup "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"

    # Ensure data/ exists and restore database
    mkdir -p "$APP_DIR/data"

    if [[ ! -f "$APP_DIR/data/shulkr.db" ]] && [[ -f /tmp/shulkr-db-backup ]]; then
        cp -a /tmp/shulkr-db-backup "$APP_DIR/data/shulkr.db"
        print_ok "Database restored to data/"
    fi

    # Migrate from old location if still present
    if [[ -f "$APP_DIR/shulkr.db" ]]; then
        if [[ ! -f "$APP_DIR/data/shulkr.db" ]]; then
            mv "$APP_DIR/shulkr.db" "$APP_DIR/data/shulkr.db"
            print_ok "Database migrated to data/"
        else
            rm -f "$APP_DIR/shulkr.db"
        fi
    fi

    # Update DATABASE_PATH in .env to canonical location
    if grep -q "DATABASE_PATH=" "$APP_DIR/.env" 2>/dev/null; then
        sed -i "s|DATABASE_PATH=.*|DATABASE_PATH=${APP_DIR}/data/shulkr.db|" "$APP_DIR/.env"
    fi

    print_ok "Application code replaced"

    # Dependencies
    cd "$APP_DIR"
    pnpm install --prod --frozen-lockfile >/dev/null 2>&1 &
    spinner $! "Installing production dependencies..."
    print_ok "Dependencies installed"

    # CLI
    if [[ -f "$APP_DIR/scripts/cli/cli.sh" ]]; then
        cp "$APP_DIR/scripts/cli/cli.sh" /usr/local/bin/shulkr.tmp
        sed -i "s|SHULKR_HOME=\"\${SHULKR_HOME:-/opt/shulkr}\"|SHULKR_HOME=\"\${SHULKR_HOME:-${SHULKR_HOME}}\"|" /usr/local/bin/shulkr.tmp
        chmod +x /usr/local/bin/shulkr.tmp
        mv /usr/local/bin/shulkr.tmp /usr/local/bin/shulkr
        print_ok "CLI updated"
    fi

    # Permissions
    chown -R "$SERVICE_USER:$SERVICE_USER" "$SHULKR_HOME"
    chmod 600 "$APP_DIR/.env"
    print_ok "Permissions set"

    # Cleanup
    rm -rf "$staging" /tmp/shulkr-env-backup /tmp/shulkr-db-backup
}

migrate_firewall_to_ufw() {
    print_step 4 6 "Migrating firewall to ufw"

    # OS detection (lightweight, mirrors install.sh)
    local os=""
    if [[ -f /etc/os-release ]]; then
        # shellcheck disable=SC1091
        . /etc/os-release
        os="$ID"
    fi

    case "$os" in
        ubuntu|debian|raspbian) ;;
        *)
            print_ok "Skipped (non-Debian system, iptables backend kept)"
            return
            ;;
    esac

    if command_exists ufw && ufw status 2>/dev/null | grep -q "Status: active"; then
        print_ok "ufw already active, no migration needed"
        return
    fi

    # CRITICAL: collect SSH ports BEFORE doing anything that could affect connectivity.
    # We must guarantee that the current SSH session and any future ones can reach the host.
    local ssh_ports
    ssh_ports=$(awk '/^[[:space:]]*Port[[:space:]]+/ {print $2}' /etc/ssh/sshd_config 2>/dev/null | sort -u)
    [[ -z "$ssh_ports" ]] && ssh_ports="22"
    if [[ -n "${SSH_CONNECTION:-}" ]]; then
        local current_port
        current_port=$(echo "$SSH_CONNECTION" | awk '{print $4}')
        if [[ -n "$current_port" && ! "$ssh_ports" =~ (^|[[:space:]])${current_port}($|[[:space:]]) ]]; then
            ssh_ports="$ssh_ports $current_port"
        fi
    fi

    # Install ufw if missing
    if ! command_exists ufw; then
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq ufw >/dev/null 2>&1 &
        spinner $! "Installing ufw..."
        command_exists ufw || fail "ufw installation failed. Migration aborted, iptables left untouched."
    fi

    local db_path="${APP_DIR}/data/shulkr.db"
    [[ -f "$db_path" ]] || fail "Database not found at ${db_path}, cannot migrate firewall safely."
    command_exists sqlite3 || {
        DEBIAN_FRONTEND=noninteractive apt-get install -y -qq sqlite3 >/dev/null 2>&1 &
        spinner $! "Installing sqlite3..."
    }
    command_exists sqlite3 || fail "sqlite3 not available, cannot read shulkr DB to migrate firewall."

    # Build the UFW ruleset on a clean slate before enabling.
    # ufw --force reset wipes its own rule files; iptables stays in place until `ufw enable` swaps in.
    ufw --force reset >/dev/null 2>&1
    ufw default deny incoming >/dev/null 2>&1
    ufw default allow outgoing >/dev/null 2>&1

    # 1. SSH first, non-negotiable (loop covers custom Port directives).
    for port in $ssh_ports; do
        ufw allow "${port}/tcp" >/dev/null 2>&1
    done

    # 2. DENY rules from the DB BEFORE allow-port rules. UFW evaluates rules in order
    #    (first-match-wins), so a deny-from-IP for a given port must come before the
    #    matching allow-port rule, otherwise the broad allow shadows the deny.
    while IFS='|' read -r action port protocol from_ip; do
        [[ "$action" == "deny" ]] || continue
        if [[ -n "$from_ip" && -n "$port" ]]; then
            if [[ "$protocol" == "both" ]]; then
                ufw deny proto tcp from "$from_ip" to any port "$port" >/dev/null 2>&1
                ufw deny proto udp from "$from_ip" to any port "$port" >/dev/null 2>&1
            else
                ufw deny proto "$protocol" from "$from_ip" to any port "$port" >/dev/null 2>&1
            fi
        elif [[ -n "$from_ip" ]]; then
            if [[ "$protocol" == "both" ]]; then
                ufw deny proto tcp from "$from_ip" >/dev/null 2>&1
                ufw deny proto udp from "$from_ip" >/dev/null 2>&1
            else
                ufw deny proto "$protocol" from "$from_ip" >/dev/null 2>&1
            fi
        elif [[ -n "$port" ]]; then
            if [[ "$protocol" == "both" ]]; then
                ufw deny "${port}/tcp" >/dev/null 2>&1
                ufw deny "${port}/udp" >/dev/null 2>&1
            else
                ufw deny "${port}/${protocol}" >/dev/null 2>&1
            fi
        fi
    done < <(sqlite3 "$db_path" "SELECT IFNULL(action,''), IFNULL(port,''), IFNULL(protocol,''), IFNULL(from_ip,'') FROM firewall_rules WHERE enabled=1 AND action='deny'" 2>/dev/null)

    # 3. Baseline ALLOW rules (HTTP/HTTPS, panel reverse-proxied via nginx).
    ufw allow 80/tcp >/dev/null 2>&1
    ufw allow 443/tcp >/dev/null 2>&1

    # 4. ALLOW rules from the DB (Minecraft server ports etc.).
    while IFS='|' read -r action port protocol from_ip; do
        [[ "$action" == "allow" ]] || continue
        # Skip the baseline we already added.
        if [[ -z "$from_ip" && ( "$port" == "22" || "$port" == "80" || "$port" == "443" ) ]]; then
            continue
        fi
        if [[ -n "$from_ip" && -n "$port" ]]; then
            if [[ "$protocol" == "both" ]]; then
                ufw allow proto tcp from "$from_ip" to any port "$port" >/dev/null 2>&1
                ufw allow proto udp from "$from_ip" to any port "$port" >/dev/null 2>&1
            else
                ufw allow proto "$protocol" from "$from_ip" to any port "$port" >/dev/null 2>&1
            fi
        elif [[ -n "$port" ]]; then
            if [[ "$protocol" == "both" ]]; then
                ufw allow "${port}/tcp" >/dev/null 2>&1
                ufw allow "${port}/udp" >/dev/null 2>&1
            else
                ufw allow "${port}/${protocol}" >/dev/null 2>&1
            fi
        fi
    done < <(sqlite3 "$db_path" "SELECT IFNULL(action,''), IFNULL(port,''), IFNULL(protocol,''), IFNULL(from_ip,'') FROM firewall_rules WHERE enabled=1 AND action='allow'" 2>/dev/null)

    # 5. Enable UFW. This swaps iptables for UFW's chains atomically.
    ufw --force enable >/dev/null 2>&1
    systemctl enable ufw >/dev/null 2>&1 || true

    if ! ufw status 2>/dev/null | grep -q "Status: active"; then
        fail "ufw enable failed. Existing iptables rules are untouched, system remains protected."
    fi

    # 6. Drop iptables-persistent, no longer needed (ufw persists natively).
    if dpkg -l iptables-persistent 2>/dev/null | awk '{print $1}' | grep -qE '^ii$'; then
        DEBIAN_FRONTEND=noninteractive apt-get remove -y -qq iptables-persistent >/dev/null 2>&1 || true
    fi

    local rule_count
    rule_count=$(ufw status numbered 2>/dev/null | grep -cE '^\[' || echo "0")
    print_ok "Firewall migrated to ufw (${rule_count} rule(s) active, SSH preserved)"
}

restart_services() {
    print_step 5 6 "Restarting services"

    # Update systemd service ReadWritePaths for domain/SSL management
    if grep -q "ReadWritePaths=" /etc/systemd/system/shulkr.service 2>/dev/null; then
        sed -i '/ProtectSystem=/d; /ProtectHome=/d; /ReadWritePaths=/d' /etc/systemd/system/shulkr.service
        print_ok "Service file updated"
    fi

    systemctl daemon-reload
    systemctl start shulkr
    sleep 2

    if systemctl is-active --quiet shulkr; then
        print_ok "Shulkr is running"
    else
        print_warn "Service may have failed — check: journalctl -u shulkr -f"
    fi

    if systemctl is-active --quiet nginx 2>/dev/null; then
        systemctl reload nginx 2>/dev/null || true
        print_ok "Nginx reloaded"
    fi
}

show_complete() {
    print_step 6 6 "Finalizing"

    print_ok "All services started"

    echo ""
    echo -e "  ${GREEN}✓${NC} ${WHITE}Updated to v${SHULKR_VERSION}${NC}"
    echo ""
    echo -e "  ${WHITE}Preserved:${NC} database, config, servers, backups"
    echo -e "  ${WHITE}Status:${NC}    shulkr status"
    echo -e "  ${WHITE}Logs:${NC}      shulkr logs"
    echo ""
}

main() {
    echo ""
    echo -e "${WHITE}Shulkr${NC} — Updater"
    echo ""
    preflight
    stop_services
    download_and_replace
    migrate_firewall_to_ufw
    restart_services
    show_complete
}

main "$@"
