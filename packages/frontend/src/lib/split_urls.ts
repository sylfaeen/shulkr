export type UrlTextPart = {
  text: string;
  url: boolean;
};

export function splitUrls(text: string): Array<UrlTextPart> {
  const pattern = /https?:\/\/[^\s<>"'`]+/gi;
  const parts: Array<UrlTextPart> = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    const url = trimTrailingPunctuation(match[0]);

    if (/^https?:\/\/$/i.test(url)) continue;

    if (match.index > lastIndex) {
      parts.push({ text: text.slice(lastIndex, match.index), url: false });
    }

    parts.push({ text: url, url: true });
    lastIndex = match.index + url.length;
  }

  if (lastIndex < text.length) {
    parts.push({ text: text.slice(lastIndex), url: false });
  }

  return parts;
}

// Sentence punctuation and unbalanced closing brackets after a link belong to the surrounding text
function trimTrailingPunctuation(url: string): string {
  const openings: Record<string, string> = { ')': '(', ']': '[', '}': '{' };
  let trimmed = url;

  while (trimmed.length > 0) {
    const last = trimmed[trimmed.length - 1];
    const opening = openings[last];
    const count = (char: string) => trimmed.split(char).length - 1;

    if ('.,;:!?'.includes(last) || (opening && count(opening) < count(last))) trimmed = trimmed.slice(0, -1);
    else break;
  }

  return trimmed;
}
