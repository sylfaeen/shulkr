import { resolve } from 'node:path';
import { type AppDeps, getAppDeps } from '@shulkr/backend/deps';

const PROJECT_ROOT = resolve(process.cwd(), '../..');
export const ENV_PATH = resolve(PROJECT_ROOT, '.env');

type Deps = Pick<AppDeps, 'fs'>;

export async function envRead(deps: Deps): Promise<string> {
  if (!(await deps.fs.exists(ENV_PATH))) return '';
  return deps.fs.readFileText(ENV_PATH);
}

export async function envWrite(deps: Deps, content: string): Promise<void> {
  await deps.fs.writeFile(ENV_PATH, content);
}

function applyUpdate(content: string, key: string, value: string): string {
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
  if (!found) updatedLines.push(`${key}=${value}`);
  return updatedLines.join('\n');
}

export async function envUpdate(deps: Deps, key: string, value: string): Promise<void> {
  const content = await envRead(deps);
  await envWrite(deps, applyUpdate(content, key, value));
}

export async function readEnvContent(): Promise<string> {
  return envRead(getAppDeps());
}

export async function writeEnvContent(content: string): Promise<void> {
  return envWrite(getAppDeps(), content);
}

export async function updateEnvVariable(key: string, value: string): Promise<void> {
  return envUpdate(getAppDeps(), key, value);
}
