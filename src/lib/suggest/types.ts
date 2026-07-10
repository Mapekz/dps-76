import type { BuildAction, ScenarioKey, SpecialKey } from '@/state/build-reducer';

/**
 * A suggestion IS a BuildAction plus presentation. The same action union the
 * UI dispatches is what the what-if engine simulates and what one-click Apply
 * replays — one change vocabulary, three consumers.
 */

export type SuggestionGroup = 'mod' | 'legendary' | 'perk' | 'mutation' | 'consumable';

export interface SuggestionBudget {
  legal: boolean;
  /** SPECIAL that is over budget (perk suggestions only). */
  special?: SpecialKey;
  /** Points that would need freeing ("requires dropping N points"). */
  deficit?: number;
}

export interface SuggestionCandidate {
  /** Stable id for caching/keys. */
  id: string;
  action: BuildAction;
  label: string;
  group: SuggestionGroup;
  budget: SuggestionBudget;
}

export interface ScenarioHeadline {
  perHit: number;
  burstDps: number;
  sustainedDps: number;
  critRate?: number;
}

export interface DpsSnapshot {
  freeAim: ScenarioHeadline;
  vats: ScenarioHeadline;
}

export interface EvaluatedSuggestion extends SuggestionCandidate {
  result: DpsSnapshot;
  /** result − baseline, per field. */
  delta: DpsSnapshot;
  /** Fractional change of the chosen metric's sustained DPS (0.082 = +8.2%). */
  primaryDeltaPct: number;
}

export interface SuggestionReport {
  baseline: DpsSnapshot | null;
  metric: ScenarioKey;
  suggestions: EvaluatedSuggestion[];
}
