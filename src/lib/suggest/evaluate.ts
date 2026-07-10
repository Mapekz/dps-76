import type { GameMode } from '@/types';
import { resolveLoadout } from '@/lib/loadout';
import { computeScenarios, type ScenarioResult, type ScenarioSet } from '@/lib/engine/scenarios';
import { buildReducer, type BuildAction, type BuildState, type ScenarioKey } from '@/state/build-reducer';
import { enumerateVariants } from './variants';
import type { DpsSnapshot, EvaluatedSuggestion, ScenarioHeadline, SuggestionCandidate, SuggestionReport } from './types';

/**
 * Speculative evaluation: run a BuildAction through the (pure) reducer, feed
 * the result to the engine, diff against the baseline. NEVER collects traces —
 * this path runs hundreds of times per config change (benched ~5µs/eval).
 */

function headline(result: ScenarioResult): ScenarioHeadline {
  return {
    perHit: result.perHit.total,
    burstDps: result.burstDps,
    sustainedDps: result.sustain.sustainedDps,
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

/** Evaluate one action against a baseline (hover diffs). Null when no weapon. */
export function evaluateAction(
  state: BuildState,
  mode: GameMode,
  action: BuildAction,
  baseline: DpsSnapshot
): { result: DpsSnapshot; delta: DpsSnapshot } | null {
  const result = computeSnapshot(buildReducer(state, action), mode);
  if (!result) return null;
  return {
    result,
    delta: { freeAim: diff(result.freeAim, baseline.freeAim), vats: diff(result.vats, baseline.vats) },
  };
}

/** Full ranked sweep of every single-change variant. */
export function evaluateSuggestions(state: BuildState, mode: GameMode, metric: ScenarioKey): SuggestionReport {
  const baseline = computeSnapshot(state, mode);
  if (!baseline) return { baseline: null, metric, suggestions: [] };

  const metricBase = baseline[metric].sustainedDps;
  const suggestions: EvaluatedSuggestion[] = [];

  for (const candidate of enumerateVariants(state, mode)) {
    const evaluated = evaluateAction(state, mode, candidate.action, baseline);
    if (!evaluated) continue;
    const primaryDeltaPct = metricBase > 0 ? evaluated.delta[metric].sustainedDps / metricBase : 0;
    suggestions.push({ ...candidate, ...evaluated, primaryDeltaPct });
  }

  suggestions.sort((a, b) => b.primaryDeltaPct - a.primaryDeltaPct || Number(b.budget.legal) - Number(a.budget.legal));
  return { baseline, metric, suggestions };
}

/** Suggestions worth showing: positive movers, ranked; legality kept for labeling. */
export function topSuggestions(report: SuggestionReport, limit: number, tiedThresholdPct = 0.01): {
  ranked: EvaluatedSuggestion[];
  tied: EvaluatedSuggestion[];
} {
  // Different ESM records can share a display name and an identical outcome
  // (per-family receiver twins) — showing both is noise, keep the first.
  const seen = new Set<string>();
  const positive = report.suggestions.filter(s => {
    if (s.primaryDeltaPct <= 0) return false;
    const key = `${s.label}|${s.primaryDeltaPct.toFixed(5)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const ranked = positive.filter(s => s.primaryDeltaPct >= tiedThresholdPct).slice(0, limit);
  const tied = positive.filter(s => s.primaryDeltaPct < tiedThresholdPct).slice(0, Math.max(0, limit - ranked.length) + 3);
  return { ranked, tied };
}

export type { SuggestionCandidate };
