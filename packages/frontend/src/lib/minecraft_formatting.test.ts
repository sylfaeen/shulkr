import { describe, it, expect } from 'vitest';
import { parseMinecraftFormatting } from '@shulkr/frontend/lib/minecraft_formatting';

describe('parseMinecraftFormatting', () => {
  it('returns a single unstyled segment for plain text', () => {
    expect(parseMinecraftFormatting('[12:00:00 INFO]: Done (3.2s)!')).toEqual([
      { text: '[12:00:00 INFO]: Done (3.2s)!', color: null, bold: false, italic: false, underlined: false, strikethrough: false },
    ]);

    expect(parseMinecraftFormatting('')).toEqual([]);
  });

  it('colors the text following a color code and hides the code', () => {
    expect(parseMinecraftFormatting('[18:35:47 INFO]: [FlyBank] §aFlyBank enabled.')).toMatchObject([
      { text: '[18:35:47 INFO]: [FlyBank] ', color: null },
      { text: 'FlyBank enabled.', color: 'a' },
    ]);

    expect(parseMinecraftFormatting('§CFailed§r, retrying')).toMatchObject([
      { text: 'Failed', color: 'c' },
      { text: ', retrying', color: null },
    ]);
  });

  it('stacks formats until a color code or a reset clears them', () => {
    expect(parseMinecraftFormatting('§l§nTitle§6 gold§obook')).toMatchObject([
      { text: 'Title', color: null, bold: true, underlined: true },
      { text: ' gold', color: '6', bold: false, underlined: false, italic: false },
      { text: 'book', color: '6', italic: true },
    ]);
  });

  it('reads hex colors written as §x followed by six digits', () => {
    expect(parseMinecraftFormatting('§x§F§F§5§5§0§0Orange')).toMatchObject([{ text: 'Orange', color: '#ff5500' }]);
  });

  it('keeps unknown or incomplete codes as text', () => {
    expect(parseMinecraftFormatting('50§ off, §z and §xyz')).toMatchObject([{ text: '50§ off, §z and §xyz', color: null }]);
  });
});
