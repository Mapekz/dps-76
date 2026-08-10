import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'bun:test';
import {
  createPassContext,
  foldIntoMeta,
  resolveRunOrder,
  writeOutput,
  type ExtractionPass,
  type ExtractorName,
  type PassResult,
} from '../pass';
import type { GeneratedMeta } from '../../../src/types/generated';

/**
 * Orchestration tests for `pass.ts`'s runner primitives — the first coverage
 * this wiring has ever had (`run-all.ts`'s old inline `if (only.includes(...))`
 * blocks, and the fallback/write/meta-merge logic they duplicated, were
 * entirely untested; each extractor's own `extract-*.test.ts` only covers
 * that one extractor in isolation). Fake passes stand in for the real
 * `extract-*` calls — `run()` bodies here are trivial, since what's under
 * test is `resolveRunOrder`/`createPassContext`/`writeOutput`/`foldIntoMeta`,
 * not any extraction logic. They reuse real `ExtractorName` values as
 * arbitrary labels for a synthetic dependency graph unrelated to the real
 * `PASSES` graph (passes.ts) — `ExtractionPass`'s id/needs are typed against
 * the 12-value `ExtractorName` union, so there's no other closed string set
 * to draw fake ids from without widening that production type just for tests.
 */

function fakePass<K extends ExtractorName>(
  id: K,
  opts: { needs?: readonly ExtractorName[]; optionalNeeds?: readonly ExtractorName[] } = {},
): ExtractionPass<K> {
  return {
    id,
    needs: opts.needs,
    optionalNeeds: opts.optionalNeeds,
    async run() {
      return { raw: { id } as never, result: { outputs: [] } };
    },
  };
}

describe('resolveRunOrder', () => {
  it('orders a simple chain: requesting the leaf pulls in its whole needs chain, in dependency order', () => {
    const weapons = fakePass('weapons');
    const omods = fakePass('omods', { needs: ['weapons'] });
    const uniques = fakePass('uniques', { needs: ['omods'] });
    const order = resolveRunOrder([weapons, omods, uniques], ['uniques']);
    expect(order.map((p) => p.id)).toEqual(['weapons', 'omods', 'uniques']);
  });

  it('does not duplicate a pass needed by two different requested passes', () => {
    const weapons = fakePass('weapons');
    const omods = fakePass('omods', { needs: ['weapons'] });
    const uniques = fakePass('uniques', { needs: ['weapons'] });
    const order = resolveRunOrder([weapons, omods, uniques], ['omods', 'uniques']);
    expect(order.map((p) => p.id)).toEqual(['weapons', 'omods', 'uniques']);
  });

  it('optionalNeeds are never auto-pulled in', () => {
    const armor = fakePass('armor');
    const omods = fakePass('omods', { optionalNeeds: ['armor'] });
    const order = resolveRunOrder([armor, omods], ['omods']);
    expect(order.map((p) => p.id)).toEqual(['omods']);
  });

  it('requesting an already-satisfied dependency explicitly does not reorder or duplicate it', () => {
    const weapons = fakePass('weapons');
    const omods = fakePass('omods', { needs: ['weapons'] });
    const order = resolveRunOrder([weapons, omods], ['weapons', 'omods']);
    expect(order.map((p) => p.id)).toEqual(['weapons', 'omods']);
  });

  it('throws on an unknown pass id', () => {
    const weapons = fakePass('weapons');
    expect(() => resolveRunOrder([weapons], ['perks'])).toThrow(/unknown extraction pass/);
  });

  it('throws on a needs cycle', () => {
    const weapons = fakePass('weapons', { needs: ['omods'] });
    const omods = fakePass('omods', { needs: ['weapons'] });
    expect(() => resolveRunOrder([weapons, omods], ['weapons'])).toThrow(/cycle/);
  });
});

describe('createPassContext', () => {
  const outDir = '/fake/outDir';

  it('memoryOf returns the in-memory result for a pass already run this session', () => {
    const stub = { weapons: ['stub'] } as never;
    const memory = new Map<ExtractorName, unknown>([['weapons', stub]]);
    const ctx = createPassContext({} as never, 'live', outDir, memory);
    expect(ctx.memoryOf('weapons')).toBe(stub);
  });

  it('memoryOf returns undefined for a pass NOT run this session — no disk fallback here', () => {
    const ctx = createPassContext({} as never, 'live', outDir, new Map());
    expect(ctx.memoryOf('weapons')).toBeUndefined();
  });
});

