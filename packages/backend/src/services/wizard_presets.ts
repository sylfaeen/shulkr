import os from 'node:os';
import type { ServerType, CommunitySize, WizardPlugin } from '@shulkr/shared';

const SIZE_TO_MAX_RAM_MB: Record<CommunitySize, number> = {
  '1-5': 2048,
  '5-20': 4096,
  '20-50': 6144,
  '50+': 8192,
};

const SIZE_LABELS: Record<CommunitySize, string> = {
  '1-5': '1–5 players',
  '5-20': '5–20 players',
  '20-50': '20–50 players',
  '50+': '50+ players',
};

export function getSizePresets() {
  return (Object.keys(SIZE_TO_MAX_RAM_MB) as Array<CommunitySize>).map((size) => ({
    size,
    minRamMb: Math.max(1024, Math.floor(SIZE_TO_MAX_RAM_MB[size] / 2)),
    maxRamMb: SIZE_TO_MAX_RAM_MB[size],
    label: SIZE_LABELS[size],
  }));
}

export function getHostRamMb(): number {
  return Math.floor(os.totalmem() / (1024 * 1024));
}

export function getRecommendedMaxRamMb(): number {
  return Math.floor(getHostRamMb() * 0.5);
}

export function clampRam(requestedMaxRamMb: number): number {
  const ceiling = getRecommendedMaxRamMb();
  return Math.min(requestedMaxRamMb, ceiling);
}

export const PLUGINS_BY_TYPE: Record<ServerType, Array<WizardPlugin>> = {
  survival: [
    {
      id: 'essentialsx',
      name: 'EssentialsX',
      description: 'Core commands (tpa, home, warp, kits)',
      category: 'utilities',
      required: false,
      modrinthSlug: 'essentialsx',
    },
    {
      id: 'luckperms',
      name: 'LuckPerms',
      description: 'Permission manager — groups, inheritance, contexts',
      category: 'permissions',
      required: true,
      modrinthSlug: 'luckperms',
    },
    {
      id: 'coreprotect',
      name: 'CoreProtect',
      description: 'Anti-grief block logging — rollback griefed areas',
      category: 'protection',
      required: false,
      modrinthSlug: 'coreprotect',
    },
    {
      id: 'worldguard',
      name: 'WorldGuard',
      description: 'Region protection — claim zones, set flags',
      category: 'protection',
      required: false,
    },
    {
      id: 'worldedit',
      name: 'WorldEdit',
      description: 'In-game world editing for admins',
      category: 'worldedit',
      required: false,
      modrinthSlug: 'worldedit',
    },
  ],
  creative: [
    {
      id: 'worldedit',
      name: 'WorldEdit',
      description: 'In-game world editing — essential for creative',
      category: 'worldedit',
      required: true,
      modrinthSlug: 'worldedit',
    },
    {
      id: 'voxelsniper',
      name: 'VoxelSniper',
      description: 'Long-range terraforming brushes',
      category: 'worldedit',
      required: false,
    },
    {
      id: 'luckperms',
      name: 'LuckPerms',
      description: 'Permission manager',
      category: 'permissions',
      required: true,
      modrinthSlug: 'luckperms',
    },
    {
      id: 'plotsquared',
      name: 'PlotSquared',
      description: 'Plot management for creative servers',
      category: 'utilities',
      required: false,
    },
  ],
  minigames: [
    {
      id: 'luckperms',
      name: 'LuckPerms',
      description: 'Permission manager',
      category: 'permissions',
      required: true,
      modrinthSlug: 'luckperms',
    },
    {
      id: 'placeholderapi',
      name: 'PlaceholderAPI',
      description: 'Dynamic placeholders for other plugins',
      category: 'utilities',
      required: false,
      modrinthSlug: 'placeholderapi',
    },
    {
      id: 'holographicdisplays',
      name: 'HolographicDisplays',
      description: 'Floating text holograms for lobbies and stats',
      category: 'holograms',
      required: false,
    },
  ],
};

export const MC_SETTINGS_BY_TYPE: Record<ServerType, Record<string, string>> = {
  survival: {
    gamemode: 'survival',
    difficulty: 'normal',
    pvp: 'true',
    'spawn-protection': '16',
  },
  creative: {
    gamemode: 'creative',
    difficulty: 'peaceful',
    pvp: 'false',
    'spawn-protection': '0',
  },
  minigames: {
    gamemode: 'adventure',
    difficulty: 'easy',
    pvp: 'true',
    'spawn-protection': '0',
  },
};
