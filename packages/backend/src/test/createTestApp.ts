import { type FastifyInstance } from 'fastify';
import { createApp } from '@shulkr/backend/app';
import { createTestDeps, cleanupTestDeps, type TestDeps, type CreateTestDepsOpts } from '@shulkr/backend/test/createTestDeps';

export type TestApp = {
  app: FastifyInstance;
  deps: TestDeps;
  cleanup: () => Promise<void>;
};

export async function createTestApp(opts: CreateTestDepsOpts = {}): Promise<TestApp> {
  const deps = createTestDeps(opts);
  const app = await createApp(deps);
  await app.ready();

  return {
    app,
    deps,
    cleanup: async () => {
      try {
        await app.close();
      } finally {
        cleanupTestDeps(deps);
      }
    },
  };
}
