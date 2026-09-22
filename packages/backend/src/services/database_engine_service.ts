import { randomBytes } from 'node:crypto';
import { ErrorCodes } from '@shulkr/shared';
import type { DatabaseEngineState, DatabaseEngineStatus } from '@shulkr/shared';
import type { AppDeps } from '@shulkr/backend/deps';

export const DATABASE_HOST_LOCAL = '127.0.0.1';
export const DATABASE_PORT = 3306;
export const CA_CERTIFICATE_PATH = '/etc/mysql/shulkr-ssl/ca.pem';

type Deps = Pick<AppDeps, 'shell' | 'fs' | 'config' | 'logger'>;

export type ScriptOutcome = {
  success: boolean;
  error?: string;
  payload?: Record<string, unknown>;
};

export type DatabaseUsage = {
  sizes: Map<string, number>;
  activeUsers: Set<string>;
};

// A MariaDB password never reaches the panel UI unless it is explicitly revealed, and it is generated rather than chosen: 32 random bytes in base64url, which the script's own validation accepts (no quotes, no backslash, no control characters).
export function generateDatabasePassword(): string {
  return randomBytes(24).toString('base64url');
}

// Six lowercase hex characters, unique per server, prefixing every MariaDB object it owns.
export function generateDatabasePrefix(): string {
  return randomBytes(3).toString('hex');
}

export function buildDatabaseName(prefix: string, slug: string): string {
  return `s_${prefix}_${slug}`;
}

export function buildDatabaseUser(prefix: string, slug: string): string {
  return `u_${prefix}_${slug}`;
}

// The access user is not derived from its row id: the MariaDB user is created before the row exists, so that a failed grant never leaves a dangling row behind.
export function buildAccessUser(prefix: string): string {
  return `a_${prefix}_${randomBytes(2).toString('hex')}`;
}

