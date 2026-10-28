import type { DnsResolver } from '@shulkr/backend/deps/dns_resolver';

export type RecordedLookup = {
  hostname: string;
  server: string | null;
};

export interface FakeDnsResolver extends DnsResolver {
  // Records every resolve4 call in invocation order.
  readonly lookups: ReadonlyArray<RecordedLookup>;
  // Queue the answer returned for a hostname. `server` scopes the answer to one resolver, so a test can make the system resolver and a public one disagree.
  mockResolve4(hostname: string, addresses: Array<string>, server?: string): void;
  reset(): void;
}

export function createFakeDns(): FakeDnsResolver {
  const lookups: Array<RecordedLookup> = [];
  const answers = new Map<string, Array<string>>();

  const key = (hostname: string, server: string | null) => `${server ?? 'system'}|${hostname}`;

  return {
    lookups,

    mockResolve4(hostname, addresses, server) {
      answers.set(key(hostname, server ?? null), addresses);
    },

    reset() {
      lookups.length = 0;
      answers.clear();
    },

    resolve4(hostname, opts = {}) {
      const server = opts.server ?? null;
      lookups.push({ hostname, server });

      return Promise.resolve(answers.get(key(hostname, server)) ?? []);
    },
  };
}
