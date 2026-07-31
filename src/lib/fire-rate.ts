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
 * - `isAutomatic` is the base WEAP `Data.Flags` "Automatic" bit, OR'd with an
 *   OMOD's real `IsAutomatic SET` — never the `WeaponTypeAutomatic` keyword,
 *   which drives perk conditions only, not fire mode (Combat Shotgun's
 *   Automatic Receiver carries the keyword but sets `HasRepeatableSingleFire`,
 *   never `IsAutomatic`). V63 Carbine/Meltdown's reduced fire rate comes
 *   entirely from its base WEAP `Speed 0.8`, no automatic-receiver override.
 * - `animDurationSec` defaults to 0.11 (fits Minigun/Gatling Laser/Gauss
 *   Minigun in their base states). Two confirmed exceptions with no ESM
 *   property encoding them, hand-maintained in `overrides/corrections.ts`:
 *   Gatling Gun 0.5s (own `AnimsGatlingGun` keyword, distinct from Minigun's
 *   `AnimsMinigun`) and Gatling Laser Charging Barrels ≈0.1667s (1/6s, two
 *   independent effective-Speed readings back-solve to the same constant).
 *   Neither Gatling Gun nor Gatling Laser sets `fullPowerSeconds`/`fullPowerDamageMult`
 *   at all — despite the "Charging Barrels" name, neither uses the FPS/FPDM charging
 *   mechanic (`src/lib/charge.ts`); their "Charging" naming refers only to the
 *   animDurationSec spin-up override documented above.
 *   The shared `Charging Attack` WEAP flag does not by itself imply a custom
 *   cycle. Submachine Gun has no true semi mode (every receiver incl.
 *   "Standard" pulls the automatic-init template) — not an exception, its
 *   raw Speed is simply never an achievable state.
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