function parseScriptOutput(raw: string): Record<string, unknown> | null {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;

  try {
    return JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Every privileged operation goes through subs_database.sh. A secret, when there is one, is written to the script's stdin: passing it as an argument would expose it in the process table to every process on the machine, Minecraft plugins included.
export async function runDatabaseScript(deps: Deps, args: Array<string>, secret?: string): Promise<ScriptOutcome> {
  const scriptPath = deps.config.DATABASE_SCRIPT_PATH;

  if (secret === undefined) {
    const result = await deps.shell.run(scriptPath, args, { sudo: true, timeoutMs: 120_000 });
    const parsed = parseScriptOutput(result.stderr) ?? parseScriptOutput(result.stdout);

    if (!result.success) {
      return {
        success: false,
        error: typeof parsed?.error === 'string' ? parsed.error : result.stderr.trim() || 'Database script failed',
      };
    }

    return { success: true, payload: parsed ?? undefined };
  }

  const handle = deps.shell.spawn(scriptPath, args, { sudo: true });
  handle.stdin?.end(`${secret}\n`);
  const result = await handle.wait();
  const parsed = parseScriptOutput(result.stderr) ?? parseScriptOutput(result.stdout);

  if (!result.success) {
    return {
      success: false,
      error: typeof parsed?.error === 'string' ? parsed.error : result.stderr.trim() || 'Database script failed',
    };
  }

  return { success: true, payload: parsed ?? undefined };
}

// Connection string understood by TablePlus and friends. The local database is not reachable from outside, so the URL carries an SSH tunnel: the client opens the tunnel itself and lands on 127.0.0.1 as if it were local.
export function buildTunnelConnectionUrl(input: {
  sshUser: string;
  sshHost: string;
  dbUser: string;
  password: string;
  dbName: string;
  label: string;
}): string {
  const password = encodeURIComponent(input.password);
  const label = encodeURIComponent(input.label);

  return `mysql+ssh://${input.sshUser}@${input.sshHost}/${input.dbUser}:${password}@${DATABASE_HOST_LOCAL}/${input.dbName}?name=${label}&usePrivateKey=true`;
}

// A remote access already reaches the engine directly, so no tunnel is needed.
export function buildDirectConnectionUrl(input: {
  host: string;
  dbUser: string;
  password: string;
  dbName: string;
  label: string;
}): string {
  const password = encodeURIComponent(input.password);
  const label = encodeURIComponent(input.label);

  return `mysql://${input.dbUser}:${password}@${input.host}:${DATABASE_PORT}/${input.dbName}?name=${label}`;
}

export async function getEngineState(deps: Deps): Promise<DatabaseEngineState> {
  const outcome = await runDatabaseScript(deps, ['usage']);
  if (outcome.success) return 'running';

  const message = outcome.error ?? '';
  if (message.includes('is not running')) return 'installed_stopped';

  // Without this line, a wrong script path or a missing sudoers entry both surface in the UI as a bare "engine unavailable" with nothing to go on.
  deps.logger.warn({ script: deps.config.DATABASE_SCRIPT_PATH, error: message }, 'Database engine probe failed');

  return 'unavailable';
}

export async function getEngineStatus(deps: Deps, remoteEnabled: boolean): Promise<DatabaseEngineStatus> {
  return {
    state: await getEngineState(deps),
    host: DATABASE_HOST_LOCAL,
    port: DATABASE_PORT,
    remoteEnabled,
  };
}

export async function assertEngineAvailable(deps: Deps): Promise<void> {
  const state = await getEngineState(deps);
  if (state !== 'running') throw new Error(ErrorCodes.DATABASE_ENGINE_NOT_INSTALLED);
}

// Sizes and live connections, read as root by the script. An application user would only see the rows it holds privileges on, which makes information_schema look empty from the backend's point of view.
export async function readDatabaseUsage(deps: Deps): Promise<DatabaseUsage> {
  const empty: DatabaseUsage = { sizes: new Map(), activeUsers: new Set() };
  const outcome = await runDatabaseScript(deps, ['usage']);
  if (!outcome.success || !outcome.payload) return empty;

  const databases = outcome.payload.databases;
  const activity = outcome.payload.activity;

  if (Array.isArray(databases)) {
    for (const entry of databases) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { name, bytes } = entry as { name?: unknown; bytes?: unknown };
      if (typeof name === 'string' && typeof bytes === 'number') empty.sizes.set(name, bytes);
    }
  }

  if (Array.isArray(activity)) {
    for (const entry of activity) {
      if (typeof entry !== 'object' || entry === null) continue;
      const { user } = entry as { user?: unknown };
      if (typeof user === 'string') empty.activeUsers.add(user);
    }
  }

  return empty;
}

export async function setEngineBind(deps: Deps, address: '127.0.0.1' | '0.0.0.0'): Promise<void> {
  const outcome = await runDatabaseScript(deps, ['set-bind', address]);
  if (!outcome.success) throw new Error(ErrorCodes.DATABASE_SCRIPT_FAILED);
}

export async function pruneDatabaseDumps(deps: Deps): Promise<void> {
  await runDatabaseScript(deps, ['prune-dumps', String(deps.config.DATABASE_DUMP_RETENTION_DAYS)]);
}

export async function readCaCertificate(deps: Deps): Promise<string | null> {
  try {
    return await deps.fs.readFileText(CA_CERTIFICATE_PATH);
  } catch {
    return null;
  }
}

let dumpPruneIntervalId: NodeJS.Timeout | null = null;
let accessActivityIntervalId: NodeJS.Timeout | null = null;

const DUMP_PRUNE_INTERVAL_MS = 24 * 60 * 60 * 1000;
const ACCESS_ACTIVITY_INTERVAL_MS = 5 * 60 * 1000;

// Dumps are full plaintext copies of production data, so their lifetime is bounded. Access activity is sampled rather than logged, which is enough to flag an access nobody uses any more.
export function initializeDatabaseMaintenance(deps: AppDeps, onSampleActivity: (deps: AppDeps) => Promise<void>): void {
  dumpPruneIntervalId = setInterval(() => {
    void pruneDatabaseDumps(deps);
  }, DUMP_PRUNE_INTERVAL_MS);

  dumpPruneIntervalId.unref();

  accessActivityIntervalId = setInterval(() => {
    void onSampleActivity(deps);
  }, ACCESS_ACTIVITY_INTERVAL_MS);

  accessActivityIntervalId.unref();
  console.log(`Database maintenance initialized (${deps.config.DATABASE_DUMP_RETENTION_DAYS}d dump retention)`);
}

export function stopDatabaseMaintenance(): void {
  if (dumpPruneIntervalId) clearInterval(dumpPruneIntervalId);
  if (accessActivityIntervalId) clearInterval(accessActivityIntervalId);
  dumpPruneIntervalId = null;
  accessActivityIntervalId = null;
}
