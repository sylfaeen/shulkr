#!/usr/bin/env bash
# subs_database.sh: secure MariaDB management for Shulkr GSMP
# This script is the ONLY entry point for database operations.
# Executed via sudo by the shulkr system user.
# sudoers: shulkr ALL=(root) NOPASSWD: /opt/shulkr/app/scripts/subs/subs_database.sh
#
# Usage:
#   subs_database.sh install
#   subs_database.sh create-db <dbname> <username>          (password on stdin)
#   subs_database.sh drop-db <dbname>
#   subs_database.sh rotate-password <username> <host>      (password on stdin)
#   subs_database.sh grant-access <dbname> <username> <ip> <read|write>  (password on stdin)
#   subs_database.sh revoke-access <username> <ip>
#   subs_database.sh set-bind <127.0.0.1|0.0.0.0>
#   subs_database.sh usage
#   subs_database.sh prune-dumps <days>
#
# Passwords are read from stdin, never passed as arguments: a command line argument is visible in the process table to every process on the machine.

set -euo pipefail

CONF_FILE="/etc/mysql/mariadb.conf.d/60-shulkr.cnf"
SSL_DIR="/etc/mysql/shulkr-ssl"
DUMP_DIR="/var/lib/shulkr/db-dumps"
RESERVED_DATABASES="mysql information_schema performance_schema sys test"

json_success() { echo "{\"success\":true,\"action\":\"$1\"}"; }
json_error()   { echo "{\"success\":false,\"error\":\"$1\"}" >&2; exit 1; }

mysql_bin() {
  if command -v mariadb &>/dev/null; then echo "mariadb"
  elif command -v mysql &>/dev/null; then echo "mysql"
  else json_error "MariaDB client not found"
  fi
}

dump_bin() {
  if command -v mariadb-dump &>/dev/null; then echo "mariadb-dump"
  elif command -v mysqldump &>/dev/null; then echo "mysqldump"
  else json_error "MariaDB dump tool not found"
  fi
}

# Runs SQL read from stdin as root through the unix socket. No password is ever stored or passed on a command line: root authenticates via unix_socket.
run_sql() {
  local bin
  bin="$(mysql_bin)"
  "$bin" --protocol=socket -u root --batch --skip-column-names 2>/dev/null
}

validate_action() {
  if ! [[ "$1" =~ ^(install|create-db|drop-db|rotate-password|grant-access|revoke-access|set-bind|usage|prune-dumps)$ ]]; then
    json_error "Invalid action: must be install, create-db, drop-db, rotate-password, grant-access, revoke-access, set-bind, usage or prune-dumps"
  fi
}

# A database name must carry the Shulkr prefix. This is the single most useful guard in this script: even a fully compromised backend cannot target a database outside the Shulkr perimeter, mysql included.
validate_db_name() {
  local name="$1"
  if [ -z "$name" ]; then json_error "Database name cannot be empty"; fi
  if ! [[ "$name" =~ ^s_[a-z0-9][a-z0-9_]{0,29}$ ]]; then
    json_error "Invalid database name: must match s_<prefix>_<slug>, lowercase alphanumeric and underscore, max 32 chars"
  fi
  for reserved in $RESERVED_DATABASES; do
    if [ "$name" = "$reserved" ]; then json_error "Database '${name}' is reserved"; fi
  done
}

validate_user_name() {
  local name="$1"
  if [ -z "$name" ]; then json_error "Username cannot be empty"; fi
  if ! [[ "$name" =~ ^[ua]_[a-z0-9][a-z0-9_]{0,29}$ ]]; then
    json_error "Invalid username: must match u_<prefix>_<slug> or a_<prefix>_<id>, lowercase alphanumeric and underscore, max 32 chars"
  fi
  if [[ "$name" =~ ^(root|mysql|mariadb)$ ]]; then json_error "Username '${name}' is reserved"; fi
}

