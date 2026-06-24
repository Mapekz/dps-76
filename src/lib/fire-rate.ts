import type { Weapon } from '@/types';

/**
 * Derives the weapon's fire rate in shots-per-second from its animation data.
 *
 * Formula (from game internals):
 *   speed_effective = speed × (isPhysical ? 0.8248 : 1.0)
 *   fireRate_auto   = speed_effective / animDurationSec   (most autos ≈ 0.11 s)
 *   fireRate_semi   = speed_effective / animDelaySec
 *   fireRate_melee  = 1.0  (stub — real timings tracked in todos/fire-rate.md)
 *
 * Notes:
 * - `speed` is almost always 1.0.
 * - The 0.8248× Speed mult applies to ballistic/physical weapons only.
 * - Returns shots/sec (multiply by perHit to get DPS — do NOT divide by 60).
 */
export function getFireRate(weapon: Weapon): number {
  // Melee/unarmed: stub 1 swing/sec until real animation timings are confirmed.
  // See todos/fire-rate.md for what values are needed.
  if (weapon.weaponClass === 'melee' || weapon.weaponClass === 'unarmed') {
    // TODO: replace with real animDelaySec once confirmed per weapon
    return 1.0;
  }

  const speed = (weapon.speed ?? 1.0) * (weapon.isPhysical ? 0.8248 : 1.0);

  if (weapon.isAutomatic) {
    // animDurationSec: the length of one auto fire animation cycle.
    // Default 0.11 s is accurate for the vast majority of automatic weapons.
    return speed / (weapon.animDurationSec ?? 0.11);
  } else {
    // animDelaySec: the delay between semi-auto shots.
    // 0.5 s is a placeholder; confirm per weapon in todos/fire-rate.md.
    return speed / (weapon.animDelaySec ?? 0.5);
  }
}
