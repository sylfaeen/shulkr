#!/usr/bin/env bash
# subs_firewall.sh — unified firewall management for Shulkr.
# Sole entry point for firewall mutations, executed via sudo.
# sudoers: shulkr ALL=(ALL) NOPASSWD: /opt/shulkr/scripts/subs/subs_firewall.sh
#
# Usage:
#   subs_firewall.sh allow|deny <port-or-range|""> <tcp|udp|both> [from-ip|""]
#   subs_firewall.sh check <port> <tcp|udp|both>
#   subs_firewall.sh list
#
# `port` may be empty (rule applies to all ports), a single number ("25565"),
# or a colon-separated range ("1024:65535"). `from-ip` may be empty (any source)
# or a single IPv4/IPv6 address. At least one of `port` or `from-ip` must be set.

set -euo pipefail

RESERVED_PORTS="22 80 443 3000 3001"
MIN_PORT=1024
MAX_PORT=65535

json_success() {
  local action="$1" port="$2" proto="$3" from_ip="$4"
  local port_json
  if [ -z "$port" ]; then port_json="null"; else port_json="\"${port}\""; fi
  local from_json
  if [ -z "$from_ip" ]; then from_json="null"; else from_json="\"${from_ip}\""; fi
  echo "{\"success\":true,\"action\":\"${action}\",\"port\":${port_json},\"protocol\":\"${proto}\",\"from_ip\":${from_json}}"
}
json_error() { echo "{\"success\":false,\"error\":\"$1\"}" >&2; exit 1; }

detect_firewall() {
  if command -v ufw &>/dev/null; then echo "ufw"
  elif command -v firewall-cmd &>/dev/null; then echo "firewalld"
  elif command -v iptables &>/dev/null; then echo "iptables"
  else json_error "No supported firewall found (ufw, firewalld, iptables)"
  fi
}

validate_action() {
  if ! [[ "$1" =~ ^(allow|deny|check|list)$ ]]; then
    json_error "Invalid action: must be allow, deny, check, or list"
  fi
}

validate_protocol() {
  if ! [[ "$1" =~ ^(tcp|udp|both)$ ]]; then
    json_error "Invalid protocol: must be tcp, udp, or both"
  fi
}

# Validates a single port number in [MIN_PORT, MAX_PORT] and not reserved.
validate_single_port() {
  local port="$1"
  if ! [[ "$port" =~ ^[0-9]+$ ]]; then json_error "Invalid port: must be numeric"; fi
  if (( port < MIN_PORT || port > MAX_PORT )); then
    json_error "Port out of range: must be ${MIN_PORT}-${MAX_PORT}"
  fi
  for reserved in $RESERVED_PORTS; do
    if (( port == reserved )); then json_error "Port ${port} is reserved and cannot be managed"; fi
  done
}

# Validates a port spec: empty (any), single port, or range "low:high".
validate_port_spec() {
  local spec="$1"
  if [ -z "$spec" ]; then return; fi
  if [[ "$spec" =~ ^[0-9]+$ ]]; then
    validate_single_port "$spec"
    return
  fi
  if [[ "$spec" =~ ^([0-9]+):([0-9]+)$ ]]; then
    local low="${BASH_REMATCH[1]}" high="${BASH_REMATCH[2]}"
    if (( low > high )); then json_error "Invalid range: low must be <= high"; fi
    validate_single_port "$low"
    validate_single_port "$high"
    for reserved in $RESERVED_PORTS; do
      if (( reserved >= low && reserved <= high )); then
        json_error "Range ${spec} contains reserved port ${reserved}"
      fi
    done
    return
  fi
  json_error "Invalid port spec: must be empty, a number, or a range (e.g. 1024:65535)"
}

