import path from 'path';
import { pipeline } from 'stream/promises';
import { Readable } from 'stream';
import { type AppDeps } from '@shulkr/backend/deps';

const PAPERMC_GRAPHQL = 'https://fill.papermc.io/graphql';

type GraphQLBuildEdge = {
  node: {
    number: number;
    channel: string;
    downloads: Array<{
      name: string;
      size: number;
      url: string;
      checksums: { sha256: string };
    }>;
  };
};

type GraphQLResponse<T> = {
  data: T;
  errors?: Array<{ message: string }>;
};

interface DownloadProgress {
  downloaded: number;
  total: number;
  percentage: number;
}

type Deps = Pick<AppDeps, 'fs'>;

async function graphql<T>(query: string, variables?: Record<string, unknown>): Promise<T> {
  const response = await fetch(PAPERMC_GRAPHQL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables }),
  });

  if (!response.ok) throw new Error(`PaperMC GraphQL request failed: ${response.statusText}`);
  const result = (await response.json()) as GraphQLResponse<T>;
  if (result.errors?.length) throw new Error(`PaperMC GraphQL error: ${result.errors[0].message}`);

  return result.data;
}

export async function getPaperMCVersions(project: string): Promise<Array<string>> {
  const data = await graphql<{ project: { versions: { edges: Array<{ node: { key: string } }> } } }>(
    `
      query ($project: String!) {
        project(key: $project) {
          versions(last: 100) {
            edges {
              node {
                key
              }
            }
          }
        }
      }
    `,
    { project }
  );

  return data.project.versions.edges.map((e) => e.node.key).reverse();
}

export async function getPaperMCBuilds(project: string, version: string): Promise<Array<number>> {
  const data = await graphql<{
    project: { version: { builds: { edges: Array<GraphQLBuildEdge> } } };
  }>(
    `
      query ($project: String!, $version: String!) {
        project(key: $project) {
          version(key: $version) {
            builds(first: 100, orderBy: { direction: DESC }) {
              edges {
                node {
                  number
                }
              }
            }
          }
        }
      }
    `,
    { project, version }
  );

  return data.project.version.builds.edges.map((e) => e.node.number);
}

export async function getPaperMCLatestBuild(
  project: string,
  version: string
): Promise<{ number: number; downloadUrl: string; filename: string }> {
  const data = await graphql<{
    project: { version: { builds: { edges: Array<GraphQLBuildEdge> } } };
  }>(
    `
      query ($project: String!, $version: String!) {
        project(key: $project) {
          version(key: $version) {
            builds(first: 1, orderBy: { direction: DESC }) {
              edges {
                node {
                  number
                  downloads {
                    name
                    url
                  }
                }
              }
            }
          }
        }
      }
    `,
    { project, version }
  );

  const edges = data.project.version.builds.edges;
  if (edges.length === 0) throw new Error(`No builds available for version ${version}`);
  const build = edges[0].node;
  const download = build.downloads[0];

  return {
    number: build.number,
    downloadUrl: download.url,
    filename: download.name,
  };
}

export async function getPaperMCBuildDownload(
  project: string,
  version: string,
  build: number
): Promise<{ downloadUrl: string; filename: string }> {
  const data = await graphql<{
    project: { version: { builds: { edges: Array<GraphQLBuildEdge> } } };
  }>(
    `
      query ($project: String!, $version: String!, $after: String) {
        project(key: $project) {
          version(key: $version) {
            builds(first: 100, orderBy: { direction: DESC }, after: $after) {
              edges {
                node {
                  number
                  downloads {
                    name
                    url
                  }
                }
              }
            }
          }
        }
      }
    `,
    { project, version }
  );

  const edge = data.project.version.builds.edges.find((e) => e.node.number === build);
  if (!edge) throw new Error(`Build #${build} not found for version ${version}`);
  const download = edge.node.downloads[0];

  return { downloadUrl: download.url, filename: download.name };
}

export async function downloadPaperMCJar(
  deps: Deps,
  project: string,
  version: string,
  build: number,
  targetDir: string,
  onProgress?: (progress: DownloadProgress) => void
): Promise<{ filename: string; path: string }> {
  const { downloadUrl, filename } =
    build === 0 ? await getPaperMCLatestBuild(project, version) : await getPaperMCBuildDownload(project, version, build);

  await deps.fs.mkdir(targetDir, { recursive: true });
  const safeFilename = path.basename(filename);
  const targetPath = path.join(targetDir, safeFilename);

  const response = await fetch(downloadUrl);
  if (!response.ok) throw new Error(`Failed to download JAR: ${response.statusText}`);

  const contentLength = response.headers.get('content-length');
  const total = contentLength ? parseInt(contentLength, 10) : 0;
  if (!response.body) throw new Error('Response body is null');

  const fileStream = deps.fs.createWriteStream(targetPath);
  let downloaded = 0;
  const reader = response.body.getReader();

  const stream = new Readable({
    async read() {
      const { done, value } = await reader.read();

      if (done) {
        this.push(null);

        return;
      }

      downloaded += value.length;

      if (onProgress && total > 0) {
        onProgress({
          downloaded,
          total,
          percentage: Math.round((downloaded / total) * 100),
        });
      }

      this.push(Buffer.from(value));
    },
  });

  await pipeline(stream, fileStream);

  return { filename: safeFilename, path: targetPath };
}
