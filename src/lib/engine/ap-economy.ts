import type { SustainResult } from './sustain';

/**
 * Steady-state VATS AP economy (docs/assumptions.md "VATS AP economy &
 * manual-aim hit rate").
 *
 * Every VATS shot costs AP (WEAP "Action Point Cost" — Weapon.apCost); AP
 * regenerates over time and VATS crits can restore extra AP (Conductor's).
 * When the drain rate exceeds the gain rate, the player cannot sustain
 * continuous VATS fire forever — `uptime` is the steady-state duty cycle
 * (fraction of time spent actively firing before the pool runs dry and
 * regen must catch back up), and `apLimitedDps` is the sustained VATS DPS
 * scaled by that duty cycle.
 *
 * GMST sources (20260702 ESM, recorded in the same assumptions.md section):
 * - `fAVDActionPointsBase` = 60, `fAVDActionPointsMult` = 10 → MaxAP = 60 + 10×AGI.
 * - `fActionPointsRestoreRate` = 4.0 AP/s base regen.
 *
 * CAVEAT (not ESM-proven — see docs/assumptions.md): whether
 * `fActionPointsRestoreRate` is a flat AP/sec or itself scaled by the
 * ActorValue `ActionPointsRateMult` (default 100, reads as a percent) is
 * engine-side and unverified from static data alone. MODELED here as the
 * AV-standard composition
 * `regenPerSec = (fActionPointsRestoreRate + Σ apRegenFlat) × (1 + Σ apRegen)`
 * — flat sources (Company Tea's +10 on AV ActionPointsRate) ADD to the base
 * rate AV, percent sources (Action Boy/Girl, hydration, Lone Wanderer on AV
 * ActionPointsRateMult) multiply it. An in-game measurement (stopwatch AP
 * regen with/without Action Boy) should pin this — tracked as a golden-case
 * TODO, no `expected` value exists yet.
 *
 * On-crit AP HoTs (Conductor's 20 AP/s over 5s half) are REFRESH-ONLY: a new
 * crit restarts the window instead of stacking (user-confirmed in-game
 * behavior, mirrors the dotDamage convention), so the steady-state term is
 * rate × min(1, durationSec × critsPerSec) — fast crits saturate at the raw
 * rate, slow crits (interval ≥ duration) recover the full rate × duration
 * per crit.
 *
 * On-kill AP restores (Grim Reaper's Sprint, Inertial) are OUT OF SCOPE
 * (need enemy TTK, phase 3) — not computed here.
 */

/** GMST fAVDActionPointsBase (20260702 ESM) — flat AP pool floor. */
export const AP_POOL_BASE = 60;
/** GMST fAVDActionPointsMult (20260702 ESM) — AP pool gained per point of AGI. */
export const AP_POOL_PER_AGILITY = 10;
/** GMST fActionPointsRestoreRate (20260702 ESM) — base AP/sec regen (see CAVEAT above). */
export const AP_BASE_REGEN_PER_SEC = 4.0;

export interface ApEconomyInput {
  /** Effective per-shot VATS AP cost (after the vatsApCost OMOD fold). */
  apCost: number;
  /** Steady-state shots/sec while actively firing (reload-inclusive — see `effectiveShotsPerSecond`). */
  shotsPerSec: number;
  agility: number;
  /** Σ of active `apRegen` modifiers (decimal, 0.45 = +45%). */
  apRegenBonus: number;
  /** Σ of active `apRegenFlat` modifiers (flat AP/sec on the base rate — Company Tea +10). */
  apRegenFlatBonus?: number;
  /** Σ of active `apMax` modifiers (flat AP pool — food/magazine fortifies, Scaly Skin's penalty). */
  apMaxBonus?: number;
  /** Σ of active `apPerCrit` modifiers (flat AP per VATS crit, e.g. Conductor's instant 10). */
  apPerCrit: number;
  /**
   * Active on-crit AP HoTs (Conductor's 20 AP/s over 5s), each refresh-only —
   * kept per-source because each carries its own duration window.
   */
  critHots?: Array<{ ratePerSec: number; durationSec: number }>;
  /** Shots per crit at steady state from the crit meter (Infinity when crits never fire). */
  shotsPerCrit: number;
}

export interface ApEconomyResult {
  maxAp: number;
  regenPerSec: number;
  /** regenPerSec + AP/sec restored by VATS crits. */
  apGainPerSec: number;
  drainPerSec: number;
  /** Steady-state duty cycle, clamped 0–1. 1 when gain ≥ drain (AP is never the constraint). */
  uptime: number;
  /** Time to empty a full pool at the net drain rate — only meaningful when uptime < 1. */
  secondsToEmpty?: number;
}

export function computeApEconomy(input: ApEconomyInput): ApEconomyResult {
  const maxAp = Math.max(0, AP_POOL_BASE + AP_POOL_PER_AGILITY * input.agility + (input.apMaxBonus ?? 0));
  const regenPerSec = (AP_BASE_REGEN_PER_SEC + (input.apRegenFlatBonus ?? 0)) * (1 + input.apRegenBonus);

  const critsPerSec =
    Number.isFinite(input.shotsPerCrit) && input.shotsPerCrit > 0 ? input.shotsPerSec / input.shotsPerCrit : 0;
  // Refresh-only crit HoTs: active fraction = min(1, duration × crits/sec).
  const critHotPerSec = (input.critHots ?? []).reduce(
    (sum, hot) => sum + hot.ratePerSec * Math.min(1, Math.max(0, hot.durationSec) * critsPerSec),
    0
  );
  const apGainPerSec = regenPerSec + input.apPerCrit * critsPerSec + critHotPerSec;
  const drainPerSec = Math.max(0, input.apCost) * Math.max(0, input.shotsPerSec);

  if (drainPerSec <= apGainPerSec || drainPerSec <= 0) {
    return { maxAp, regenPerSec, apGainPerSec, drainPerSec, uptime: 1 };
  }

  const uptime = Math.max(0, Math.min(1, apGainPerSec / drainPerSec));
  const secondsToEmpty = maxAp / (drainPerSec - apGainPerSec);
  return { maxAp, regenPerSec, apGainPerSec, drainPerSec, uptime, secondsToEmpty };
}

/**
 * Effective steady-state shots/sec for the AP drain model: the SAME
 * reload-inclusive cadence that produces `SustainResult.sustainedDps`
 * (`shotsPerMag / (magDumpSec + reloadSec)`), not the raw burst fire rate —
 * AP keeps regenerating during reload downtime even though no shots are
 * draining it, so using the burst rate would understate uptime. Falls back
 * to the raw fire rate for weapons with no magazine cycle (sustain ==
 * burst): `sustain.ts`'s own degenerate-case rule.
 */
export function effectiveShotsPerSecond(sustain: SustainResult, fireRate: number): number {
  const cycleSec = sustain.magDumpSec + sustain.reloadSec;
  if (sustain.shotsPerMag <= 0 || cycleSec <= 0) return fireRate;
  return sustain.shotsPerMag / cycleSec;
}

/** Sustained VATS DPS scaled by the AP-limited duty cycle. */
export function apLimitedDps(sustainedDps: number, uptime: number): number {
  return sustainedDps * uptime;
}
