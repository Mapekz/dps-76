import type { GameMode } from '@/types';
import { resolveLoadout } from '@/lib/loadout';
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
  SuggestionCandidate,
  SuggestionGroup,
  SuggestionReport,
} from './types';

/**
 * Speculative evaluation: run a BuildAction through the (pure) reducer, feed
 * the result to the engine, diff against the baseline. NEVER collects traces —
 * this path runs hundreds of times per config change (benched ~5µs/eval).
 */

function headline(result: ScenarioResult): ScenarioHeadline {
  return {
    perHit: result.perHit.total,
    burstDps: result.burstDps,
    // Canonical DPS for this scenario: AP-limited when VATS AP is the
    // constraint (see ScenarioCard.tsx/useScenarioResults.ts), else the same
    // reload/hit-rate sustained value free aim always uses. Field name kept
    // as `sustainedDps` — every consumer (DiffTooltip, ActionDelta,
    // evaluateSuggestions' primaryDeltaPct) reads through this snapshot, so
    // this one fold is what makes AP-economy picks show up in deltas.
    sustainedDps: result.ap?.apLimitedDps ?? result.sustain.sustainedDps,
    critRate: result.critRate,
  };
}

export function snapshotOf(scenarios: ScenarioSet): DpsSnapshot {
  return { freeAim: headline(scenarios.freeAim), vats: headline(scenarios.vats) };
}

function computeSnapshot(state: BuildState, mode: GameMode): DpsSnapshot | null {
  const input = resolveLoadout(state.player, state.enemy, mode);
  return input ? snapshotOf(computeScenarios(input)) : null;
}

function diff(a: ScenarioHeadline, b: ScenarioHeadline): ScenarioHeadline {
  return {
    perHit: a.perHit - b.perHit,
    burstDps: a.burstDps - b.burstDps,
    sustainedDps: a.sustainedDps - b.sustainedDps,
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

function evaluateActions(
  state: BuildState,
  mode: GameMode,
  actions: readonly BuildAction[],
  baseline: DpsSnapshot,
): { result: DpsSnapshot; delta: DpsSnapshot } | null {
  const result = computeSnapshot(applyActions(state, mode, actions), mode);
  if (!result) return null;
  return {
    result,
    delta: {
      freeAim: diff(result.freeAim, baseline.freeAim),
      vats: diff(result.vats, baseline.vats),
    },
  };
}

/** Evaluate one action against a baseline (hover diffs). Null when no weapon. */
export function evaluateAction(
  state: BuildState,
  mode: GameMode,
  action: BuildAction,
  baseline: DpsSnapshot,
): { result: DpsSnapshot; delta: DpsSnapshot } | null {
  return evaluateActions(state, mode, [action], baseline);
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
  const baseline = computeSnapshot(state, mode);
  if (!baseline) return { baseline: null, metric, suggestions: [] };

  const metricBase = baseline[metric].sustainedDps;
  const suggestions: EvaluatedSuggestion[] = [];

  for (const candidate of enumerateVariants(state, mode)) {
    const evaluated = evaluateActions(state, mode, candidate.action, baseline);
    if (!evaluated) continue;
    const primaryDeltaPct = metricBase > 0 ? evaluated.delta[metric].sustainedDps / metricBase : 0;
    suggestions.push({ ...candidate, ...evaluated, primaryDeltaPct });
  }

  const collapsed = collapseSuggestionFamilies(suggestions);
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
]);

/** Suggestions worth showing: positive movers, ranked; legality kept for labeling. */
export function topSuggestions(
  report: SuggestionReport,
  limit: number,
  tiedThresholdPct = 0.01,
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

export type { SuggestionCandidate };
