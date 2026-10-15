import { describe, it, expect } from 'vitest';
import { splitUrls } from '@shulkr/frontend/lib/split_urls';

describe('splitUrls', () => {
  it('returns the text as a single part when it contains no link', () => {
    expect(splitUrls('[LP] Preparing a new editor session, please wait...')).toEqual([
      { text: '[LP] Preparing a new editor session, please wait...', url: false },
    ]);

    expect(splitUrls('')).toEqual([]);
  });

  it('isolates http and https links from the surrounding text', () => {
    expect(splitUrls('https://luckperms.net/editor/0HhHRAdacE')).toEqual([
      { text: 'https://luckperms.net/editor/0HhHRAdacE', url: true },
    ]);

    expect(splitUrls('Map on http://0.0.0.0:8123/?world=world then HTTPS://Example.com done')).toEqual([
      { text: 'Map on ', url: false },
      { text: 'http://0.0.0.0:8123/?world=world', url: true },
      { text: ' then ', url: false },
      { text: 'HTTPS://Example.com', url: true },
      { text: ' done', url: false },
    ]);
  });

  it('leaves trailing punctuation and unbalanced brackets outside the link', () => {
    expect(splitUrls('Open https://example.com/a.')).toMatchObject([
      { text: 'Open ' },
      { text: 'https://example.com/a' },
      { text: '.' },
    ]);

    expect(splitUrls('(see https://example.com/a),')).toMatchObject([
      { text: '(see ' },
      { text: 'https://example.com/a' },
      { text: '),' },
    ]);

    expect(splitUrls('[https://example.com]')).toMatchObject([{ text: '[' }, { text: 'https://example.com' }, { text: ']' }]);

    expect(splitUrls('https://en.wikipedia.org/wiki/Creeper_(mob)')).toEqual([
      { text: 'https://en.wikipedia.org/wiki/Creeper_(mob)', url: true },
    ]);
  });

  it('ignores a scheme without a host', () => {
    expect(splitUrls('prefix http://. suffix')).toEqual([{ text: 'prefix http://. suffix', url: false }]);
  });
});
