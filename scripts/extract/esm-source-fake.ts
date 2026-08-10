import type { EsmListRow, EsmRecord, EsmRefRow, EsmSource } from './esm-client';

export interface InMemoryEsmSourceData {
  /** Keyed by form_id (e.g. "0x00012345") OR editor_id — get()/bulkGet()/resolveEdid() look up by whichever key `target` is. */
  records?: Record<string, EsmRecord>;
  /** Backing store for list()/search() — plain row metadata, independent of `records`. */
  rows?: EsmListRow[];
  /** Backing store for refs(), keyed by formId. A value of the literal string 'throw' makes refs() reject for that formId (test convenience — mirrors the existing obtainability.test.ts stub's 'throw' sentinel). */
  refs?: Record<string, EsmRefRow[] | 'throw'>;
  /**
   * When `get()` misses `records`, return this instead of throwing — mirrors
   * omod/perk stubs that synthesize harmless KYWD/PERK placeholders.
   */
  getFallback?: (target: string) => EsmRecord;
  /** Explicit formId → editor_id map checked before `records` (weapon keyword tables, etc.). */
  resolveEdidMap?: Record<string, string>;
  /** Last resort when `resolveEdidMap` and `records`/`getFallback` miss; default `<unresolved:formId>`. */
  resolveEdidFallback?: (formId: string) => string;
}

/** `*` wildcards in search patterns (esm glob semantics). */
function globMatch(pattern: string, text: string): boolean {
  const re = new RegExp(
    `^${pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*')}$`,
    'i',
  );
  return re.test(text);
}

export function createInMemoryEsmSource(data: InMemoryEsmSourceData = {}): EsmSource {
  const records = data.records ?? {};
  const rows = data.rows ?? [];
  const refsData = data.refs ?? {};
  const { getFallback, resolveEdidMap, resolveEdidFallback } = data;

  async function get(target: string): Promise<EsmRecord> {
    const rec = records[target];
    if (rec) return rec;
    if (getFallback) return getFallback(target);
    throw new Error(`InMemoryEsmSource: not found: ${target}`);
  }

  return {
    async list(type, limit) {
      const matches = rows.filter((r) => r.record_type === type);
      return limit === undefined ? matches : matches.slice(0, limit);
    },
    async search(pattern, opts = {}) {
      let matches = rows;
      if (opts.type) matches = matches.filter((r) => r.record_type === opts.type);
      if (pattern !== '*') {
        matches = matches.filter((r) => {
          const haystack =
            opts.searchIn === 'name'
              ? (r.name ?? '')
              : opts.searchIn === 'edid'
                ? r.editor_id
                : `${r.editor_id} ${r.name ?? ''}`;
          return globMatch(pattern, haystack);
        });
      }
      if (opts.limit === undefined || opts.limit === 0) return matches;
      return matches.slice(0, opts.limit);
    },
    get,
    async bulkGet(targets) {
      return Promise.all(targets.map((t) => get(t)));
    },
    async refs(formId, _opts) {
      const entry = refsData[formId];
      if (entry === 'throw') throw new Error('InMemoryEsmSource: refs failed');
      return entry ?? [];
    },
    async resolveEdid(formId) {
      if (resolveEdidMap?.[formId] !== undefined) return resolveEdidMap[formId];
      const rec = records[formId] ?? getFallback?.(formId);
      if (rec) return rec.editor_id;
      return resolveEdidFallback?.(formId) ?? `<unresolved:${formId}>`;
    },
  };
}
