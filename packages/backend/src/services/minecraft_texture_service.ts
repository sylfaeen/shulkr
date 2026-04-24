import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import AdmZip from 'adm-zip';
import { DATA_DIR } from '@shulkr/backend/services/paths';

const TEXTURE_CACHE_DIR = join(DATA_DIR, 'texture-cache');
const MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';

interface VersionManifest {
  latest: { release: string; snapshot: string };
  versions: Array<{ id: string; type: string; url: string }>;
}

interface VersionMeta {
  downloads: {
    client: { url: string; sha1: string; size: number };
  };
}

// Suffixes to strip when the exact ID has no texture (e.g. cobblestone_slab → cobblestone)
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

// Explicit ID → texture file remaps
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

class MinecraftTextureService {
  private memoryCache: Map<string, Buffer> = new Map();
  private extractionPromise: Promise<void> | null = null;
  async getTexture(id: string): Promise<Buffer | null> {
    const cached = this.memoryCache.get(id);
    if (cached) return cached;
    await this.ensureTexturesExtracted();
    const candidates = this.buildCandidates(id);
    for (const candidate of candidates) {
      for (const type of ['block', 'item']) {
        const filePath = join(TEXTURE_CACHE_DIR, type, `${candidate}.png`);
        if (existsSync(filePath)) {
          const buffer = readFileSync(filePath);
          this.memoryCache.set(id, buffer);
          return buffer;
        }
      }
    }
    return null;
  }
  private buildCandidates(id: string): Array<string> {
    const candidates = [id];
    if (TEXTURE_ALIASES[id]) {
      candidates.push(TEXTURE_ALIASES[id]);
    }
    for (const suffix of STRIP_SUFFIXES) {
      if (id.endsWith(suffix)) {
        const base = id.slice(0, -suffix.length);
        candidates.push(base, `${base}_planks`);
        break;
      }
    }
    // Try _top variant for blocks (grass_block_top, etc.)
    candidates.push(`${id}_top`);
    return candidates;
  }
  private async ensureTexturesExtracted(): Promise<void> {
    if (existsSync(join(TEXTURE_CACHE_DIR, '.extracted'))) return;
    if (this.extractionPromise) {
      await this.extractionPromise;
      return;
    }
    this.extractionPromise = this.downloadAndExtract();
    await this.extractionPromise;
    this.extractionPromise = null;
  }
  private async downloadAndExtract(): Promise<void> {
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
    mkdirSync(blockDir, { recursive: true });
    mkdirSync(itemDir, { recursive: true });
    let count = 0;
    for (const entry of entries) {
      const name = entry.entryName;
      if (name.startsWith('assets/minecraft/textures/block/') && name.endsWith('.png')) {
        const filename = name.split('/').pop()!;
        writeFileSync(join(blockDir, filename), entry.getData());
        count++;
      } else if (name.startsWith('assets/minecraft/textures/item/') && name.endsWith('.png')) {
        const filename = name.split('/').pop()!;
        writeFileSync(join(itemDir, filename), entry.getData());
        count++;
      }
    }
    writeFileSync(join(TEXTURE_CACHE_DIR, '.extracted'), latestRelease.id);
    console.log(`Extracted ${count} Minecraft textures (${latestRelease.id})`);
  }
}

export const minecraftTextureService = new MinecraftTextureService();
