import type { Weapon } from '@/types';

/**
 * Charging weapons (Gauss rifle/pistol/shotgun, bows, tesla/gamma/laser via
 * charging-barrel OMODs) ramp damage up from base (×1) as the trigger/draw
 * is held. ESM encodes the two knobs on WEAP.Data: "Full Power Seconds"
 * (FPS — how long a full charge takes) and "Full Power Damage Mult" (FPDM —
 * despite the "Mult" name, a damage BONUS added on top of the 1.0× base, NOT
 * a replacement: Gauss Rifle's 91 base × (1 + 2.0) = 273 at full charge).
 * Bows additionally carry a top-level "Minimum Charge Time"; OMODs can
 * grant/override either knob via `FullPowerSeconds`/`FullPowerDamageMult`
 * SET properties (the `chargeFullPowerSec`/`chargeFullPowerDamageMult`
 * buckets, src/types/modifiers.ts), which is how tesla/gamma/laser charging
 * barrels turn charging ON for weapons whose base WEAP record doesn't have
 * it.
 *
 * The `damage(t) = base × (1 + FPDM × t/FPS)` formula below — linear ramp
 * starting at ×1 (full base damage) at t=0, up to `1 + FPDM` at t=FPS — is
 * USER-CONFIRMED, NOT ESM-proven — see docs/assumptions.md "Charging
 * weapons". Worked example: 50 base damage, FPDM 2.0, FPS 1.0s → 50 dmg at
 * t=0, 100 at t=0.5, 150 at t=1.0.
 *
 * `resolvedChargeTimeSec` floors `t` at `weapon.minimumChargeTime ?? 0`
 * (below that, a real shot never fires at all — 0 damage — but the model
 * doesn't need to represent that: the UI slider already refuses to select
 * sub-min charge times, so flooring `t` here just keeps engine output
 * consistent with the UI for any charge time that reaches the formula, e.g.
 * a sub-min value arriving via URL state). A bow with FPDM 2.0, FPS 1.0s,
 * minimumChargeTime 0.25s fires nothing below 0.25s, does 75 damage (on the
 * 50-base example) at 0.25s (floored), then matches the non-bow ramp above
 * that point (100 @ 0.5, 150 @ 1.0).
 */

/**
 * A weapon charges iff BOTH knobs are set and positive — the numeric gate.
 * Deliberately does NOT consult the `HoldInputToPower` WEAP flag: laser
 * sniper barrels charge without carrying that flag, so a flag-based gate
 * would false-negative them (docs/assumptions.md "Charging weapons").
 */
export function weaponCharges(weapon: Weapon): boolean {
  return (weapon.fullPowerSeconds ?? 0) > 0 && (weapon.fullPowerDamageMult ?? 0) > 0;
}

/**
 * Resolves the player's held charge time against the effective weapon:
 * undefined `chargeTimeSec` means "always fully charge" (the default,
 * optimal-play assumption). Clamped to
 * `[max(0, minimumChargeTime ?? 0), fullPowerSeconds]`: the upper bound
 * keeps a stale slider value carried over from a previously-equipped weapon
 * with a longer charge window from overshooting the newly-equipped
 * weapon's FPS; the lower bound floors at the weapon's minimum charge time
 * (0 if it doesn't have one) since a shot that actually fires always has
 * t ≥ min — see the module doc comment for why the floor is safe to bake
 * into the formula instead of modeling the true "no projectile below min"
 * behavior.
 */
export function resolvedChargeTimeSec(weapon: Weapon, chargeTimeSec?: number): number {
  const fullPowerSeconds = weapon.fullPowerSeconds ?? 0;
  const minimumChargeTime = Math.max(0, weapon.minimumChargeTime ?? 0);
  const t = chargeTimeSec ?? fullPowerSeconds;
  return Math.min(Math.max(t, minimumChargeTime), fullPowerSeconds);
}

/**
 * Damage multiplier at the resolved charge time: 1 (neutral) for weapons
 * that don't charge, else the linear ramp `1 + FPDM × (t / FPS)` — starting
 * at ×1 (full base damage) at t=0, reaching `1 + FPDM` at t=FPS. The
 * finished per-component damage is multiplied by this straight, alongside
 * the paper-damage formula's other whole-damage multipliers.
 */
export function chargeDamageMultiplier(weapon: Weapon, chargeTimeSec?: number): number {
  if (!weaponCharges(weapon)) return 1;
  const fullPowerSeconds = weapon.fullPowerSeconds ?? 0;
  const fullPowerDamageMult = weapon.fullPowerDamageMult ?? 0;
  const t = resolvedChargeTimeSec(weapon, chargeTimeSec);
  return 1 + fullPowerDamageMult * (t / fullPowerSeconds);
}
