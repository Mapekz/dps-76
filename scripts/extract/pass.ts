import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { EsmClient } from './esm-client';
import type { GameMode } from '../../src/types';
import type { ExcludedRecordDetail, GeneratedMeta } from '../../src/types/generated';
import type { ExtractWeaponsResult } from './extract-weapons';
import type { ExtractPerksResult } from './extract-perks';
import type { ExtractArmorResult } from './extract-armor';
import type { ExtractOmodsResult } from './extract-omods';
import type { ExtractUniquesResult } from './extract-uniques';
import type { ExtractBuffsResult } from './extract-buffs';
import type { BodyPartsResult } from './extract-bodyparts';
import type { ExtractHealingResult } from './extract-healing';
import type { CurveTablesResult } from './extract-curvetables';
import type { NpcsResult } from './extract-npcs';
import type { ConstantsResult } from './extract-constants';
import type { VerifyDfobsResult } from './verify-dfobs';

/**
 * Declared extraction passes: each `ExtractionPass` states its id, its real
 * dependencies (`needs`/`optionalNeeds`), and a `run()` that returns both
 * what downstream passes can read (`raw`) and what gets written to disk and
 * folded into `_meta.json` (`result`) — see `run-all.ts`'s `main()` for the
 * runner. This is the single home for the fallback/write/meta-merge logic
 * that used to be copy-pasted per `if (only.includes(...))` block.
 */

export const KNOWN_EXTRACTORS = [
  'weapons',
  'perks',
  'armor',
  'omods',
  'uniques',
  'buffs',
  'bodyparts',
  'healing',
  'curvetables',
  'npcs',
  'constants',
  'dfobs',
] as const;
export type ExtractorName = (typeof KNOWN_EXTRACTORS)[number];

/** The raw result each extractor entry function returns, keyed by pass id — what `PassContext.memoryOf` gives downstream passes. */
export interface PassRawResults {
  weapons: ExtractWeaponsResult;
  perks: ExtractPerksResult;
  armor: ExtractArmorResult;
  omods: ExtractOmodsResult;
  uniques: ExtractUniquesResult;
  buffs: ExtractBuffsResult;
  bodyparts: BodyPartsResult;
  healing: ExtractHealingResult;
  curvetables: CurveTablesResult;
  npcs: NpcsResult;
  constants: ConstantsResult;
  dfobs: VerifyDfobsResult;
}

/** One file to write, and what indent to write it with (matches every extractor's existing `null, 1` convention; `_meta.json` alone uses 2, handled by the runner itself). */
export interface PassOutput {
  /** Absolute path, or relative to the mode's `generated/` dir. */
  path: string;
  content: unknown;
  indent?: number;
  /** Write `content` (a string) as-is instead of `JSON.stringify`-ing it — the curvetables pass's generated barrel modules (`.ts` source, not JSON). */
  raw?: boolean;
}

export interface PassResult {
  outputs: readonly PassOutput[];
  counts?: Record<string, number>;
  excluded?: Record<string, string[]>;
  excludedDetailed?: Record<string, ExcludedRecordDetail[]>;
  reviewFlagged?: Record<string, ExcludedRecordDetail[]>;
  unresolved?: readonly string[];
}

export interface ExtractionPass<K extends ExtractorName = ExtractorName> {
  readonly id: K;
  /**
   * Hard deps: always pulled into the run set (topologically, ahead of this
   * pass) even under `--only`, so this pass's `ctx.memoryOf(dep)` is never
   * undefined. Use this when there's no sound way to satisfy the dependency
   * from disk alone (uniques←omods: the variant-container rewrite has no
   * on-disk representation, so reading a stale `omods.json` was a real
   * staleness bug) or when re-deriving is cheap enough that freshness should
   * just win (omods←weapons).
   */
  readonly needs?: readonly ExtractorName[];
  /**
   * Soft deps: NOT auto-pulled into the run set. Satisfied from
   * `ctx.memoryOf(dep)` if that pass happens to be in the run set already
   * (explicitly requested, or pulled in by someone else's `needs`), else
   * from `ctx.readGenerated(...)` off disk, else the pass degrades
   * gracefully (matches today's `--only omods` without perks/armor).
   */
  readonly optionalNeeds?: readonly ExtractorName[];
  run(ctx: PassContext): Promise<{ raw: PassRawResults[K]; result: PassResult }>;
}

