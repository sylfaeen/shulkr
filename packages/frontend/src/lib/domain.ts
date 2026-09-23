function ipv4ToNumber(ip: string): number | null {
  const octets = ip.split('.');
  if (octets.length !== 4) return null;

  let value = 0;

  for (const octet of octets) {
    if (!/^\d{1,3}$/.test(octet) || Number(octet) > 255) return null;
    value = value * 256 + Number(octet);
  }

  return value;
}

export function isCloudflareIp(ip: string): boolean {
  const cloudflareRanges = [
    '173.245.48.0/20',
    '103.21.244.0/22',
    '103.22.200.0/22',
    '103.31.4.0/22',
    '141.101.64.0/18',
    '108.162.192.0/18',
    '190.93.240.0/20',
    '188.114.96.0/20',
    '197.234.240.0/22',
    '198.41.128.0/17',
    '162.158.0.0/15',
    '104.16.0.0/13',
    '104.24.0.0/14',
    '172.64.0.0/13',
    '131.0.72.0/22',
  ];

  const value = ipv4ToNumber(ip.trim());
  if (value === null) return false;

  return cloudflareRanges.some((range) => {
    const [base, prefixLength] = range.split('/');
    const start = ipv4ToNumber(base) ?? 0;
    const size = 2 ** (32 - Number(prefixLength));

    return value >= start && value < start + size;
  });
}

export function getHstsPreloadedTld(domain: string): string | null {
  const hstsPreloadedTlds = ['app', 'dev', 'page', 'new', 'foo', 'day', 'zip', 'mov', 'ing', 'meme', 'boo', 'dad'];
  const tld = domain.trim().toLowerCase().split('.').pop() ?? '';

  return hstsPreloadedTlds.includes(tld) ? `.${tld}` : null;
}
