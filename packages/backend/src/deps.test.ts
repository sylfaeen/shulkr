import { describe, it, expect, afterEach } from 'vitest';
import { parseConfig } from '@shulkr/backend/config';
import { createDeps, getAppDeps, clearAppDeps, closeDeps } from '@shulkr/backend/deps';

// Regression: createDeps must call setAppDeps so that boot-time initializers in index.ts (jobQueue, taskScheduler, agentIngest, etc.) can read deps via getAppDeps() BEFORE createApp() runs. Lost this in the Epic 58 migration; rediscovered when `pnpm dev` crashed at JobQueueService.initialize.
describe('createDeps boot contract', () => {
  afterEach(() => {
    clearAppDeps();
  });

  it('makes getAppDeps() return the constructed deps without going through createApp()', () => {
    clearAppDeps();
    expect(() => getAppDeps()).toThrow(/AppDeps not initialized/);

    const config = parseConfig({
      ...process.env,
      NODE_ENV: 'test',
      DATABASE_PATH: ':memory:',
      LOG_LEVEL: 'silent',
      SHELL_DRY_RUN: 'true',
    });
    const deps = createDeps(config);

    expect(getAppDeps()).toBe(deps);

    closeDeps(deps);
  });
});
