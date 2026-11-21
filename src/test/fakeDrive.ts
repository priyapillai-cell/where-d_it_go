import type { FetchLike, FetchResponse } from '@/services/google/driveClient';

interface FakeFile {
  id: string;
  name: string;
  parents: string[];
  mimeType: string;
  content: string | Uint8Array;
  version: number;
  modifiedTime: string;
  trashed: boolean;
}

function response(status: number, body: unknown = ''): FetchResponse {
  const text = typeof body === 'string' ? body : JSON.stringify(body);
  return { ok: status >= 200 && status < 300, status, text: async () => text };
}

const unescape = (value: string) => value.replace(/\\(.)/g, '$1');

/** In-memory Google Drive v3 API covering the endpoints `DriveClient` calls. */
export class FakeDrive {
  files = new Map<string, FakeFile>();
  validToken = 'token-1';
  requests: string[] = [];
  failNext: number | null = null;
  private counter = 0;
  private clock = Date.parse('2026-06-01T00:00:00.000Z');

  fetch: FetchLike = async (url, init) => {
    const method = init.method ?? 'GET';
    const parsed = new URL(url);
    this.requests.push(`${method} ${parsed.pathname}`);
    if (init.headers?.Authorization !== `Bearer ${this.validToken}`) return response(401);
    if (this.failNext !== null) {
      const status = this.failNext;
      this.failNext = null;
      return response(status, 'boom');
    }
    const match = /^\/(upload\/)?drive\/v3\/files(?:\/([^/]+))?$/.exec(parsed.pathname);
    if (!match) return response(404);
    const id = match[2] ? decodeURIComponent(match[2]) : null;

    if (!id && method === 'GET') return response(200, { files: this.search(parsed) });
    if (!id && method === 'POST') {
      const meta = JSON.parse(String(init.body)) as {
        name: string;
        parents?: string[];
        mimeType?: string;
      };
      const file: FakeFile = {
        id: `file-${++this.counter}`,
        name: meta.name,
        parents: meta.parents ?? ['root'],
        mimeType: meta.mimeType ?? 'application/octet-stream',
        content: '',
        version: 1,
        modifiedTime: this.tick(),
        trashed: false,
      };
      this.files.set(file.id, file);
      return response(200, this.meta(file));
    }
    const file = id ? this.files.get(id) : undefined;
    if (!file) return response(404);
    if (method === 'GET' && parsed.searchParams.get('alt') === 'media') {
      return response(
        200,
        typeof file.content === 'string' ? file.content : `<${file.content.length} bytes>`,
      );
    }
    if (method === 'GET') return response(200, this.meta(file));
    if (method === 'PATCH') {
      file.content = init.body ?? '';
      file.version += 1;
      file.modifiedTime = this.tick();
      return response(200, this.meta(file));
    }
    if (method === 'DELETE') {
      this.files.delete(file.id);
      return response(204);
    }
    return response(405);
  };

  byName(name: string): FakeFile | undefined {
    return [...this.files.values()].find((f) => f.name === name);
  }

  /** Simulates another device updating a file. */
  touch(name: string, content?: string): void {
    const file = this.byName(name);
    if (!file) throw new Error(`No file ${name}`);
    if (content !== undefined) file.content = content;
    file.version += 1;
  }

  private tick(): string {
    this.clock += 1000;
    return new Date(this.clock).toISOString();
  }

  private meta(file: FakeFile) {
    const size = typeof file.content === 'string' ? file.content.length : file.content.length;
    return {
      id: file.id,
      name: file.name,
      version: String(file.version),
      modifiedTime: file.modifiedTime,
      size: String(size),
      trashed: file.trashed,
    };
  }

  private search(url: URL) {
    const q = url.searchParams.get('q') ?? '';
    const space = url.searchParams.get('spaces');
    const literal = "'((?:\\\\.|[^'])*)'";
    const name = new RegExp(`name = ${literal}`).exec(q)?.[1];
    const mimeType = new RegExp(`mimeType = ${literal}`).exec(q)?.[1];
    const parent = new RegExp(`${literal} in parents`).exec(q)?.[1];
    return [...this.files.values()]
      .filter((f) => !f.trashed)
      .filter((f) => (space === 'appDataFolder') === f.parents.includes('appDataFolder'))
      .filter((f) => name === undefined || f.name === unescape(name))
      .filter((f) => mimeType === undefined || f.mimeType === unescape(mimeType))
      .filter((f) => parent === undefined || f.parents.includes(unescape(parent)))
      .sort((a, b) => b.modifiedTime.localeCompare(a.modifiedTime))
      .map((f) => this.meta(f));
  }
}
