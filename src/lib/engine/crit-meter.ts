import type { Weapon } from '@/types';
import type { Modifier } from '@/types/modifiers';
import { foldBucket, type ResolveContext } from './resolve';

/**
 * VATS crit-meter economy → steady-state crit rate.
 *
 * Fill per hit (percent of the 100-point meter):
 *   fill = (fVATSCriticalChargeBase + fVATSCriticalChargeMult × LCK) × weaponCritChargeBonus
 * GMST sources (20260702 ESM): fVATSCriticalChargeBase = 5.0 (0x00249662),
 * fVATSCriticalChargeMult = 1.5 (0x0023AEC0).
 *
 * Consumption per crit (percent of meter):
 *   cost = fold(critConsumption over base 100)          // Critical Savvy SETs 85/70/55
 *          × (1 − 0.10 × limitBreakingPieces)           // Limit Breaking armor mod, up to −50%
 *
 * Steady state: a crit fires at a full meter and drops it by `cost`; each
 * following hit adds `fill` (capped at 100). Crit every ceil(cost/fill)+1
 * shots → max is a crit every 2nd shot (hit-crit-hit-crit).
 * Anchor (user-verified): 16 LCK (fill 29) + Crit Savvy 3 + 5× Limit Breaking
 * (cost 27.5) → crit every 2nd shot.
 */

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

export function computeCritMeter(modifiers: Modifier[], weapon: Weapon, ctx: ResolveContext): CritMeterResult {
  const luck = ctx.player.luck;
  const fillBase = (VATS_CRITICAL_CHARGE_BASE + VATS_CRITICAL_CHARGE_MULT * luck) * (weapon.critChargeBonus ?? 1.0);
  const fillPerHit = foldBucket(modifiers, 'critFill', fillBase, ctx);

  const costFromPerks = foldBucket(modifiers, 'critConsumption', 100, ctx);
  const limitBreaking = 1 - 0.1 * Math.max(0, Math.min(5, ctx.player.limitBreakingPieces));
  const consumption = costFromPerks * limitBreaking;

  if (fillPerHit <= 0) {
    return { fillPerHit, consumption, critRate: 0, shotsPerCrit: Infinity };
  }

  const hitsBetweenCrits = Math.max(1, Math.ceil(consumption / fillPerHit));
  const shotsPerCrit = hitsBetweenCrits + 1;
  return { fillPerHit, consumption, critRate: 1 / shotsPerCrit, shotsPerCrit };
}
