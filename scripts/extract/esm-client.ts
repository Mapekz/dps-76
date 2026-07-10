import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface EsmListRow {
  form_id: string;
  record_type: string;
  editor_id: string;
  name: string | null;
}

export interface EsmRecord {
  header: { signature: string; form_id: string };
  editor_id: string;
  // Field layout varies by record type; extractors pick what they need.
  fields: Record<string, unknown>;
}

export interface EsmRefRow {
  form_id: string;
  record_type: string;
  editor_id: string;
  name: string | null;
  depth: number;
}

/**
 * Thin wrapper around the `esm` CLI (one-shot `-p` mode with a warm daemon).
 *
 * Quirks handled here:
 * - `list --limit 0` returns [] (CLI bug) — always pass an explicit large limit.
 * - `search` requires "*" (not "") to match all records.
 * - `get` results are memo-cached per formid/edid — keyword and damage-type
 *   formids repeat across thousands of records.
 */
export class EsmClient {
  private getCache = new Map<string, Promise<EsmRecord>>();
  private refsCache = new Map<string, Promise<EsmRefRow[]>>();

  constructor(private esmPath: string) {}

  private async run(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('esm', ['-p', ...args], {
      maxBuffer: 256 * 1024 * 1024,
    });
    return stdout;
  }

  /** All records of a type (named or not). */
  async list(type: string, limit = 99999): Promise<EsmListRow[]> {
    const out = await this.run(['list', this.esmPath, '--type', type, '--limit', String(limit), '--json']);
    return JSON.parse(out);
  }

  /** Search by pattern; "*" matches all. `searchIn: 'name'` restricts to records with a localized name. */
  async search(
    pattern: string,
    opts: { type?: string; searchIn?: 'edid' | 'name' | 'both'; limit?: number } = {}
  ): Promise<EsmListRow[]> {
    const args = ['search', this.esmPath, pattern, '--limit', String(opts.limit ?? 99999), '--json'];
    if (opts.type) args.push('--type', opts.type);
    if (opts.searchIn) args.push('--in', opts.searchIn);
    return JSON.parse(await this.run(args));
  }

  /** Get a full record by FormID (0x...) or EditorID. Cached. */
  get(target: string): Promise<EsmRecord> {
    let cached = this.getCache.get(target);
    if (!cached) {
      cached = this.run(['get', this.esmPath, target, '--json']).then(out => JSON.parse(out));
      this.getCache.set(target, cached);
    }
    return cached;
  }

  /**
   * Records that reference `target` (reverse lookup). Cached.
   * Always pass a formid — the CLI misparses numeric editor_ids when it
   * auto-detects the target kind — and an explicit large limit (the default
   * of 100 silently truncates popular records like the .44).
   */
  refs(formId: string, opts: { depth?: number; limit?: number } = {}): Promise<EsmRefRow[]> {
    const depth = opts.depth ?? 1;
    const limit = opts.limit ?? 4000;
    const key = `${formId}:${depth}:${limit}`;
    let cached = this.refsCache.get(key);
    if (!cached) {
      cached = this.run([
        'refs', this.esmPath, '--formid', formId,
        '--depth', String(depth), '--limit', String(limit), '--json',
      ]).then(out => JSON.parse(out));
      this.refsCache.set(key, cached);
    }
    return cached;
  }

  /** Resolve a formid to its editor_id (e.g. keyword/damage-type lookups). Cached via get(). */
  async resolveEdid(formId: string): Promise<string> {
    try {
      const rec = await this.get(formId);
      return rec.editor_id;
    } catch {
      return `<unresolved:${formId}>`;
    }
  }
}

/** Run `fn` over `items` with bounded concurrency, preserving order. */
export async function mapPool<T, R>(items: T[], concurrency: number, fn: (item: T, i: number) => Promise<R>): Promise<R[]> {
  const results = new Array<R>(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}
