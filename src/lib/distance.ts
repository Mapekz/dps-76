import { interpolateCurve } from '@/lib/curve-tables';
import minToMaxRangeCurveFile from '@/data/live/curvetables/player/range/percentofmintomaxrangedamagemult.json';

/**
 * Target-distance & range-falloff constants (Phase 1 — Range + falloff).
 *
 * Storage is ALWAYS raw game units — `EnemyConditions.targetDistance` and
 * `Weapon.minRange`/`maxRange` (src/types/index.ts) never hold a pre-divided
 * value. The Pip-Boy HUD displays distance divided by `PIP_BOY_UNIT_DIVISOR`
 * — UI-only conversion, applied at render time (TargetSection.tsx,
 * WeaponSection.tsx range context).
 */

/** Raw game units → Pip-Boy compass units (user-provided; 64/3 ≈ 21.3̅). */
export const PIP_BOY_UNIT_DIVISOR = 64 / 3;

/**
 * The "Close" perk-gate threshold (Guerrilla, Down Ranger's near-range half).
 * GMST `fDistanceForCloseDamage` = 850 — ESM-PROVEN (docs/assumptions.md
 * "Target distance (Close / Far)").
 */
export const CLOSE_THRESHOLD_UNITS = 850;

/**
 * The "Far" perk-gate threshold (Sniper's, Down Ranger's far-range half).
 * `STAT_DmgVsFar` carries no distance-condition row anywhere in the ESM —
 * the check is native-code, not data (DFOB `DamageVsFar_DO` 0x00815EE7
 * confirms the entry point exists without giving a number). MEASURED
 * in-game by the user 2026-07-18 via the CAMP-foundation method (~3.9
 * foundations × 12 Pip-Boy units each × 64/3 ≈ 1000 game units) —
 * docs/assumptions.md "Target distance (Close / Far)".
 */
export const FAR_THRESHOLD_UNITS = 1000;

/**
 * Default target distance: strictly between the two gates so NEITHER Close
 * nor Far perk conditions fire — preserves the pre-Phase-1 `'none'`
 * default's behavior now that `targetDistance` is a continuous number.
 */
export const DEFAULT_DISTANCE_UNITS = 900;

/** Raw game units → Pip-Boy compass units (display only). */
export function gameUnitsToPipBoy(units: number): number {
  return units / PIP_BOY_UNIT_DIVISOR;
}

/** Pip-Boy compass units → raw game units (storage). */
export function pipBoyToGameUnits(pipBoy: number): number {
  return pipBoy * PIP_BOY_UNIT_DIVISOR;
}

/**
 * `CT_Player_PercentOfMinToMaxRangeDMGMult` (0x008407AC, DFOB
 * `CombatFormulaPercentOfMinToMaxRangeDMGMult_DO` 0x008407AD) — ESM-PROVEN,
 * byte-identical across every live/pts dump sampled through 2026-07-18.
 * Points: (1.0, 1.0), (1.5, 0.75), (1.75, 0.55), (2.0, 0.2). `interpolateCurve`
 * clamps to the curve's own endpoints outside its domain (game-accurate —
 * curve-tables.ts), so X > 2.0 flattens at 0.2 rather than continuing to fall.
 */
const MIN_TO_MAX_RANGE_CURVE = minToMaxRangeCurveFile.curve;

/**
 * Composite range-falloff multiplier — USER-CONFIRMED reconciliation of two
 * ESM-proven pieces (docs/assumptions.md "Target distance (Close / Far)"):
 *
 *   d ≤ minRange            → 1.0
 *   minRange < d ≤ maxRange → linear 1.0 → outOfRangeMult
 *   d > maxRange            → outOfRangeMult × curveY(X),
 *                              X = (d − minRange) / (maxRange − minRange)
 *
 * X is "percent of the min-to-max range span" (the curve's own name) — NOT
 * d/maxRange. Both segments share the same X: the linear segment runs X over
 * [0, 1], the curve segment picks up past X = 1 and is continuous with the
 * linear endpoint there (curveY(1) = 1.0, so `outOfRangeMult × 1.0 ==
 * outOfRangeMult`, matching the linear segment's own value at d = maxRange).
 * With `maxRange = 2 × minRange` (the sampled-weapon norm), X reaches 2.0
 * (the curve's floor, 0.2) at `d = 1.5 × maxRange`, NOT `2 × maxRange`.
 *
 * Guards: a non-positive or degenerate `[minRange, maxRange]` span (melee
 * sentinel values, missing extraction data) returns 1.0 — a structural
 * fallback only. Melee-weapon exemption is the CALLER's job (scenarios.ts's
 * `isMelee` check) since melee `outOfRangeDamageMult` values are sentinel-ish
 * (Shishkebab 0.0, Machete −1.0) and must never reach this function.
 */
export function rangeFalloffMult(
  distanceUnits: number,
  minRange: number,
  maxRange: number,
  outOfRangeMult: number
): number {
  if (maxRange <= 0 || maxRange <= minRange) return 1.0;
  if (distanceUnits <= minRange) return 1.0;

  const x = (distanceUnits - minRange) / (maxRange - minRange);
  if (x <= 1) return 1.0 + (outOfRangeMult - 1.0) * x;
  return outOfRangeMult * interpolateCurve(MIN_TO_MAX_RANGE_CURVE, x);
}
