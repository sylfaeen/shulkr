#!/bin/bash
# Story 61.4: validate backwards compatibility of the new tarball format with the
# legacy do_update.sh upgrade flow.
#
# The legacy do_update.sh (shipped to all existing user installs prior to story
# 61.3) runs `pnpm install --prod --frozen-lockfile` from inside the extracted
# tarball after replacing the app code. With the new format that bundles
# node_modules and ships the lockfile + package.json, this step must succeed and
# be effectively a no-op.
#
# Usage:
#   scripts/release/test_backwards_compat.sh <path-to-tarball.tar.gz>
#
# Exits 0 on success, non-zero on regression.

set -euo pipefail

TARBALL="${1:?usage: $0 <tarball>}"
[[ -f "$TARBALL" ]] || { echo "tarball not found: $TARBALL" >&2; exit 1; }

WORK=$(mktemp -d -t shulkr-upgrade-test-XXXX)
trap 'rm -rf "$WORK"' EXIT

echo "→ Extracting tarball into $WORK"
tar -xzf "$TARBALL" -C "$WORK"

# The tarball top-level dir is shulkr-<version>/
EXTRACTED=$(find "$WORK" -mindepth 1 -maxdepth 1 -type d | head -1)
[[ -d "$EXTRACTED" ]] || { echo "no top-level dir in tarball" >&2; exit 1; }
echo "→ Extracted to $EXTRACTED"

cd "$EXTRACTED"

# Capture pre-state hashes
echo "→ Snapshotting node_modules + lockfile state"
LOCKFILE_HASH_BEFORE=$(sha256sum pnpm-lock.yaml | cut -d' ' -f1)
NM_FILES_BEFORE=$(find packages/backend/node_modules -type f 2>/dev/null | wc -l | tr -d ' ')
NM_LINKS_BEFORE=$(find packages/backend/node_modules -type l 2>/dev/null | wc -l | tr -d ' ')
echo "  lockfile sha256: $LOCKFILE_HASH_BEFORE"
echo "  node_modules files: $NM_FILES_BEFORE"
echo "  node_modules symlinks: $NM_LINKS_BEFORE"

# Simulate the legacy do_update.sh flow.
# pnpm 11 needs Node 22.13+, so corepack must be enabled.
corepack enable >/dev/null 2>&1 || true

echo "→ Running legacy upgrade step: pnpm install --prod --frozen-lockfile"
START=$(date +%s)
if ! pnpm install --prod --frozen-lockfile 2>&1; then
  echo "✗ pnpm install --prod --frozen-lockfile FAILED. The legacy do_update.sh would brick the user's install at this step."
  exit 2
fi
END=$(date +%s)
DURATION=$((END - START))
echo "  completed in ${DURATION}s"

# Verify nothing material was modified
LOCKFILE_HASH_AFTER=$(sha256sum pnpm-lock.yaml | cut -d' ' -f1)
NM_FILES_AFTER=$(find packages/backend/node_modules -type f 2>/dev/null | wc -l | tr -d ' ')
NM_LINKS_AFTER=$(find packages/backend/node_modules -type l 2>/dev/null | wc -l | tr -d ' ')

echo "→ Verifying no drift"

if [[ "$LOCKFILE_HASH_BEFORE" != "$LOCKFILE_HASH_AFTER" ]]; then
  echo "✗ pnpm-lock.yaml was modified by pnpm install. The tarball lockfile is not cohérent with the bundled node_modules."
  exit 3
fi

# pnpm may add a few internal files (.modules.yaml, .pnpm-workspace-state.json) on first run
# even when nothing changes. Tolerate up to 10 extra files but no missing files.
DELTA_FILES=$((NM_FILES_AFTER - NM_FILES_BEFORE))
if [[ "$DELTA_FILES" -lt 0 ]]; then
  echo "✗ pnpm install REMOVED $((-DELTA_FILES)) files from node_modules. Tarball deps are inconsistent with lockfile."
  exit 4
fi
if [[ "$DELTA_FILES" -gt 10 ]]; then
  echo "✗ pnpm install ADDED $DELTA_FILES files to node_modules (threshold: 10). Tarball deps are incomplete."
  exit 5
fi

DELTA_LINKS=$((NM_LINKS_AFTER - NM_LINKS_BEFORE))
if [[ "$DELTA_LINKS" -ne 0 ]]; then
  echo "✗ pnpm install changed symlink count by ${DELTA_LINKS}. Tarball symlink graph is inconsistent."
  exit 6
fi

# Final sanity: the natives still load after the legacy install pass
cd packages/backend
node -e "const s = require('better-sqlite3'); const db = new s(':memory:'); if (db.prepare('SELECT 1 as x').get().x !== 1) throw new Error('broken'); console.log('  better-sqlite3 still loadable');"
node -e "const b = require('bcrypt'); const h = b.hashSync('upgrade-path', 4); if (!b.compareSync('upgrade-path', h)) throw new Error('broken'); console.log('  bcrypt still loadable');"
node -e "const sh = require('sharp'); sh({create:{width:1,height:1,channels:3,background:{r:0,g:0,b:0}}}).png().toBuffer().then(b => { if (b.length < 1) throw new Error('broken'); console.log('  sharp still loadable'); });"

echo ""
echo "✓ Backwards compatibility verified: legacy do_update.sh flow is a $((DURATION))s no-op against the new tarball."
echo "  delta files: ${DELTA_FILES}, delta symlinks: ${DELTA_LINKS}, lockfile unchanged."
