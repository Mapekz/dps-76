import type { GameMode } from '@/types';
import { resolveLoadout } from '@/lib/loadout';
import { createKeyedCache, createMemoScope, type MemoScope } from '@/lib/loadout-memo';
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
    // Canonical DPS for this scenario (ADR-0007): AP-limited totalDps when
    // VATS AP is the constraint, else the raw totalDps free aim always uses.
    // Every consumer (DiffTooltip, ActionDelta, primaryDeltaPct) reads
    // through this snapshot, so this one fold is what makes AP-economy
    // picks AND proc/DoT streams show up in deltas.
    totalDps: result.ap?.apLimitedTotalDps ?? result.totalDps,
    // VATS uptime ratio (1 for free aim / no AP block). Carried so a candidate
    // that moves VATS uptime can be classified downstream (a follow-up task
    // adds a "VATS uptime" suggestions section); never a ranking input.
    uptime: result.ap?.uptime ?? 1,
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
    totalDps: a.totalDps - b.totalDps,
    uptime: a.uptime - b.uptime,
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

export type ComboGatePolicy = 'positive' | 'margin' | 'door-closed';

/** Tweak here while play-testing; 'positive' is the shipped default. */
export const COMBO_GATE_POLICY: ComboGatePolicy = 'positive';

export function comboCharts(
  pct: number,
  bestConstituentPct: number,
  policy: ComboGatePolicy,
): boolean {
  switch (policy) {
    case 'positive':
      return pct > 0;
    case 'margin':
      return pct > bestConstituentPct + TIED_THRESHOLD_PCT;
    case 'door-closed':
      return (
        bestConstituentPct < TIED_THRESHOLD_PCT && pct > bestConstituentPct + TIED_THRESHOLD_PCT
      );
  }
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

  const metricBase = baseline[metric].totalDps;
  const suggestions: EvaluatedSuggestion[] = [];

  for (const candidate of enumerateVariants(state, mode, metric)) {
    const evaluated = evaluateActions(state, mode, candidate.action, baseline, scope);
    if (!evaluated) continue;
    const primaryDeltaPct = metricBase > 0 ? evaluated.delta[metric].totalDps / metricBase : 0;
    suggestions.push({ ...candidate, ...evaluated, primaryDeltaPct });
  }

  const bestByPiece = new Map<string, number>();
  for (const s of suggestions) {
    if (s.group === 'combo') continue;
    if (s.group === 'perk') {
      const max = bestByPiece.get(s.family) ?? 0;
      bestByPiece.set(s.family, Math.max(max, s.primaryDeltaPct));
    } else if (s.group === 'legendary') {
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
    return comboCharts(s.primaryDeltaPct, bestConstituent, COMBO_GATE_POLICY);
  });

  const collapsed = collapseSuggestionFamilies(filtered);
  collapsed.sort((a, b) => b.primaryDeltaPct - a.primaryDeltaPct);
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

/** Suggestions worth showing: positive movers, ranked. */
export function topSuggestions(
  report: SuggestionReport,
  limit: number,
  tiedThresholdPct = TIED_THRESHOLD_PCT,
  options: {
    groups?: ReadonlySet<SuggestionGroup>;
    filter?: (s: EvaluatedSuggestion) => boolean;
  } = {},
): {
  ranked: EvaluatedSuggestion[];
  tied: EvaluatedSuggestion[];
} {
  const groups = options.groups ?? STRUCTURAL_GROUPS;
  const scoped = report.suggestions.filter(
    (s) => groups.has(s.group) && (options.filter?.(s) ?? true),
  );
  const seen = new Set<string>();
  const candidates = scoped.filter((s) => {
    if (s.primaryDeltaPct <= 0) return false;
    // ADR 0007's canonical-delta guard collapsed into the ranking metric itself.
    const key = `${s.label}|${s.primaryDeltaPct.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const ranked = candidates.filter((s) => s.primaryDeltaPct >= tiedThresholdPct).slice(0, limit);
  const tied = candidates
    .filter((s) => s.primaryDeltaPct < tiedThresholdPct)
    .slice(0, Math.max(0, limit - ranked.length) + 3);
  return { ranked, tied };
}
