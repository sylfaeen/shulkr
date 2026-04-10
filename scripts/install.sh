#!/bin/bash

set -e

# ==============================================================================
# Shulkr — Minecraft Server Management Panel
# Unified installation script (interactive + automated provisioning)
#
# Interactive mode (default):
#   curl -fsSL https://raw.githubusercontent.com/sylfaeen/shulkr/main/install.sh | sudo bash
#
# Automated mode (via provisioning API):
#   Set PROVISION_TOKEN, PROVISION_API, SUDO_PASSWORD before running.
# ==============================================================================

export DEBIAN_FRONTEND=noninteractive

GITHUB_REPO="${SHULKR_REPO:-sylfaeen/shulkr}"
SHULKR_VERSION="${SHULKR_VERSION:-latest}"
DEFAULT_SHULKR_HOME="/opt/shulkr"
SHULKR_HOME="${SHULKR_HOME:-}"
APP_DIR=""
SERVERS_DIR=""
BACKUPS_DIR=""
DATABASE_FILE=""
SERVICE_USER="${SHULKR_USER:-shulkr}"
SERVICE_PORT="${SHULKR_PORT:-3001}"
NODE_VERSION="20"
MIN_RAM_MB=512
MIN_DISK_MB=500
TOTAL_STEPS=9

# Mode detection: automated if PROVISION_TOKEN is set
if [[ -n "${PROVISION_TOKEN:-}" ]]; then
    INTERACTIVE=false
else
    INTERACTIVE=true
fi

# Colors

if [[ -t 1 ]]; then
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m' BLUE='\033[0;34m'
    CYAN='\033[0;36m' WHITE='\033[1;37m' GRAY='\033[0;90m' NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' BLUE='' CYAN='' WHITE='' GRAY='' NC=''
fi

# Utilities

command_exists() { command -v "$1" &>/dev/null; }

fail() {
    echo ""
    echo -e "  ${RED}✗ ERROR:${NC} $1"
    echo ""
    if [[ "$INTERACTIVE" == false ]]; then
        provision_error "$1"
    fi
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

print_step() { echo ""; echo -e "${WHITE}[${1}/${TOTAL_STEPS}]${NC} ${2}"; }

# Provisioning API callbacks (automated mode only)

provision_ping() {
    [[ "$INTERACTIVE" == false ]] || return 0
    curl -sf -X POST "${PROVISION_API}/api/provision/${PROVISION_TOKEN}/ping" \
        -H "Content-Type: application/json" \
        -d "{\"status\": $1}" >/dev/null 2>&1 || true
}

provision_error() {
    [[ "$INTERACTIVE" == false ]] || return 0
    curl -sf -X POST "${PROVISION_API}/api/provision/${PROVISION_TOKEN}/ping" \
        -H "Content-Type: application/json" \
        -d "{\"status\": -1, \"error\": \"$1\"}" >/dev/null 2>&1 || true
}

# Interactive prompt with default value
ask_value() {
    local label=$1 default=$2 varname=$3
    printf "  %s ${GRAY}[%s]${NC}: " "$label" "$default"
    read -r input < /dev/tty
    local value="${input:-$default}"
    eval "$varname=\"\$value\""
    printf "\033[1A\033[2K"
    if [[ -z "$input" ]]; then
        printf "  ${GREEN}✓${NC} %s ${GRAY}[%s]${NC}: ${GRAY}default${NC}\n" "$label" "$default"
    else
        printf "  ${GREEN}✓${NC} %s ${GRAY}[%s]${NC}: ${WHITE}%s${NC}\n" "$label" "$default" "$value"
    fi
}

# APT lock handling (inspired by Laravel Forge)

apt_wait() {
    local files="/var/lib/dpkg/lock /var/lib/dpkg/lock-frontend /var/lib/apt/lists/lock"
    local max_attempts=60 attempt=0
    if [ -f /var/log/unattended-upgrades/unattended-upgrades.log ]; then
        files="$files /var/log/unattended-upgrades/unattended-upgrades.log"
    fi
    while fuser $files >/dev/null 2>&1; do
        if [[ $attempt -eq 0 ]]; then
            print_warn "Waiting for dpkg/apt locks..."
        fi
        sleep 5
        attempt=$((attempt + 1))
        if [[ $attempt -ge $max_attempts ]]; then
            print_warn "Timeout waiting for apt locks after 300s. Continuing..."
            break
        fi
    done
}

apt_install() {
    case $OS in
        ubuntu|debian|raspbian)
            apt_wait
            apt-get install -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" -y -qq "$@"
            ;;
        centos|rhel|rocky|almalinux|fedora)
            dnf install -y -q "$@"
            ;;
    esac
}

apt_update() {
    case $OS in
        ubuntu|debian|raspbian)
            apt_wait
            apt-get update -o Acquire::AllowReleaseInfoChange=true -qq
            ;;
        centos|rhel|rocky|almalinux|fedora)
            dnf check-update -q || true
            ;;
    esac
}

# OS-specific installers

