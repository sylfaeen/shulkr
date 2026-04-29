import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createTestDeps, cleanupTestDeps, type TestDeps } from '@shulkr/backend/test/createTestDeps';
import { envRead, envWrite, envUpdate, ENV_PATH } from '@shulkr/backend/services/env_service';

describe('env_service', () => {
  let deps: TestDeps;
  beforeAll(() => {
    deps = createTestDeps();
  });
  afterAll(() => {
    cleanupTestDeps(deps);
  });

  it('envRead returns "" when ENV_PATH does not exist in fake fs', async () => {
    const content = await envRead(deps);
    expect(content).toBe('');
  });

  it('envWrite + envRead round-trips through deps.fs', async () => {
    deps.fs.put(ENV_PATH, 'JWT_SECRET=existing\n');
    await envWrite(deps, 'NEW_VAR=hello\nOTHER=world\n');
    expect(await envRead(deps)).toBe('NEW_VAR=hello\nOTHER=world\n');
  });

  it('envUpdate appends a missing key', async () => {
    deps.fs.put(ENV_PATH, 'EXISTING=1\n');
    await envUpdate(deps, 'BRAND_NEW', 'foo');
    const content = await envRead(deps);
    expect(content).toContain('BRAND_NEW=foo');
    expect(content).toContain('EXISTING=1');
  });

  it('envUpdate replaces an existing key', async () => {
    deps.fs.put(ENV_PATH, 'KEY=old\nOTHER=keep\n');
    await envUpdate(deps, 'KEY', 'new');
    const content = await envRead(deps);
    expect(content).toContain('KEY=new');
    expect(content).not.toContain('KEY=old');
    expect(content).toContain('OTHER=keep');
  });
});
