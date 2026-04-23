import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';

const HANGAR_API = 'https://hangar.papermc.io/api/v1';
const USER_AGENT = 'shulkr/1.0 (minecraft-server-panel)';

export type HangarProject = {
  id: number;
  name: string;
  namespace: { owner: string; slug: string };
  stats: { views: number; downloads: number; stars: number };
  category: string;
  description: string;
  lastUpdated: string;
  createdAt: string;
  avatarUrl: string;
  settings: {
    license: { name: string; url: string | null; type: string };
    keywords: Array<string>;
    tags: Array<string>;
  };
};

export type HangarVersion = {
  id: number;
  name: string;
  description: string;
  createdAt: string;
  stats: { totalDownloads: number; platformDownloads: Record<string, number> };
  author: string;
  channel: { name: string; color: string };
  downloads: Record<
    string,
    {
      fileInfo: { name: string; sizeBytes: number; sha256Hash: string } | null;
      externalUrl: string | null;
      downloadUrl: string | null;
    }
  >;
  pluginDependencies: Record<string, Array<{ name: string; required: boolean }>>;
  platformDependencies: Record<string, Array<string>>;
};

type HangarPaginated<T> = {
  pagination: { count: number; limit: number; offset: number };
  result: Array<T>;
};

async function hangarFetch<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${HANGAR_API}${endpoint}`, {
    headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
  });
  if (!response.ok) {
    throw new Error(`Hangar API error: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export class HangarService {
  async search(options: {
    query?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ hits: Array<HangarProject>; totalHits: number }> {
    const params = new URLSearchParams();
    if (options.query) params.set('q', options.query);
    params.set('limit', String(options.limit ?? 20));
    params.set('offset', String(options.offset ?? 0));
    params.set('sort', '-downloads');
    const result = await hangarFetch<HangarPaginated<HangarProject>>(`/projects?${params.toString()}`);
    return { hits: result.result, totalHits: result.pagination.count };
  }
  async getProject(slug: string): Promise<HangarProject> {
    return hangarFetch<HangarProject>(`/projects/${encodeURIComponent(slug)}`);
  }
  async getVersions(
    slug: string,
    options?: { limit?: number; offset?: number }
  ): Promise<{ versions: Array<HangarVersion>; total: number }> {
    const params = new URLSearchParams();
    params.set('limit', String(options?.limit ?? 25));
    params.set('offset', String(options?.offset ?? 0));
    const result = await hangarFetch<HangarPaginated<HangarVersion>>(
      `/projects/${encodeURIComponent(slug)}/versions?${params.toString()}`
    );
    return { versions: result.result, total: result.pagination.count };
  }
  async downloadPlugin(
    slug: string,
    versionName: string,
    platform: string,
    destDir: string
  ): Promise<{ filename: string; path: string }> {
    await fs.mkdir(destDir, { recursive: true });
    const url = `${HANGAR_API}/projects/${encodeURIComponent(slug)}/versions/${encodeURIComponent(versionName)}/${encodeURIComponent(platform)}/download`;
    const response = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT },
      redirect: 'follow',
    });
    if (!response.ok) {
      throw new Error(`Failed to download plugin: ${response.statusText}`);
    }
    const contentDisposition = response.headers.get('content-disposition');
    const filenameMatch = contentDisposition?.match(/filename="?([^";\n]+)"?/);
    const filename = filenameMatch?.[1] ?? `${slug}-${versionName}.jar`;
    const safeFilename = path.basename(filename);
    const tmpPath = path.join(destDir, `.${safeFilename}.tmp`);
    const finalPath = path.join(destDir, safeFilename);
    if (!response.body) throw new Error('Response body is null');
    const fileStream = createWriteStream(tmpPath);
    const reader = response.body.getReader();
    const stream = new Readable({
      async read() {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        this.push(Buffer.from(value));
      },
    });
    try {
      await pipeline(stream, fileStream);
      await fs.rename(tmpPath, finalPath);
      return { filename: safeFilename, path: finalPath };
    } catch (error) {
      await fs.unlink(tmpPath).catch(() => {});
      throw error;
    }
  }
}

export const hangarService = new HangarService();