install_nodejs() {
    local setup_url
    case $OS in
        ubuntu|debian|raspbian) setup_url="https://deb.nodesource.com/setup_${NODE_VERSION}.x" ;;
        *)                      setup_url="https://rpm.nodesource.com/setup_${NODE_VERSION}.x" ;;
    esac
    curl -fsSL "$setup_url" | bash - >/dev/null 2>&1
    apt_install nodejs >/dev/null 2>&1 &
    spinner $! "Installing Node.js ${NODE_VERSION}..."
    print_ok "Node.js v$(node -v | cut -d'v' -f2) installed"
}

install_temurin() {
    case $OS in
        ubuntu|debian|raspbian)
            apt_install apt-transport-https gnupg >/dev/null 2>&1
            curl -fsSL https://packages.adoptium.net/artifactory/api/gpg/key/public \
                | gpg --dearmor -o /usr/share/keyrings/adoptium.gpg 2>/dev/null
            echo "deb [signed-by=/usr/share/keyrings/adoptium.gpg] https://packages.adoptium.net/artifactory/deb $(lsb_release -cs) main" \
                > /etc/apt/sources.list.d/adoptium.list
            apt_update >/dev/null 2>&1
            apt_install temurin-25-jre temurin-21-jre temurin-17-jre >/dev/null 2>&1 &
            ;;
        *)
            cat > /etc/yum.repos.d/adoptium.repo << 'REPO'
[Adoptium]
name=Adoptium
baseurl=https://packages.adoptium.net/artifactory/rpm/rhel/$releasever/$basearch
enabled=1
gpgcheck=1
gpgkey=https://packages.adoptium.net/artifactory/api/gpg/key/public
REPO
            yum install -y temurin-25-jre temurin-21-jre temurin-17-jre >/dev/null 2>&1 &
            ;;
    esac
    spinner $! "Installing Adoptium Temurin 25, 21 & 17..."

    if ! command_exists java; then
        fail "Java installation failed. Install manually: https://adoptium.net/installation/"
    fi

    local ver
    ver=$(java -version 2>&1 | head -n1 | cut -d'"' -f2 | cut -d'.' -f1)
    print_ok "Adoptium Temurin installed (default: Java ${ver})"

    for jvm_dir in /usr/lib/jvm/temurin-*; do
        [[ -x "${jvm_dir}/bin/java" ]] || continue
        print_ok "  $(basename "$jvm_dir") ($("${jvm_dir}/bin/java" -version 2>&1 | head -n1 | cut -d'"' -f2))"
    done
}

# System detection

detect_system() {
    if [[ -f /etc/os-release ]]; then
        . /etc/os-release
        OS=$ID; OS_VERSION=$VERSION_ID; OS_NAME=$PRETTY_NAME
    elif [[ -f /etc/debian_version ]]; then
        OS="debian"; OS_NAME="Debian $(cat /etc/debian_version)"
    elif [[ -f /etc/redhat-release ]]; then
        OS="rhel"; OS_NAME=$(cat /etc/redhat-release)
    else
        OS="unknown"; OS_NAME="Unknown"
    fi

    case $(uname -m) in
        x86_64)  ARCH_NAME="x64" ;;
        aarch64) ARCH_NAME="arm64" ;;
        *)       ARCH_NAME=$(uname -m) ;;
    esac

    case $OS in
        ubuntu|debian|raspbian) ;;
        centos|rhel|rocky|almalinux|fedora) ;;
        *) fail "Unsupported OS: ${OS_NAME}. Supported: Ubuntu, Debian, CentOS, RHEL, Rocky, Fedora" ;;
    esac
}

# Version resolution

resolve_version() {
    if [[ "$SHULKR_VERSION" == "local" ]]; then
        return 0
    fi
    if [[ "$SHULKR_VERSION" == "latest" ]]; then
        SHULKR_VERSION=$(curl -sf --connect-timeout 5 "https://api.github.com/repos/${GITHUB_REPO}/releases/latest" \
            | grep '"tag_name"' | sed -E 's/.*"v([^"]+)".*/\1/' || echo "")
        [[ -n "$SHULKR_VERSION" ]] || fail "Could not determine latest version. Set SHULKR_VERSION manually."
    fi
}

# Reinstall prompt (interactive only)

