import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(process.cwd(), '../..');
export const ENV_PATH = resolve(PROJECT_ROOT, '.env');

export function readEnvContent(): string {
  if (!existsSync(ENV_PATH)) {
    return '';
  }
  return readFileSync(ENV_PATH, 'utf-8');
}

export function writeEnvContent(content: string): void {
  writeFileSync(ENV_PATH, content, 'utf-8');
}

export function updateEnvVariable(key: string, value: string): void {
  const content = readEnvContent();
  const lines = content.split('\n');
  let found = false;

  const updatedLines = lines.map((line) => {
    const trimmed = line.trim();
    if (trimmed.startsWith('#') || !trimmed.includes('=')) return line;
    const eqIndex = line.indexOf('=');
    const lineKey = line.slice(0, eqIndex).trim();
    if (lineKey === key) {
      found = true;
      return `${key}=${value}`;
    }
    return line;
  });

  if (!found) {
    updatedLines.push(`${key}=${value}`);
  }

  writeEnvContent(updatedLines.join('\n'));
}
