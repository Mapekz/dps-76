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
  const ammoFreeChance = weapon.ammoFreeChance ?? 0;
  const effCapacity = ammoFreeChance > 0 ? capacity / (1 - ammoFreeChance) : capacity;
  const shotsPerMag = ammoPerShot > 0 ? Math.floor(effCapacity / ammoPerShot) : 0;

  if (shotsPerMag <= 0 || fireRate <= 0) {
    // No magazine (melee, thrown) or degenerate fire rate: nothing to reload.
    return { burstDps, sustainedDps: burstDps, shotsPerMag: 0, magDumpSec: 0, reloadSec: 0, reloadApproximate: true };
  }

  // Per-shell reloaders (AnimsSequentialReload — lever/pump/single-action):
  // animationReloadSec is the per-round increment, so a full reload repeats
  // it shotsPerMag times. The whole per-shell-scaled time divides by the same
  // reloadSpeed fold, so speed bonuses compose identically either way.
  const perShellMult = weapon.reloadPerShell ? shotsPerMag : 1;
  const reloadSkip = weapon.reloadSkipChance ?? 0;
  const reloadSec =
    ((weapon.animationReloadSec ?? 0) * perShellMult) / (weapon.reloadSpeed || 1.0) * (1 - reloadSkip);
  // Steady-state cycle: each shot occupies one fire interval, then one reload.
  const magDumpSec = shotsPerMag / fireRate;
  const sustainedDps = (perHitAvg * shotsPerMag) / (magDumpSec + reloadSec);

  return { burstDps, sustainedDps, shotsPerMag, magDumpSec, reloadSec, reloadApproximate: true };
}
