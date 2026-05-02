import { join } from 'node:path';
import AdmZip from 'adm-zip';
import { DATA_DIR } from '@shulkr/backend/services/paths';
import type { AppDeps } from '@shulkr/backend/deps';

const TEXTURE_CACHE_DIR = join(DATA_DIR, 'texture-cache');
const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: Array<{ id: string; type: string; url: string }>;
}

interface VersionMeta {
  downloads: { client: { url: string; sha1: string; size: number } };
}

const STRIP_SUFFIXES = [
  '_slab',
  '_stairs',
  '_wall',
  '_fence',
  '_fence_gate',
  '_button',
  '_pressure_plate',
  '_sign',
  '_hanging_sign',
];

const TEXTURE_ALIASES: Record<string, string> = {
  grass_block: 'grass_block_top',
  snow_block: 'snow',
  podzol: 'podzol_top',
  mycelium: 'mycelium_top',
  farmland: 'farmland_moist',
  redstone_wire: 'redstone_dust_line0',
  tripwire: 'tripwire',
  bamboo: 'bamboo_stalk',
  sweet_berry_bush: 'sweet_berry_bush_stage3',
  cave_vines: 'cave_vines',
  big_dripleaf: 'big_dripleaf_top',
  pitcher_plant: 'pitcher_crop_top_stage_4',
};

type Deps = Pick<AppDeps, 'fs'>;

// Module-level caches: per-process, lazy-loaded. The fetch to Mojang's CDN is deferred until the first texture request. Story 58.6.3 keeps fetch inline; HttpFetcher injection is a 58.6.7 follow-up since the same wrapper is needed by papermc/hangar/modrinth services.
const memoryCache = new Map<string, Buffer>();
let extractionPromise: Promise<void> | null = null;

function buildCandidates(id: string): Array<string> {
  const candidates = [id];
  if (TEXTURE_ALIASES[id]) candidates.push(TEXTURE_ALIASES[id]);

  for (const suffix of STRIP_SUFFIXES) {
    if (id.endsWith(suffix)) {
      const base = id.slice(0, -suffix.length);
      candidates.push(base, `${base}_planks`);
      break;
    }
  }

  candidates.push(`${id}_top`);

  return candidates;
}

async function downloadAndExtract(deps: Deps): Promise<void> {
  console.log('Downloading Minecraft textures...');
  const manifestRes = await fetch(MANIFEST_URL);
  const manifest = (await manifestRes.json()) as VersionManifest;
  const latestRelease = manifest.versions.find((v) => v.id === manifest.latest.release);
  if (!latestRelease) throw new Error('No latest release found');

  const versionRes = await fetch(latestRelease.url);
  const versionMeta = (await versionRes.json()) as VersionMeta;
  const clientUrl = versionMeta.downloads.client.url;

  console.log(`Fetching client jar for ${latestRelease.id}...`);
  const jarRes = await fetch(clientUrl);
  const jarBuffer = Buffer.from(await jarRes.arrayBuffer());
  const zip = new AdmZip(jarBuffer);
  const entries = zip.getEntries();

  const blockDir = join(TEXTURE_CACHE_DIR, 'block');
  const itemDir = join(TEXTURE_CACHE_DIR, 'item');
  await deps.fs.mkdir(blockDir, { recursive: true });
  await deps.fs.mkdir(itemDir, { recursive: true });

  let count = 0;

  for (const entry of entries) {
    const name = entry.entryName;

    if (name.startsWith('assets/minecraft/textures/block/') && name.endsWith('.png')) {
      const filename = name.split('/').pop()!;
      await deps.fs.writeFile(join(blockDir, filename), entry.getData());
      count++;
    } else if (name.startsWith('assets/minecraft/textures/item/') && name.endsWith('.png')) {
      const filename = name.split('/').pop()!;
      await deps.fs.writeFile(join(itemDir, filename), entry.getData());
      count++;
    }
  }

  await deps.fs.writeFile(join(TEXTURE_CACHE_DIR, '.extracted'), latestRelease.id);
  console.log(`Extracted ${count} Minecraft textures (${latestRelease.id})`);
}

async function ensureTexturesExtracted(deps: Deps): Promise<void> {
  if (await deps.fs.exists(join(TEXTURE_CACHE_DIR, '.extracted'))) return;

  if (extractionPromise) {
    await extractionPromise;

    return;
  }

  extractionPromise = downloadAndExtract(deps);
  await extractionPromise;
  extractionPromise = null;
}

export async function getMinecraftTexture(deps: Deps, id: string): Promise<Buffer | null> {
  const cached = memoryCache.get(id);
  if (cached) return cached;
  await ensureTexturesExtracted(deps);

  const candidates = buildCandidates(id);

  for (const candidate of candidates) {
    for (const type of ['block', 'item']) {
      const filePath = join(TEXTURE_CACHE_DIR, type, `${candidate}.png`);

      if (await deps.fs.exists(filePath)) {
        const buffer = await deps.fs.readFile(filePath);
        memoryCache.set(id, buffer);

        return buffer;
      }
    }
  }

  return null;
}

import { createFsAdapter } from '@shulkr/backend/deps/fs_adapter';

const _legacyDeps: Deps = { fs: createFsAdapter() };
