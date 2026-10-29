#!/bin/bash

set -e

GITHUB_REPO="${SHULKR_REPO:-sylfaeen/shulkr}"
SHULKR_VERSION="${SHULKR_VERSION:-latest}"
SHULKR_HOME="${SHULKR_HOME:-/opt/shulkr}"
APP_DIR="${SHULKR_HOME}/app"
SERVICE_USER="${SHULKR_USER:-shulkr}"
REQUIRED_NODE_MAJOR=22
# Oldest Node.js 22 release carrying the latest security fixes, same floor as install.sh. Raise it with every Node.js security release.
MIN_NODE_VERSION="22.23.4"

if [[ -t 1 ]]; then
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m' BLUE='\033[0;34m'
    CYAN='\033[0;36m' WHITE='\033[1;37m' GRAY='\033[0;90m' NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' WHITE='' GRAY='' NC=''
fi

command_exists() { command -v "$1" &>/dev/null; }

# True when dotted version $1 is strictly older than $2
version_lt() { [[ "$1" != "$2" && "$(printf '%s\n%s\n' "$1" "$2" | sort -V | head -n1)" == "$1" ]]; }

node_version() { node -v 2>/dev/null | cut -d'v' -f2; }

# Debian/Ubuntu flag pending reboots with a file, RHEL-family through needs-restarting when dnf-utils is installed
reboot_required() {
    [[ -f /var/run/reboot-required ]] || { command_exists needs-restarting && ! needs-restarting -r &>/dev/null; }
}

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

# Stays within the installed major: NodeSource repositories are per major, and the bundled native bindings are built for it
upgrade_nodejs() {
    if command_exists apt-get; then
        (apt-get update -qq && DEBIAN_FRONTEND=noninteractive apt-get install --only-upgrade -y -qq nodejs) >/dev/null 2>&1 &
    else
        dnf upgrade -y -q nodejs >/dev/null 2>&1 &
    fi
    spinner $! "Upgrading Node.js..."

    if version_lt "$(node_version)" "$MIN_NODE_VERSION"; then
        fail "Node.js v$(node_version) lacks security fixes, this update requires v${MIN_NODE_VERSION}+. Upgrade Node first, then re-run shulkr update:
    apt-get update && apt-get install --only-upgrade nodejs   (RHEL-family: dnf upgrade nodejs)"
    fi
    print_ok "Node.js upgraded to v$(node_version)"
}

preflight() {
    print_step 1 6 "Pre-flight checks"

    # Root is required, but how you got there is not. The old check also rejected any SUDO_USER other than root, which broke `sudo shulkr update` and the documented `curl ... | sudo bash` fallback alike.
    if [[ $EUID -ne 0 ]]; then
        fail "This script must be run as root. Run: sudo shulkr update"
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

    # Node.js runtime check. better-sqlite3 v11 uses node-gyp, so its native binding is ABI-locked to the Node major it was built for. CI ships Node 22 binaries, so user must run Node 22+. Fail fast with a clear remediation rather than touching the system, services are still running at this point.
    local current_node_major=0
    if command_exists node; then
        current_node_major=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    fi
    if (( current_node_major < REQUIRED_NODE_MAJOR )); then
        fail "Node.js v${current_node_major:-none} found, this update requires v${REQUIRED_NODE_MAJOR}+ (native binding ABI). Upgrade Node first, then re-run shulkr update:
    curl -fsSL https://deb.nodesource.com/setup_${REQUIRED_NODE_MAJOR}.x | bash -
    apt-get install -y nodejs"
    fi

    # Within the supported major, an outdated patch release only lacks security fixes, so it is upgraded once the update is confirmed
    local node_needs_upgrade=false
    if version_lt "$(node_version)" "$MIN_NODE_VERSION"; then
        node_needs_upgrade=true
        print_warn "Node.js v$(node_version) lacks security fixes, will be upgraded to v${MIN_NODE_VERSION}+"
    else
        print_ok "Node.js v$(node_version)"
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
    if [[ "$node_needs_upgrade" == true ]]; then
        echo -e "  ${WHITE}Node.js:${NC} v$(node_version) → v${MIN_NODE_VERSION}+"
    fi
    echo -e "  ${WHITE}Keeps:${NC}  database, .env, servers, backups"
    echo ""
    read -p "   Proceed? [Y/n] " -n 1 -r < /dev/tty
    echo ""
    [[ ! $REPLY =~ ^[Nn]$ ]] || { echo -e "\n  Cancelled.\n"; exit 0; }

    # Before anything is stopped, so a failed upgrade leaves the panel running
    if [[ "$node_needs_upgrade" == true ]]; then
        upgrade_nodejs
    fi
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

    # Ensure data/ exists and restore database if find above wiped it.
    mkdir -p "$APP_DIR/data"
    if [[ ! -f "$APP_DIR/data/shulkr.db" ]] && [[ -f /tmp/shulkr-db-backup ]]; then
        cp -a /tmp/shulkr-db-backup "$APP_DIR/data/shulkr.db"
        print_ok "Database restored to data/"
    fi

    print_ok "Application code replaced"

    # Dependencies are bundled in the tarball: the backend boots directly from packages/backend/dist/index.js using packages/backend/node_modules.
    # No pnpm install, no corepack, no network call required at this stage.

    # CLI
    if [[ -f "$APP_DIR/scripts/cli/cli.sh" ]]; then
        cp "$APP_DIR/scripts/cli/cli.sh" /usr/local/bin/shulkr.tmp
        sed -i "s|SHULKR_HOME=\"\${SHULKR_HOME:-/opt/shulkr}\"|SHULKR_HOME=\"\${SHULKR_HOME:-${SHULKR_HOME}}\"|" /usr/local/bin/shulkr.tmp
        chmod +x /usr/local/bin/shulkr.tmp
        mv /usr/local/bin/shulkr.tmp /usr/local/bin/shulkr
        print_ok "CLI updated"
    fi

    # Permissions. The application tree stays root-owned: the service user is allowed to run four scripts as root, and sudo checks their path, not their owner. Handing it back write access here would give anything running under that account, the panel and every Minecraft plugin, a one-line path to root.
    # Paths are configurable at install time, so they are read back rather than assumed
    local servers_dir backups_dir database_dir public_files_dir
    servers_dir=$(grep -E '^SERVERS_BASE_PATH=' "$APP_DIR/.env" | cut -d= -f2- | tr -d '"')
    backups_dir=$(grep -E '^BACKUPS_BASE_PATH=' "$APP_DIR/.env" | cut -d= -f2- | tr -d '"')
    database_dir=$(dirname "$(grep -E '^DATABASE_PATH=' "$APP_DIR/.env" | cut -d= -f2- | tr -d '"')")
    public_files_dir=$(grep -E '^PUBLIC_FILES_PATH=' "$APP_DIR/.env" | cut -d= -f2- | tr -d '"')
    # Installations older than the public files feature have no such line, and the backend then defaults to this path
    public_files_dir="${public_files_dir:-$SHULKR_HOME/public-files}"

    chown -R root:root "$SHULKR_HOME"
    chmod 755 "$SHULKR_HOME" "$APP_DIR"

    local writable
    for writable in "$servers_dir" "$backups_dir" "$database_dir"; do
        [[ -n "$writable" && -d "$writable" ]] && chown -R "$SERVICE_USER:$SERVICE_USER" "$writable"
    done

    # Created here too, not only at install: the backend cannot create it under the root-owned SHULKR_HOME, and the chown above would take it back on every update anyway
    mkdir -p "$public_files_dir"
    chown -R "$SERVICE_USER:$SERVICE_USER" "$public_files_dir"
    chmod 700 "$public_files_dir"

    chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
    print_ok "Permissions set"

    # Cleanup
    rm -rf "$staging" /tmp/shulkr-env-backup /tmp/shulkr-db-backup
}

# Adds a directive to the sshd Match block opened by the exact line $2, unless that block already sets the same keyword
ensure_match_directive() {
    local file=$1 match=$2 directive=$3 tmp
    awk -v m="$match" -v k="${directive%% *}" '$0 == m { f = 1; next } /^Match / { f = 0 } f && $1 == k { found = 1 } END { exit !found }' "$file" && return 0

    tmp=$(mktemp)
    awk -v m="$match" -v d="    ${directive}" '{ print } $0 == m { print d }' "$file" > "$tmp"
    cat "$tmp" > "$file"
    rm -f "$tmp"
}

# Brings older installs to what install.sh now sets up. Idempotent, runs on every update.
apply_host_settings() {
    print_step 4 6 "Applying system settings"

    # Node.js and Java come from vendor repositories outside the distribution security origin, see configure_unattended_upgrades in install.sh
    if [[ -f /etc/apt/apt.conf.d/50unattended-upgrades ]]; then
        cat > /etc/apt/apt.conf.d/51shulkr-runtimes << 'EOF'
// Managed by Shulkr. Security updates for the Node.js and Java runtimes.
Unattended-Upgrade::Origins-Pattern {
    "site=deb.nodesource.com";
    "site=packages.adoptium.net";
};
EOF
        print_ok "Unattended upgrades cover Node.js and Java"
    fi

    # Older installs gave the shulkr account a full SSH shell, see harden_ssh in install.sh
    local sshd_conf=/etc/ssh/sshd_config.d/49-shulkr.conf
    if [[ -f "$sshd_conf" ]] && grep -qx "Match User ${SERVICE_USER}" "$sshd_conf"; then
        local backup
        backup=$(mktemp)
        cp -a "$sshd_conf" "$backup"
        ensure_match_directive "$sshd_conf" "Match User ${SERVICE_USER}" "DisableForwarding yes"
        ensure_match_directive "$sshd_conf" "Match User ${SERVICE_USER}" "ForceCommand internal-sftp"

        if sshd -t 2>/dev/null; then
            systemctl reload sshd 2>/dev/null || systemctl reload ssh 2>/dev/null || true
            print_ok "SSH access for '${SERVICE_USER}' restricted to SFTP"
        else
            cp -a "$backup" "$sshd_conf"
            print_warn "sshd rejected the SFTP restriction for '${SERVICE_USER}', configuration left unchanged"
        fi

        rm -f "$backup"
    fi
}

restart_services() {
    print_step 5 6 "Restarting services"

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

    # Unattended upgrades install kernel and core library fixes, only a reboot puts them in effect
    if reboot_required; then
        print_warn "A reboot is pending to apply system security updates. Stop your servers, then run: sudo reboot"
        echo ""
    fi
}

main() {
    echo ""
    echo -e "${WHITE}Shulkr${NC} — Updater"
    echo ""
    preflight
    stop_services
    download_and_replace
    apply_host_settings
    restart_services
    show_complete
}

main "$@"
