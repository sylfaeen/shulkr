const GOOGLE_FONTS_CSS_URL =
  'https://fonts.googleapis.com/css2?family=Inter:ital,opsz,wght@0,14..32,100..900;1,14..32,100..900&family=JetBrains+Mono:ital,wght@0,100..800;1,100..800&family=Quattrocento:wght@400;700&display=swap';

let cachedCSS: Promise<string> | null = null;

export function getInlinedGoogleFontsCSS(): Promise<string> {
  if (!cachedCSS) {
    cachedCSS = buildInlinedCSS().catch((error: unknown) => {
      cachedCSS = null;
      throw error;
    });
  }
  return cachedCSS;
}

async function buildInlinedCSS(): Promise<string> {
  const response = await fetch(GOOGLE_FONTS_CSS_URL);
  if (!response.ok) {
    throw new Error(`Failed to fetch Google Fonts CSS: ${response.status}`);
  }
  const css = await response.text();

  const urlPattern = /url\((https?:\/\/[^)]+)\)/g;
  const uniqueUrls = Array.from(new Set(Array.from(css.matchAll(urlPattern), (match) => match[1])));

  const replacements = await Promise.all(
    uniqueUrls.map(async (url) => {
      try {
        const fontResponse = await fetch(url);
        if (!fontResponse.ok) return null;
        const buffer = await fontResponse.arrayBuffer();
        const base64 = await arrayBufferToBase64(buffer);
        return { url, dataUri: `data:font/woff2;base64,${base64}` };
      } catch {
        return null;
      }
    })
  );

  let result = css;
  for (const replacement of replacements) {
    if (replacement) {
      result = result.split(replacement.url).join(replacement.dataUri);
    }
  }
  return result;
}

function arrayBufferToBase64(buffer: ArrayBuffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== 'string') {
        reject(new Error('FileReader returned unexpected result'));
        return;
      }
      const commaIndex = result.indexOf(',');
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : '');
    };
    reader.onerror = () => reject(reader.error ?? new Error('FileReader failed'));
    reader.readAsDataURL(new Blob([buffer]));
  });
}
