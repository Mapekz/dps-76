import type { Weapon } from '@/types';

/**
 * Derives the weapon's fire rate in shots-per-second (approximate until
 * animation-derived timing lands — dps-todos/fire-rate.md).
 *
 * Formula:
 *   fireRate_auto   = speed / animDurationSec   (most autos ≈ 0.11 s)
 *   fireRate_semi   = speed / attackDelaySec    (extracted WEAP "Attack Delay Seconds")
 *   fireRate_melee  = 1.0  (stub — real timings tracked in todos/fire-rate.md)
 *
 * Notes:
 * - `speed` is the EFFECTIVE weapon speed. The historical 0.8248× "physical"
 *   multiplier is actually `SET Speed 0.8248` on automatic-receiver OMODs —
 *   buildEffectiveWeapon() applies it from real mod data, so it is no longer
 *   hardcoded here.
 * - Returns shots/sec (multiply by perHit to get DPS — do NOT divide by 60).
 */
export function getFireRate(weapon: Weapon): number {
  // Melee/unarmed: stub 1 swing/sec until real animation timings are confirmed.
  if (weapon.weaponClass === 'melee' || weapon.weaponClass === 'unarmed') {
    return 1.0;
  }

  const speed = weapon.speed ?? 1.0;

  if (weapon.isAutomatic) {
    // animDurationSec: the length of one auto fire animation cycle.
    return speed / (weapon.animDurationSec ?? 0.11);
  }
  // Semi-auto: delay between shots from the WEAP record.
  return speed / (weapon.animDelaySec ?? 0.5);
}
