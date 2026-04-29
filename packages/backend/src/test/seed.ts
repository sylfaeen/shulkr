import bcrypt from 'bcrypt';
import type { FastifyInstance } from 'fastify';
import type { TestDeps } from '@shulkr/backend/test/createTestDeps';

export type SeedUserInput = {
  username?: string;
  password?: string;
  permissions?: Array<string>;
  locale?: string;
};

export type SeededUser = {
  id: number;
  username: string;
  password: string;
};

// Inserts a user with a bcrypt-hashed password. Returns the plaintext for login tests.
export async function seedUser(deps: TestDeps, input: SeedUserInput = {}): Promise<SeededUser> {
  const username = input.username ?? `user-${Math.random().toString(36).slice(2, 8)}`;
  const password = input.password ?? 'CorrectHorseBatteryStaple1!';
  const passwordHash = await bcrypt.hash(password, 4);
  const permissions = JSON.stringify(input.permissions ?? []);

  const result = deps.sqlite
    .prepare(
      `INSERT INTO users (username, password_hash, permissions, locale)
       VALUES (?, ?, ?, ?)`
    )
    .run(username, passwordHash, permissions, input.locale ?? null);

  return {
    id: Number(result.lastInsertRowid),
    username,
    password,
  };
}

export type SeedServerInput = {
  id?: string;
  name?: string;
  path?: string;
  javaPort?: number;
  autoStart?: boolean;
};

export type SeededServer = {
  id: string;
  name: string;
};

export function seedServer(deps: TestDeps, input: SeedServerInput = {}): SeededServer {
  const id = input.id ?? `srv-${Math.random().toString(36).slice(2, 10)}`;
  const name = input.name ?? `server-${id}`;
  const port = input.javaPort ?? 25000 + Math.floor(Math.random() * 10000);

  deps.sqlite
    .prepare(
      `INSERT INTO servers (id, name, path, java_port, auto_start)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(id, name, input.path ?? `/tmp/test-${id}`, port, input.autoStart ? 1 : 0);

  return { id, name };
}

export type SeededAuth = SeededUser & {
  token: string;
  headers: { authorization: string };
};

/**
 * Inserts a user with the given permissions and signs a JWT against the
 * Fastify instance's @fastify/jwt so the token verifies cleanly. Returns
 * pre-built `headers` ready to drop into `app.inject({ headers })`.
 */
export async function seedAuthenticatedUser(
  app: FastifyInstance,
  deps: TestDeps,
  input: SeedUserInput = {}
): Promise<SeededAuth> {
  const user = await seedUser(deps, input);
  const token = app.jwt.sign({
    sub: user.id,
    username: user.username,
    permissions: input.permissions ?? [],
    token_version: 0,
  });
  return { ...user, token, headers: { authorization: `Bearer ${token}` } };
}
