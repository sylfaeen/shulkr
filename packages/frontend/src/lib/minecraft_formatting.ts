export type MinecraftTextSegment = {
  text: string;
  color: string | null;
  bold: boolean;
  italic: boolean;
  underlined: boolean;
  strikethrough: boolean;
};

export function parseMinecraftFormatting(message: string): Array<MinecraftTextSegment> {
  const reset: Omit<MinecraftTextSegment, 'text'> = {
    color: null,
    bold: false,
    italic: false,
    underlined: false,
    strikethrough: false,
  };

  const pattern = /§(x(?:§[0-9a-f]){6}|[0-9a-fk-or])/gi;
  const segments: Array<MinecraftTextSegment> = [];
  let style = reset;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(message)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ ...style, text: message.slice(lastIndex, match.index) });
    }

    const code = match[1].toLowerCase();

    if (code.startsWith('x')) style = { ...reset, color: `#${code.replaceAll(/[x§]/g, '')}` };
    else if (/^[0-9a-f]$/.test(code)) style = { ...reset, color: code };
    else if (code === 'r') style = reset;
    else if (code === 'l') style = { ...style, bold: true };
    else if (code === 'o') style = { ...style, italic: true };
    else if (code === 'n') style = { ...style, underlined: true };
    else if (code === 'm') style = { ...style, strikethrough: true };

    lastIndex = pattern.lastIndex;
  }

  if (lastIndex < message.length) {
    segments.push({ ...style, text: message.slice(lastIndex) });
  }

  return segments;
}
