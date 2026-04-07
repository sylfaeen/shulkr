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
    print_step 1 5 "Pre-flight checks"

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
    print_step 2 5 "Stopping services"

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
    print_step 3 5 "Downloading & installing v${SHULKR_VERSION}"

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
    if [[ -f "$APP_DIR/scripts/shulkr-cli.sh" ]]; then
        cp "$APP_DIR/scripts/shulkr-cli.sh" /usr/local/bin/shulkr
        chmod +x /usr/local/bin/shulkr
        print_ok "CLI updated"
    fi

    # Permissions
    chown -R "$SERVICE_USER:$SERVICE_USER" "$SHULKR_HOME"
    chmod 600 "$APP_DIR/.env"
    print_ok "Permissions set"

    # Cleanup
    rm -rf "$staging" /tmp/shulkr-env-backup /tmp/shulkr-db-backup
}

restart_services() {
    print_step 4 5 "Restarting services"

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
    print_step 5 5 "Finalizing"

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
    restart_services
    show_complete
}

main "$@"
