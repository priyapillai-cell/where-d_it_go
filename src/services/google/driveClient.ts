import { z } from 'zod';

export interface FetchResponse {
  ok: boolean;
  status: number;
  text(): Promise<string>;
}

export type FetchLike = (
  url: string,
  init: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array },
) => Promise<FetchResponse>;

/** Returns a Google access token; `forceRefresh` after the API rejected the previous one. */
export type AccessTokenProvider = (forceRefresh: boolean) => Promise<string>;

export type DriveSpace = 'appDataFolder' | 'drive';

export class DriveError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
    this.name = 'DriveError';
  }
}

const fileSchema = z.object({
  id: z.string(),
  name: z.string(),
  version: z.string().optional(),
  modifiedTime: z.string().optional(),
  size: z.string().optional(),
  trashed: z.boolean().optional(),
});

export interface DriveFile {
  id: string;
  name: string;
  /** Increases on every change; used to detect writes by other devices. */
  version: string;
  modifiedTime: string | null;
  size: number | null;
  trashed: boolean;
}

const listSchema = z.object({ files: z.array(fileSchema) });

const API = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FIELDS = 'id,name,version,modifiedTime,size,trashed';
export const FOLDER_MIME = 'application/vnd.google-apps.folder';

function toDriveFile(raw: z.infer<typeof fileSchema>): DriveFile {
  return {
    id: raw.id,
    name: raw.name,
    version: raw.version ?? '0',
    modifiedTime: raw.modifiedTime ?? null,
    size: raw.size === undefined ? null : Number(raw.size),
    trashed: raw.trashed === true,
  };
}

/** Escapes a value for a Drive search query string literal. */
export function driveQueryLiteral(value: string): string {
  return `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

/** Minimal Google Drive v3 REST client covering what sync, backups and the sheet need. */
export class DriveClient {
  constructor(
    private readonly fetchFn: FetchLike,
    private readonly accessToken: AccessTokenProvider,
  ) {}

  private async request(
    url: string,
    init: { method?: string; headers?: Record<string, string>; body?: string | Uint8Array } = {},
  ): Promise<FetchResponse> {
    let response: FetchResponse | null = null;
    for (const forceRefresh of [false, true]) {
      const token = await this.accessToken(forceRefresh);
      response = await this.fetchFn(url, {
        ...init,
        headers: { ...init.headers, Authorization: `Bearer ${token}` },
      });
      if (response.status !== 401) break;
    }
    if (!response || !response.ok) {
      const body = response ? await response.text().catch(() => '') : '';
      throw new DriveError(response?.status ?? 0, `Drive request failed: ${body.slice(0, 200)}`);
    }
    return response;
  }

  private async json(url: string, init?: Parameters<FetchLike>[1]): Promise<unknown> {
    const text = await (await this.request(url, init)).text();
    return JSON.parse(text) as unknown;
  }

  async list(query: string, space: DriveSpace): Promise<DriveFile[]> {
    const params = new URLSearchParams({
      q: `${query} and trashed = false`,
      spaces: space,
      fields: `files(${FIELDS})`,
      orderBy: 'modifiedTime desc',
      pageSize: '100',
    });
    const parsed = listSchema.parse(await this.json(`${API}/files?${params.toString()}`));
    return parsed.files.map(toDriveFile);
  }

  async findByName(
    name: string,
    space: DriveSpace,
    options: { parentId?: string; mimeType?: string } = {},
  ): Promise<DriveFile | null> {
    const parent = options.parentId ?? (space === 'appDataFolder' ? 'appDataFolder' : null);
    const clauses = [`name = ${driveQueryLiteral(name)}`];
    if (parent) clauses.push(`${driveQueryLiteral(parent)} in parents`);
    if (options.mimeType) clauses.push(`mimeType = ${driveQueryLiteral(options.mimeType)}`);
    const files = await this.list(clauses.join(' and '), space);
    return files[0] ?? null;
  }

  /** Metadata for a file, or `null` when it no longer exists or is in the trash. */
  async get(id: string): Promise<DriveFile | null> {
    try {
      const raw = await this.json(`${API}/files/${encodeURIComponent(id)}?fields=${FIELDS}`);
      const file = toDriveFile(fileSchema.parse(raw));
      return file.trashed ? null : file;
    } catch (error) {
      if (error instanceof DriveError && error.status === 404) return null;
      throw error;
    }
  }

  async download(id: string): Promise<string> {
    return (await this.request(`${API}/files/${encodeURIComponent(id)}?alt=media`)).text();
  }

  async create(
    metadata: { name: string; parents?: string[]; mimeType?: string },
    content?: { data: string | Uint8Array; mimeType: string },
  ): Promise<DriveFile> {
    const created = toDriveFile(
      fileSchema.parse(
        await this.json(`${API}/files?fields=${FIELDS}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json; charset=UTF-8' },
          body: JSON.stringify(metadata),
        }),
      ),
    );
    return content ? this.upload(created.id, content.data, content.mimeType) : created;
  }

  async upload(id: string, data: string | Uint8Array, mimeType: string): Promise<DriveFile> {
    const url = `${UPLOAD}/files/${encodeURIComponent(id)}?uploadType=media&fields=${FIELDS}`;
    return toDriveFile(
      fileSchema.parse(
        await this.json(url, {
          method: 'PATCH',
          headers: { 'Content-Type': mimeType },
          body: data,
        }),
      ),
    );
  }

  async remove(id: string): Promise<void> {
    try {
      await this.request(`${API}/files/${encodeURIComponent(id)}`, { method: 'DELETE' });
    } catch (error) {
      if (error instanceof DriveError && error.status === 404) return;
      throw error;
    }
  }
}
