import type { Weapon } from '@/types';
import type { Modifier } from '@/types/modifiers';
import { effectiveValue, foldBucket, type ResolveContext } from './resolve';
import { lastTrace, type BucketTrace, type CritMeterTrace } from './trace';

/**
 * VATS crit-meter economy → steady-state crit rate.
 *
 * Fill per hit (percent of the 100-point meter):
 *   fill = (fVATSCriticalChargeBase + fVATSCriticalChargeMult × LCK) × weaponCritChargeBonus
 * GMST sources (20260702 ESM): fVATSCriticalChargeBase = 5.0 (0x00249662),
 * fVATSCriticalChargeMult = 1.5 (0x0023AEC0).
 *
 * Consumption per crit (percent of meter):
 *   cost = fold(critConsumption over base 100) × Π(1 + selfScalingMult)
 *   // Critical Savvy SETs 85/70/55 folds normally.
 *   // Limit-Breaking Armor (Armor checklist,
 *   // src/data/armor-modifiers.ts) is handled SEPARATELY as a sequential
 *   // multiplier, not folded through foldOps: its 5-tier MUL_ADD values
 *   // (−10%..−50%, wornPieceCount-gated) mean "reduce the cost by X%" —
 *   // a percentage OFF whatever the cost already is, not off the bucket's
 *   // abstract 100 base. foldOps' "MUL_ADD always scales the ORIGINAL
 *   // base, even past a SET" rule (verified for OMOD stat properties) would
 *   // otherwise compute 55 + (−0.5×100) = 5 instead of the correct
 *   // 55 × (1−0.5) = 27.5. Detected generically — any critConsumption
 *   // MUL_ADD modifier carrying a wornPieceCount condition — not by source
 *   // name, so any future effect in the same shape is handled for free
 *   // (same "separate stacking multiplier" pattern as foldWholeDamage).
 *
 * Steady state: a crit fires at a full meter and drops it by `cost`; each
 * following hit adds `fill` (capped at 100). Crit every ceil(cost/fill)+1
 * shots → max is a crit every 2nd shot (hit-crit-hit-crit).
 * Anchor (user-verified): 16 LCK (fill 29) + Crit Savvy 3 + 5× Limit Breaking
 * (cost 27.5) → crit every 2nd shot.
 */

/** True for Limit-Breaking-shaped critConsumption modifiers — see the module doc comment above. */
function isSelfScalingCritConsumption(m: Modifier): boolean {
  return m.bucket === 'critConsumption' && m.op === 'MUL_ADD' && m.conditions.some(c => c.kind === 'wornPieceCount');
}

const VATS_CRITICAL_CHARGE_BASE = 5.0;
const VATS_CRITICAL_CHARGE_MULT = 1.5;

export interface CritMeterResult {
  /** Meter % gained per hit. */
  fillPerHit: number;
  /** Meter % consumed per crit. */
  consumption: number;
  /** Steady-state fraction of shots that are crits (0–0.5). */
  critRate: number;
  /** Shots per crit at steady state (Infinity when the meter never fills). */
  shotsPerCrit: number;
}

export function computeCritMeter(
  modifiers: Modifier[],
  weapon: Weapon,
  ctx: ResolveContext,
  trace?: CritMeterTrace
): CritMeterResult {
  const luck = ctx.player.luck;
  const fillBase = (VATS_CRITICAL_CHARGE_BASE + VATS_CRITICAL_CHARGE_MULT * luck) * (weapon.critChargeBonus ?? 1.0);
  const fillCollect = trace ? ([] as BucketTrace[]) : undefined;
  const fillPerHit = foldBucket(modifiers, 'critFill', fillBase, ctx, fillCollect);
  if (trace && fillCollect) trace.fill = lastTrace(fillCollect);

  const costCollect = trace ? ([] as BucketTrace[]) : undefined;
  const restModifiers = modifiers.filter(m => !isSelfScalingCritConsumption(m));
  const consumptionBase = foldBucket(restModifiers, 'critConsumption', 100, ctx, costCollect);
  if (trace && costCollect) trace.consumption = lastTrace(costCollect);

  let selfScalingMult = 1;
  for (const m of modifiers) {
    if (!isSelfScalingCritConsumption(m)) continue;
    const value = effectiveValue(m, ctx);
    if (value === null) continue;
    selfScalingMult *= 1 + value;
  }
  const consumption = consumptionBase * selfScalingMult;

  if (fillPerHit <= 0) {
    return { fillPerHit, consumption, critRate: 0, shotsPerCrit: Infinity };
  }

  const hitsBetweenCrits = Math.max(1, Math.ceil(consumption / fillPerHit));
  const shotsPerCrit = hitsBetweenCrits + 1;
  return { fillPerHit, consumption, critRate: 1 / shotsPerCrit, shotsPerCrit };
}
