#!/usr/bin/env bash
# shulkr-firewall.sh — Secure firewall management for Shulkr GSMP
# This script is the ONLY entry point for firewall operations.
# Executed via sudo by the shulkr system user.
# sudoers: shulkr ALL=(ALL) NOPASSWD: /opt/shulkr/scripts/subs/subs_firewall.sh

set -euo pipefail

RESERVED_PORTS="22 80 443 3000 3001"
MIN_PORT=1024
MAX_PORT=65535

json_success() { echo "{\"success\":true,\"action\":\"$1\",\"port\":$2,\"protocol\":\"$3\"}"; }
json_success_ip() { echo "{\"success\":true,\"action\":\"$1\",\"ip\":\"$2\"}"; }
json_error()   { echo "{\"success\":false,\"error\":\"$1\"}" >&2; exit 1; }

detect_firewall() {
  if command -v ufw &>/dev/null; then
    echo "ufw"
  elif command -v firewall-cmd &>/dev/null; then
    echo "firewalld"
  elif command -v iptables &>/dev/null; then
    echo "iptables"
  else
    json_error "No supported firewall found (ufw, firewalld, iptables)"
  fi
}

validate_port() {
  local port="$1"
  # Strict numeric check
  if ! [[ "$port" =~ ^[0-9]+$ ]]; then
    json_error "Invalid port: must be numeric"
  fi
  if (( port < MIN_PORT || port > MAX_PORT )); then
    json_error "Port out of range: must be ${MIN_PORT}-${MAX_PORT}"
  fi
  for reserved in $RESERVED_PORTS; do
    if (( port == reserved )); then
      json_error "Port ${port} is reserved and cannot be managed"
    fi
  done
}

validate_protocol() {
  local proto="$1"
  if ! [[ "$proto" =~ ^(tcp|udp|both)$ ]]; then
    json_error "Invalid protocol: must be tcp, udp, or both"
  fi
}

validate_action() {
  local action="$1"
  if ! [[ "$action" =~ ^(allow|deny|check|list|block-ip|unblock-ip|list-bans)$ ]]; then
    json_error "Invalid action: must be allow, deny, check, list, block-ip, unblock-ip, or list-bans"
  fi
}