ask_reinstall() {
    [[ -d "$SHULKR_HOME" ]] || return 0

    echo ""
    print_warn "Shulkr is already installed in ${SHULKR_HOME}"
    echo ""
    echo -e "    ${WHITE}1)${NC} Update     — keeps data, servers, config"
    echo -e "    ${WHITE}2)${NC} ${RED}Reinstall${NC}  — deletes everything"
    echo -e "    ${WHITE}3)${NC} Cancel"
    echo ""
    read -p "   Choose [1/2/3]: " -n 1 -r < /dev/tty
    echo ""

    case $REPLY in
        1)
            if [[ -f "${APP_DIR}/scripts/update.sh" ]]; then
                bash "${APP_DIR}/scripts/update.sh"
            else
                echo -e "  ${GRAY}Downloading update script...${NC}"
                curl -fsSL "https://raw.githubusercontent.com/${GITHUB_REPO}/main/scripts/update.sh" | bash
            fi
            exit 0
            ;;
        2)
            echo ""
            echo -e "  ${RED}This will permanently delete:${NC}"
            echo -e "    ${RED}✗${NC} All Minecraft servers in ${WHITE}${SERVERS_DIR}${NC}"
            echo -e "    ${RED}✗${NC} Database (${WHITE}${DATABASE_FILE}${NC})"
            echo -e "    ${RED}✗${NC} All backups in ${WHITE}${BACKUPS_DIR}${NC}"
            echo -e "    ${RED}✗${NC} Configuration and sessions"
            echo ""
            read -p "   Type 'DELETE' to confirm: " CONFIRM < /dev/tty
            [[ "$CONFIRM" == "DELETE" ]] || { echo -e "\n  Cancelled.\n"; exit 0; }

            echo ""
            local java_pids
            java_pids=$(pgrep -f "java.*-jar.*${SERVERS_DIR}" 2>/dev/null || true)
            if [[ -n "$java_pids" ]]; then
                echo "$java_pids" | xargs kill 2>/dev/null || true
                sleep 2
                echo "$java_pids" | xargs kill -9 2>/dev/null || true
            fi
            print_ok "Servers stopped"

            systemctl stop shulkr 2>/dev/null || true
            systemctl disable shulkr 2>/dev/null || true
            rm -f /etc/systemd/system/shulkr.service
            systemctl daemon-reload 2>/dev/null || true
            rm -f /usr/local/bin/shulkr
            rm -rf "$SHULKR_HOME"
            rm -f /root/.shulkr-provisioned
            print_ok "Removed ${SHULKR_HOME}"
            ;;
        *)
            echo -e "\n  Cancelled.\n"
            exit 0
            ;;
    esac
}

# Interactive prompts

ask_install_paths() {
    local server_ip
    server_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

    echo ""
    echo -e "${WHITE}Where do you want to install Shulkr?${NC}"
    ask_value "Installation path" "$DEFAULT_SHULKR_HOME" SHULKR_HOME

    APP_DIR="${SHULKR_HOME}/app"
    DATABASE_DIR="${APP_DIR}/data"

    ask_value "Servers path" "${SHULKR_HOME}/servers" SERVERS_DIR
    ask_value "Backups path" "${SHULKR_HOME}/backups" BACKUPS_DIR
    ask_value "Database path" "${DATABASE_DIR}/shulkr.db" DATABASE_FILE

    echo ""
    echo -e "${WHITE}What URL will users access Shulkr from?${NC}"
    ask_value "Access URL" "http://${server_ip}" CORS_ORIGIN

    # Ask for service user password upfront (only if user doesn't exist yet)
    if ! id "$SERVICE_USER" &>/dev/null; then
        echo ""
        echo -e "${WHITE}Set a password for '${SERVICE_USER}' (used for SFTP access):${NC}"
        print_warn "This password can only be reset with root access"
        echo ""
        while true; do
            read -sp "  Password: " USER_PASSWORD < /dev/tty
            echo ""
            read -sp "  Confirm:  " USER_PASSWORD_CONFIRM < /dev/tty
            echo ""
            echo ""
            if [[ -z "$USER_PASSWORD" ]]; then
                echo -e "  ${RED}Password cannot be empty.${NC}"
            elif [[ "$USER_PASSWORD" != "$USER_PASSWORD_CONFIRM" ]]; then
                echo -e "  ${RED}Passwords do not match. Try again.${NC}"
            else
                break
            fi
        done
    fi
}

# Set defaults for automated mode

set_automated_defaults() {
    SHULKR_HOME="${SHULKR_HOME:-$DEFAULT_SHULKR_HOME}"
    APP_DIR="${SHULKR_HOME}/app"
    SERVERS_DIR="${SHULKR_HOME}/servers"
    BACKUPS_DIR="${SHULKR_HOME}/backups"
    DATABASE_FILE="${APP_DIR}/data/shulkr.db"
    USER_PASSWORD="${SUDO_PASSWORD}"
    local server_ip
    server_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
    CORS_ORIGIN="http://${server_ip}"
}

# ==============================================================================
# Step 1: System check
# ==============================================================================

check_system() {
    print_step 1 "Checking system requirements"
    provision_ping 1

    local errors=0

    detect_system
    print_ok "Detecting operating system... ${OS_NAME} (${ARCH_NAME})"

    local total_ram
    total_ram=$(grep MemTotal /proc/meminfo 2>/dev/null | awk '{print int($2/1024)}' || echo "0")
    if [[ $total_ram -lt $MIN_RAM_MB ]]; then
        print_err "Checking memory... ${total_ram}MB (minimum: ${MIN_RAM_MB}MB)"
        errors=$((errors + 1))
    else
        print_ok "Checking memory... ${total_ram}MB"
    fi

    local avail_disk
    avail_disk=$(df -BM / 2>/dev/null | tail -1 | awk '{gsub(/M/,"",$4); print $4}')
    if [[ ${avail_disk:-0} -lt $MIN_DISK_MB ]]; then
        print_err "Checking disk space... ${avail_disk}MB available (minimum: ${MIN_DISK_MB}MB)"
        errors=$((errors + 1))
    else
        print_ok "Checking disk space... ${avail_disk}MB available"
    fi

    curl -sf --connect-timeout 5 https://api.github.com >/dev/null 2>&1 &
    spinner $! "Checking connectivity..."
    if curl -sf --connect-timeout 5 https://api.github.com >/dev/null 2>&1; then
        print_ok "Checking connectivity... GitHub API reachable"
    else
        print_err "Checking connectivity... cannot reach GitHub API"
        errors=$((errors + 1))
    fi

    [[ $errors -eq 0 ]] || fail "System check failed with ${errors} error(s)"
}

