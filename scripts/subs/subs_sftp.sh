#!/usr/bin/env bash
# subs_sftp.sh — Secure SFTP user management for Shulkr GSMP
# This script is the ONLY entry point for SFTP user operations.
# Executed via sudo by the shulkr system user.
# sudoers: shulkr ALL=(ALL) NOPASSWD: /opt/shulkr/app/scripts/subs/subs_sftp.sh

set -euo pipefail

SFTP_GROUP="sftp-users"
SHULKR_USER="shulkr"

json_success() { echo "{\"success\":true,\"action\":\"$1\"}"; }
json_error()   { echo "{\"success\":false,\"error\":\"$1\"}" >&2; exit 1; }

validate_action() {
  local action="$1"
  if ! [[ "$action" =~ ^(create-user|update-password|update-permissions|update-paths|delete-user)$ ]]; then
    json_error "Invalid action: must be create-user, update-password, update-permissions, update-paths, or delete-user"
  fi
}

validate_username() {
  local username="$1"
  if [ -z "$username" ]; then
    json_error "Username cannot be empty"
  fi
  if ! [[ "$username" =~ ^[a-z_][a-z0-9_-]{0,31}$ ]]; then
    json_error "Invalid username: must be lowercase alphanumeric (max 32 chars)"
  fi
  if [[ "$username" =~ ^(root|admin|nobody|daemon|bin|sys|www-data|shulkr)$ ]]; then
    json_error "Username '${username}' is reserved"
  fi
}

validate_path() {
  local path="$1"
  if [ -z "$path" ]; then
    json_error "Path cannot be empty"
  fi
  if [[ "$path" == *".."* ]]; then
    json_error "Invalid path: path traversal detected"
  fi
  if [ ! -d "$path" ]; then
    json_error "Server path does not exist: ${path}"
  fi
}

validate_permissions() {
  local perms="$1"
  if ! [[ "$perms" =~ ^(read-only|read-write)$ ]]; then
    json_error "Invalid permissions: must be read-only or read-write"
  fi
}

ensure_sftp_group() {
  if ! getent group "$SFTP_GROUP" &>/dev/null; then
    groupadd "$SFTP_GROUP"
  fi

  # Configure sshd for SFTP-only access if not already done
  if ! grep -q "Match Group ${SFTP_GROUP}" /etc/ssh/sshd_config 2>/dev/null; then
    cat >> /etc/ssh/sshd_config << SSHD_EOF

# Shulkr SFTP configuration
Match Group ${SFTP_GROUP}
    ForceCommand internal-sftp
    AllowTcpForwarding no
    X11Forwarding no
    PermitTunnel no
SSHD_EOF
    systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true
  fi

  # Remove stale ChrootDirectory directive if present
  if grep -q "ChrootDirectory" /etc/ssh/sshd_config 2>/dev/null; then
    sed -i '/Match Group sftp-users/,/^Match\|^$/{/ChrootDirectory/d}' /etc/ssh/sshd_config
    systemctl restart sshd 2>/dev/null || systemctl restart ssh 2>/dev/null || true
  fi
}

action_create_user() {
  local username="$1" password="$2" server_path="$3"

  validate_username "$username"
  validate_path "$server_path"

  ensure_sftp_group

  if id "$username" &>/dev/null; then
    json_error "System user '${username}' already exists"
  fi

  # Create system user with home set to server path, no login shell
  if ! useradd -g "$SFTP_GROUP" -d "$server_path" -s /usr/sbin/nologin -M "$username" 2>/dev/null; then
    json_error "Failed to create system user '${username}'"
  fi

  # Set password — rollback user if chpasswd fails (e.g. special characters)
  if ! echo "${username}:${password}" | chpasswd 2>/dev/null; then
    userdel "$username" 2>/dev/null || true
    json_error "Failed to set password for '${username}'"
  fi

  # Grant access to the server directory
  if ! usermod -aG "$SFTP_GROUP" "$username" 2>/dev/null; then
    userdel "$username" 2>/dev/null || true
    json_error "Failed to add '${username}' to group '${SFTP_GROUP}'"
  fi

  setfacl -R -m "u:${username}:rwX" "$server_path" 2>/dev/null || chown -R "${username}:${SFTP_GROUP}" "$server_path"
  setfacl -R -d -m "u:${username}:rwX" "$server_path" 2>/dev/null || true

  # Ensure shulkr retains full access to files created by SFTP users
  setfacl -R -m "u:${SHULKR_USER}:rwX" "$server_path" 2>/dev/null || true
  setfacl -R -d -m "u:${SHULKR_USER}:rwX" "$server_path" 2>/dev/null || true

  json_success "create-user"
}

