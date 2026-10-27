import { Resolver } from 'node:dns/promises';

export interface DnsResolver {
  // Resolves the A records of a hostname. When `server` is set, the query is sent to that resolver instead of the system one, which is how a stale local cache is told apart from a genuinely wrong record. Returns an empty array when the name does not resolve.
  resolve4(hostname: string, opts?: { server?: string; timeoutMs?: number }): Promise<Array<string>>;
}

const DEFAULT_TIMEOUT_MS = 5000;

export function createDnsResolver(): DnsResolver {
  return {
    async resolve4(hostname, opts = {}) {
      const resolver = new Resolver({ timeout: opts.timeoutMs ?? DEFAULT_TIMEOUT_MS, tries: 1 });
      if (opts.server) resolver.setServers([opts.server]);

      try {
        return await resolver.resolve4(hostname);
      } catch {
        return [];
      }
    },
  };
}