# ==============================================================================
# Step 2: Preparing the server
# ==============================================================================

prepare_server() {
    print_step 2 "Preparing server"
    provision_ping 2

    # Set timezone to UTC
    ln -sf /usr/share/zoneinfo/UTC /etc/localtime
    print_ok "Timezone set to UTC"

    # Configure APT lock timeouts (Debian/Ubuntu)
    case $OS in
        ubuntu|debian|raspbian)
            cat > /etc/apt/apt.conf.d/90lock-timeout << 'EOF'
DPkg::Lock::Timeout "300";
APT::Get::Lock::Timeout "300";
EOF
            print_ok "APT lock timeout configured (300s)"

            # Set needrestart to automatic mode (prevents interactive prompts)
            if [[ -f /etc/needrestart/needrestart.conf ]]; then
                sed -i "s/^#\$nrconf{restart} = 'i';/\$nrconf{restart} = 'a';/" /etc/needrestart/needrestart.conf
                print_ok "needrestart set to automatic mode"
            fi
            ;;
    esac

    # Prefer IPv4 over IPv6 for DNS resolution
    if [[ -f /etc/gai.conf ]]; then
        sed -i "s/#precedence ::ffff:0:0\/96 100/precedence ::ffff:0:0\/96 100/" /etc/gai.conf
        print_ok "IPv4 preference configured"
    fi

    # Configure swap
    if [[ -f /swapfile ]]; then
        print_ok "Swap already exists"
    else
        fallocate -l 1G /swapfile
        chmod 600 /swapfile
        mkswap /swapfile >/dev/null 2>&1
        swapon /swapfile
        echo "/swapfile none swap sw 0 0" >> /etc/fstab
        echo "vm.swappiness=30" >> /etc/sysctl.conf
        echo "vm.vfs_cache_pressure=50" >> /etc/sysctl.conf
        sysctl -p >/dev/null 2>&1 || true
        print_ok "1GB swap configured"
    fi

    # Create service user
    if id "$SERVICE_USER" &>/dev/null; then
        print_ok "User '${SERVICE_USER}' exists"
    else
        useradd --system --shell /bin/bash --home-dir "$SHULKR_HOME" "$SERVICE_USER" 2>/dev/null || true
        echo "$SERVICE_USER:$USER_PASSWORD" | chpasswd
        unset USER_PASSWORD USER_PASSWORD_CONFIRM
        print_ok "User '${SERVICE_USER}' created (password set)"
    fi

    # Create directories
    mkdir -p "$APP_DIR" "$SERVERS_DIR" "$BACKUPS_DIR" "$(dirname "$DATABASE_FILE")"
    print_ok "Directories created"

    # Add github.com to known_hosts (for git-based deployments)
    mkdir -p "/home/${SERVICE_USER}/.ssh"
    ssh-keyscan -H github.com >> "/home/${SERVICE_USER}/.ssh/known_hosts" 2>/dev/null || true
    chown -R "${SERVICE_USER}:${SERVICE_USER}" "/home/${SERVICE_USER}/.ssh" 2>/dev/null || true
    print_ok "GitHub SSH key added to known_hosts"
}

# ==============================================================================
# Step 3: Install base dependencies
# ==============================================================================

install_dependencies() {
    print_step 3 "Installing dependencies"
    provision_ping 3

    apt_update >/dev/null 2>&1 &
    spinner $! "Updating package lists..."
    print_ok "Package lists updated"

    # Base packages
    local base_pkgs="curl wget conntrack acl"
    for pkg in $base_pkgs; do
        command_exists "$pkg" || apt_install "$pkg" >/dev/null 2>&1
    done

    # Install fail2ban (brute-force protection)
    if command_exists fail2ban-server; then
        print_ok "fail2ban"
    else
        apt_install fail2ban >/dev/null 2>&1 &
        spinner $! "Installing fail2ban..."
        systemctl enable fail2ban >/dev/null 2>&1 || true
        systemctl start fail2ban >/dev/null 2>&1 || true
        print_ok "fail2ban installed and enabled"
    fi

    # Node.js
    if command_exists node; then
        local node_ver
        node_ver=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
        if [[ $node_ver -ge $NODE_VERSION ]]; then
            print_ok "Node.js v$(node -v | cut -d'v' -f2)"
        else
            print_warn "Node.js v${node_ver} found, need v${NODE_VERSION}+"
            install_nodejs
        fi
    else
        install_nodejs
    fi

    # pnpm
    if command_exists pnpm; then
        print_ok "pnpm v$(pnpm -v)"
    else
        npm install -g pnpm >/dev/null 2>&1 &
        spinner $! "Installing pnpm..."
        print_ok "pnpm v$(pnpm -v)"
    fi

    # Java
    if command_exists java; then
        local java_ver
        java_ver=$(java -version 2>&1 | head -n1 | cut -d'"' -f2 | cut -d'.' -f1)
        if [[ "$java_ver" -ge 25 ]]; then
            print_ok "Java ${java_ver}"
        else
            print_warn "Java ${java_ver} found, Java 25+ recommended for Minecraft 1.21.5+"
            install_temurin
        fi
    else
        install_temurin
    fi

    # Nginx + stream module
    if command_exists nginx; then
        print_ok "Nginx v$(nginx -v 2>&1 | cut -d'/' -f2)"
    else
        apt_install nginx >/dev/null 2>&1 &
        spinner $! "Installing Nginx..."
        print_ok "Nginx installed"
    fi
    if ! nginx -V 2>&1 | grep -q "with-stream"; then
        apt_install libnginx-mod-stream >/dev/null 2>&1 &
        spinner $! "Installing Nginx stream module..."
        print_ok "Nginx stream module installed"
    fi

    # Certbot
    if command_exists certbot; then
        print_ok "Certbot"
    else
        apt_install certbot python3-certbot-nginx >/dev/null 2>&1 &
        spinner $! "Installing Certbot..."
        print_ok "Certbot installed"
    fi
}