action_update_password() {
  local username="$1" password="$2"

  validate_username "$username"

  if ! id "$username" &>/dev/null; then
    json_error "System user '${username}' does not exist"
  fi

  if ! echo "${username}:${password}" | chpasswd 2>/dev/null; then
    json_error "Failed to set password for '${username}'"
  fi

  json_success "update-password"
}

action_update_permissions() {
  local username="$1" server_path="$2" permissions="$3"

  validate_username "$username"
  validate_path "$server_path"
  validate_permissions "$permissions"

  if ! id "$username" &>/dev/null; then
    json_error "System user '${username}' does not exist"
  fi

  if [ "$permissions" = "read-only" ]; then
    if command -v setfacl &>/dev/null; then
      setfacl -R -m "u:${username}:rX" "$server_path"
      setfacl -R -d -m "u:${username}:rX" "$server_path"
    else
      chmod -R o-w "$server_path"
    fi
  else
    if command -v setfacl &>/dev/null; then
      setfacl -R -m "u:${username}:rwX" "$server_path"
      setfacl -R -d -m "u:${username}:rwX" "$server_path"
    else
      chown -R "${username}:${SFTP_GROUP}" "$server_path"
      chmod -R 775 "$server_path"
    fi
  fi

  # Ensure shulkr retains full access after permission changes
  setfacl -R -m "u:${SHULKR_USER}:rwX" "$server_path" 2>/dev/null || true
  setfacl -R -d -m "u:${SHULKR_USER}:rwX" "$server_path" 2>/dev/null || true

  json_success "update-permissions"
}

action_update_paths() {
  local username="$1" server_path="$2"

  validate_username "$username"
  validate_path "$server_path"

  if ! id "$username" &>/dev/null; then
    json_error "System user '${username}' does not exist"
  fi

  # Update home directory to new server path
  usermod -d "$server_path" "$username"

  # Grant access
  setfacl -R -m "u:${username}:rwX" "$server_path" 2>/dev/null || chown -R "${username}:${SFTP_GROUP}" "$server_path"
  setfacl -R -d -m "u:${username}:rwX" "$server_path" 2>/dev/null || true

  # Ensure shulkr retains full access after path changes
  setfacl -R -m "u:${SHULKR_USER}:rwX" "$server_path" 2>/dev/null || true
  setfacl -R -d -m "u:${SHULKR_USER}:rwX" "$server_path" 2>/dev/null || true

  json_success "update-paths"
}

action_delete_user() {
  local username="$1"

  validate_username "$username"

  if ! id "$username" &>/dev/null; then
    json_success "delete-user"
    exit 0
  fi

  # Kill any active sessions
  pkill -u "$username" 2>/dev/null || true

  # Delete the system user
  userdel "$username" 2>/dev/null || true

  json_success "delete-user"
}

ACTION="${1:-}"
[ -n "$ACTION" ] || json_error "Usage: $0 <create-user|update-password|update-permissions|delete-user> [args...]"

validate_action "$ACTION"

case "$ACTION" in
  create-user)
    USERNAME="${2:-}"
    PASSWORD="${3:-}"
    SERVER_PATH="${4:-}"
    [ -n "$USERNAME" ] && [ -n "$PASSWORD" ] && [ -n "$SERVER_PATH" ] || json_error "Usage: $0 create-user <username> <password> <server_path>"
    action_create_user "$USERNAME" "$PASSWORD" "$SERVER_PATH"
    ;;
  update-password)
    USERNAME="${2:-}"
    PASSWORD="${3:-}"
    [ -n "$USERNAME" ] && [ -n "$PASSWORD" ] || json_error "Usage: $0 update-password <username> <password>"
    action_update_password "$USERNAME" "$PASSWORD"
    ;;
  update-permissions)
    USERNAME="${2:-}"
    SERVER_PATH="${3:-}"
    PERMISSIONS="${4:-}"
    [ -n "$USERNAME" ] && [ -n "$SERVER_PATH" ] && [ -n "$PERMISSIONS" ] || json_error "Usage: $0 update-permissions <username> <server_path> <permissions>"
    action_update_permissions "$USERNAME" "$SERVER_PATH" "$PERMISSIONS"
    ;;
  update-paths)
    USERNAME="${2:-}"
    SERVER_PATH="${3:-}"
    [ -n "$USERNAME" ] && [ -n "$SERVER_PATH" ] || json_error "Usage: $0 update-paths <username> <server_path>"
    action_update_paths "$USERNAME" "$SERVER_PATH"
    ;;
  delete-user)
    USERNAME="${2:-}"
    [ -n "$USERNAME" ] || json_error "Usage: $0 delete-user <username>"
    action_delete_user "$USERNAME"
    ;;
esac
