/**
 * Legacy damage-formula module. The outgoing paper-damage path now lives in
 * src/lib/engine/ (resolve.ts, paper-damage.ts, scenarios.ts); this file keeps
 * only the dormant enemy-mitigation scaffolding for the enemy-defenses
 * enhancement (out of scope for paper-damage v1 — see dps-todos/phase-3-enemies.md).
 */

/**
 * Calculates damage resistance multiplier using Fallout 76's formula.
 * Formula: DamageResistMult = (IncomingDamage × 0.15 / Resist)^0.365
 * Where:   Resist = BaseResistance × (1 - ArmorPenTotal)
 *
 * The factor is clamped to [0.01, 0.99] (user-confirmed): you can never deal
 * more than 99% or less than 1% of paper damage through resists.
 *
 * Currently dormant (enemy resist = no-op ×1.0 in v1).
 */
export function calculateDamageResistMult(
  outgoingDamage: number,
  baseResistance: number,
  armorPenPercent: number = 0
): number {
  if (outgoingDamage <= 0) return 0;
  const resist = baseResistance * (1 - armorPenPercent / 100);
  if (resist <= 0) return 0.99;
  const factor = Math.pow((outgoingDamage * 0.15) / resist, 0.365);
  return Math.min(0.99, Math.max(0.01, factor));
}
