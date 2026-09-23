import path from 'node:path';
import { eq } from 'drizzle-orm';
import { serverDatabases } from '@shulkr/backend/db/schema';
import type { AppDeps } from '@shulkr/backend/deps';

type Deps = Pick<AppDeps, 'db' | 'shell' | 'fs' | 'config' | 'logger'>;

// Dumps land inside the server directory so the existing archiver picks them up with everything else. Restoring a backup then brings the plugin files and its data back to the same point, instead of rolling the files back while the database stays current.
export const DATABASE_DUMP_DIR = '.shulkr-databases';

export async function writeDatabaseDumps(deps: Deps, serverId: string, serverPath: string): Promise<number> {
  const rows = await deps.db.select().from(serverDatabases).where(eq(serverDatabases.server_id, serverId));
  if (rows.length === 0) return 0;

  const target = path.join(serverPath, DATABASE_DUMP_DIR);
  await deps.fs.mkdir(target, { recursive: true });

  let written = 0;

  for (const row of rows) {
    try {
      const handle = deps.shell.spawn(deps.config.DATABASE_SCRIPT_PATH, ['stream-dump', row.db_name], { sudo: true });
      if (!handle.stdout) throw new Error('no output from the dump');

      const destination = deps.fs.createWriteStream(path.join(target, `${row.db_name}.sql.gz`));

      await new Promise<void>((resolve, reject) => {
        handle.stdout!.pipe(destination);
        destination.on('finish', () => resolve());
        destination.on('error', (error: Error) => reject(error));
      });

      const result = await handle.wait();
      if (!result.success) throw new Error(result.stderr.trim() || 'the dump command failed');

      written += 1;
    } catch (error) {
      // A backup that loses its database dump is worth more than no backup at all, so this is reported and the archive still goes out.
      deps.logger.warn(
        { database: row.db_name, error: error instanceof Error ? error.message : String(error) },
        'Database dump skipped'
      );
    }
  }

  return written;
}

export async function clearDatabaseDumps(deps: Deps, serverPath: string): Promise<void> {
  await deps.fs.rm(path.join(serverPath, DATABASE_DUMP_DIR), { recursive: true, force: true });
}
