import sharp from 'sharp';

const CACHE_TTL_MS = 3_600_000; // 1 hour
const MOJANG_SESSION_URL = 'https://sessionserver.mojang.com/session/minecraft/profile';

// Steve skin face as fallback (8x8 raw RGBA)
const STEVE_FACE_URL = 'https://textures.minecraft.net/texture/31f477eb1a7beee631c2ca64d06f8f68fa93a3386d04452ab27f43acdf1b60cb';

interface CacheEntry {
  buffer: Buffer;
  expiresAt: number;
}

interface MojangProfile {
  id: string;
  name: string;
  properties: Array<{
    name: string;
    value: string;
  }>;
}

interface TextureData {
  textures: {
    SKIN?: {
      url: string;
    };
  };
}

class AvatarService {
  private cache: Map<string, CacheEntry> = new Map();
  async getAvatar(uuid: string, size: number): Promise<Buffer> {
    const cacheKey = `${uuid}:${size}`;
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() < cached.expiresAt) {
      return cached.buffer;
    }
    try {
      const skinUrl = await this.getSkinUrl(uuid);
      const buffer = await this.extractFace(skinUrl, size);
      this.cache.set(cacheKey, { buffer, expiresAt: Date.now() + CACHE_TTL_MS });
      return buffer;
    } catch {
      // Fallback to Steve skin
      const buffer = await this.extractFace(STEVE_FACE_URL, size);
      return buffer;
    }
  }
  private async getSkinUrl(uuid: string): Promise<string> {
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
  private async extractFace(skinUrl: string, size: number): Promise<Buffer> {
    const response = await fetch(skinUrl);
    if (!response.ok) throw new Error(`Skin fetch error: ${response.status}`);
    const skinBuffer = Buffer.from(await response.arrayBuffer());
    // Extract base face layer (8,8) -> (16,16)
    const face = await sharp(skinBuffer).extract({ left: 8, top: 8, width: 8, height: 8 }).toBuffer();
    // Extract overlay layer (40,8) -> (48,16)
    const overlay = await sharp(skinBuffer).extract({ left: 40, top: 8, width: 8, height: 8 }).toBuffer();
    // Composite overlay on face, then resize
    return sharp(face)
      .composite([{ input: overlay }])
      .resize(size, size, { kernel: sharp.kernel.nearest })
      .png()
      .toBuffer();
  }
}

export const avatarService = new AvatarService();
