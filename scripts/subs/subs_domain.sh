#!/usr/bin/env bash
# shulkr-domain.sh — Secure domain & SSL management for Shulkr GSMP
# This script is the ONLY entry point for domain/vhost/SSL operations.
# Executed via sudo by the shulkr system user.
# sudoers: shulkr ALL=(root) NOPASSWD: /opt/shulkr/app/scripts/subs/subs_domain.sh

set -euo pipefail

SITES_AVAILABLE="/etc/nginx/sites-available"
SITES_ENABLED="/etc/nginx/sites-enabled"
DOMAIN_REGEX='^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\.[a-zA-Z]{2,}$'
MIN_PORT=1024
MAX_PORT=65535

json_success() { echo "{\"success\":true,\"action\":\"$1\",\"domain\":\"$2\"}"; }
json_error()   { echo "{\"success\":false,\"error\":\"$1\"}" >&2; exit 1; }

validate_action() {
  local action="$1"
  if ! [[ "$action" =~ ^(add|remove|enable-ssl|dns-check|list|renew|check-expiry|ensure-timer|update-panel|reset-panel)$ ]]; then
    json_error "Invalid action"
  fi
}

validate_domain() {
  local domain="$1"

  # Block empty
  if [ -z "$domain" ]; then
    json_error "Domain cannot be empty"
  fi

  # Block path traversal
  if [[ "$domain" == *".."* ]] || [[ "$domain" == *"/"* ]]; then
    json_error "Invalid domain: path traversal detected"
  fi

  # Block shell metacharacters
  local forbidden_chars='[;|&$`(){}<>!#~*?\[\]"'"'"'\\  ]'
  if [[ "$domain" =~ $forbidden_chars ]]; then
    json_error "Invalid domain: contains forbidden characters"
  fi

  # Strict regex validation
  if ! [[ "$domain" =~ $DOMAIN_REGEX ]]; then
    json_error "Invalid domain format: must be a valid FQDN (e.g. play.example.com)"
  fi
}

validate_port() {
  local port="$1"
  if ! [[ "$port" =~ ^[0-9]+$ ]]; then
    json_error "Invalid port: must be numeric"
  fi
  if (( port < MIN_PORT || port > MAX_PORT )); then
    json_error "Port out of range: must be ${MIN_PORT}-${MAX_PORT}"
  fi
}

validate_type() {
  local type="$1"
  if ! [[ "$type" =~ ^(http|tcp|connection|panel)$ ]]; then
    json_error "Invalid type: must be http, tcp, connection, or panel"
  fi
}

safe_vhost_path() {
  local domain="$1"
  local filename
  filename=$(basename "$domain")
  local path="${SITES_AVAILABLE}/${filename}"

  # Verify the resolved path is still inside SITES_AVAILABLE
  local resolved
  resolved=$(readlink -f "$SITES_AVAILABLE")
  local resolved_path="${resolved}/${filename}"
  if [[ "$path" != "${SITES_AVAILABLE}/${filename}" ]]; then
    json_error "Path traversal detected in vhost path"
  fi

  echo "$path"
}

resolve_domain() {
  local domain="$1"
  local ip=""
  if command -v dig &>/dev/null; then
    ip=$(set +o pipefail; dig +short A "$domain" 2>/dev/null | head -1)
  elif command -v host &>/dev/null; then
    ip=$(set +o pipefail; host -t A "$domain" 2>/dev/null | grep "has address" | head -1 | awk '{print $NF}')
  elif command -v nslookup &>/dev/null; then
    ip=$(set +o pipefail; nslookup "$domain" 2>/dev/null | grep -A1 "Name:" | grep "Address:" | awk '{print $2}' | head -1)
  fi
  echo "$ip"
}

get_server_ip() {
  hostname -I 2>/dev/null | awk '{print $1}' || echo ""
}

verify_dns() {
  local domain="$1"
  local server_ip
  server_ip=$(get_server_ip)

  if [ -z "$server_ip" ]; then
    json_error "Cannot determine server IP address"
  fi

  local resolved_ip
  resolved_ip=$(resolve_domain "$domain")

  if [ -z "$resolved_ip" ]; then
    json_error "DNS lookup failed: ${domain} does not resolve to any IP address"
  fi

  if [ "$resolved_ip" != "$server_ip" ]; then
    json_error "DNS mismatch: ${domain} resolves to ${resolved_ip} but server IP is ${server_ip}. Add an A record: ${domain} → ${server_ip}"
  fi
}

