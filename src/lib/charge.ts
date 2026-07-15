import type { Weapon } from '@/types';

/**
 * Charging weapons (Gauss rifle/pistol/shotgun, bows, tesla/gamma/laser via
 * charging-barrel OMODs) ramp damage up from 0 as the trigger/draw is held.
 * ESM encodes the two knobs on WEAP.Data: "Full Power Seconds" (FPS — how
 * long a full charge takes) and "Full Power Damage Mult" (FPDM — despite the
 * "Mult" name, a damage BONUS added on top of the 1.0× base, NOT a
 * replacement: Gauss Rifle's 91 base × (1 + 2.0) = 273 at full charge). Bows
 * additionally carry a top-level "Minimum Charge Time"; OMODs can grant/
 * override either knob via `FullPowerSeconds`/`FullPowerDamageMult` SET
 * properties (the `chargeFullPowerSec`/`chargeFullPowerDamageMult` buckets,
 * src/types/modifiers.ts), which is how tesla/gamma/laser charging barrels
 * turn charging ON for weapons whose base WEAP record doesn't have it.
 *
 * The `damage(t) = base × (1 + FPDM) × (t / FPS)` formula below (linear ramp
 * from 0, clamped to [0, FPS]) is USER-CONFIRMED, NOT ESM-proven — see
 * docs/assumptions.md "Charging weapons". `minimumChargeTime` is
 * deliberately never consulted here: it only floors the UI charge-time
 * slider's range, it does not floor `t` in the formula.
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
 * optimal-play assumption), clamped to [0, fullPowerSeconds] so a stale
 * slider value carried over from a previously-equipped weapon with a longer
 * charge window can never overshoot the newly-equipped weapon's FPS.
 */
export function resolvedChargeTimeSec(weapon: Weapon, chargeTimeSec?: number): number {
  const fullPowerSeconds = weapon.fullPowerSeconds ?? 0;
  const t = chargeTimeSec ?? fullPowerSeconds;
  return Math.min(Math.max(t, 0), fullPowerSeconds);
}

/**
 * Damage multiplier at the resolved charge time: 1 (neutral) for weapons
 * that don't charge, else the linear ramp `(1 + FPDM) × (t / FPS)` — the
 * finished per-component damage is multiplied by this straight, alongside
 * the paper-damage formula's other whole-damage multipliers.
 */
export function chargeDamageMultiplier(weapon: Weapon, chargeTimeSec?: number): number {
  if (!weaponCharges(weapon)) return 1;
  const fullPowerSeconds = weapon.fullPowerSeconds ?? 0;
  const fullPowerDamageMult = weapon.fullPowerDamageMult ?? 0;
  const t = resolvedChargeTimeSec(weapon, chargeTimeSec);
  return (1 + fullPowerDamageMult) * (t / fullPowerSeconds);
}
