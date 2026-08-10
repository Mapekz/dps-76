import type { GameMode } from '@/types';
import { resolveLoadout } from '@/lib/loadout';
import { createKeyedCache, createMemoScope, type MemoScope } from '@/lib/loadout-memo';
import { apLimitedDps } from '@/lib/engine/ap-economy';
import { computeScenarios, type ScenarioResult, type ScenarioSet } from '@/lib/engine/scenarios';
import {
  makeBuildReducer,
  type BuildAction,
  type BuildState,
  type ScenarioKey,
} from '@/state/build-reducer';
import { enumerateVariants } from './variants';
import type {
  DpsSnapshot,
  EvaluatedSuggestion,
  ScenarioHeadline,
  SuggestionGroup,
  SuggestionReport,
} from './types';

/**
 * Speculative evaluation: run a BuildAction through the (pure) reducer, feed
 * the result to the engine, diff against the baseline. NEVER collects traces —
 * this path runs hundreds of times per config change (benched ~5µs/eval).
 */

/** Shared by topSuggestions' tie grouping and the combo dominance filter — one threshold, not two magic numbers. */
export const TIED_THRESHOLD_PCT = 0.01;

function headline(result: ScenarioResult): ScenarioHeadline {
  return {
    perHit: result.perHit.total,
    burstDps: result.burstDps,
    // Canonical DPS for this scenario: AP-limited when VATS AP is the
    // constraint (see ScenarioCard.tsx/useScenarioResults.ts), else the same
    // reload/hit-rate sustained value free aim always uses. Field name kept
    // as `sustainedDps` — every consumer (DiffTooltip, ActionDelta) reads
    // through this snapshot, so this one fold is what makes AP-economy picks
    // show up in deltas.
    sustainedDps: result.ap?.apLimitedDps ?? result.sustain.sustainedDps,
    // VATS-Window DPS: damage over the AP-funded firing window only, pause
    // counted as zero (apLimitedDps's default `downtimeFallbackDps = 0`).
    // This is the *ranking objective* for suggestions/ActionDelta when VATS
    // is emphasized — deliberately NOT the same as `sustainedDps` above,
    // which blends in the free-aim fallback and must stay canonical for the
    // headline. Equals `sustainedDps`'s raw sustain value (no AP blend) when
    // there's no `ap` block (free aim, melee, 0-AP-cost VATS).
    windowDps: result.ap
      ? apLimitedDps(result.sustain.sustainedDps, result.ap.uptime, 0)
      : result.sustain.sustainedDps,
    critRate: result.critRate,
  };
}

export function snapshotOf(scenarios: ScenarioSet): DpsSnapshot {
  return { freeAim: headline(scenarios.freeAim), vats: headline(scenarios.vats) };
}

/**
 * Sweep-level cache for `computeScenarios` ITSELF, not just resolveLoadout's
 * assembly: every `ScenarioInput` field except weapon/modifiers/player is
 * provably invariant across one sweep — none of it is fed by any
 * `PlayerConfig`/`EnemyConfig` slice a suggestion candidate's `BuildAction`
 * ever touches (see resolveLoadout's own doc-comment). `weapon`/`modifiers`/
 * `player` are themselves already interned/canonicalized by `resolveLoadout`
 * (stable references when their real inputs didn't change) — so a
 * damage-IRRELEVANT candidate (an inert consumable/mutation `variants.ts`
 * enumerates unconditionally, a perk whose modifiers don't move any bucket
 * THIS build reads) collapses to a hit here, skipping the engine's
 * per-scenario fold entirely rather than just avoiding redundant assembly
 * work.
 *
 * Deliberately `createKeyedCache`, not `scoped()`: the sound key is
 * `[weapon, modifiers, player]`, narrower than what `computeScenarios`
 * actually reads (the full `ScenarioInput`) — a `scoped()` wrapper keyed on
 * the whole `input` would never hit, since `resolveLoadout` allocates a fresh
 * `ScenarioInput` object every call regardless of whether its fields changed.
 * See `createKeyedCache`'s own doc-comment for why this narrower key is sound
 * here specifically.
 */
const scenariosCache = createKeyedCache<DpsSnapshot>();

function computeSnapshot(state: BuildState, mode: GameMode, scope?: MemoScope): DpsSnapshot | null {
  const input = resolveLoadout(state.player, state.enemy, mode, scope);
  if (!input) return null;
  return scenariosCache(scope, [input.weapon, input.modifiers, input.player], () =>
    snapshotOf(computeScenarios(input)),
  );
}