detect_ip_family() {
  local ip="$1"
  if [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    local IFS='.'
    local -a octets
    read -ra octets <<< "$ip"
    for octet in "${octets[@]}"; do
      if (( octet > 255 )); then
        echo "invalid"
        return
      fi
    done
    echo "ipv4"
  elif [[ "$ip" =~ ^[0-9a-fA-F:]+$ ]] && [[ "$ip" =~ : ]]; then
    if command -v python3 &>/dev/null; then
      if python3 -c "import ipaddress, sys; ipaddress.ip_address(sys.argv[1])" "$ip" 2>/dev/null; then
        echo "ipv6"
      else
        echo "invalid"
      fi
    else
      echo "ipv6"
    fi
  else
    echo "invalid"
  fi
}

validate_ip() {
  local family
  family=$(detect_ip_family "$1")
  if [ "$family" = "invalid" ]; then
    json_error "invalid_ip"
  fi
  echo "$family"
}

flush_conntrack_ip() {
  local ip="$1"
  if command -v conntrack &>/dev/null; then
    conntrack -D -s "$ip" 2>/dev/null || true
  fi
}

ufw_allow() {
  local port="$1" proto="$2"
  if [ "$proto" = "both" ]; then
    ufw delete deny "$port"/tcp >/dev/null 2>&1 || true
    ufw delete deny "$port"/udp >/dev/null 2>&1 || true
    ufw allow "$port"/tcp >/dev/null 2>&1
    ufw allow "$port"/udp >/dev/null 2>&1
  else
    ufw delete deny "$port"/"$proto" >/dev/null 2>&1 || true
    ufw allow "$port"/"$proto" >/dev/null 2>&1
  fi
}

ufw_deny() {
  local port="$1" proto="$2"
  if [ "$proto" = "both" ]; then
    ufw delete allow "$port"/tcp >/dev/null 2>&1 || true
    ufw delete allow "$port"/udp >/dev/null 2>&1 || true
    ufw deny "$port"/tcp >/dev/null 2>&1
    ufw deny "$port"/udp >/dev/null 2>&1
  else
    ufw delete allow "$port"/"$proto" >/dev/null 2>&1 || true
    ufw deny "$port"/"$proto" >/dev/null 2>&1
  fi
  # Flush conntrack so existing UDP connections are dropped immediately
  if command -v conntrack &>/dev/null; then
    if [ "$proto" = "both" ] || [ "$proto" = "udp" ]; then
      conntrack -D -p udp --dport "$port" 2>/dev/null || true
    fi
    if [ "$proto" = "both" ] || [ "$proto" = "tcp" ]; then
      conntrack -D -p tcp --dport "$port" 2>/dev/null || true
    fi
  fi
}

ufw_check() {
  local port="$1" proto="$2"
  if [ "$proto" = "both" ]; then
    if ufw status | grep -qE "${port}/tcp.*ALLOW" && ufw status | grep -qE "${port}/udp.*ALLOW"; then
      echo '{"open":true}'
    else
      echo '{"open":false}'
    fi
  else
    if ufw status | grep -qE "${port}/${proto}.*ALLOW"; then
      echo '{"open":true}'
    else
      echo '{"open":false}'
    fi
  fi
}

ufw_list() {
  local rules="[]"
  rules=$(ufw status numbered 2>/dev/null | grep -E '^\[' | sed -E 's/\[([0-9]+)\]\s+([0-9]+)\/(tcp|udp)\s+ALLOW.*/{"port":\2,"protocol":"\3"}/' | grep -E '^\{' | paste -sd ',' - || echo "")
  if [ -n "$rules" ]; then
    echo "[${rules}]"
  else
    echo "[]"
  fi
}

firewalld_allow() {
  local port="$1" proto="$2"
  if [ "$proto" = "both" ]; then
    firewall-cmd --zone=public --permanent --add-port="${port}/tcp" >/dev/null 2>&1
    firewall-cmd --zone=public --permanent --add-port="${port}/udp" >/dev/null 2>&1
  else
    firewall-cmd --zone=public --permanent --add-port="${port}/${proto}" >/dev/null 2>&1
  fi
  firewall-cmd --reload >/dev/null 2>&1
}

firewalld_deny() {
  local port="$1" proto="$2"
  if [ "$proto" = "both" ]; then
    firewall-cmd --zone=public --permanent --remove-port="${port}/tcp" >/dev/null 2>&1 || true
    firewall-cmd --zone=public --permanent --remove-port="${port}/udp" >/dev/null 2>&1 || true
  else
    firewall-cmd --zone=public --permanent --remove-port="${port}/${proto}" >/dev/null 2>&1 || true
  fi
  firewall-cmd --reload >/dev/null 2>&1
  # Flush conntrack so existing UDP connections are dropped immediately
  if command -v conntrack &>/dev/null; then
    if [ "$proto" = "both" ] || [ "$proto" = "udp" ]; then
      conntrack -D -p udp --dport "$port" 2>/dev/null || true
    fi
    if [ "$proto" = "both" ] || [ "$proto" = "tcp" ]; then
      conntrack -D -p tcp --dport "$port" 2>/dev/null || true
    fi
  fi
}

firewalld_check() {
  local port="$1" proto="$2"
  if [ "$proto" = "both" ]; then
    if firewall-cmd --zone=public --query-port="${port}/tcp" >/dev/null 2>&1 && \
       firewall-cmd --zone=public --query-port="${port}/udp" >/dev/null 2>&1; then
      echo '{"open":true}'
    else
      echo '{"open":false}'
    fi
  else
    if firewall-cmd --zone=public --query-port="${port}/${proto}" >/dev/null 2>&1; then
      echo '{"open":true}'
    else
      echo '{"open":false}'
    fi
  fi
}

firewalld_list() {
  local rules=""
  for entry in $(firewall-cmd --zone=public --list-ports 2>/dev/null); do
    local p="${entry%%/*}"
    local pr="${entry##*/}"
    if [ -n "$rules" ]; then rules="${rules},"; fi
    rules="${rules}{\"port\":${p},\"protocol\":\"${pr}\"}"
  done
  echo "[${rules}]"
}

iptables_allow() {
  local port="$1" proto="$2"
  if [ "$proto" = "both" ]; then
    iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || iptables -A INPUT -p tcp --dport "$port" -j ACCEPT
    iptables -C INPUT -p udp --dport "$port" -j ACCEPT 2>/dev/null || iptables -A INPUT -p udp --dport "$port" -j ACCEPT
  else
    iptables -C INPUT -p "$proto" --dport "$port" -j ACCEPT 2>/dev/null || iptables -A INPUT -p "$proto" --dport "$port" -j ACCEPT
  fi
  if command -v iptables-save &>/dev/null; then
    iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
  fi
}

iptables_deny() {
  local port="$1" proto="$2"
  if [ "$proto" = "both" ]; then
    iptables -D INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null || true
    iptables -D INPUT -p udp --dport "$port" -j ACCEPT 2>/dev/null || true
  else
    iptables -D INPUT -p "$proto" --dport "$port" -j ACCEPT 2>/dev/null || true
  fi
  # Flush conntrack entries so existing connections are dropped immediately
  if command -v conntrack &>/dev/null; then
    if [ "$proto" = "both" ]; then
      conntrack -D -p tcp --dport "$port" 2>/dev/null || true
      conntrack -D -p udp --dport "$port" 2>/dev/null || true
    else
      conntrack -D -p "$proto" --dport "$port" 2>/dev/null || true
    fi
  fi
  if command -v iptables-save &>/dev/null; then
    iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
  fi
}

iptables_check() {
  local port="$1" proto="$2"
  if [ "$proto" = "both" ]; then
    if iptables -C INPUT -p tcp --dport "$port" -j ACCEPT 2>/dev/null && \
       iptables -C INPUT -p udp --dport "$port" -j ACCEPT 2>/dev/null; then
      echo '{"open":true}'
    else
      echo '{"open":false}'
    fi
  else
    if iptables -C INPUT -p "$proto" --dport "$port" -j ACCEPT 2>/dev/null; then
      echo '{"open":true}'
    else
      echo '{"open":false}'
    fi
  fi
}

iptables_list() {
  local rules=""
  while IFS= read -r line; do
    local proto port
    proto=$(echo "$line" | awk '{print $2}')
    port=$(echo "$line" | grep -oP 'dpt:\K[0-9]+')
    if [ -n "$port" ] && [ -n "$proto" ]; then
      if [ -n "$rules" ]; then rules="${rules},"; fi
      rules="${rules}{\"port\":${port},\"protocol\":\"${proto}\"}"
    fi
  done < <(iptables -L INPUT -n 2>/dev/null | grep -E 'ACCEPT.*(tcp|udp).*dpt:' || true)
  echo "[${rules}]"
}

ufw_block_ip() {
  local ip="$1"
  ufw delete deny from "$ip" >/dev/null 2>&1 || true
  ufw insert 1 deny from "$ip" >/dev/null 2>&1
}

ufw_unblock_ip() {
  local ip="$1"
  ufw delete deny from "$ip" >/dev/null 2>&1 || true
}

ufw_list_bans() {
  local ips=""
  while IFS= read -r line; do
    local ip
    ip=$(echo "$line" | awk '{print $3}')
    if [ -n "$ip" ]; then
      if [ -n "$ips" ]; then ips="${ips},"; fi
      ips="${ips}\"${ip}\""
    fi
  done < <(ufw status numbered 2>/dev/null | grep -E 'DENY IN' | grep -E '^\[' | sed -E 's/^\[[ 0-9]+\][[:space:]]+//' | awk '{print $1, $2, $NF}' | grep -v '/' || true)
  echo "[${ips}]"
}

firewalld_block_ip() {
  local ip="$1" family="$2"
  local rule="rule family=\"${family}\" source address=\"${ip}\" drop"
  firewall-cmd --permanent --add-rich-rule="$rule" >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1
}

firewalld_unblock_ip() {
  local ip="$1" family="$2"
  local rule="rule family=\"${family}\" source address=\"${ip}\" drop"
  firewall-cmd --permanent --remove-rich-rule="$rule" >/dev/null 2>&1 || true
  firewall-cmd --reload >/dev/null 2>&1
}

firewalld_list_bans() {
  local ips=""
  while IFS= read -r line; do
    local ip
    ip=$(echo "$line" | grep -oP 'source address="\K[^"]+')
    if [ -n "$ip" ] && echo "$line" | grep -q "drop"; then
      if [ -n "$ips" ]; then ips="${ips},"; fi
      ips="${ips}\"${ip}\""
    fi
  done < <(firewall-cmd --permanent --list-rich-rules 2>/dev/null || true)
  echo "[${ips}]"
}

iptables_block_ip() {
  local ip="$1" family="$2"
  local cmd
  if [ "$family" = "ipv4" ]; then
    cmd="iptables"
  else
    cmd="ip6tables"
  fi
  $cmd -C INPUT -s "$ip" -j DROP 2>/dev/null || $cmd -I INPUT 1 -s "$ip" -j DROP
  if command -v iptables-save &>/dev/null && [ "$family" = "ipv4" ]; then
    iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
  fi
  if command -v ip6tables-save &>/dev/null && [ "$family" = "ipv6" ]; then
    ip6tables-save > /etc/iptables/rules.v6 2>/dev/null || true
  fi
}

iptables_unblock_ip() {
  local ip="$1" family="$2"
  local cmd
  if [ "$family" = "ipv4" ]; then
    cmd="iptables"
  else
    cmd="ip6tables"
  fi
  $cmd -D INPUT -s "$ip" -j DROP 2>/dev/null || true
  if command -v iptables-save &>/dev/null && [ "$family" = "ipv4" ]; then
    iptables-save > /etc/iptables/rules.v4 2>/dev/null || true
  fi
  if command -v ip6tables-save &>/dev/null && [ "$family" = "ipv6" ]; then
    ip6tables-save > /etc/iptables/rules.v6 2>/dev/null || true
  fi
}

iptables_list_bans() {
  local ips=""
  local v4
  v4=$(iptables -S INPUT 2>/dev/null | grep -E '^-A INPUT -s [^ ]+ -j DROP' | awk '{print $4}' | sed 's|/32$||' || true)
  local v6
  v6=$(ip6tables -S INPUT 2>/dev/null | grep -E '^-A INPUT -s [^ ]+ -j DROP' | awk '{print $4}' | sed 's|/128$||' || true)
  while IFS= read -r ip; do
    [ -z "$ip" ] && continue
    if [ -n "$ips" ]; then ips="${ips},"; fi
    ips="${ips}\"${ip}\""
  done < <(printf '%s\n%s\n' "$v4" "$v6" | grep -v '^$' || true)
  echo "[${ips}]"
}

ACTION="${1:-}"
ARG2="${2:-}"
ARG3="${3:-}"

validate_action "$ACTION"

FW=$(detect_firewall)

case "$ACTION" in
  list)
    "${FW}_list"
    exit 0
    ;;
  list-bans)
    "${FW}_list_bans"
    exit 0
    ;;
  block-ip|unblock-ip)
    if [ -z "$ARG2" ]; then
      json_error "Usage: $0 <block-ip|unblock-ip> <ip>"
    fi
    FAMILY=$(validate_ip "$ARG2")
    if [ "$ACTION" = "block-ip" ]; then
      case "$FW" in
        ufw)       ufw_block_ip "$ARG2" ;;
        firewalld) firewalld_block_ip "$ARG2" "$FAMILY" ;;
        iptables)  iptables_block_ip "$ARG2" "$FAMILY" ;;
      esac
      flush_conntrack_ip "$ARG2"
      json_success_ip "block-ip" "$ARG2"
    else
      case "$FW" in
        ufw)       ufw_unblock_ip "$ARG2" ;;
        firewalld) firewalld_unblock_ip "$ARG2" "$FAMILY" ;;
        iptables)  iptables_unblock_ip "$ARG2" "$FAMILY" ;;
      esac
      json_success_ip "unblock-ip" "$ARG2"
    fi
    exit 0
    ;;
esac

# Port-based actions: require port + protocol
if [ -z "$ARG2" ] || [ -z "$ARG3" ]; then
  json_error "Usage: $0 <allow|deny|check|list|block-ip|unblock-ip|list-bans> [port|ip] [tcp|udp|both]"
fi

PORT="$ARG2"
PROTOCOL="$ARG3"

validate_port "$PORT"
validate_protocol "$PROTOCOL"

case "$ACTION" in
  allow)
    "${FW}_allow" "$PORT" "$PROTOCOL"
    json_success "allow" "$PORT" "$PROTOCOL"
    ;;
  deny)
    "${FW}_deny" "$PORT" "$PROTOCOL"
    json_success "deny" "$PORT" "$PROTOCOL"
    ;;
  check)
    "${FW}_check" "$PORT" "$PROTOCOL"
    ;;
esac
