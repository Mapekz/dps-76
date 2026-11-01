import type { GameMode } from '@/types';
import type { CurvePoint } from '@/types/curves';
import ptsDamage from '@/data/pts/curvetables/player/damage/index.generated';
import ptsChargedMelee from '@/data/pts/curvetables/legendarymods/weapon_chargedmeleeattack.json';
import ptsLuckCritCharge from '@/data/pts/curvetables/player/vats/luckvatscriticalcharge.json';
import ptsMinToMaxRange from '@/data/pts/curvetables/player/range/percentofmintomaxrangedamagemult.json';
import ptsLevelReward from '@/data/pts/curvetables/player/special/levelrewardcurve.json';
import ptsLegendarySlots from '@/data/pts/curvetables/player/perks/legendaryperkslotcount.json';

// PTS is the only extracted dataset, so every mode reads these tables. The mode
// arguments stay in place for when a Live dump is extracted.
//
// Barrel modules at ../data/<mode>/curvetables/player/damage/index.generated.ts
// export a Record<number, CurveFile> indexed by tier number.
// Shape per tier: { "curve": [{ "x": <level>, "y": <dmg> }, …] }
// X values are at 1, 5, 10, 15, … 50 (not every integer — linear interpolation required).

/** Return the sorted curve points for the given mode + tier, or null if not found. */
function getCurve(_mode: GameMode, tier: number): CurvePoint[] | null {
  return ptsDamage[tier]?.curve ?? null;
}

/** `SPECIAL_LevelRewardCurve`: player level → cumulative level-up SPECIAL points. */
export function getSpecialLevelRewardCurve(_mode: GameMode): CurvePoint[] {
  return ptsLevelReward.curve;
}

/** `LegendaryPerkSlotCount`: slot number → the player level that unlocks it. */
export function getLegendarySlotCurve(_mode: GameMode): CurvePoint[] {
  return ptsLegendarySlots.curve;
}

/** `CT_Legendary_Weapon_ChargedUpWeapon`: charge count → bonus damage. */
export function getChargedMeleeCurve(_mode: GameMode): CurvePoint[] {
  return ptsChargedMelee.curve;
}

/** `CT_LuckVATSCriticalCharge`: Luck → VATS crit meter fill per hit. */
export function getLuckCritChargeCurve(_mode: GameMode): CurvePoint[] {
  return ptsLuckCritCharge.curve;
}

/** `CT_Player_PercentOfMinToMaxRangeDMGMult`: range-span fraction → damage multiplier. */
export function getMinToMaxRangeCurve(_mode: GameMode): CurvePoint[] {
  return ptsMinToMaxRange.curve;
}

/**
 * Linearly interpolate within an ordered set of curve points at the given x.
 * Clamps to the curve's range (no extrapolation).
 * Exported for inline ESM-extracted curves (WeaponComponent.curvePoints).
 */
export function interpolateCurve(points: CurvePoint[], x: number): number {
  return interpolate(points, x);
}

function interpolate(points: CurvePoint[], x: number): number {
  if (points.length === 0) return 0;

  const first = points[0];
  const last = points[points.length - 1];

  if (x <= first.x) return first.y;
  if (x >= last.x) return last.y;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (x >= p0.x && x <= p1.x) {
      const t = (x - p0.x) / (p1.x - p0.x);
      return p0.y + t * (p1.y - p0.y);
    }
  }

  return last.y;
}

/**
 * Get the base damage value for one weapon component at a given item level.
 *
 * The level is clamped to [1, levelCap] before lookup.  Pass the weapon
 * component's `levelCap` as the caller; this function clamps internally so
 * callers can pass the global item level directly.
 *
 * @param mode     - Game mode ('live' | 'pts')
 * @param tier     - Universal damage curve tier (e.g. 24 for The Fixer)
 * @param level    - Effective item level after applying the component's levelCap
 *
 * @example
 * // The Fixer, tier 24, cap 50, at item level 50 → 103
 * getBaseDamage('pts', 24, 50) === 103
 *
 * // Plasma Gun energy component, tier 16, cap 45, at item level 50 (clamped) → 42
 * getBaseDamage('pts', 16, Math.min(50, 45)) === 42
 */
export function getBaseDamage(mode: GameMode, tier: number, level: number): number {
  const curve = getCurve(mode, tier);
  if (!curve) {
    console.warn(`[curve-tables] No curve found for mode=${mode} tier=${tier}`);
    return 0;
  }
  return interpolate(curve, level);
}
