import type { Weapon } from '@/types';

/**
 * Magazine/reload model → burst vs sustained DPS.
 *
 * burstDps    = perHitAvg × fireRate                 (mag-dump, no reload)
 * sustainedDps = magazine damage / (mag-dump time + reload time)
 *
 * reloadSec = animationReloadSec / reloadSpeed is an ASSUMPTION until measured
 * in-game (docs/assumptions.md "Sustained DPS"). Per-shell reloaders
 * (Weapon.reloadPerShell, from the AnimsSequentialReload keyword) repeat the
 * animation once per round: reloadSec × shotsPerMag — also unmeasured.
 * Weapons without a magazine (melee/unarmed, capacity 0) sustain their burst
 * DPS.
 */

export interface SustainTiming {
  shotsPerMag: number;
  magDumpSec: number;
  reloadSec: number;
}

export interface SustainResult extends SustainTiming {
  /** Per-hit average × fire rate (no reloads). */
  burstDps: number;
  /** DPS over full magazine cycles including the reload. */
  sustainedDps: number;
  /** The reload formula is unverified in-game. */
  reloadApproximate: true;
}

/** Magazine/reload timing shared by sustain DPS and reverse-onslaught simulation. */
export function sustainTiming(weapon: Weapon, fireRate: number): SustainTiming {
  const capacity = weapon.capacity ?? 0;
  const ammoPerShot = weapon.ammoPerShot ?? 1;
  const ammoFreeChance = weapon.ammoFreeChance ?? 0;
  const effCapacity = ammoFreeChance > 0 ? capacity / (1 - ammoFreeChance) : capacity;
  const shotsPerMag = ammoPerShot > 0 ? Math.floor(effCapacity / ammoPerShot) : 0;

  if (shotsPerMag <= 0 || fireRate <= 0) {
    return { shotsPerMag: 0, magDumpSec: 0, reloadSec: 0 };
  }

  const perShellMult = weapon.reloadPerShell ? shotsPerMag : 1;
  const reloadSkip = weapon.reloadSkipChance ?? 0;
  const reloadSec =
    ((weapon.animationReloadSec ?? 0) * perShellMult) / (weapon.reloadSpeed || 1.0) * (1 - reloadSkip);
  const magDumpSec = shotsPerMag / fireRate;

  return { shotsPerMag, magDumpSec, reloadSec };
}

export function computeSustain(perHitAvg: number, fireRate: number, weapon: Weapon): SustainResult {
  const burstDps = perHitAvg * fireRate;
  const timing = sustainTiming(weapon, fireRate);

  if (timing.shotsPerMag <= 0 || fireRate <= 0) {
    return { burstDps, sustainedDps: burstDps, ...timing, reloadApproximate: true };
  }

  const sustainedDps = (perHitAvg * timing.shotsPerMag) / (timing.magDumpSec + timing.reloadSec);

  return { burstDps, sustainedDps, ...timing, reloadApproximate: true };
}
