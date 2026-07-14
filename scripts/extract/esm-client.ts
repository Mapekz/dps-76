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
  /** Only present with `refs({ paths: true })`; JSON field path(s) from the referrer to `target`. */
  field_paths?: string[];
  offset?: number;
}

/**
 * Thin wrapper around the `esm` CLI (one-shot `-p` mode with a warm daemon).
 *
 * Quirks handled here:
 * - `list --limit 0` returns [] (CLI bug) — always pass an explicit large limit.
 * - `search` requires "*" (not "") to match all records.
 * - `get` results are memo-cached per formid/edid — keyword and damage-type
 *   formids repeat across thousands of records.
 * - `get`'s multi-selector form (`bulkGet`) returns one JSON array entry per
 *   target (`{sel, ...record}` or `{sel, error}` for an unresolvable one) —
 *   unlike the single-target form, a bad selector doesn't fail the whole call.
 */
export class EsmClient {
  private getCache = new Map<string, Promise<EsmRecord>>();
  private refsCache = new Map<string, Promise<EsmRefRow[]>>();

  constructor(private esmPath: string) {}

  private async run(args: string[]): Promise<string> {
    const { stdout } = await execFileAsync('esm', ['-p', '--esm', this.esmPath, ...args], {
      maxBuffer: 256 * 1024 * 1024,
    });
    return stdout;
  }

  /** All records of a type (named or not). */
  async list(type: string, limit = 99999): Promise<EsmListRow[]> {
    const out = await this.run(['list', '--type', type, '--limit', String(limit), '--json']);
    return JSON.parse(out);
  }

  /** Search by pattern; "*" matches all. `searchIn: 'name'` restricts to records with a localized name. */
  async search(
    pattern: string,
    opts: { type?: string; searchIn?: 'edid' | 'name' | 'both'; limit?: number } = {}
  ): Promise<EsmListRow[]> {
    const args = ['search', pattern, '--limit', String(opts.limit ?? 99999), '--json'];
    if (opts.type) args.push('--type', opts.type);
    if (opts.searchIn) args.push('--in', opts.searchIn);
    return JSON.parse(await this.run(args));
  }

  /** Get a full record by FormID (0x...) or EditorID. Cached. */
  get(target: string): Promise<EsmRecord> {
    let cached = this.getCache.get(target);
    if (!cached) {
      cached = this.run(['get', target, '--json']).then(out => JSON.parse(out));
      this.getCache.set(target, cached);
    }
    return cached;
  }

  /**
   * Fetch many records in one CLI round-trip, then return them via `get()`
   * (so both this call's results and every later `get`/`resolveEdid` on the
   * same targets hit the warm cache). Order of the returned array matches
   * `targets`, duplicates included.
   */
  bulkGet(targets: string[]): Promise<EsmRecord[]> {
    const uncached = [...new Set(targets)].filter(t => !this.getCache.has(t));
    if (uncached.length === 1) {
      // The CLI's multi-selector form only activates for 2+ targets; a
      // single uncached target just goes through the classic get() path.
      void this.get(uncached[0]);
    } else if (uncached.length > 1) {
      const bulk = this.run(['get', ...uncached, '--json']).then(
        out => JSON.parse(out) as Array<{ sel: string; error?: string } & Partial<EsmRecord>>
      );
      for (const target of uncached) {
        this.getCache.set(
          target,
          bulk.then(entries => {
            const entry = entries.find(e => e.sel === target);
            if (!entry || entry.error) {
              throw new Error(`esm get ${target}: ${entry?.error ?? 'missing from bulk response'}`);
            }
            const { sel: _sel, ...record } = entry;
            return record as EsmRecord;
          })
        );
      }
    }
    return Promise.all(targets.map(t => this.get(t)));
  }

  /**
   * Records that reference `target` (reverse lookup). Cached.
   * Always pass a formid — the CLI misparses numeric editor_ids when it
   * auto-detects the target kind — and an explicit large limit (the default
   * of 100 silently truncates popular records like the .44).
   *
   * `type` narrows to one 4-char referrer record type server-side (e.g.
   * `OMOD`); `paths` annotates each row with the JSON field path(s) from the
   * referrer to `target` (e.g. `Effects[2].Conditions[0].Parameter 1`) — off
   * by default since it decodes every emitted row.
   */
  refs(
    formId: string,
    opts: { depth?: number; limit?: number; type?: string; paths?: boolean } = {}
  ): Promise<EsmRefRow[]> {
    const depth = opts.depth ?? 1;
    const limit = opts.limit ?? 4000;
    const type = opts.type;
    const paths = opts.paths ?? false;
    const key = `${formId}:${depth}:${limit}:${type ?? ''}:${paths}`;
    let cached = this.refsCache.get(key);
    if (!cached) {
      const args = ['refs', '--formid', formId, '--depth', String(depth), '--limit', String(limit)];
      if (type) args.push('--type', type);
      if (paths) args.push('--paths');
      args.push('--json');
      cached = this.run(args).then(out => JSON.parse(out));
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