# ==============================================================================
# Step 4: Download & install Shulkr
# ==============================================================================

download_shulkr() {
    print_step 4 "Downloading Shulkr"
    provision_ping 4

    resolve_version
    print_ok "Version: ${SHULKR_VERSION}"

    local tarball="/tmp/shulkr-${SHULKR_VERSION}.tar.gz"

    # Support local tarball for dev testing
    if [[ "$SHULKR_VERSION" == "local" ]] && [[ -f "/tmp/shulkr-local.tar.gz" ]]; then
        tarball="/tmp/shulkr-local.tar.gz"
        print_ok "Using local tarball"
    else
        local url="https://github.com/${GITHUB_REPO}/releases/download/v${SHULKR_VERSION}/shulkr-${SHULKR_VERSION}.tar.gz"
        curl -sfL "$url" -o "$tarball" 2>/dev/null &
        spinner $! "Downloading shulkr-${SHULKR_VERSION}.tar.gz..."
        [[ -f "$tarball" ]] || fail "Download failed: ${url}"
        print_ok "Download complete"
    fi

    tar -xzf "$tarball" -C "$APP_DIR" --strip-components=1 2>/dev/null &
    spinner $! "Extracting..."
    rm -f "$tarball" 2>/dev/null || true
    print_ok "Extracted to ${APP_DIR}"

    # Dependencies
    cd "$APP_DIR"
    pnpm install --prod --frozen-lockfile >/dev/null 2>&1 &
    spinner $! "Installing production dependencies..."
    print_ok "Dependencies installed"

    # CLI
    cp "$APP_DIR/scripts/cli/cli.sh" /usr/local/bin/shulkr
    sed -i "s|SHULKR_HOME=\"\${SHULKR_HOME:-/opt/shulkr}\"|SHULKR_HOME=\"\${SHULKR_HOME:-${SHULKR_HOME}}\"|" /usr/local/bin/shulkr
    chmod +x /usr/local/bin/shulkr
    print_ok "CLI installed → shulkr"

    # Script permissions
    chmod +x "$APP_DIR/scripts/subs/subs_firewall.sh"
    chmod +x "$APP_DIR/scripts/subs/subs_domain.sh"
    chmod +x "$APP_DIR/scripts/subs/subs_sftp.sh"

    # Sudoers for scripts and service management
    cat > /etc/sudoers.d/shulkr << SUDOERS_EOF
${SERVICE_USER} ALL=(root) NOPASSWD: ${APP_DIR}/scripts/subs/subs_firewall.sh
${SERVICE_USER} ALL=(root) NOPASSWD: ${APP_DIR}/scripts/subs/subs_domain.sh
${SERVICE_USER} ALL=(root) NOPASSWD: ${APP_DIR}/scripts/subs/subs_sftp.sh
${SERVICE_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl restart shulkr
${SERVICE_USER} ALL=(root) NOPASSWD: /usr/bin/systemctl reload shulkr
SUDOERS_EOF
    chmod 440 /etc/sudoers.d/shulkr
    print_ok "Sudoers configured (firewall + domains + sftp + service)"

    # Permissions
    chown -R "$SERVICE_USER:$SERVICE_USER" "$SHULKR_HOME"
    chmod 755 "$SHULKR_HOME" "$APP_DIR" "$SERVERS_DIR" "$BACKUPS_DIR"
    print_ok "Permissions set"
}

# ==============================================================================
# Step 5: Configure systemd service
# ==============================================================================

configure_service() {
    print_step 5 "Configuring service"
    provision_ping 5

    local jwt_secret cookie_secret totp_key
    jwt_secret=$(openssl rand -base64 48 2>/dev/null || head -c 48 /dev/urandom | base64)
    cookie_secret=$(openssl rand -base64 48 2>/dev/null || head -c 48 /dev/urandom | base64)
    totp_key=$(openssl rand -base64 48 2>/dev/null || head -c 48 /dev/urandom | base64)

    cat > "$APP_DIR/.env" << EOF
SHULKR_HOME=${SHULKR_HOME}
SERVERS_BASE_PATH=${SERVERS_DIR}
BACKUPS_BASE_PATH=${BACKUPS_DIR}
DATABASE_PATH=${DATABASE_FILE}

CORS_ORIGIN=${CORS_ORIGIN}

JWT_SECRET=${jwt_secret}
COOKIE_SECRET=${cookie_secret}
TOTP_ENCRYPTION_KEY=${totp_key}
SECURE_COOKIES=false
EOF

    chown "$SERVICE_USER:$SERVICE_USER" "$APP_DIR/.env"
    chmod 600 "$APP_DIR/.env"
    print_ok "Environment configured"

    cat > /etc/systemd/system/shulkr.service << EOF
[Unit]
Description=Shulkr - Minecraft Server Management Panel
Documentation=https://github.com/${GITHUB_REPO}
After=network.target

[Service]
Type=simple
User=${SERVICE_USER}
Group=${SERVICE_USER}
WorkingDirectory=${APP_DIR}/packages/backend
Environment=NODE_ENV=production
EnvironmentFile=${APP_DIR}/.env
ExecStart=/usr/bin/node dist/index.js
Restart=always
RestartSec=10
StandardOutput=journal
StandardError=journal
SyslogIdentifier=shulkr
PrivateTmp=true

[Install]
WantedBy=multi-user.target
EOF

    print_ok "Systemd service created"

    mkdir -p /etc/letsencrypt /var/lib/letsencrypt /var/log/letsencrypt

    systemctl daemon-reload
    systemctl enable shulkr >/dev/null 2>&1
    systemctl start shulkr
    sleep 2

    if systemctl is-active --quiet shulkr; then
        print_ok "Shulkr is running"
    else
        print_warn "Service may have failed — check: journalctl -u shulkr -f"
    fi
}

# ==============================================================================
# Step 6: Configure Nginx
# ==============================================================================

configure_nginx() {
    print_step 6 "Configuring Nginx"
    provision_ping 6

    # Primary settings
    sed -i "s/user www-data;/user ${SERVICE_USER};/" /etc/nginx/nginx.conf 2>/dev/null || true
    sed -i "s/worker_processes.*/worker_processes auto;/" /etc/nginx/nginx.conf 2>/dev/null || true
    sed -i "s/# multi_accept.*/multi_accept on;/" /etc/nginx/nginx.conf 2>/dev/null || true
    sed -i "s/# server_names_hash_bucket_size.*/server_names_hash_bucket_size 128;/" /etc/nginx/nginx.conf 2>/dev/null || true
    chown -R "${SERVICE_USER}:${SERVICE_USER}" /var/lib/nginx
    print_ok "Nginx primary settings configured"

    # server_tokens off — hide Nginx version in headers
    if ! grep -q "server_tokens off" /etc/nginx/nginx.conf 2>/dev/null; then
        sed -i '/http {/a \\tserver_tokens off;' /etc/nginx/nginx.conf 2>/dev/null || true
    fi
    print_ok "server_tokens off"

    # Gzip compression
    cat > /etc/nginx/conf.d/gzip.conf << 'EOF'
gzip_comp_level 5;
gzip_min_length 256;
gzip_proxied any;
gzip_vary on;
gzip_http_version 1.1;

gzip_types
    application/atom+xml
    application/javascript
    application/json
    application/ld+json
    application/manifest+json
    application/rss+xml
    application/vnd.geo+json
    application/vnd.ms-fontobject
    application/x-font-ttf
    application/x-web-app-manifest+json
    application/xhtml+xml
    application/xml
    font/opentype
    image/bmp
    image/svg+xml
    image/x-icon
    text/cache-manifest
    text/css
    text/plain
    text/vcard
    text/vnd.rim.location.xloc
    text/vtt
    text/x-component
    text/x-cross-domain-policy;
EOF
    print_ok "Gzip compression configured"

    # Generate DH params for stronger SSL
    if [[ ! -f /etc/nginx/dhparams.pem ]]; then
        openssl dhparam -out /etc/nginx/dhparams.pem 2048 >/dev/null 2>&1 &
        spinner $! "Generating DH params (2048-bit)..."
        print_ok "DH params generated"
    else
        print_ok "DH params already exist"
    fi

    # Shulkr site
    cat > /etc/nginx/sites-available/shulkr << 'NGINX_EOF'
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 256M;

    location / {
        proxy_pass http://127.0.0.1:SHULKR_PORT;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /ws {
        proxy_pass http://127.0.0.1:SHULKR_PORT;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }
}
NGINX_EOF

    sed -i "s/SHULKR_PORT/${SERVICE_PORT}/g" /etc/nginx/sites-available/shulkr
    print_ok "Shulkr site configuration created"

    rm -f /etc/nginx/sites-enabled/default
    ln -sf /etc/nginx/sites-available/shulkr /etc/nginx/sites-enabled/shulkr

    # Log rotation for Nginx
    if [[ -f /etc/logrotate.d/nginx ]]; then
        if ! grep -q "maxsize" /etc/logrotate.d/nginx; then
            sed -i -r "s/^(\s*)(daily|weekly|monthly|yearly)$/\1\2\n\1maxsize 100M/" /etc/logrotate.d/nginx
        fi
        sed -i -r "s/^create 0640 www-data adm/create 0640 ${SERVICE_USER} adm/" /etc/logrotate.d/nginx
        print_ok "Nginx log rotation configured (maxsize 100M)"
    fi

    if nginx -t 2>/dev/null; then
        systemctl enable nginx >/dev/null 2>&1
        systemctl reload nginx 2>/dev/null || systemctl restart nginx 2>/dev/null || true
        print_ok "Nginx is running"
    else
        print_warn "Nginx config test failed — check: nginx -t"
    fi
}

# ==============================================================================
# Step 7: Configure firewall
# ==============================================================================

configure_firewall() {
    print_step 7 "Configuring firewall"
    provision_ping 7

    case $OS in
        ubuntu|debian|raspbian)
            echo iptables-persistent iptables-persistent/autosave_v4 boolean true | debconf-set-selections 2>/dev/null || true
            echo iptables-persistent iptables-persistent/autosave_v6 boolean true | debconf-set-selections 2>/dev/null || true
            apt_install iptables-persistent >/dev/null 2>&1 &
            spinner $! "Installing iptables-persistent..."
            print_ok "iptables-persistent installed"
            ;;
        centos|rhel|rocky|almalinux|fedora)
            apt_install iptables-services >/dev/null 2>&1 &
            spinner $! "Installing iptables-services..."
            systemctl enable iptables >/dev/null 2>&1
            print_ok "iptables-services installed"
            ;;
    esac

    iptables -F
    iptables -X
    iptables -t nat -F
    iptables -t mangle -F

    iptables -A INPUT -i lo -j ACCEPT
    iptables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
    iptables -A INPUT -p tcp --dport 22 -j ACCEPT
    iptables -A INPUT -p tcp --dport 80 -j ACCEPT
    iptables -A INPUT -p tcp --dport 443 -j ACCEPT

    iptables -P INPUT DROP
    iptables -P FORWARD DROP
    iptables -P OUTPUT ACCEPT

    print_ok "iptables rules applied (SSH, HTTP, HTTPS)"

    if command_exists ip6tables; then
        ip6tables -F
        ip6tables -X
        ip6tables -A INPUT -i lo -j ACCEPT
        ip6tables -A INPUT -m state --state ESTABLISHED,RELATED -j ACCEPT
        ip6tables -A INPUT -p tcp --dport 22 -j ACCEPT
        ip6tables -A INPUT -p tcp --dport 80 -j ACCEPT
        ip6tables -A INPUT -p tcp --dport 443 -j ACCEPT
        ip6tables -P INPUT DROP
        ip6tables -P FORWARD DROP
        ip6tables -P OUTPUT ACCEPT
        print_ok "ip6tables rules applied"
    fi

    case $OS in
        ubuntu|debian|raspbian)
            mkdir -p /etc/iptables
            iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
            ip6tables-save > /etc/iptables/rules.v6 2>/dev/null || true
            ;;
        centos|rhel|rocky|almalinux|fedora)
            service iptables save 2>/dev/null || true
            ;;
    esac
    print_ok "Rules persisted across reboots"
}