detect_ip_family() {
  local ip="$1"
  if [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    local IFS='.' ; local -a octets
    read -ra octets <<< "$ip"
    for octet in "${octets[@]}"; do
      if (( octet > 255 )); then echo "invalid"; return; fi
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

validate_from_ip() {
  if [ -z "$1" ]; then return; fi
  local family
  family=$(detect_ip_family "$1")
  if [ "$family" = "invalid" ]; then json_error "invalid_ip"; fi
}

# UFW backend ----------------------------------------------------------------

# Translate a range "low:high" to UFW's "low:high" syntax (already supported).
ufw_port_arg() {
  local port="$1" proto="$2"
  if [ -z "$port" ]; then echo ""; return; fi
  echo "${port}/${proto}"
}

# Build a UFW rule clause for a single proto.
ufw_rule_for_proto() {
  local action="$1" port="$2" proto="$3" from_ip="$4"
  # Order: <action> [proto X] [from Y] [to any [port Z]]
  local cmd="ufw $action"
  if [ -n "$from_ip" ]; then
    cmd+=" proto $proto from $from_ip"
    if [ -n "$port" ]; then cmd+=" to any port $port"; fi
  else
    # Pure port rule
    cmd+=" $port/$proto"
  fi
  echo "$cmd"
}

ufw_apply() {
  local action="$1" port="$2" proto="$3" from_ip="$4"
  local protos=("$proto")
  if [ "$proto" = "both" ]; then protos=("tcp" "udp"); fi
  for p in "${protos[@]}"; do
    # Best-effort cleanup of the inverse rule before applying.
    local opposite="deny"
    if [ "$action" = "deny" ]; then opposite="allow"; fi
    local cleanup
    cleanup=$(ufw_rule_for_proto "$opposite" "$port" "$p" "$from_ip")
    eval "ufw delete ${cleanup#ufw }" >/dev/null 2>&1 || true
    local apply
    apply=$(ufw_rule_for_proto "$action" "$port" "$p" "$from_ip")
    eval "$apply" >/dev/null 2>&1
  done
  if [ "$action" = "deny" ] && command -v conntrack &>/dev/null; then
    if [ -n "$from_ip" ]; then
      conntrack -D -s "$from_ip" 2>/dev/null || true
    fi
    if [ -n "$port" ] && [[ "$port" =~ ^[0-9]+$ ]]; then
      for p in "${protos[@]}"; do conntrack -D -p "$p" --dport "$port" 2>/dev/null || true; done
    fi
  fi
}

ufw_check_port() {
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
  local rules=""
  while IFS= read -r line; do
    if [ -n "$rules" ]; then rules="${rules},"; fi
    rules="${rules}${line}"
  done < <(ufw status numbered 2>/dev/null | grep -E '^\[' | sed -E 's/\[([0-9]+)\]\s+([^[:space:]]+)\s+(ALLOW|DENY)\s+IN.*/{"raw":"\2","action":"\3"}/' | grep -E '^\{')
  echo "[${rules}]"
}

# firewalld backend (port-only; from-IP via rich rules) ----------------------

firewalld_apply_port() {
  local action="$1" port="$2" proto="$3"
  local protos=("$proto")
  if [ "$proto" = "both" ]; then protos=("tcp" "udp"); fi
  for p in "${protos[@]}"; do
    if [ "$action" = "allow" ]; then
      firewall-cmd --zone=public --permanent --add-port="${port}/${p}" >/dev/null 2>&1
    else
      firewall-cmd --zone=public --permanent --remove-port="${port}/${p}" >/dev/null 2>&1 || true
    fi
  done
  firewall-cmd --reload >/dev/null 2>&1
}

firewalld_apply_ip() {
  local action="$1" from_ip="$2" family="$3"
  local rule="rule family=\"${family}\" source address=\"${from_ip}\" drop"
  if [ "$action" = "deny" ]; then
    firewall-cmd --permanent --add-rich-rule="$rule" >/dev/null 2>&1 || true
  else
    firewall-cmd --permanent --remove-rich-rule="$rule" >/dev/null 2>&1 || true
  fi
  firewall-cmd --reload >/dev/null 2>&1
}

firewalld_apply() {
  local action="$1" port="$2" proto="$3" from_ip="$4"
  if [ -n "$from_ip" ]; then
    local family
    family=$(detect_ip_family "$from_ip")
    firewalld_apply_ip "$action" "$from_ip" "$family"
  fi
  if [ -n "$port" ]; then firewalld_apply_port "$action" "$port" "$proto"; fi
}

firewalld_check_port() {
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
    if [ -n "$rules" ]; then rules="${rules},"; fi
    rules="${rules}{\"raw\":\"${entry}\",\"action\":\"ALLOW\"}"
  done
  echo "[${rules}]"
}

# iptables backend -----------------------------------------------------------

iptables_apply_port() {
  local action="$1" port="$2" proto="$3"
  local op_target
  if [ "$action" = "allow" ]; then op_target="ACCEPT"; else op_target="DROP"; fi
  local protos=("$proto")
  if [ "$proto" = "both" ]; then protos=("tcp" "udp"); fi
  for p in "${protos[@]}"; do
    if [ "$action" = "allow" ]; then
      iptables -C INPUT -p "$p" --dport "$port" -j "$op_target" 2>/dev/null \
        || iptables -A INPUT -p "$p" --dport "$port" -j "$op_target"
    else
      iptables -D INPUT -p "$p" --dport "$port" -j ACCEPT 2>/dev/null || true
    fi
  done
}

iptables_apply_ip() {
  local action="$1" from_ip="$2" family="$3"
  local cmd
  if [ "$family" = "ipv4" ]; then cmd="iptables"; else cmd="ip6tables"; fi
  if [ "$action" = "deny" ]; then
    $cmd -C INPUT -s "$from_ip" -j DROP 2>/dev/null || $cmd -I INPUT 1 -s "$from_ip" -j DROP
  else
    $cmd -D INPUT -s "$from_ip" -j DROP 2>/dev/null || true
  fi
}

iptables_apply() {
  local action="$1" port="$2" proto="$3" from_ip="$4"
  if [ -n "$from_ip" ]; then
    local family
    family=$(detect_ip_family "$from_ip")
    iptables_apply_ip "$action" "$from_ip" "$family"
  fi
  if [ -n "$port" ]; then iptables_apply_port "$action" "$port" "$proto"; fi
  if command -v iptables-save &>/dev/null; then iptables-save > /etc/iptables/rules.v4 2>/dev/null || true; fi
  if command -v ip6tables-save &>/dev/null; then ip6tables-save > /etc/iptables/rules.v6 2>/dev/null || true; fi
}

iptables_check_port() {
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
    if [ -n "$rules" ]; then rules="${rules},"; fi
    rules="${rules}${line}"
  done < <(iptables -L INPUT -n 2>/dev/null | grep -E 'ACCEPT.*(tcp|udp).*dpt:' | awk '{print "{\"raw\":\""$0"\",\"action\":\"ALLOW\"}"}' || true)
  echo "[${rules}]"
}

# Entry point ----------------------------------------------------------------

ACTION="${1:-}"
ARG2="${2:-}"
ARG3="${3:-}"
ARG4="${4:-}"

validate_action "$ACTION"
FW=$(detect_firewall)

if [ "$ACTION" = "list" ]; then
  "${FW}_list"
  exit 0
fi

if [ "$ACTION" = "check" ]; then
  if [ -z "$ARG2" ] || [ -z "$ARG3" ]; then
    json_error "Usage: $0 check <port> <tcp|udp|both>"
  fi
  validate_single_port "$ARG2"
  validate_protocol "$ARG3"
  "${FW}_check_port" "$ARG2" "$ARG3"
  exit 0
fi

# allow|deny: <port-or-range|""> <protocol> [<from-ip|"">]
PORT="$ARG2"
PROTOCOL="$ARG3"
FROM_IP="$ARG4"

if [ -z "$PROTOCOL" ]; then
  json_error "Usage: $0 $ACTION <port-or-range|\"\"> <tcp|udp|both> [from-ip|\"\"]"
fi
if [ -z "$PORT" ] && [ -z "$FROM_IP" ]; then
  json_error "At least one of port or from-ip must be set"
fi

validate_port_spec "$PORT"
validate_protocol "$PROTOCOL"
validate_from_ip "$FROM_IP"

"${FW}_apply" "$ACTION" "$PORT" "$PROTOCOL" "$FROM_IP"
json_success "$ACTION" "$PORT" "$PROTOCOL" "$FROM_IP"
