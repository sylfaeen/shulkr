import path from 'node:path';
import { type AppDeps } from '@shulkr/backend/deps';

const JVM_BASE_PATHS = ['/usr/lib/jvm', '/usr/java', '/opt/java'];

export interface InstalledJava {
  name: string;
  version: string;
  path: string;
  isDefault: boolean;
}

type Deps = Pick<AppDeps, 'fs' | 'shell'>;

async function resolveDefaultJava(deps: Deps): Promise<string | null> {
  const whichResult = await deps.shell.run('which', ['java']);
  if (!whichResult.success) return null;
  const whichPath = whichResult.stdout.trim();
  if (!whichPath) return null;
  const readlinkResult = await deps.shell.run('readlink', ['-f', whichPath]);
  if (!readlinkResult.success) return null;
  const result = readlinkResult.stdout.trim();
  return result && (await deps.fs.exists(result)) ? result : null;
}

async function getVersionFromBinary(deps: Deps, javaBin: string): Promise<string | null> {
  const result = await deps.shell.run(javaBin, ['-version'], { timeoutMs: 5000 });
  const output = result.stdout + result.stderr;
  const match = output.match(/version "(\d+)/);
  return match ? match[1] : null;
}

export async function getInstalledJavaVersions(deps: Deps): Promise<Array<InstalledJava>> {
  const defaultPath = await resolveDefaultJava(deps);
  const installed: Array<InstalledJava> = [];
  const seenPaths = new Set<string>();

  for (const basePath of JVM_BASE_PATHS) {
    if (!(await deps.fs.exists(basePath))) continue;
    const entries = await deps.fs.readdir(basePath);
    for (const entryName of entries) {
      const entryPath = path.join(basePath, entryName);
      try {
        const entryStat = await deps.fs.stat(entryPath);
        if (!entryStat.isDirectory()) continue;
      } catch {
        continue;
      }
      const javaBin = path.join(basePath, entryName, 'bin', 'java');
      if (!(await deps.fs.exists(javaBin))) continue;
      const realPath = await deps.fs.realpath(javaBin);
      if (seenPaths.has(realPath)) continue;
      seenPaths.add(realPath);
      const versionMatch = entryName.match(/(\d+)/);
      const version = versionMatch ? versionMatch[1] : ((await getVersionFromBinary(deps, javaBin)) ?? 'unknown');
      installed.push({
        name: entryName,
        version,
        path: javaBin,
        isDefault: defaultPath === realPath,
      });
    }
  }

  return installed.sort((a, b) => {
    if (a.isDefault) return -1;
    if (b.isDefault) return 1;
    return parseInt(b.version) - parseInt(a.version);
  });
}

export async function getJavaPath(deps: Pick<AppDeps, 'fs'>, name: string): Promise<string | null> {
  for (const basePath of JVM_BASE_PATHS) {
    const javaBin = path.join(basePath, name, 'bin', 'java');
    if (await deps.fs.exists(javaBin)) return javaBin;
  }
  return null;
}