# ==============================================================================
# Step 8: Harden SSH
# ==============================================================================

harden_ssh() {
    print_step 8 "Hardening SSH"
    provision_ping 8

    # Disable password authentication globally
    mkdir -p /etc/ssh/sshd_config.d

    cat > /etc/ssh/sshd_config.d/49-shulkr.conf << 'EOF'
# Managed by Shulkr installer — do not edit manually.
PasswordAuthentication no
EOF
    print_ok "SSH password authentication disabled globally"

    # Allow password auth for SFTP group only (game server file access)
    local sftp_group="sftp-users"
    if ! getent group "$sftp_group" >/dev/null 2>&1; then
        groupadd "$sftp_group" 2>/dev/null || true
    fi

    cat >> /etc/ssh/sshd_config.d/49-shulkr.conf << EOF

# Allow password authentication for SFTP users only
Match Group ${sftp_group}
    PasswordAuthentication yes
    ForceCommand internal-sftp
EOF
    print_ok "SFTP password authentication enabled for group '${sftp_group}'"

    # Reload SSH
    if systemctl is-active --quiet sshd 2>/dev/null; then
        systemctl reload sshd 2>/dev/null || true
    elif systemctl is-active --quiet ssh 2>/dev/null; then
        systemctl reload ssh 2>/dev/null || true
    fi
    print_ok "SSH configuration reloaded"
}