nginx_test_and_reload() {
  local nginx_bin
  nginx_bin=$(command -v nginx 2>/dev/null || echo "/usr/sbin/nginx")

  if "$nginx_bin" -t 2>/dev/null; then
    "$nginx_bin" -s reload 2>/dev/null || /usr/bin/systemctl reload nginx 2>/dev/null || true
    return 0
  else
    return 1
  fi
}

generate_http_vhost() {
  local domain="$1" port="$2"
  cat <<VHOST
server {
    listen 80;
    server_name ${domain};
    client_max_body_size 256M;

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
VHOST
}

action_add() {
  local domain="$1" port="$2" type="$3"

  validate_domain "$domain"
  validate_port "$port"
  validate_type "$type"

  local vhost_path
  vhost_path=$(safe_vhost_path "$domain")
  local symlink_path="${SITES_ENABLED}/$(basename "$domain")"

  if [ -f "$vhost_path" ]; then
    json_error "Domain ${domain} already has a vhost configuration"
  fi

  if [ "$type" = "tcp" ] || [ "$type" = "connection" ]; then
    # Connection/TCP domains are DNS-only (A record + SRV record)
    # No Nginx config needed — the Minecraft server handles connections directly
    json_success "add" "$domain"
    exit 0
  else
    generate_http_vhost "$domain" "$port" > "$vhost_path"
    ln -sf "$vhost_path" "$symlink_path"

    if ! nginx_test_and_reload; then
      rm -f "$vhost_path" "$symlink_path"
      json_error "Nginx configuration test failed for ${domain}. Changes rolled back."
    fi
  fi

  json_success "add" "$domain"
}

action_remove() {
  local domain="$1"

  validate_domain "$domain"

  local filename
  filename=$(basename "$domain")

  # Remove HTTP vhost
  rm -f "${SITES_ENABLED}/${filename}"
  rm -f "${SITES_AVAILABLE}/${filename}"

  nginx_test_and_reload || true

  json_success "remove" "$domain"
}

action_enable_ssl() {
  local domain="$1"

  validate_domain "$domain"

  local vhost_path
  vhost_path=$(safe_vhost_path "$domain")

  # Check domain-specific vhost first, then panel vhost
  if [ ! -f "$vhost_path" ]; then
    # Check if this domain is configured in the panel vhost
    if grep -q "server_name ${domain}" "${SITES_AVAILABLE}/shulkr" 2>/dev/null; then
      vhost_path="${SITES_AVAILABLE}/shulkr"
    else
      json_error "No vhost found for ${domain}. Add the domain first."
    fi
  fi

  # Verify DNS points to this server
  verify_dns "$domain"

  local certbot_output

  if [ -d "/etc/letsencrypt/live/${domain}" ]; then
    # Certificate exists but nginx may not be configured for SSL — install it
    certbot_output=$(certbot install --nginx -d "$domain" --cert-name "$domain" --non-interactive --redirect 2>&1) || {
      json_error "Failed to install existing certificate into nginx for ${domain}: ${certbot_output}"
    }
  else
    # Obtain new certificate and configure nginx
    certbot_output=$(certbot --nginx -d "$domain" --non-interactive --agree-tos --register-unsafely-without-email --redirect 2>&1) || {
      json_error "Certbot failed for ${domain}: ${certbot_output}"
    }
  fi

  # Update fallback vhost to redirect to HTTPS if it exists
  local fallback_vhost="${SITES_AVAILABLE}/shulkr-fallback"
  if [ -f "$fallback_vhost" ]; then
    cat > "$fallback_vhost" << FALLBACK
server {
    listen 80 default_server;
    server_name _;
    return 302 https://${domain}\$request_uri;
}
FALLBACK
    nginx_test_and_reload || true
  fi

  # Extract expiry date
  local expiry=""
  if command -v openssl &>/dev/null && [ -f "/etc/letsencrypt/live/${domain}/cert.pem" ]; then
    expiry=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/${domain}/cert.pem" 2>/dev/null | cut -d= -f2)
  fi
  echo "{\"success\":true,\"action\":\"enable-ssl\",\"domain\":\"${domain}\",\"ssl_expires_at\":\"${expiry}\"}"
}

action_list() {
  local domains=""
  for vhost in "${SITES_AVAILABLE}"/*; do
    [ -f "$vhost" ] || continue
    local name
    name=$(basename "$vhost")

    # Skip the default shulkr vhost
    if [ "$name" = "shulkr" ] || [ "$name" = "default" ]; then
      continue
    fi

    local ssl="false"
    local expiry=""
    if [ -d "/etc/letsencrypt/live/${name}" ]; then
      ssl="true"
      if command -v openssl &>/dev/null && [ -f "/etc/letsencrypt/live/${name}/cert.pem" ]; then
        expiry=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/${name}/cert.pem" 2>/dev/null | cut -d= -f2)
      fi
    fi

    if [ -n "$domains" ]; then domains="${domains},"; fi
    domains="${domains}{\"domain\":\"${name}\",\"ssl_enabled\":${ssl},\"ssl_expires_at\":\"${expiry}\"}"
  done
  echo "[${domains}]"
}

action_dns_check() {
  local domain="$1"

  validate_domain "$domain"

  local server_ip
  server_ip=$(get_server_ip)

  if [ -z "$server_ip" ]; then
    json_error "Cannot determine server IP address"
  fi

  local resolved_ip
  resolved_ip=$(resolve_domain "$domain")

  if [ -z "$resolved_ip" ]; then
    echo "{\"matches\":false,\"resolved_ip\":\"\",\"server_ip\":\"${server_ip}\",\"error\":\"DNS lookup failed: ${domain} does not resolve\"}"
    exit 0
  fi

  if [ "$resolved_ip" = "$server_ip" ]; then
    echo "{\"matches\":true,\"resolved_ip\":\"${resolved_ip}\",\"server_ip\":\"${server_ip}\"}"
  else
    echo "{\"matches\":false,\"resolved_ip\":\"${resolved_ip}\",\"server_ip\":\"${server_ip}\",\"error\":\"DNS mismatch: ${domain} resolves to ${resolved_ip} but server IP is ${server_ip}\"}"
  fi
}

action_renew() {
  if certbot renew --non-interactive 2>/dev/null; then
    echo "{\"success\":true,\"action\":\"renew\"}"
  else
    json_error "Certbot renewal failed"
  fi
}

action_check_expiry() {
  local domain="$1"

  validate_domain "$domain"

  if [ ! -f "/etc/letsencrypt/live/${domain}/cert.pem" ]; then
    json_error "No SSL certificate found for ${domain}"
  fi

  local expiry
  expiry=$(openssl x509 -enddate -noout -in "/etc/letsencrypt/live/${domain}/cert.pem" 2>/dev/null | cut -d= -f2)

  if [ -z "$expiry" ]; then
    json_error "Could not read certificate expiry for ${domain}"
  fi

  local expiry_epoch
  expiry_epoch=$(date -d "$expiry" +%s 2>/dev/null || echo "0")
  local now_epoch
  now_epoch=$(date +%s)
  local days_left=$(( (expiry_epoch - now_epoch) / 86400 ))

  echo "{\"domain\":\"${domain}\",\"ssl_expires_at\":\"${expiry}\",\"days_left\":${days_left}}"
}

action_ensure_timer() {
  if systemctl is-active --quiet certbot.timer 2>/dev/null; then
    echo "{\"success\":true,\"timer_active\":true}"
  else
    systemctl enable certbot.timer 2>/dev/null || true
    systemctl start certbot.timer 2>/dev/null || true

    if systemctl is-active --quiet certbot.timer 2>/dev/null; then
      echo "{\"success\":true,\"timer_active\":true,\"activated\":true}"
    else
      json_error "Failed to activate certbot.timer"
    fi
  fi
}

action_update_panel() {
  local domain="$1"

  validate_domain "$domain"

  local panel_vhost="${SITES_AVAILABLE}/shulkr"
  if [ ! -f "$panel_vhost" ]; then
    json_error "Panel vhost not found at ${panel_vhost}"
  fi

  # Update server_name with the domain and remove default_server (fallback handles IP access)
  sed -i "s/listen 80 default_server;/listen 80;/" "$panel_vhost"
  sed -i "s/server_name .*/server_name ${domain};/" "$panel_vhost"

  # Ensure a catch-all vhost exists that redirects IP access to the domain
  local fallback_vhost="${SITES_AVAILABLE}/shulkr-fallback"
  cat > "$fallback_vhost" << FALLBACK
server {
    listen 80 default_server;
    server_name _;
    return 302 http://${domain}\$request_uri;
}
FALLBACK
  ln -sf "$fallback_vhost" "${SITES_ENABLED}/shulkr-fallback"

  if ! nginx_test_and_reload; then
    # Rollback to catch-all
    sed -i "s/server_name .*/server_name _;/" "$panel_vhost"
    nginx_test_and_reload || true
    json_error "Nginx configuration test failed after updating panel domain. Rolled back to default."
  fi

  json_success "update-panel" "$domain"
}

action_reset_panel() {
  local panel_vhost="${SITES_AVAILABLE}/shulkr"
  if [ ! -f "$panel_vhost" ]; then
    json_error "Panel vhost not found at ${panel_vhost}"
  fi

  # Reset server_name to catch-all and restore default_server
  sed -i "s/listen 80;/listen 80 default_server;/" "$panel_vhost"
  sed -i "s/server_name .*/server_name _;/" "$panel_vhost"

  # Remove any certbot SSL config lines (revert to plain HTTP)
  # Certbot adds lines with "managed by Certbot" comments
  if grep -q "managed by Certbot" "$panel_vhost" 2>/dev/null; then
    # Re-generate clean panel vhost
    local port
    port=$(grep -oP 'proxy_pass http://127\.0\.0\.1:\K[0-9]+' "$panel_vhost" | head -1)
    port="${port:-3001}"
    cat > "$panel_vhost" << PANEL_VHOST
server {
    listen 80 default_server;
    server_name _;
    client_max_body_size 256M;

    location / {
        proxy_pass http://127.0.0.1:${port};
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }

    location /ws/ {
        proxy_pass http://127.0.0.1:${port};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    }
}
PANEL_VHOST
  fi

  # Remove fallback vhost (no longer needed when panel uses catch-all)
  rm -f "${SITES_ENABLED}/shulkr-fallback" "${SITES_AVAILABLE}/shulkr-fallback"

  if ! nginx_test_and_reload; then
    json_error "Nginx configuration test failed after resetting panel domain."
  fi

  echo "{\"success\":true,\"action\":\"reset-panel\"}"
}

ACTION="${1:-}"
[ -n "$ACTION" ] || json_error "Usage: $0 <add|remove|enable-ssl|dns-check|list|renew|update-panel|reset-panel> [args...]"

validate_action "$ACTION"

case "$ACTION" in
  add)
    DOMAIN="${2:-}"
    PORT="${3:-}"
    TYPE="${4:-http}"
    [ -n "$DOMAIN" ] && [ -n "$PORT" ] || json_error "Usage: $0 add <domain> <port> [http|tcp|panel]"
    action_add "$DOMAIN" "$PORT" "$TYPE"
    ;;
  remove)
    DOMAIN="${2:-}"
    [ -n "$DOMAIN" ] || json_error "Usage: $0 remove <domain>"
    action_remove "$DOMAIN"
    ;;
  enable-ssl)
    DOMAIN="${2:-}"
    [ -n "$DOMAIN" ] || json_error "Usage: $0 enable-ssl <domain>"
    action_enable_ssl "$DOMAIN"
    ;;
  dns-check)
    DOMAIN="${2:-}"
    [ -n "$DOMAIN" ] || json_error "Usage: $0 dns-check <domain>"
    action_dns_check "$DOMAIN"
    ;;
  list)
    action_list
    ;;
  renew)
    action_renew
    ;;
  update-panel)
    DOMAIN="${2:-}"
    [ -n "$DOMAIN" ] || json_error "Usage: $0 update-panel <domain>"
    action_update_panel "$DOMAIN"
    ;;
  check-expiry)
    DOMAIN="${2:-}"
    [ -n "$DOMAIN" ] || json_error "Usage: $0 check-expiry <domain>"
    action_check_expiry "$DOMAIN"
    ;;
  ensure-timer)
    action_ensure_timer
    ;;
  reset-panel)
    action_reset_panel
    ;;
esac
