import type { Weapon } from '@/types';

/**
 * Derives the weapon's fire rate in shots-per-second (melee approximate until
 * animation-derived timing lands — dps-todos/melee-cadence.md).
 *
 * Formula:
 *   fireRate_auto   = speed / animDurationSec   (most autos ≈ 0.11 s)
 *   fireRate_semi   = speed / attackDelaySec    (extracted WEAP "Attack Delay Seconds")
 *   fireRate_melee  = 1.0  (stub — real timings tracked in dps-todos/melee-cadence.md)
 *
 * Notes:
 * - `speed` is the EFFECTIVE weapon speed. The historical 0.8248× "physical"
 *   multiplier is actually `SET Speed 0.8248` on automatic-receiver OMODs —
 *   buildEffectiveWeapon() applies it from real mod data, so it is no longer
 *   hardcoded here.
 * - Returns shots/sec (multiply by perHit to get DPS — do NOT divide by 60).
 */
export function getFireRate(weapon: Weapon): number {
  // Melee/unarmed: 1 swing/sec stub until real animation timings are
  // confirmed (dps-todos/melee-cadence.md). Speed-affecting mods
  // (Thrill-Seeker's melee-speed AV, Cursed melee event mods) apply RELATIVELY
  // on top of the stub — `weapon.speed` already carries a 1.0 baseline (WEAP
  // Data.Speed) through the same fireRateSpeed OMOD fold ranged weapons use
  // (docs/assumptions.md "Power attacks & melee cadence").
  if (weapon.weaponClass === 'melee' || weapon.weaponClass === 'unarmed') {
    return 1.0 * (weapon.speed ?? 1.0);
  }

  const speed = weapon.speed ?? 1.0;

  if (weapon.isAutomatic) {
    // animDurationSec: the length of one auto fire animation cycle.
    return speed / (weapon.animDurationSec ?? 0.11);
  }
  // Semi-auto: delay between shots from the WEAP record.
  return speed / (weapon.animDelaySec ?? 0.5);
}
