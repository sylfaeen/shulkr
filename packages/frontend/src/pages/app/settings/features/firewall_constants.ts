export type Protocol = 'tcp' | 'udp' | 'both';

export const PROTOCOL_LABELS: Record<Protocol, string> = {
  tcp: 'TCP',
  udp: 'UDP',
  both: 'TCP+UDP',
};

export type FirewallRule = {
  id: number;
  port: number;
  protocol: Protocol;
  label: string;
  enabled: boolean;
};

export const PROTOCOL_STYLES: Record<Protocol, { label: string; text: string }> = {
  tcp: { label: 'TCP', text: 'text-green-600' },
  udp: { label: 'UDP', text: 'text-blue-600' },
  both: { label: 'TCP+UDP', text: 'text-violet-600' },
};

export const PRESET_STYLES: Record<Protocol, { active: string; icon: string }> = {
  tcp: {
    active: 'border-emerald-600/30 bg-emerald-600/5 text-emerald-700 dark:text-emerald-400',
    icon: 'group-hover/preset:text-emerald-600',
  },
  udp: {
    active: 'border-blue-600/30 bg-blue-600/5 text-blue-700 dark:text-blue-400',
    icon: 'group-hover/preset:text-blue-600',
  },
  both: {
    active: 'border-violet-600/30 bg-violet-600/5 text-violet-700 dark:text-violet-400',
    icon: 'group-hover/preset:text-violet-600',
  },
};

export const FIREWALL_PRESETS: Array<{ label: string; port: number; protocol: Protocol; description: string }> = [
  { label: 'GeyserMC', port: 19132, protocol: 'udp', description: 'Bedrock' },
  { label: 'BlueMap', port: 8100, protocol: 'tcp', description: 'Web Map' },
  { label: 'Dynmap', port: 8123, protocol: 'tcp', description: 'Web Map' },
  { label: 'Votifier', port: 8192, protocol: 'tcp', description: 'Vote Listener' },
  { label: 'Simple Voice Chat', port: 24454, protocol: 'udp', description: 'Voice' },
];
