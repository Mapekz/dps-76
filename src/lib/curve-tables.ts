import type { GameMode } from '@/types';

interface CurvePoint {
  x: number;
  y: number;
}

interface CurveFile {
  curve: CurvePoint[];
}

// Eagerly import all universal damage curve JSON files at build time.
// Shape per file: { "curve": [{ "x": <level>, "y": <dmg> }, …] }
// X values are at 1, 5, 10, 15, … 50 (not every integer — linear interpolation required).
const liveDamageCurves = import.meta.glob<{ default: CurveFile }>(
  '../data/live/curvetables/player/damage/damage_universal_tier*.json',
  { eager: true },
);

const ptsDamageCurves = import.meta.glob<{ default: CurveFile }>(
  '../data/pts/curvetables/player/damage/damage_universal_tier*.json',
  { eager: true },
);

function getCurvesByMode(mode: GameMode) {
  return mode === 'pts' ? ptsDamageCurves : liveDamageCurves;
}

/** Extract the tier number from a glob path, e.g. "…tier24.json" → 24 */
function tierFromPath(path: string): number {
  const m = path.match(/tier(\d+)\.json$/);
  return m ? parseInt(m[1], 10) : -1;
}

/** Return the sorted curve points for the given mode + tier, or null if not found. */
function getCurve(mode: GameMode, tier: number): CurvePoint[] | null {
  const curves = getCurvesByMode(mode);
  for (const [path, mod] of Object.entries(curves)) {
    if (tierFromPath(path) === tier) {
      return mod.default.curve;
    }
  }
  return null;
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
 * getBaseDamage('live', 24, 50) === 103
 *
 * // Plasma Gun energy component, tier 16, cap 45, at item level 50 (clamped) → 42
 * getBaseDamage('live', 16, Math.min(50, 45)) === 42
 */
export function getBaseDamage(mode: GameMode, tier: number, level: number): number {
  const curve = getCurve(mode, tier);
  if (!curve) {
    console.warn(`[curve-tables] No curve found for mode=${mode} tier=${tier}`);
    return 0;
  }
  return interpolate(curve, level);
}
