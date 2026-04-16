import { createWriteStream } from 'fs';
import fs from 'fs/promises';
import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import crypto from 'crypto';

const MODRINTH_API = 'https://api.modrinth.com/v2';
const USER_AGENT = 'shulkr/1.0 (minecraft-server-panel)';

export type ModrinthSearchHit = {
  project_id: string;
  slug: string;
  title: string;
  description: string;
  author: string;
  categories: Array<string>;
  display_categories: Array<string>;
  versions: Array<string>;
  downloads: number;
  follows: number;
  icon_url: string | null;
  date_created: string;
  date_modified: string;
  license: string;
  client_side: string;
  server_side: string;
};

export type ModrinthSearchResult = {
  hits: Array<ModrinthSearchHit>;
  offset: number;
  limit: number;
  total_hits: number;
};

export type ModrinthProject = {
  id: string;
  slug: string;
  title: string;
  description: string;
  body: string;
  categories: Array<string>;
  license: { id: string; name: string; url: string | null };
  downloads: number;
  followers: number;
  icon_url: string | null;
  gallery: Array<{
    url: string;
    title: string | null;
    description: string | null;
    ordering: number;
  }>;
  source_url: string | null;
  wiki_url: string | null;
  discord_url: string | null;
  donation_urls: Array<{ platform: string; url: string }>;
  date_created: string;
  date_modified: string;
  versions: Array<string>;
  game_versions: Array<string>;
  loaders: Array<string>;
};

export type ModrinthVersionFile = {
  hashes: { sha512: string; sha1: string };
  url: string;
  filename: string;
  primary: boolean;
  size: number;
};

export type ModrinthVersion = {
  id: string;
  project_id: string;
  name: string;
  version_number: string;
  changelog: string | null;
  game_versions: Array<string>;
  loaders: Array<string>;
  files: Array<ModrinthVersionFile>;
  date_published: string;
  downloads: number;
  version_type: 'release' | 'beta' | 'alpha';
};

export type ModrinthCategory = {
  icon: string;
  name: string;
  project_type: string;
  header: string;
};

type SearchOptions = {
  query?: string;
  categories?: Array<string>;
  gameVersions?: Array<string>;
  loaders?: Array<string>;
  index?: 'relevance' | 'downloads' | 'follows' | 'newest' | 'updated';
  limit?: number;
  offset?: number;
};

type VersionFilterOptions = {
  gameVersions?: Array<string>;
  loaders?: Array<string>;
};

async function modrinthFetch<T>(endpoint: string): Promise<T> {
  const response = await fetch(`${MODRINTH_API}${endpoint}`, {
    headers: { 'User-Agent': USER_AGENT },
  });

  if (!response.ok) {
    throw new Error(`Modrinth API error: ${response.status} ${response.statusText}`);
  }

  return (await response.json()) as T;
}

export class ModrinthService {
  async search(options: SearchOptions): Promise<ModrinthSearchResult> {
    const params = new URLSearchParams();

    if (options.query) params.set('query', options.query);
    if (options.index) params.set('index', options.index);
    params.set('limit', String(options.limit ?? 20));
    params.set('offset', String(options.offset ?? 0));

    const facets: Array<Array<string>> = [['project_type:plugin']];
    if (options.categories?.length) {
      facets.push(options.categories.map((c) => `categories:${c}`));
    }
    if (options.gameVersions?.length) {
      facets.push(options.gameVersions.map((v) => `versions:${v}`));
    }
    if (options.loaders?.length) {
      facets.push(options.loaders.map((l) => `categories:${l}`));
    }

    params.set('facets', JSON.stringify(facets));

    return modrinthFetch<ModrinthSearchResult>(`/search?${params.toString()}`);
  }

  async getProject(idOrSlug: string): Promise<ModrinthProject> {
    return modrinthFetch<ModrinthProject>(`/project/${encodeURIComponent(idOrSlug)}`);
  }

  async getVersions(projectId: string, options?: VersionFilterOptions): Promise<Array<ModrinthVersion>> {
    const params = new URLSearchParams();

    if (options?.gameVersions?.length) {
      params.set('game_versions', JSON.stringify(options.gameVersions));
    }
    if (options?.loaders?.length) {
      params.set('loaders', JSON.stringify(options.loaders));
    }

    const query = params.toString();
    const endpoint = `/project/${encodeURIComponent(projectId)}/version${query ? `?${query}` : ''}`;
    return modrinthFetch<Array<ModrinthVersion>>(endpoint);
  }

  async getCategories(): Promise<Array<ModrinthCategory>> {
    const all = await modrinthFetch<Array<ModrinthCategory>>('/tag/category');
    return all.filter((c) => c.project_type === 'mod');
  }

  async downloadPlugin(
    fileUrl: string,
    destDir: string,
    filename: string,
    expectedHash?: string
  ): Promise<{ filename: string; path: string }> {
    await fs.mkdir(destDir, { recursive: true });

    const safeFilename = path.basename(filename);
    const tmpPath = path.join(destDir, `.${safeFilename}.tmp`);
    const finalPath = path.join(destDir, safeFilename);

    const response = await fetch(fileUrl, {
      headers: { 'User-Agent': USER_AGENT },
    });

    if (!response.ok) {
      throw new Error(`Failed to download plugin: ${response.statusText}`);
    }

    if (!response.body) {
      throw new Error('Response body is null');
    }

    const fileStream = createWriteStream(tmpPath);
    const hash = crypto.createHash('sha512');
    const reader = response.body.getReader();

    const stream = new Readable({
      async read() {
        const { done, value } = await reader.read();
        if (done) {
          this.push(null);
          return;
        }
        hash.update(Buffer.from(value));
        this.push(Buffer.from(value));
      },
    });

    try {
      await pipeline(stream, fileStream);

      if (expectedHash) {
        const actualHash = hash.digest('hex');
        if (actualHash !== expectedHash) {
          throw new Error(`Hash mismatch: expected ${expectedHash.substring(0, 16)}..., got ${actualHash.substring(0, 16)}...`);
        }
      }

      await fs.rename(tmpPath, finalPath);
      return { filename: safeFilename, path: finalPath };
    } catch (error) {
      await fs.unlink(tmpPath).catch(() => {});
      throw error;
    }
  }
}

export const modrinthService = new ModrinthService();
