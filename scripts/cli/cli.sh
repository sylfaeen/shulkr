#!/bin/bash

_shulkr_main() {

if [[ -t 1 ]]; then
    RED='\033[0;31m' GREEN='\033[0;32m' YELLOW='\033[1;33m'
    CYAN='\033[0;36m' WHITE='\033[1;37m' GRAY='\033[0;90m' NC='\033[0m'
else
    RED='' GREEN='' YELLOW='' CYAN='' WHITE='' GRAY='' NC=''
fi

SHULKR_HOME="${SHULKR_HOME:-/opt/shulkr}"
SERVICE_NAME="shulkr"

show_status() {
    local status_script="${SHULKR_HOME}/app/scripts/cli/show_status.sh"
    if [[ ! -f "$status_script" ]]; then
        echo -e "  ${RED}✗${NC} Status script not found at ${status_script}"
        exit 1
    fi
    bash "$status_script"
}

show_logs() {
    journalctl -u "$SERVICE_NAME" -f --no-hostname -o cat
}

do_start() {
    echo -e "  Starting Shulkr..."
    sudo systemctl start "$SERVICE_NAME"
    sleep 1
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo -e "  ${GREEN}✓${NC} Shulkr started"
    else
        echo -e "  ${RED}✗${NC} Failed to start — run: ${GRAY}shulkr logs${NC}"
    fi
}

do_stop() {
    echo -e "  Stopping Shulkr..."
    sudo systemctl stop "$SERVICE_NAME"
    echo -e "  ${GREEN}✓${NC} Shulkr stopped"
}

do_restart() {
    echo -e "  Restarting Shulkr..."
    sudo systemctl restart "$SERVICE_NAME"
    sleep 1
    if systemctl is-active --quiet "$SERVICE_NAME"; then
        echo -e "  ${GREEN}✓${NC} Shulkr restarted"
    else
        echo -e "  ${RED}✗${NC} Failed to restart — run: ${GRAY}shulkr logs${NC}"
    fi
}

do_update() {
    local update_script="${SHULKR_HOME}/app/scripts/cli/do_update.sh"
    if [[ ! -f "$update_script" ]]; then
        echo -e "  ${RED}✗${NC} Update script not found at ${update_script}"
        echo -e "  ${GRAY}Run manually:${NC} ${CYAN}curl -fsSL https://raw.githubusercontent.com/sylfaeen/shulkr/refs/heads/main/scripts/cli/do_update.sh | sudo bash${NC}"
        exit 1
    fi
    sudo SHULKR_HOME="$SHULKR_HOME" bash "$update_script"
}

show_version() {
    local version="unknown"
    if [[ -f "$SHULKR_HOME/app/package.json" ]]; then
        version=$(grep '"version"' "$SHULKR_HOME/app/package.json" 2>/dev/null | head -1 | sed -E 's/.*"([0-9]+\.[0-9]+\.[0-9]+)".*/\1/' || echo "unknown")
    fi
    echo -e "  Shulkr v${version}"
}

show_domains() {
    local domains_script="${SHULKR_HOME}/app/scripts/cli/show_domains.sh"
    if [[ ! -f "$domains_script" ]]; then
        echo -e "  ${RED}✗${NC} Domains script not found at ${domains_script}"
        exit 1
    fi
    sudo SHULKR_HOME="$SHULKR_HOME" bash "$domains_script"
}

do_uninstall() {
    local uninstall_script="${SHULKR_HOME}/app/scripts/cli/do_uninstall.sh"
    if [[ ! -f "$uninstall_script" ]]; then
        echo -e "  ${RED}✗${NC} Uninstall script not found at ${uninstall_script}"
        echo -e "  ${GRAY}Run manually:${NC} ${CYAN}curl -fsSL https://raw.githubusercontent.com/sylfaeen/shulkr/main/scripts/uninstall.sh | sudo bash${NC}"
        exit 1
    fi
    sudo SHULKR_HOME="$SHULKR_HOME" bash "$uninstall_script"
}

show_help() {
    echo ""
    echo -e "  ${WHITE}Shulkr CLI${NC}"
    echo ""
    echo -e "  ${WHITE}Usage:${NC} shulkr <command>"
    echo ""
    echo -e "  ${CYAN}status${NC}      Show service status"
    echo -e "  ${CYAN}logs${NC}        Follow live logs"
    echo -e "  ${CYAN}start${NC}       Start the service"
    echo -e "  ${CYAN}stop${NC}        Stop the service"
    echo -e "  ${CYAN}restart${NC}     Restart the service"
    echo -e "  ${CYAN}update${NC}      Update to the latest version"
    echo -e "  ${CYAN}domains${NC}     Show Nginx domains and test connectivity"
    echo -e "  ${CYAN}version${NC}     Show current version"
    echo -e "  ${CYAN}uninstall${NC}   Remove Shulkr (keeps packages)"
    echo ""
}

case "${1:-status}" in
    status)                show_status ;;
    logs)                  show_logs ;;
    start)                 do_start ;;
    stop)                  do_stop ;;
    restart)               do_restart ;;
    update)                do_update ;;
    uninstall)             do_uninstall ;;
    domains)               show_domains ;;
    version|-v|--version)  show_version ;;
    help|-h|--help)        show_help ;;
    *)
        echo -e "  ${RED}Unknown command:${NC} $1"
        show_help
        exit 1
        ;;
esac

}

_shulkr_main "$@"
