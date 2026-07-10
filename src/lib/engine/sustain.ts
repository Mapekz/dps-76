import type { Weapon } from '@/types';

/**
 * Magazine/reload model → burst vs sustained DPS.
 *
 * burstDps    = perHitAvg × fireRate                 (mag-dump, no reload)
 * sustainedDps = magazine damage / (mag-dump time + reload time)
 *
 * reloadSec = animationReloadSec / reloadSpeed is an ASSUMPTION until measured
 * in-game (docs/assumptions.md "Sustained DPS"). Weapons without a magazine
 * (melee/unarmed, capacity 0) sustain their burst DPS.
 */

export interface SustainResult {
  /** Per-hit average × fire rate (no reloads). */
  burstDps: number;
  /** DPS over full magazine cycles including the reload. */
  sustainedDps: number;
  shotsPerMag: number;
  magDumpSec: number;
  reloadSec: number;
  /** The reload formula is unverified in-game. */
  reloadApproximate: true;
}

export function computeSustain(perHitAvg: number, fireRate: number, weapon: Weapon): SustainResult {
  const burstDps = perHitAvg * fireRate;

  const capacity = weapon.capacity ?? 0;
  const ammoPerShot = weapon.ammoPerShot ?? 1;
  const shotsPerMag = ammoPerShot > 0 ? Math.floor(capacity / ammoPerShot) : 0;

  if (shotsPerMag <= 0 || fireRate <= 0) {
    // No magazine (melee, thrown) or degenerate fire rate: nothing to reload.
    return { burstDps, sustainedDps: burstDps, shotsPerMag: 0, magDumpSec: 0, reloadSec: 0, reloadApproximate: true };
  }

  const reloadSec = (weapon.animationReloadSec ?? 0) / (weapon.reloadSpeed || 1.0);
  // Steady-state cycle: each shot occupies one fire interval, then one reload.
  const magDumpSec = shotsPerMag / fireRate;
  const sustainedDps = (perHitAvg * shotsPerMag) / (magDumpSec + reloadSec);

  return { burstDps, sustainedDps, shotsPerMag, magDumpSec, reloadSec, reloadApproximate: true };
}