# ==============================================================================
# Step 9: Finalize
# ==============================================================================

configure_unattended_upgrades() {
    case $OS in
        ubuntu|debian|raspbian)
            apt_install unattended-upgrades >/dev/null 2>&1 &
            spinner $! "Installing unattended-upgrades..."

            cat > /etc/apt/apt.conf.d/50unattended-upgrades << 'EOF'
Unattended-Upgrade::Allowed-Origins {
    "${distro_id}:${distro_codename}-security";
};
Unattended-Upgrade::Package-Blacklist {
};
EOF

            cat > /etc/apt/apt.conf.d/10periodic << 'EOF'
APT::Periodic::Update-Package-Lists "1";
APT::Periodic::Download-Upgradeable-Packages "1";
APT::Periodic::AutocleanInterval "7";
APT::Periodic::Unattended-Upgrade "1";
EOF
            print_ok "Unattended security upgrades enabled"
            ;;
        centos|rhel|rocky|almalinux|fedora)
            if command_exists dnf; then
                dnf install -y -q dnf-automatic >/dev/null 2>&1 || true
                systemctl enable --now dnf-automatic-install.timer >/dev/null 2>&1 || true
                print_ok "Automatic security upgrades enabled (dnf-automatic)"
            fi
            ;;
    esac
}