export interface PassContext {
  readonly client: EsmClient;
  readonly mode: GameMode;
  readonly outDir: string;
  /** In-memory result if `id` ran earlier in this session, else undefined — no disk fallback (that's each pass's own `readGenerated` call, for the deps that have one). */
  memoryOf<K extends ExtractorName>(id: K): PassRawResults[K] | undefined;
  /** Read a previously-written `generated/<filename>` off disk, or undefined if missing/unparseable. */
  readGenerated<T>(filename: string): Promise<T | undefined>;
}

export function createPassContext(
  client: EsmClient,
  mode: GameMode,
  outDir: string,
  memoryResults: ReadonlyMap<ExtractorName, unknown>,
): PassContext {
  return {
    client,
    mode,
    outDir,
    memoryOf: (id) => memoryResults.get(id) as never,
    readGenerated: async (filename) => {
      try {
        return JSON.parse(await readFile(path.join(outDir, filename), 'utf8'));
      } catch {
        return undefined;
      }
    },
  };
}

/**
 * Topologically orders `requested` plus the transitive closure of every
 * pass's `needs` (never `optionalNeeds` — those degrade instead of pulling
 * anything in). Throws on an unknown id or a `needs` cycle (neither should
 * happen with `PASSES` below; this is a guard against a future typo, not
 * expected user-facing behavior).
 */
export function resolveRunOrder(
  passes: readonly ExtractionPass[],
  requested: readonly ExtractorName[],
): ExtractionPass[] {
  const byId = new Map(passes.map((p) => [p.id, p]));
  const included = new Set<ExtractorName>();
  const order: ExtractionPass[] = [];
  const visiting = new Set<ExtractorName>();

  function visit(id: ExtractorName) {
    if (included.has(id)) return;
    if (visiting.has(id)) throw new Error(`extraction pass cycle detected at "${id}"`);
    const pass = byId.get(id);
    if (!pass) throw new Error(`unknown extraction pass "${id}"`);
    visiting.add(id);
    for (const dep of pass.needs ?? []) visit(dep);
    visiting.delete(id);
    included.add(id);
    order.push(pass);
  }

  for (const id of requested) visit(id);
  return order;
}

/** Writes one `PassOutput` — JSON by default (matching every extractor's existing `null, 1` convention), or raw text when `output.raw` (curvetables' generated `.ts` barrels). */
export async function writeOutput(outDir: string, output: PassOutput): Promise<void> {
  const filePath = path.isAbsolute(output.path) ? output.path : path.join(outDir, output.path);
  await mkdir(path.dirname(filePath), { recursive: true });
  const content = output.raw
    ? (output.content as string)
    : JSON.stringify(output.content, null, output.indent ?? 1);
  await writeFile(filePath, content);
}

/** Folds one pass's `PassResult` into the run's accumulated `GeneratedMeta` — the one place every pass's counts/excluded/excludedDetailed/reviewFlagged/unresolved get merged, replacing the 12 hand-copied merges `run-all.ts`'s `main()` used to do inline. */
export function foldIntoMeta(meta: GeneratedMeta, result: PassResult): void {
  if (result.counts) Object.assign(meta.counts, result.counts);
  if (result.excluded) meta.excluded = { ...meta.excluded, ...result.excluded };
  if (result.excludedDetailed) {
    meta.excludedDetailed = { ...meta.excludedDetailed, ...result.excludedDetailed };
  }
  if (result.reviewFlagged) meta.reviewFlagged = { ...meta.reviewFlagged, ...result.reviewFlagged };
  if (result.unresolved) meta.unresolved.push(...result.unresolved);
}
