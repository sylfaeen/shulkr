// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
const MC_LOG_REGEX = /^\[(\d{2}:\d{2}:\d{2})\s+([A-Z]+)]:\s?(.*)/s;
const ARCHIVE_LOG_REGEX = /^\[(\d{2}:\d{2}:\d{2})] \[([^/]+)\/([A-Z]+)]: (.*)/;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

export function parseConsoleLine(line: string): { level?: string; content: string } {
  const clean = stripAnsi(line);
  const match = clean.match(MC_LOG_REGEX);
  if (match) {
    return { level: match[2], content: clean };
  }
  return { content: clean };
}

export interface ParsedLogLine {
  level?: string;
  message: string;
}

export function parseArchiveLogLines(content: string, maxLines: number): Array<ParsedLogLine> {
  const rawLines = content.split(/\r?\n/);
  const lines: Array<ParsedLogLine> = [];

  for (const raw of rawLines) {
    if (!raw.trim()) continue;
    if (lines.length >= maxLines) break;

    const clean = stripAnsi(raw);
    const match = clean.match(ARCHIVE_LOG_REGEX);
    if (match) {
      lines.push({ level: match[3], message: clean });
    } else {
      lines.push({ message: clean });
    }
  }

  return lines;
}
