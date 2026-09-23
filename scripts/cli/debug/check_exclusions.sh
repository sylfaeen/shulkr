#!/bin/bash
# Scan <dir> for sensitive patterns that must never appear in a debug bundle.
# Exits 0 if clean, 1 (and lists offenders) otherwise.
#
# Usage:
#   check_exclusions.sh <dir>

set -uo pipefail
source "$(dirname "${BASH_SOURCE[0]}")/lib.sh"

target="${1:?usage: check_exclusions.sh <dir>}"

if [[ ! -d "$target" ]]; then
    die "check_exclusions.sh: not a directory: ${target}"
fi

# Patterns that would mean a secret leaked into the output.
# Each entry: a regex + a human label.
# Values are checked with `=` separator to distinguish column names in
# schema.sql (`password_hash TEXT`) from actual dumps (`password_hash,abc...`).
patterns=(
    'JWT_SECRET=[^[:space:]]+|JWT secret value'
    'COOKIE_SECRET=[^[:space:]]+|Cookie secret value'
    'TOTP_ENCRYPTION_KEY=[^[:space:]]+|TOTP encryption key'
    'DATABASE_URL=[^[:space:]]+|Database URL with credentials'
    '-----BEGIN[[:space:]]+(RSA[[:space:]]+)?PRIVATE KEY-----|Private key block'
    '-----BEGIN[[:space:]]+CERTIFICATE-----|Certificate block'
    '-----BEGIN[[:space:]]+OPENSSH PRIVATE KEY-----|OpenSSH private key'
    'aws_access_key_id[[:space:]]*=[[:space:]]*[A-Z0-9]{16,}|AWS access key'
    'aws_secret_access_key[[:space:]]*=[[:space:]]*[A-Za-z0-9/+=]{20,}|AWS secret key'
    'secret_access_key_encrypted["'\''[:space:]]*[:,][^[:space:]]{10,}|Cloud destination secret'
    'xoxb-[0-9]+-[0-9]+|Slack bot token'
    'ghp_[A-Za-z0-9]{30,}|GitHub personal token'
)

violations=()
while IFS= read -r file; do
    # Skip non-text files and schema.sql (legitimate column names).
    case "$file" in
        */schema.sql) continue ;;
    esac
    for entry in "${patterns[@]}"; do
        regex="${entry%%|*}"
        label="${entry#*|}"
        if grep -E -l "$regex" "$file" >/dev/null 2>&1; then
            violations+=("${file}: ${label}")
        fi
    done
done < <(find "$target" -type f \( -name '*.txt' -o -name '*.csv' -o -name '*.log' -o -name '*.sql' -o -name '*.conf' \) 2>/dev/null)

if (( ${#violations[@]} > 0 )); then
    echo -e "  ${RED}✗ Sensitive patterns detected in bundle:${NC}"
    for v in "${violations[@]}"; do
        echo "    - ${v}"
    done
    exit 1
fi

echo -e "  ${GREEN}✓${NC} No sensitive patterns found"
exit 0
