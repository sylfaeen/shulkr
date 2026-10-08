#!/bin/bash
# Read stdin, redact sensitive patterns, write to stdout.
#
# Patterns are applied in order. The goal is defense-in-depth — sensitive
# files (.env, keys, etc.) are already excluded at the source; this is an
# extra pass on free-form text (systemd journal, Minecraft latest.log).

set -uo pipefail

# Use a sentinel to preserve loopback addresses before the IPv4 catch-all
# replaces them. After redaction, restore the sentinel back to 127.0.0.1.
LOOPBACK_SENTINEL='__SHULKR_LOOPBACK__'

sed -E \
    -e "s#127\\.0\\.0\\.1#${LOOPBACK_SENTINEL}#g" \
    -e 's#eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+#<jwt>#g' \
    -e 's#(sk|pk|rk)_[A-Za-z0-9]{16,}#<token>#g' \
    -e 's#(Bearer|Basic)[[:space:]]+[A-Za-z0-9._=+/-]{16,}#\1 <redacted>#g' \
    -e 's#(\?|&)(token|key|secret|password|api_key|auth)=[^&[:space:]"'"'"']+#\1\2=<redacted>#gi' \
    -e 's#[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}#<email>#g' \
    -e 's#(([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])\.){3}([0-9]|[1-9][0-9]|1[0-9]{2}|2[0-4][0-9]|25[0-5])#X.X.X.X#g' \
    -e 's#[0-9a-fA-F]{1,4}(:[0-9a-fA-F]{1,4}){7}#X:X:X:X:X:X:X:X#g' \
    -e "s#${LOOPBACK_SENTINEL}#127.0.0.1#g"
