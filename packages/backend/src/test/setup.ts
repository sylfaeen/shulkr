// Vitest global setup, runs once per worker, BEFORE any test file or its imports are evaluated. Prepares the process.env so that: - The db/index.ts singleton opens an in-memory SQLite (instead of the production data file). This works because db/index.ts reads DATABASE_PATH at module load time, and Vitest evaluates setupFiles before any test-file import resolves the singleton. - All required secrets are present (createDeps would otherwise crash). - Logger is silenced and shell is in dryRun mode. - Time zone is pinned to UTC so date assertions are deterministic.

import { mkdtempSync, writeFileSync, chmodSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

process.env.NODE_ENV = 'test';
process.env.DATABASE_PATH = ':memory:';
process.env.SHELL_DRY_RUN = 'true';
process.env.LOG_LEVEL = 'silent';
process.env.TZ = 'UTC';

// Filesystem isolation: tests that create / delete servers (story 59.1) must not write under SHULKR_HOME (defaults to /opt/shulkr in prod). Use a per-worker tmp dir so each Vitest file gets its own filesystem sandbox.
const sandbox = mkdtempSync(join(tmpdir(), 'shulkr-test-'));
process.env.SHULKR_HOME = sandbox;
process.env.SERVERS_BASE_PATH = join(sandbox, 'servers');
process.env.BACKUPS_BASE_PATH = join(sandbox, 'backups');

// Mock subs scripts: firewall_service / global_ip_ban_service / sftp_service / domain_service shell out to real scripts (sudo /opt/shulkr/scripts/...) which do not exist in CI. Until those services are migrated to deps.shell.run with dryRun (deferred to a future cleanup story), point each script env var at a no-op shell script that always exits 0. Output is JSON-shaped so callers that parse stdout still work. The script also accepts the leading "sudo" arg that firewall_service prepends.
const scriptsDir = join(sandbox, 'mock-scripts');
mkdirSync(scriptsDir, { recursive: true });
const noopScript = join(scriptsDir, 'noop.sh');
writeFileSync(noopScript, '#!/bin/sh\necho "{}"\nexit 0\n');
chmodSync(noopScript, 0o755);
process.env.FIREWALL_SCRIPT_PATH = noopScript;
process.env.SFTP_SCRIPT_PATH = noopScript;
process.env.DOMAIN_SCRIPT_PATH = noopScript;

// parseConfig requires these at boot. Use stable test fixtures rather than generated secrets to keep test runs deterministic.
process.env.JWT_SECRET ??= 'test-jwt-secret-deterministic-1234';
process.env.COOKIE_SECRET ??= 'test-cookie-secret-deterministic-1234';