function diff(a: ScenarioHeadline, b: ScenarioHeadline): ScenarioHeadline {
  return {
    perHit: a.perHit - b.perHit,
    burstDps: a.burstDps - b.burstDps,
    sustainedDps: a.sustainedDps - b.sustainedDps,
    windowDps: a.windowDps - b.windowDps,
  };
}

/** Folds the reducer over an ordered action list — a suggestion candidate's `action` array applied sequentially. */
function applyActions(
  state: BuildState,
  mode: GameMode,
  actions: readonly BuildAction[],
): BuildState {
  const reducer = makeBuildReducer(mode);
  let next = state;
  for (const action of actions) next = reducer(next, action);
  return next;
}

export function evaluateActions(
  state: BuildState,
  mode: GameMode,
  actions: readonly BuildAction[],
  baseline: DpsSnapshot,
  scope?: MemoScope,
): { result: DpsSnapshot; delta: DpsSnapshot } | null {
  const result = computeSnapshot(applyActions(state, mode, actions), mode, scope);
  if (!result) return null;
  return {
    result,
    delta: {
      freeAim: diff(result.freeAim, baseline.freeAim),
      vats: diff(result.vats, baseline.vats),
    },
  };
}

/**
 * Collapses graduated-family candidates (perk ranks, armor counts) to ≤2
 * rows: `next` (the cheapest step that's still a positive mover) and `best`
 * (the single highest-delta step, ties broken toward lower cost) when they
 * differ. A family with no positive member collapses to just `best` — it's
 * still ≤0 and gets filtered out downstream by `topSuggestions`. Families of
 * size 1 pass through untouched. Called on the evaluated list BEFORE the
 * final sort, so `report.suggestions` is already collapsed.
 */
export function collapseSuggestionFamilies(
  suggestions: EvaluatedSuggestion[],
): EvaluatedSuggestion[] {
  const order: string[] = [];
  const groups = new Map<string, EvaluatedSuggestion[]>();
  for (const s of suggestions) {
    let members = groups.get(s.family);
    if (!members) {
      members = [];
      groups.set(s.family, members);
      order.push(s.family);
    }
    members.push(s);
  }

  const out: EvaluatedSuggestion[] = [];
  for (const family of order) {
    const members = groups.get(family)!;
    if (members.length === 1) {
      out.push(members[0]);
      continue;
    }

    let best = members[0];
    for (const m of members) {
      if (
        m.primaryDeltaPct > best.primaryDeltaPct ||
        (m.primaryDeltaPct === best.primaryDeltaPct && m.cost < best.cost)
      ) {
        best = m;
      }
    }

    const positive = members.filter((m) => m.primaryDeltaPct > 0);
    if (positive.length === 0) {
      out.push(best);
      continue;
    }

    let next = positive[0];
    for (const m of positive) {
      if (
        m.cost < next.cost ||
        (m.cost === next.cost && m.primaryDeltaPct > next.primaryDeltaPct)
      ) {
        next = m;
      }
    }

    out.push(next);
    if (best !== next) out.push(best);
  }

  return out;
}

