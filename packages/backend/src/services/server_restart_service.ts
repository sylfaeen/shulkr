import { serverRestarts } from '@shulkr/backend/db/schema';
import { type AppDeps } from '@shulkr/backend/deps';

type Deps = Pick<AppDeps, 'db'>;

// Called on every successful server start (manual start, boot auto-start, restart, crash recovery). Never throws: failing to record the marker must not turn a successful start into an error.
export function recordServerRestart(deps: Deps, serverId: string): void {
  try {
    deps.db.insert(serverRestarts).values({ server_id: serverId }).run();
  } catch (error: unknown) {
    console.error(`Failed to record restart for server ${serverId}:`, error);
  }
}
