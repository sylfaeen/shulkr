// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
const MC_LOG_REGEX = /^\[(\d{2}:\d{2}:\d{2})\s+([A-Z]+)]:\s?(.*)/s;
const ARCHIVE_LOG_REGEX = /^\[(\d{2}:\d{2}:\d{2})] \[([^/]+)\/([A-Z]+)]: (.*)/;

export function stripAnsi(text: string): string {
  return text.replace(ANSI_REGEX, '');
}

export function parseConsoleLine(line: string): { time?: string; level?: string; content: string } {
  const clean = stripAnsi(line);
  const match = clean.match(MC_LOG_REGEX);
  if (match) {
    return { time: match[1], level: match[2], content: match[3] };
  }
  return { content: clean };
}

export interface ParsedLogLine {
  time?: string;
  thread?: string;
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
      lines.push({ time: match[1], thread: match[2], level: match[3], message: match[4] });
    } else {
      lines.push({ message: clean });
    }
  }

  return lines;
}
