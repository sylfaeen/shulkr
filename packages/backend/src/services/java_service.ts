import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const JVM_BASE_PATHS = ['/usr/lib/jvm', '/usr/java', '/opt/java'];

export interface InstalledJava {
  name: string;
  version: string;
  path: string;
  isDefault: boolean;
}

class JavaService {
  private defaultJavaPath: string | null = null;

  private resolveDefaultJava(): string | null {
    if (this.defaultJavaPath !== null) return this.defaultJavaPath;

    try {
      const whichResult = execFileSync('which', ['java'], { encoding: 'utf-8' }).trim();
      if (!whichResult) {
        this.defaultJavaPath = null;
        return null;
      }
      const result = execFileSync('readlink', ['-f', whichResult], { encoding: 'utf-8' }).trim();
      this.defaultJavaPath = result && fs.existsSync(result) ? result : null;
    } catch {
      this.defaultJavaPath = null;
    }

    return this.defaultJavaPath;
  }

  private getVersionFromBinary(javaBin: string): string | null {
    try {
      const output = execFileSync(javaBin, ['-version'], { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] });
      const match = output.match(/version "(\d+)/);
      return match ? match[1] : null;
    } catch (error: unknown) {
      if (error instanceof Error) {
        const match = error.message.match(/version "(\d+)/);
        if (match) return match[1];
      }
      return null;
    }
  }

  getInstalledVersions(): Array<InstalledJava> {
    const defaultPath = this.resolveDefaultJava();
    const installed: Array<InstalledJava> = [];
    const seenPaths = new Set<string>();

    for (const basePath of JVM_BASE_PATHS) {
      if (!fs.existsSync(basePath)) continue;

      const entries = fs.readdirSync(basePath, { withFileTypes: true });

      for (const entry of entries) {
        if (!entry.isDirectory()) continue;

        const javaBin = path.join(basePath, entry.name, 'bin', 'java');
        if (!fs.existsSync(javaBin)) continue;

        const realPath = fs.realpathSync(javaBin);
        if (seenPaths.has(realPath)) continue;
        seenPaths.add(realPath);

        const versionMatch = entry.name.match(/(\d+)/);
        const version = versionMatch ? versionMatch[1] : (this.getVersionFromBinary(javaBin) ?? 'unknown');

        installed.push({
          name: entry.name,
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

  getJavaPath(name: string): string | null {
    for (const basePath of JVM_BASE_PATHS) {
      const javaBin = path.join(basePath, name, 'bin', 'java');
      if (fs.existsSync(javaBin)) return javaBin;
    }
    return null;
  }
}

export const javaService = new JavaService();
