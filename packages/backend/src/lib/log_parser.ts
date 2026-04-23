// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[0-9;]*m/g;
const MC_LOG_REGEX = /^\[(\d{2}:\d{2}:\d{2})\s+([A-Z]+)]:\s?(.*)/s;
const ARCHIVE_LOG_REGEX = /^\[(\d{2}:\d{2}:\d{2})] \[([^/]+)\/([A-Z]+)]: (.*)/;
const DATE_PREFIX_REGEX = /^\[(\d{4}-\d{2}-\d{2})\] (.*)$/;

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
  date?: string;
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
    let date: string | undefined;
    let body = clean;
    const dateMatch = clean.match(DATE_PREFIX_REGEX);
    if (dateMatch) {
      date = dateMatch[1];
      body = dateMatch[2];
    }
    const match = body.match(ARCHIVE_LOG_REGEX);
    if (match) {
      lines.push({ date, level: match[3], message: body });
    } else {
      lines.push({ date, message: body });
    }
  }
  return lines;
}
