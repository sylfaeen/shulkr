import { describe, it, expect } from 'vitest';
import { getMinecraftTexture } from '@shulkr/backend/services/minecraft_texture_service';

describe('minecraft_texture_service', () => {
  it('exposes getMinecraftTexture(deps, id)', () => {
    expect(typeof getMinecraftTexture).toBe('function');
    expect(getMinecraftTexture.length).toBe(2);
  });
});