configure_log_rotation() {
    # Configure fail2ban log rotation
    if [[ -f /etc/logrotate.d/fail2ban ]]; then
        if ! grep -q "maxsize" /etc/logrotate.d/fail2ban; then
            sed -i -r "s/^(\s*)(daily|weekly|monthly|yearly)$/\1\2\n\1maxsize 100M/" /etc/logrotate.d/fail2ban
        fi
    fi

    # Configure rsyslog log rotation
    if [[ -f /etc/logrotate.d/rsyslog ]]; then
        if ! grep -q "maxsize" /etc/logrotate.d/rsyslog; then
            sed -i -r "s/^(\s*)(daily|weekly|monthly|yearly)$/\1\2\n\1maxsize 100M/" /etc/logrotate.d/rsyslog
        fi
    fi

    # Set logrotate timer to hourly
    if [[ -d /etc/systemd/system ]]; then
        mkdir -p /etc/systemd/system/timers.target.wants
        cat > /etc/systemd/system/timers.target.wants/logrotate.timer << 'EOF'
[Unit]
Description=Rotation of log files
Documentation=man:logrotate(8) man:logrotate.conf(5)

[Timer]
OnCalendar=*:0/1

[Install]
WantedBy=timers.target
EOF
        systemctl daemon-reload
        systemctl restart logrotate.timer 2>/dev/null || true
    fi
    print_ok "Log rotation configured (hourly, maxsize 100M)"
}

finalize() {
    print_step 9 "Finalizing"
    provision_ping 9

    configure_unattended_upgrades
    configure_log_rotation

    # Sentinel file to prevent re-provisioning
    touch /root/.shulkr-provisioned
    print_ok "Provisioning sentinel created"

    print_ok "All services started"

    local server_ip
    server_ip=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

    echo -e "  ${GREEN}✓${NC} ${WHITE}Shulkr v${SHULKR_VERSION} installed successfully${NC}"
    echo ""
    echo -e "  ${WHITE}Panel:${NC}        ${CORS_ORIGIN}"
    if [[ "$INTERACTIVE" == true ]]; then
        echo -e "  ${GRAY}If you add a domain later, update CORS_ORIGIN in ${APP_DIR}/.env${NC}"
    fi
    echo ""
    echo -e "  ${WHITE}SFTP:${NC}"
    echo -e "  Host: ${CYAN}${server_ip}${NC}  Port: ${CYAN}22${NC}"
    echo -e "  User: ${CYAN}${SERVICE_USER}${NC}  (password set during install)"
    echo -e "  Root: ${CYAN}${SHULKR_HOME}${NC}"
    echo ""
    echo -e "  ${WHITE}Commands:${NC} shulkr help"
    echo ""
    echo -e "  ${WHITE}Firewall:${NC}"
    echo -e "  Open ports: ${CYAN}22${NC} (SSH), ${CYAN}80${NC} (HTTP), ${CYAN}443${NC} (HTTPS)"
    echo -e "  Game ports: managed via panel ${GRAY}(Settings > Firewall)${NC}"
    echo ""

    # Signal completion to provisioning API
    provision_ping 10
}

# ==============================================================================
# Main
# ==============================================================================

main() {
    echo ""
    echo -e "${WHITE}Shulkr${NC} — Minecraft Server Management Panel"
    echo ""

    if [[ $EUID -ne 0 ]]; then
        fail "This script must be run as root."
    fi

    # Guard against re-provisioning
    if [[ -f /root/.shulkr-provisioned ]] && [[ "$INTERACTIVE" == false ]]; then
        fail "This server has already been provisioned. Remove /root/.shulkr-provisioned to re-provision."
    fi

    if [[ "$INTERACTIVE" == true ]]; then
        # Interactive mode: also reject sudo (must be real root)
        if [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
            fail "This script must be run as root (not via sudo). Log in as root first: su -"
        fi
        resolve_version
        echo -e "Current version: ${CYAN}v${SHULKR_VERSION}${NC}"
        ask_install_paths
        ask_reinstall
    else
        # Automated mode: set defaults from env vars
        set_automated_defaults
        echo -e "  ${GRAY}Server: $(hostname -I 2>/dev/null | awk '{print $1}')${NC}"
        echo -e "  ${GRAY}Mode: automated provisioning${NC}"
    fi

    check_system
    prepare_server
    install_dependencies
    download_shulkr
    configure_service
    configure_nginx
    configure_firewall
    harden_ssh
    finalize
}

main "$@"