/** Full ranked sweep of every candidate variant (graduated families pre-collapsed to ≤2 rows). */
export function evaluateSuggestions(
  state: BuildState,
  mode: GameMode,
  metric: ScenarioKey,
): SuggestionReport {
  // One scope per sweep (src/lib/loadout-memo.ts): every candidate re-runs
  // `resolveLoadout` on a `BuildState` that differs from `state` by exactly
  // one `PlayerConfig` slice (the reducer's immutable updates keep every
  // OTHER slice's reference identity — see makeBuildReducer/withPlayer), so
  // caching assemble()'s per-slice sub-steps here turns the ~600-candidate
  // sweep's dominant cost (rebuilding perk/buff/armor/addiction modifier
  // lists and re-walking enemy/bodypart data from scratch every candidate)
  // into mostly cache hits. Discarded when this function returns — never
  // shared across sweeps or renders.
  const scope = createMemoScope();
  const baseline = computeSnapshot(state, mode, scope);
  if (!baseline) return { baseline: null, metric, suggestions: [] };

  const metricBase = baseline[metric].windowDps;
  const suggestions: EvaluatedSuggestion[] = [];

  for (const candidate of enumerateVariants(state, mode)) {
    const evaluated = evaluateActions(state, mode, candidate.action, baseline, scope);
    if (!evaluated) continue;
    const primaryDeltaPct = metricBase > 0 ? evaluated.delta[metric].windowDps / metricBase : 0;
    suggestions.push({ ...candidate, ...evaluated, primaryDeltaPct });
  }

  // Combo dominance filter: pairs are door-openers for synergies the single-step
  // ladder cannot start (e.g., clean slow weapon: every Onslaught single ≈ 0);
  // when any constituent single already charts comparably, the ladder is open and
  // the pair row is redundant noise. See docs/adr/0006-combo-suggestions-are-mechanism-derived-pairs.md.
  const bestByPiece = new Map<string, number>();
  for (const s of suggestions) {
    if (s.group === 'combo') continue;
    if (s.group === 'perk') {
      // Perk singles: family IS the piece key (perk:<perkId>)
      const max = bestByPiece.get(s.family) ?? 0;
      bestByPiece.set(s.family, Math.max(max, s.primaryDeltaPct));
    } else if (s.group === 'legendary') {
      // Legendary singles: extract piece key as 'omod:' + omodId from id like 'leg:<slotIndex>:<omodId>'
      const secondColon = s.id.indexOf(':', s.id.indexOf(':') + 1);
      if (secondColon > 0) {
        const pieceKey = 'omod:' + s.id.substring(secondColon + 1);
        const max = bestByPiece.get(pieceKey) ?? 0;
        bestByPiece.set(pieceKey, Math.max(max, s.primaryDeltaPct));
      }
    }
  }

  const filtered = suggestions.filter((s) => {
    if (s.group !== 'combo') return true;
    const bestConstituent = Math.max(...s.comboPieces!.map((key) => bestByPiece.get(key) ?? 0));
    // Two clauses, both required: the pair must out-earn its best piece by the
    // tie threshold, AND no piece may chart on its own — a charting single
    // means the ladder already has a first rung there, so the pair is noise
    // even when the synergy is superlinear (auto Fixer: Furious alone +31.8%
    // suppresses every Furious pair; the ladder reaches the same build).
    return (
      bestConstituent < TIED_THRESHOLD_PCT &&
      s.primaryDeltaPct > bestConstituent + TIED_THRESHOLD_PCT
    );
  });

  const collapsed = collapseSuggestionFamilies(filtered);
  collapsed.sort(
    (a, b) =>
      b.primaryDeltaPct - a.primaryDeltaPct || Number(b.budget.legal) - Number(a.budget.legal),
  );
  return { baseline, metric, suggestions: collapsed };
}

/** Default group scope for the suggestions panel: build-structural changes, not consumables (those get their own section). */
export const STRUCTURAL_GROUPS: ReadonlySet<SuggestionGroup> = new Set([
  'mod',
  'legendary',
  'perk',
  'mutation',
  'armor',
  'combo',
]);

/** Suggestions worth showing: positive movers, ranked; legality kept for labeling. */
export function topSuggestions(
  report: SuggestionReport,
  limit: number,
  tiedThresholdPct = TIED_THRESHOLD_PCT,
  options: { groups?: ReadonlySet<SuggestionGroup> } = {},
): {
  ranked: EvaluatedSuggestion[];
  tied: EvaluatedSuggestion[];
} {
  const groups = options.groups ?? STRUCTURAL_GROUPS;
  const scoped = report.suggestions.filter((s) => groups.has(s.group));
  // Different ESM records can share a display name and an identical outcome
  // (per-family receiver twins) — showing both is noise, keep the first.
  const seen = new Set<string>();
  const positive = scoped.filter((s) => {
    if (s.primaryDeltaPct <= 0) return false;
    // Guard against contradicting the headline: `windowDps` can rise while
    // canonical achieved DPS falls (e.g. an AP-cost receiver that raises
    // uptime but lowers per-shot damage enough that the blended DPS drops).
    // Never show a row that would make Apply drive the headline down.
    if (s.delta[report.metric].sustainedDps <= 0) return false;
    const key = `${s.label}|${s.primaryDeltaPct.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const ranked = positive.filter((s) => s.primaryDeltaPct >= tiedThresholdPct).slice(0, limit);
  const tied = positive
    .filter((s) => s.primaryDeltaPct < tiedThresholdPct)
    .slice(0, Math.max(0, limit - ranked.length) + 3);
  return { ranked, tied };
}
