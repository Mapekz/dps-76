import type { BuildAction, ScenarioKey, SpecialKey } from '@/state/build-reducer';

/**
 * A suggestion IS a BuildAction plus presentation. The same action union the
 * UI dispatches is what the what-if engine simulates and what one-click Apply
 * replays — one change vocabulary, three consumers.
 */

export type SuggestionGroup =
  | 'mod'
  | 'legendary'
  | 'perk'
  | 'mutation'
  | 'armor'
  | 'consumable'
  | 'combo';

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
  /** Ordered sequence of actions applied in sequence to reach this candidate (e.g. an armor swap is a drop + an add). */
  action: BuildAction[];
  label: string;
  group: SuggestionGroup;
  budget: SuggestionBudget;
  /**
   * Collapse unit: candidates sharing a `family` are graduated steps toward
   * the same change (e.g. every rank of one perk, every count of one armor
   * effect) and get collapsed post-evaluation to ≤2 rows (the cheapest
   * positive-delta step and the best overall) by `collapseSuggestionFamilies`.
   */
  family: string;
  /** Steps/points spent to reach this candidate (rank delta, worn-piece count delta, ...). 0 for non-graduated candidates (a single on/off toggle). */
  cost: number;
  /**
   * Constituent piece keys (`perk:<perkId>` / `omod:<omodId>`) for combo
   * suggestions — used by evaluate.ts's dominance filter to ensure a combo
   * only charts when it beats its best constituent single.
   */
  comboPieces?: readonly string[];
}

export interface ScenarioHeadline {
  perHit: number;
  burstDps: number;
  /** Canonical achieved DPS — `ap.apLimitedDps` when AP-throttled. Never the ranking objective. */
  sustainedDps: number;
  /** VATS-Window DPS: `AP Uptime × VATS sustained`, pause counted as zero. Equals `sustainedDps` for free aim. */
  windowDps: number;
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
  /** Fractional change of the chosen metric's window DPS (0.082 = +8.2%). */
  primaryDeltaPct: number;
}

export interface SuggestionReport {
  baseline: DpsSnapshot | null;
  metric: ScenarioKey;
  suggestions: EvaluatedSuggestion[];
}
