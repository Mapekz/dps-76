import type { Weapon } from '@/types';
import { resolvedChargeTimeSec, weaponCharges } from '@/lib/charge';

/**
 * Derives the weapon's fire rate in shots-per-second.
 *
 * Formula:
 *   fireRate_charging = 1 / (t + animDelaySec / speed)   (t = resolved charge hold, wall-clock)
 *   fireRate_auto     = speed / animDurationSec   (most autos ≈ 0.11 s)
 *   fireRate_semi     = speed / attackDelaySec    (extracted WEAP "Attack Delay Seconds")
 *   fireRate_melee    = speed / animationAttackSec  (extracted WEAP "Animation Attack Seconds")
 *
 * Notes:
 * - `speed` is the EFFECTIVE weapon speed. The historical 0.8248× "physical"
 *   multiplier is actually `SET Speed 0.8248` on automatic-receiver OMODs —
 *   buildEffectiveWeapon() applies it from real mod data, so it is no longer
 *   hardcoded here.
 * - Charging weapons (Gauss family, bows, tesla/gamma/laser via
 *   charging-barrel OMODs, `src/lib/charge.ts`): holding the trigger/draw is
 *   REAL wall-clock time — Speed/fire-rate buffs never make the charge itself
 *   faster (user-confirmed). Only the attack-delay tail after release (the
 *   animation before the weapon can start charging again) divides by `speed`,
 *   mirroring the semi-auto term above. The same `chargeTimeSec` (and
 *   therefore the same cadence) applies whether the shot is Free Aim or VATS
 *   — nothing auto-charges in-game.
 * - Returns shots/sec (multiply by perHit to get DPS — do NOT divide by 60).
 */
export function getFireRate(weapon: Weapon, chargeTimeSec?: number): number {
  const speed = weapon.speed ?? 1.0;

  if (weaponCharges(weapon)) {
    const t = resolvedChargeTimeSec(weapon, chargeTimeSec);
    return 1 / (t + (weapon.animDelaySec ?? 0.5) / speed);
  }

  if (weapon.isAutomatic) {
    // animDurationSec: the length of one auto fire animation cycle.
    return speed / (weapon.animDurationSec ?? 0.11);
  }
  // Semi-auto: delay between shots from the WEAP record.
  return speed / (weapon.animDelaySec ?? 0.5);
}