# Defense in depth against SQL injection through the password. Identifiers and passwords cannot be bound as parameters in DDL, so validation is the only guarantee we have.
validate_password() {
  local password="$1"
  if [ -z "$password" ]; then json_error "Password cannot be empty"; fi
  if [[ "$password" =~ [[:cntrl:]] ]]; then json_error "Invalid password: control characters not allowed"; fi
  if [[ "$password" == *"'"* ]] || [[ "$password" == *'"'* ]] || [[ "$password" == *'\'* ]] || [[ "$password" == *'`'* ]]; then
    json_error "Invalid password: quotes, backslashes and backticks not allowed"
  fi
}

# A single literal address only. Wildcards, CIDR notations and hostnames are refused here too, not only in the backend: this script must hold on its own.
validate_ip() {
  local ip="$1"
  if [ -z "$ip" ]; then json_error "IP address cannot be empty"; fi
  if [[ "$ip" == *"%"* ]] || [[ "$ip" == *"/"* ]] || [[ "$ip" == *"*"* ]]; then
    json_error "Invalid IP: wildcards and CIDR notations are not allowed"
  fi
  if [[ "$ip" =~ ^([0-9]{1,3}\.){3}[0-9]{1,3}$ ]]; then
    local octet
    for octet in ${ip//./ }; do
      if (( octet > 255 )); then json_error "Invalid IPv4 address: ${ip}"; fi
    done
    if [ "$ip" = "0.0.0.0" ]; then json_error "Invalid IP: 0.0.0.0 is not a valid source address"; fi
    return
  fi
  if [[ "$ip" =~ ^[0-9a-fA-F:]+$ ]] && [[ "$ip" == *":"* ]]; then return; fi
  json_error "Invalid IP: must be a single literal IPv4 or IPv6 address"
}

validate_host() {
  local host="$1"
  if [ "$host" = "127.0.0.1" ]; then return; fi
  validate_ip "$host"
}

validate_scope() {
  if ! [[ "$1" =~ ^(read|write)$ ]]; then json_error "Invalid scope: must be read or write"; fi
}

validate_bind() {
  if ! [[ "$1" =~ ^(127\.0\.0\.1|0\.0\.0\.0)$ ]]; then json_error "Invalid bind address: must be 127.0.0.1 or 0.0.0.0"; fi
}

read_password_from_stdin() {
  local password
  IFS= read -r password || json_error "Password expected on stdin"
  validate_password "$password"
  printf '%s' "$password"
}

service_name() {
  if systemctl list-unit-files 2>/dev/null | grep -q '^mariadb\.service'; then echo "mariadb"
  else echo "mysql"
  fi
}

ensure_running() {
  local svc
  svc="$(service_name)"
  if ! systemctl is-active --quiet "$svc"; then
    json_error "MariaDB is not running. Start it with: systemctl start ${svc}"
  fi
}

install_packages() {
  if command -v mariadbd &>/dev/null || command -v mysqld &>/dev/null; then return; fi

  if command -v apt-get &>/dev/null; then
    DEBIAN_FRONTEND=noninteractive apt-get install -o Dpkg::Options::="--force-confdef" -o Dpkg::Options::="--force-confold" -y -qq mariadb-server >/dev/null 2>&1 \
      || json_error "Failed to install mariadb-server"
  elif command -v dnf &>/dev/null; then
    dnf install -y -q mariadb-server >/dev/null 2>&1 || json_error "Failed to install mariadb-server"
  else
    json_error "Unsupported distribution: no apt-get or dnf found"
  fi
}

# Total RAM in MB, used to size the InnoDB buffer pool. A Shulkr box also runs one JVM per Minecraft server, so MariaDB must not claim its default share.
buffer_pool_mb() {
  local total_mb
  total_mb=$(awk '/MemTotal/ {printf "%d", $2 / 1024}' /proc/meminfo 2>/dev/null || echo 2048)
  if (( total_mb <= 2048 )); then echo 128
  elif (( total_mb <= 4096 )); then echo 256
  else echo 512
  fi
}

write_config() {
  local conf_dir
  conf_dir="$(dirname "$CONF_FILE")"
  mkdir -p "$conf_dir"

  cat > "$CONF_FILE" << CONF
[mysqld]
bind-address = 127.0.0.1
skip-symbolic-links
local-infile = 0
event_scheduler = OFF
max_connections = 200
innodb_buffer_pool_size = $(buffer_pool_mb)M
ssl_ca = ${SSL_DIR}/ca.pem
ssl_cert = ${SSL_DIR}/server-cert.pem
ssl_key = ${SSL_DIR}/server-key.pem
CONF
  chmod 644 "$CONF_FILE"
}

generate_certificates() {
  if [ -f "${SSL_DIR}/ca.pem" ] && openssl x509 -checkend 2592000 -noout -in "${SSL_DIR}/ca.pem" &>/dev/null; then
    return
  fi

  mkdir -p "$SSL_DIR"

  openssl req -x509 -newkey rsa:2048 -days 3650 -nodes -sha256 \
    -keyout "${SSL_DIR}/ca-key.pem" -out "${SSL_DIR}/ca.pem" \
    -subj "/CN=Shulkr Database CA" >/dev/null 2>&1 || json_error "Failed to generate the certificate authority"

  openssl req -newkey rsa:2048 -days 3650 -nodes -sha256 \
    -keyout "${SSL_DIR}/server-key.pem" -out "${SSL_DIR}/server-req.pem" \
    -subj "/CN=shulkr-mariadb" >/dev/null 2>&1 || json_error "Failed to generate the server certificate request"

  openssl x509 -req -in "${SSL_DIR}/server-req.pem" -days 3650 -sha256 \
    -CA "${SSL_DIR}/ca.pem" -CAkey "${SSL_DIR}/ca-key.pem" -CAcreateserial \
    -out "${SSL_DIR}/server-cert.pem" >/dev/null 2>&1 || json_error "Failed to sign the server certificate"

  rm -f "${SSL_DIR}/server-req.pem"
  chown -R mysql:mysql "$SSL_DIR" 2>/dev/null || true
  chmod 700 "$SSL_DIR"
  chmod 600 "${SSL_DIR}"/*.pem
  chmod 644 "${SSL_DIR}/ca.pem"
}

# Equivalent of mysql_secure_installation, minus the root password: root stays on unix_socket authentication so that no secret exists to be stolen.
secure_installation() {
  run_sql << 'SQL' || json_error "Failed to harden the MariaDB instance"
DELETE FROM mysql.global_priv WHERE User='';
DELETE FROM mysql.global_priv WHERE User='root' AND Host NOT IN ('localhost','127.0.0.1','::1');
DROP DATABASE IF EXISTS test;
DELETE FROM mysql.db WHERE Db='test' OR Db='test\\_%';
FLUSH PRIVILEGES;
SQL
}

action_install() {
  install_packages

  local svc
  svc="$(service_name)"
  systemctl enable "$svc" >/dev/null 2>&1 || true
  systemctl start "$svc" >/dev/null 2>&1 || true

  generate_certificates
  write_config

  mkdir -p "$DUMP_DIR"
  chown root:root "$DUMP_DIR"
  chmod 700 "$DUMP_DIR"

  systemctl restart "$svc" >/dev/null 2>&1 || json_error "MariaDB failed to restart after configuration"
  secure_installation

  json_success "install"
}

action_create_db() {
  local dbname="$1" username="$2"

  validate_db_name "$dbname"
  validate_user_name "$username"
  ensure_running

  local password
  password="$(read_password_from_stdin)"

  local exists
  exists=$(echo "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${dbname}';" | run_sql)
  if [ "$exists" != "0" ]; then json_error "Database '${dbname}' already exists"; fi

  run_sql << SQL || json_error "Failed to create database '${dbname}'"
CREATE DATABASE \`${dbname}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER '${username}'@'127.0.0.1' IDENTIFIED BY '${password}' WITH MAX_USER_CONNECTIONS 30;
GRANT ALL PRIVILEGES ON \`${dbname}\`.* TO '${username}'@'127.0.0.1';
FLUSH PRIVILEGES;
SQL

  json_success "create-db"
}

# A dump is a full plaintext copy of the database. It is owned by root so that no Minecraft server on this machine can read another server's data from it.
dump_database() {
  local dbname="$1"
  local stamp
  stamp=$(date +%Y%m%d-%H%M%S)
  local target="${DUMP_DIR}/${dbname}-${stamp}.sql.gz"

  mkdir -p "$DUMP_DIR"
  chown root:root "$DUMP_DIR"
  chmod 700 "$DUMP_DIR"

  local bin
  bin="$(dump_bin)"
  if ! "$bin" --protocol=socket -u root --single-transaction --routines "$dbname" 2>/dev/null | gzip > "$target"; then
    rm -f "$target"
    json_error "Failed to dump database '${dbname}', aborting deletion"
  fi

  chown root:root "$target"
  chmod 600 "$target"
}

action_drop_db() {
  local dbname="$1"

  validate_db_name "$dbname"
  ensure_running

  local exists
  exists=$(echo "SELECT COUNT(*) FROM information_schema.schemata WHERE schema_name='${dbname}';" | run_sql)
  if [ "$exists" = "0" ]; then json_success "drop-db"; exit 0; fi

  dump_database "$dbname"

  local grantees
  grantees=$(echo "SELECT CONCAT(grantee) FROM information_schema.schema_privileges WHERE table_schema='${dbname}' GROUP BY grantee;" | run_sql)

  local grantee
  while IFS= read -r grantee; do
    [ -n "$grantee" ] || continue
    echo "DROP USER IF EXISTS ${grantee};" | run_sql || true
  done <<< "$grantees"

  run_sql << SQL || json_error "Failed to drop database '${dbname}'"
DROP DATABASE \`${dbname}\`;
FLUSH PRIVILEGES;
SQL

  json_success "drop-db"
}

action_rotate_password() {
  local username="$1" host="$2"

  validate_user_name "$username"
  validate_host "$host"
  ensure_running

  local password
  password="$(read_password_from_stdin)"

  run_sql << SQL || json_error "Failed to rotate the password for '${username}'"
ALTER USER '${username}'@'${host}' IDENTIFIED BY '${password}';
FLUSH PRIVILEGES;
SQL

  json_success "rotate-password"
}

validate_tls_mode() {
  if ! [[ "$1" =~ ^(ssl|x509)$ ]]; then json_error "Invalid TLS mode: must be ssl or x509"; fi
}

# Escapes a PEM file into a JSON string value. Certificates travel in the response rather than through a file: the backend runs unprivileged and must never read from /etc/mysql.
pem_to_json() {
  awk '{printf "%s\\n", $0}' "$1"
}

issue_client_certificate() {
  local username="$1"
  local workdir
  workdir=$(mktemp -d)
  chmod 700 "$workdir"

  openssl req -newkey rsa:2048 -days 3650 -nodes -sha256 \
    -keyout "${workdir}/client-key.pem" -out "${workdir}/client-req.pem" \
    -subj "/CN=${username}" >/dev/null 2>&1 || { rm -rf "$workdir"; json_error "Failed to generate the client certificate request"; }

  openssl x509 -req -in "${workdir}/client-req.pem" -days 3650 -sha256 \
    -CA "${SSL_DIR}/ca.pem" -CAkey "${SSL_DIR}/ca-key.pem" -CAcreateserial \
    -out "${workdir}/client-cert.pem" >/dev/null 2>&1 || { rm -rf "$workdir"; json_error "Failed to sign the client certificate"; }

  CLIENT_CERT_JSON=$(pem_to_json "${workdir}/client-cert.pem")
  CLIENT_KEY_JSON=$(pem_to_json "${workdir}/client-key.pem")
  rm -rf "$workdir"
}

action_grant_access() {
  local dbname="$1" username="$2" ip="$3" scope="$4" tls_mode="${5:-ssl}"

  validate_db_name "$dbname"
  validate_user_name "$username"
  validate_ip "$ip"
  validate_scope "$scope"
  validate_tls_mode "$tls_mode"
  ensure_running

  local password
  password="$(read_password_from_stdin)"

  # A write scope grants row operations only. Schema privileges (CREATE, ALTER, DROP, INDEX) stay with the plugin user: a remote consumer must never be able to reshape or destroy the plugin's tables.
  local privileges="SELECT"
  if [ "$scope" = "write" ]; then privileges="SELECT, INSERT, UPDATE, DELETE"; fi

  # REQUIRE SSL encrypts the connection but authenticates nobody. REQUIRE X509 additionally demands a client certificate signed by our own authority, so a stolen password alone no longer grants access.
  local requirement="REQUIRE SSL"
  CLIENT_CERT_JSON=""
  CLIENT_KEY_JSON=""

  if [ "$tls_mode" = "x509" ]; then
    requirement="REQUIRE X509"
    issue_client_certificate "$username"
  fi

  run_sql << SQL || json_error "Failed to grant access on '${dbname}' to '${username}'"
CREATE USER '${username}'@'${ip}' IDENTIFIED BY '${password}' ${requirement} WITH MAX_USER_CONNECTIONS 10;
GRANT ${privileges} ON \`${dbname}\`.* TO '${username}'@'${ip}';
FLUSH PRIVILEGES;
SQL

  if [ "$tls_mode" = "x509" ]; then
    echo "{\"success\":true,\"action\":\"grant-access\",\"clientCert\":\"${CLIENT_CERT_JSON}\",\"clientKey\":\"${CLIENT_KEY_JSON}\"}"
  else
    json_success "grant-access"
  fi
}

action_revoke_access() {
  local username="$1" ip="$2"

  validate_user_name "$username"
  validate_ip "$ip"
  ensure_running

  run_sql << SQL || json_error "Failed to revoke access for '${username}'"
DROP USER IF EXISTS '${username}'@'${ip}';
FLUSH PRIVILEGES;
SQL

  json_success "revoke-access"
}

# Once the port is reachable, the IP allowlist limits who can try, not how many times they can. fail2ban is already installed by install.sh.
configure_fail2ban_jail() {
  command -v fail2ban-client &>/dev/null || return 0
  [ -d /etc/fail2ban ] || return 0

  mkdir -p /etc/fail2ban/filter.d /etc/fail2ban/jail.d

  cat > /etc/fail2ban/filter.d/shulkr-mariadb.conf << 'FILTER'
[Definition]
failregex = ^.*\[Warning\] Access denied for user .* \(using password: (YES|NO)\)$
ignoreregex =
FILTER

  cat > /etc/fail2ban/jail.d/shulkr-mariadb.conf << JAIL
[shulkr-mariadb]
enabled = true
port = 3306
filter = shulkr-mariadb
logpath = /var/log/mysql/error.log
          /var/log/mariadb/mariadb.log
          /var/log/syslog
backend = auto
maxretry = 5
findtime = 600
bantime = 3600
JAIL

  systemctl reload fail2ban >/dev/null 2>&1 || systemctl restart fail2ban >/dev/null 2>&1 || true
}

disable_fail2ban_jail() {
  [ -f /etc/fail2ban/jail.d/shulkr-mariadb.conf ] || return 0

  rm -f /etc/fail2ban/jail.d/shulkr-mariadb.conf
  systemctl reload fail2ban >/dev/null 2>&1 || systemctl restart fail2ban >/dev/null 2>&1 || true
}

action_set_bind() {
  local address="$1"

  validate_bind "$address"

  if [ ! -f "$CONF_FILE" ]; then json_error "Shulkr MariaDB configuration not found, run: subs_database.sh install"; fi

  local previous
  previous=$(grep -E '^bind-address' "$CONF_FILE" | awk -F'= *' '{print $2}' | tr -d '[:space:]')
  if [ "$previous" = "$address" ]; then json_success "set-bind"; exit 0; fi

  sed -i "s|^bind-address.*|bind-address = ${address}|" "$CONF_FILE"

  local svc
  svc="$(service_name)"
  if ! systemctl restart "$svc" >/dev/null 2>&1; then
    sed -i "s|^bind-address.*|bind-address = ${previous}|" "$CONF_FILE"
    systemctl restart "$svc" >/dev/null 2>&1 || true
    json_error "MariaDB failed to restart with bind-address ${address}, previous value restored"
  fi

  if [ "$address" = "0.0.0.0" ]; then
    configure_fail2ban_jail
  else
    disable_fail2ban_jail
  fi

  json_success "set-bind"
}

# Sizes and live connections for every Shulkr database. Read as root because an application user only ever sees the rows it has privileges on, which would make information_schema look empty.
action_usage() {
  ensure_running

  local sizes
  sizes=$(echo "SELECT table_schema, COALESCE(SUM(data_length + index_length), 0) FROM information_schema.tables WHERE table_schema LIKE 's\\_%' GROUP BY table_schema;" | run_sql)

  local connections
  connections=$(echo "SELECT USER, SUBSTRING_INDEX(HOST, ':', 1) FROM information_schema.processlist WHERE USER LIKE 'a\\_%' GROUP BY USER, SUBSTRING_INDEX(HOST, ':', 1);" | run_sql)

  local databases_json="" row name bytes
  while IFS=$'\t' read -r name bytes; do
    [ -n "$name" ] || continue
    [ -z "$databases_json" ] || databases_json="${databases_json},"
    databases_json="${databases_json}{\"name\":\"${name}\",\"bytes\":${bytes:-0}}"
  done <<< "$sizes"

  local activity_json="" user host
  while IFS=$'\t' read -r user host; do
    [ -n "$user" ] || continue
    [ -z "$activity_json" ] || activity_json="${activity_json},"
    activity_json="${activity_json}{\"user\":\"${user}\",\"host\":\"${host}\"}"
  done <<< "$connections"

  echo "{\"success\":true,\"action\":\"usage\",\"databases\":[${databases_json}],\"activity\":[${activity_json}]}"
}

action_prune_dumps() {
  local days="$1"

  if ! [[ "$days" =~ ^[0-9]+$ ]]; then json_error "Invalid retention: must be a number of days"; fi
  if (( days < 1 || days > 365 )); then json_error "Invalid retention: must be between 1 and 365 days"; fi
  if [ ! -d "$DUMP_DIR" ]; then json_success "prune-dumps"; exit 0; fi

  # Only files matching the dump naming pattern, inside the dump directory, are ever removed. A delete running as root deserves the same paranoia as SQL.
  find "$DUMP_DIR" -maxdepth 1 -type f -name 's_*.sql.gz' -mtime "+${days}" -delete 2>/dev/null || true

  json_success "prune-dumps"
}

ACTION="${1:-}"
[ -n "$ACTION" ] || json_error "Usage: $0 <install|create-db|drop-db|rotate-password|grant-access|revoke-access|set-bind|usage|prune-dumps> [args...]"

validate_action "$ACTION"

case "$ACTION" in
  install)         action_install ;;
  create-db)       action_create_db "${2:-}" "${3:-}" ;;
  drop-db)         action_drop_db "${2:-}" ;;
  rotate-password) action_rotate_password "${2:-}" "${3:-}" ;;
  grant-access)    action_grant_access "${2:-}" "${3:-}" "${4:-}" "${5:-}" "${6:-ssl}" ;;
  revoke-access)   action_revoke_access "${2:-}" "${3:-}" ;;
  set-bind)        action_set_bind "${2:-}" ;;
  usage)           action_usage ;;
  prune-dumps)     action_prune_dumps "${2:-7}" ;;
esac
