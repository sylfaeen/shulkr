import os from 'node:os';

// The address a remote consumer will actually dial. Falls back to localhost on a machine with no external interface, which only happens in development.
export function getServerPublicIp(): string {
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    if (!entries) continue;

    for (const entry of entries) {
      if (!entry.internal && entry.family === 'IPv4') return entry.address;
    }
  }

  return 'localhost';
}
