import type { Weapon } from '@/types';
import type { Modifier } from '@/types/modifiers';
import { interpolateCurve } from '@/lib/curve-tables';
import luckCritChargeCurveFile from '@/data/live/curvetables/player/vats/luckvatscriticalcharge.json';
import { effectiveValue, foldBucket, type ResolveContext } from './resolve';
import { lastTrace, type BucketTrace, type CritMeterTrace } from './trace';

/**
 * VATS crit-meter economy → steady-state crit rate.
 *
 * Fill per hit (percent of the 100-point meter):
 *   fill = fVATSCriticalChargeBase + weapon's own Crit Charge Bonus + curveY(LCK)
 * USER-IDENTIFIED, ESM-CONFIRMED 2026-07-21 (corrects the prior linear-LCK
 * approximation): `fVATSCriticalChargeMult` (the old `1.5 × LCK` term) is
 * DEAD — not read by the live mechanic. The real per-LCK term is curve table
 * `CT_LuckVATSCriticalCharge` (0x00655629, domain LCK 1–100, matching the
 * SPECIAL clamp exactly — reached via DFOB `LuckVATSCriticalChargeCurve_DO`
 * 0x0065562A), extracted alongside the other player curves
 * (`extract-curvetables.ts`'s `CURVE_TABLE_SINGLETONS`) into
 * `player/vats/luckvatscriticalcharge.json`. `fVATSCriticalChargeBase` = 5.0
 * (0x00249662) is unchanged/still live. The weapon's own "Crit Charge Bonus"
 * WEAP field (`weapon.critChargeBonus`, already extracted) is ADDITIVE here,
 * not multiplicative as previously modeled — verified ESM-raw and literally
 * 1.0 for 280/282 obtainable weapons (the two SnapMatic/disposable cameras
 * read 0, non-combat items).
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
 * Anchor (user-verified): 16 LCK + Crit Savvy 3 + 5× Limit Breaking (cost
 * 27.5) → crit every 2nd shot. Still holds under the corrected fill formula
 * (fill 27.8 at 16 LCK vs. the old formula's 29 — both round `ceil(cost/fill)`
 * to the same 1, so the anchor doesn't distinguish between the two; the
 * curve-based formula is preferred as the ESM-confirmed mechanism).
 */

/** True for Limit-Breaking-shaped critConsumption modifiers — see the module doc comment above. */
function isSelfScalingCritConsumption(m: Modifier): boolean {
  return m.bucket === 'critConsumption' && m.op === 'MUL_ADD' && m.conditions.some(c => c.kind === 'wornPieceCount');
}

const LUCK_CRIT_CHARGE_CURVE = luckCritChargeCurveFile.curve;

/**
 * ESM-extracted `fVATSCriticalChargeBase` — `getVatsCritConstants` (`@/data`)
 * resolves the live value via `extract-constants.ts`; real callers
 * (`scenarios.ts`, threaded from `resolveLoadout`) pass it through
 * `ScenarioInput.engineConstants`. `DEFAULT_VATS_CRIT_CONSTANTS` is the
 * fallback for callers without a mode (tests) — mirrors
 * `mitigation.ts`'s `DEFAULT_MITIGATION_CONSTANTS`.
 */
export interface VatsCritConstants {
  /** `fVATSCriticalChargeBase` GMST (0x00249662) — flat per-hit fill addend. */
  chargeBase: number;
}

/** Pre-extraction hardcode — `fVATSCriticalChargeBase` = 5.0 in the 20260717 dump. */
export const DEFAULT_VATS_CRIT_CONSTANTS: VatsCritConstants = { chargeBase: 5.0 };

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
  trace?: CritMeterTrace,
  constants: VatsCritConstants = DEFAULT_VATS_CRIT_CONSTANTS
): CritMeterResult {
  const luck = ctx.player.luck;
  const fillBase = constants.chargeBase + (weapon.critChargeBonus ?? 1.0) + interpolateCurve(LUCK_CRIT_CHARGE_CURVE, luck);
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