describe('createPassContext readGenerated (real filesystem)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pass-test-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('reads and parses a previously-written generated file', async () => {
    await writeOutput(dir, { path: 'weapons.json', content: [{ id: 'w1' }] });
    const ctx = createPassContext({} as never, 'live', dir, new Map());
    const result = await ctx.readGenerated<Array<{ id: string }>>('weapons.json');
    expect(result).toEqual([{ id: 'w1' }]);
  });

  it('returns undefined when the file is missing (soft-dep degrade path)', async () => {
    const ctx = createPassContext({} as never, 'live', dir, new Map());
    const result = await ctx.readGenerated('missing.json');
    expect(result).toBeUndefined();
  });
});

describe('writeOutput (real filesystem)', () => {
  let dir: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), 'pass-test-'));
  });
  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('writes JSON content indented by 1 space by default, matching every extractor convention', async () => {
    await writeOutput(dir, { path: 'weapons.json', content: { a: 1 } });
    const written = await readFile(path.join(dir, 'weapons.json'), 'utf8');
    expect(written).toBe(JSON.stringify({ a: 1 }, null, 1));
  });

  it('honors an explicit indent override', async () => {
    await writeOutput(dir, { path: '_meta.json', content: { a: 1 }, indent: 2 });
    const written = await readFile(path.join(dir, '_meta.json'), 'utf8');
    expect(written).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it('writes raw (non-JSON) content as-is — the curvetables barrel case', async () => {
    await writeOutput(dir, {
      path: 'index.generated.ts',
      content: 'export const x = 1;',
      raw: true,
    });
    const written = await readFile(path.join(dir, 'index.generated.ts'), 'utf8');
    expect(written).toBe('export const x = 1;');
  });

  it('an absolute path routes OUTSIDE outDir — the curvetables different-output-root case', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'pass-test-outside-'));
    await writeOutput(dir, { path: path.join(outside, 'file.json'), content: { a: 1 } });
    const written = await readFile(path.join(outside, 'file.json'), 'utf8');
    expect(written).toBe(JSON.stringify({ a: 1 }, null, 1));
    await rm(outside, { recursive: true, force: true });
  });

  it('creates nested directories that do not exist yet (a curvetable subfamily folder)', async () => {
    await writeOutput(dir, { path: 'creatures/health/tier1.json', content: [] });
    const written = await readFile(path.join(dir, 'creatures/health/tier1.json'), 'utf8');
    expect(written).toBe('[]');
  });
});

describe('foldIntoMeta', () => {
  function emptyMeta(): GeneratedMeta {
    return {
      esmPath: '/fake.esm',
      esmDate: '20260101',
      mode: 'live',
      extractedAt: '2026-01-01T00:00:00.000Z',
      counts: {},
      excluded: {},
      excludedDetailed: {},
      reviewFlagged: {},
      unresolved: [],
    };
  }

  it('sets counts for keys the pass reports, without touching unrelated keys', () => {
    const meta = emptyMeta();
    meta.counts.perks = 769; // simulates a prior pass's count surviving
    foldIntoMeta(meta, { outputs: [], counts: { weapons: 282 } });
    expect(meta.counts).toEqual({ perks: 769, weapons: 282 });
  });

  it('merges excluded/excludedDetailed/reviewFlagged, preserving keys from earlier passes', () => {
    const meta = emptyMeta();
    meta.excluded.perkJunkEdid = ['A'];
    const result: PassResult = {
      outputs: [],
      excluded: { omodJunkEdid: ['B'] },
      excludedDetailed: { omodWeak: [{ id: 'C' }] },
      reviewFlagged: { skippedUniqueCombinations: [{ id: 'D', name: 'reason' }] },
    };
    foldIntoMeta(meta, result);
    expect(meta.excluded).toEqual({ perkJunkEdid: ['A'], omodJunkEdid: ['B'] });
    expect(meta.excludedDetailed).toEqual({ omodWeak: [{ id: 'C' }] });
    expect(meta.reviewFlagged).toEqual({
      skippedUniqueCombinations: [{ id: 'D', name: 'reason' }],
    });
  });

  it('appends unresolved rather than replacing it — run-scoped across passes in one run', () => {
    const meta = emptyMeta();
    foldIntoMeta(meta, { outputs: [], unresolved: ['first'] });
    foldIntoMeta(meta, { outputs: [], unresolved: ['second'] });
    expect(meta.unresolved).toEqual(['first', 'second']);
  });

  it('a pass reporting nothing (empty PassResult) leaves meta untouched', () => {
    const meta = emptyMeta();
    meta.counts.weapons = 1;
    foldIntoMeta(meta, { outputs: [] });
    expect(meta.counts).toEqual({ weapons: 1 });
    expect(meta.unresolved).toEqual([]);
  });
});
