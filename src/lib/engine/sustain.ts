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

/**
 * Seconds spent bashing in place of a real reload when a
 * `reloadSkipChanceBash` source (Battle-Loader's) triggers instead of a
 * genuine reload — **ASSUMPTION**, a user-approved placeholder pending an
 * in-game stopwatch measurement of a real bash swing (per-weapon animation
 * timing likely varies, `#61`). Overridable
 * per scenario via `PlayerInput.battleLoadersBashSec`, which literally
 * duplicates this value as its default (types/ stays a leaf — no engine
 * import; `sustain.test.ts` regression-tests the two stay in sync).
 */
export const DEFAULT_BATTLE_LOADERS_BASH_SEC = 0.75;

/**
 * Effective rounds per magazine: capacity ÷ ammo-per-shot, with `ammoFreeChance`
 * stretching the effective capacity (a shot that costs no ammo doesn't advance
 * the magazine). 0 = no magazine at all (melee/unarmed, capacity 0).
 *
 * Split out of `sustainTiming` so the magazine-cycle folds that don't need the
 * rest of the timing model can share ONE definition of the mag size — notably
 * resolve.ts's `lastRound` condition, which spreads the Last Shot legendary's
 * bonus over 1 shot in `shotsPerMagazine`.
 */
export function shotsPerMagazine(weapon: Weapon): number {
  const capacity = weapon.capacity ?? 0;
  const ammoPerShot = weapon.ammoPerShot ?? 1;
  const ammoFreeChance = weapon.ammoFreeChance ?? 0;
  const effCapacity = ammoFreeChance > 0 ? capacity / (1 - ammoFreeChance) : capacity;
  return ammoPerShot > 0 ? Math.floor(effCapacity / ammoPerShot) : 0;
}

/**
 * Magazine/reload timing shared by sustain DPS and reverse-onslaught/Bullet
 * Storm simulation.
 *
 * `bashAnimationSec` (default `DEFAULT_BATTLE_LOADERS_BASH_SEC`) is the time
 * cost of a Battle-Loader's bash-triggered reload skip — see the two-channel
 * reload-skip model below and docs/assumptions.md "Reload-skip & free-ammo
 * expected value".
 */
export function sustainTiming(
  weapon: Weapon,
  fireRate: number,
  bashAnimationSec: number = DEFAULT_BATTLE_LOADERS_BASH_SEC,
): SustainTiming {
  const shotsPerMag = shotsPerMagazine(weapon);

  if (shotsPerMag <= 0 || fireRate <= 0) {
    return { shotsPerMag: 0, magDumpSec: 0, reloadSec: 0 };
  }

  const perShellMult = weapon.reloadPerShell ? shotsPerMag : 1;
  const realReloadSec =
    ((weapon.animationReloadSec ?? 0) * perShellMult) / (weapon.reloadSpeed || 1.0);
  // Two independent reload-skip channels (docs/assumptions.md "Reload-skip &
  // free-ammo expected value"): `reloadSkipChance` (Quick Hands/Wild West
  // Wind — passive on the reload itself, free) and `reloadSkipChanceBash`
  // (Battle-Loader's — bash-triggered, costs `bashAnimationSec` in place of
  // the real reload instead of being free). FREE SKIP WINS FIRST — a
  // modeling choice, not ESM-proven: when a reload would be skipped both
  // ways, the passive skip fires (no bash swing needed at all), so the free
  // channel gates the whole expression. At `bashAnimationSec = 0` this
  // degenerates to `(1 − pFree) × (1 − pBash) × realReloadSec` — IDENTICAL
  // to the old single-channel `realReloadSec × (1 − union(pFree, pBash))`
  // formula, so this two-channel model is a strict generalization of the
  // one it replaces (regression-tested, sustain.test.ts).
  const pFree = Math.max(0, Math.min(weapon.reloadSkipChance ?? 0, 1));
  const pBash = Math.max(0, Math.min(weapon.reloadSkipChanceBash ?? 0, 1));
  const reloadSec = (1 - pFree) * ((1 - pBash) * realReloadSec + pBash * bashAnimationSec);
  const magDumpSec = shotsPerMag / fireRate;

  return { shotsPerMag, magDumpSec, reloadSec };
}

export function computeSustain(
  perHitAvg: number,
  fireRate: number,
  weapon: Weapon,
  bashAnimationSec?: number,
): SustainResult {
  const burstDps = perHitAvg * fireRate;
  const timing = sustainTiming(weapon, fireRate, bashAnimationSec);

  if (timing.shotsPerMag <= 0 || fireRate <= 0) {
    return { burstDps, sustainedDps: burstDps, ...timing, reloadApproximate: true };
  }

  const sustainedDps = (perHitAvg * timing.shotsPerMag) / (timing.magDumpSec + timing.reloadSec);

  return { burstDps, sustainedDps, ...timing, reloadApproximate: true };
}
