import type { GameMode } from '@/types';
import { interpolateCurve } from './curve-tables';

interface CurvePoint {
  x: number;
  y: number;
}

interface CurveFile {
  curve: CurvePoint[];
}

/**
 * Enemy Health/Armor(resist) curve lookup — mirrors curve-tables.ts's
 * getBaseDamage exactly, but reads the CT_Creatures_{Health,Armor}_Universal_Tier<N>
 * families (scripts/extract/extract-curvetables.ts) instead of
 * CT_Player_Damage_Universal_Tier<N>.
 *
 * X-axis semantics (Phase 2 spike, scratchpad/phase2-curve-spike.md,
 * 2026-07-18 — ESM-proven + high-confidence-inferred, see docs/assumptions.md):
 * the curve's X input is the target actor's own effective level, i.e.
 * `clamp(nearbyPlayerLevel + levelOffsetGlobal, levelMinGlobal, levelMaxGlobal)`
 * — the caller (Engine/UI layer, not this module) is responsible for
 * computing that clamp from GeneratedNpc.levelMin/MaxGlobal before calling
 * in; this module only does the curve-table X→Y lookup once `effectiveLevel`
 * is known, same division of labor as `getBaseDamage` (which takes an
 * already-clamped `level`, not a raw item level).
 *
 * Curve-endpoint clamping: out-of-domain inputs clamp to the curve's own
 * first/last point (never a synthetic zero floor) — project-wide convention,
 * enforced by the shared `interpolateCurve` helper (curve-tables.ts).
 */

const liveHealthCurves = import.meta.glob<{ default: CurveFile }>(
  '../data/live/curvetables/creatures/health/health_universal_tier*.json',
  { eager: true }
);
const ptsHealthCurves = import.meta.glob<{ default: CurveFile }>(
  '../data/pts/curvetables/creatures/health/health_universal_tier*.json',
  { eager: true }
);
const liveArmorCurves = import.meta.glob<{ default: CurveFile }>(
  '../data/live/curvetables/creatures/armor/armor_universal_tier*.json',
  { eager: true }
);
const ptsArmorCurves = import.meta.glob<{ default: CurveFile }>(
  '../data/pts/curvetables/creatures/armor/armor_universal_tier*.json',
  { eager: true }
);

function tierFromPath(path: string): number {
  const m = /tier(\d+)\.json$/.exec(path);
  return m ? parseInt(m[1], 10) : -1;
}

function getCurve(curves: Record<string, { default: CurveFile }>, tier: number): CurvePoint[] | null {
  for (const [path, mod] of Object.entries(curves)) {
    if (tierFromPath(path) === tier) return mod.default.curve;
  }
  return null;
}

/**
 * Enemy Health at a given effective level, from the CT_Creatures_Health_Universal_Tier<N> curve.
 *
 * @param mode          - Game mode ('live' | 'pts')
 * @param tier          - GeneratedNpc.healthCurveTier (Universal creature-health curve tier)
 * @param effectiveLevel - The target's already-clamped effective level (see module doc)
 */
export function getCreatureHealth(mode: GameMode, tier: number, effectiveLevel: number): number {
  const curves = mode === 'pts' ? ptsHealthCurves : liveHealthCurves;
  const curve = getCurve(curves, tier);
  if (!curve) {
    console.warn(`[creature-curves] No health curve found for mode=${mode} tier=${tier}`);
    return 0;
  }
  return interpolateCurve(curve, effectiveLevel);
}

/**
 * Enemy per-damage-type resist at a given effective level, from the
 * CT_Creatures_Armor_Universal_Tier<N> curve (the family name is "Armor" in
 * the ESM but it backs every damage-type resist, not just physical — see
 * GeneratedNpcResist.curveTier).
 *
 * @param mode          - Game mode ('live' | 'pts')
 * @param tier          - A GeneratedNpcResist.curveTier value
 * @param effectiveLevel - The target's already-clamped effective level (see module doc)
 */
export function getCreatureResist(mode: GameMode, tier: number, effectiveLevel: number): number {
  const curves = mode === 'pts' ? ptsArmorCurves : liveArmorCurves;
  const curve = getCurve(curves, tier);
  if (!curve) {
    console.warn(`[creature-curves] No armor(resist) curve found for mode=${mode} tier=${tier}`);
    return 0;
  }
  return interpolateCurve(curve, effectiveLevel);
}
