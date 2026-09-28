import pino from 'pino';
import type { Logger } from '@shulkr/backend/deps/logger';

// A real pino Logger configured at level 'silent' so it satisfies the Logger type without spilling output during tests. If a test needs to assert against log output, pass `{ collect: true }` and inspect the returned `entries`.
export interface FakeLogger {
  logger: Logger;
  // Captured entries when created with `{ collect: true }`.
  entries: ReadonlyArray<{ level: string; msg: unknown }>;
  reset(): void;
}

export function createFakeLogger(opts: { collect?: boolean } = {}): FakeLogger {
  if (!opts.collect) {
    return {
      logger: pino({ level: 'silent' }),
      entries: [],
      reset: () => {},
    };
  }

  const entries: Array<{ level: string; msg: unknown }> = [];

  const sink = pino(
    { level: 'trace' },
    {
      write(chunk: string): void {
        try {
          const obj = JSON.parse(chunk) as { level: number; msg?: unknown };
          const levelName = pino.levels.labels[obj.level] ?? String(obj.level);
          entries.push({ level: levelName, msg: obj.msg });
        } catch {
          entries.push({ level: 'raw', msg: chunk });
        }
      },
    }
  );

  return {
    logger: sink,
    entries,
    reset: () => {
      entries.length = 0;
    },
  };
}
