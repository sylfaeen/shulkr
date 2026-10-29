import sharp from 'sharp';
import type { AppDeps } from '@shulkr/backend/deps';

const CACHE_TTL_MS = 3_600_000;
const MOJANG_SESSION_URL = 'https://sessionserver.mojang.com/session/minecraft/profile';
const STEVE_FACE_URL = 'https://textures.minecraft.net/texture/31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb';

interface CacheEntry {
  buffer: Buffer;
  expiresAt: number;
}

interface MojangProfile {
  id: string;
  name: string;
  properties: Array<{ name: string; value: string }>;
}

interface TextureData {
  textures: { SKIN?: { url: string } };
}

type Deps = Pick<AppDeps, 'clock'>;

// Module-level cache shared across requests; cleared per-process. The fake HttpFetcher introduced in story 58.6.3 will let tests inject deterministic Mojang responses; for now this remains an out-of-process call by design.
const cache: Map<string, CacheEntry> = new Map();

async function getSkinUrl(uuid: string): Promise<string> {
  const cleanUuid = uuid.replace(/-/g, '');
  const response = await fetch(`${MOJANG_SESSION_URL}/${cleanUuid}`);
  if (!response.ok) throw new Error(`Mojang API error: ${response.status}`);

  const profile = (await response.json()) as MojangProfile;
  const textureProperty = profile.properties.find((p) => p.name === 'textures');
  if (!textureProperty) throw new Error('No texture property found');

  const textureData = JSON.parse(Buffer.from(textureProperty.value, 'base64').toString()) as TextureData;
  const skinUrl = textureData.textures.SKIN?.url;
  if (!skinUrl) throw new Error('No skin URL found');

  return skinUrl;
}

async function extractFace(skinUrl: string, size: number): Promise<Buffer> {
  const response = await fetch(skinUrl);
  if (!response.ok) throw new Error(`Skin fetch error: ${response.status}`);

  const skinBuffer = Buffer.from(await response.arrayBuffer());
  const face = await sharp(skinBuffer).extract({ left: 8, top: 8, width: 8, height: 8 }).toBuffer();
  const overlay = await sharp(skinBuffer).extract({ left: 40, top: 8, width: 8, height: 8 }).toBuffer();

  return sharp(face)
    .composite([{ input: overlay }])
    .resize(size, size, { kernel: sharp.kernel.nearest })
    .png()
    .toBuffer();
}

export async function getAvatar(deps: Deps, uuid: string, size: number): Promise<Buffer> {
  const cacheKey = `${uuid}:${size}`;
  const cached = cache.get(cacheKey);
  const now = deps.clock().getTime();

  if (cached && now < cached.expiresAt) {
    return cached.buffer;
  }

  try {
    const skinUrl = await getSkinUrl(uuid);
    const buffer = await extractFace(skinUrl, size);
    cache.set(cacheKey, { buffer, expiresAt: now + CACHE_TTL_MS });

    return buffer;
  } catch {
    return extractFace(STEVE_FACE_URL, size);
  }
}
