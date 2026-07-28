import type { Weapon } from '@/types';
import type { Modifier } from '@/types/modifiers';
import { foldBucket, type ResolveContext } from './resolve';
import { sustainTiming } from './sustain';

/** Reverse-onslaught regen rate (stacks/sec, continuous — docs/assumptions.md "Onslaught"). */
export const ONSLAUGHT_REGEN_PER_SEC = 1;

function clampStacks(stacks: number, max: number): number {
  return Math.max(0, Math.min(stacks, max));
}

/** True when the weapon has at least one non-explosion damage component. */
export function weaponHasNonExplosionPhysical(weapon: Weapon): boolean {
  return (weapon.components ?? []).some((c) => !c.fromExplosion);
}

/**
 * True when the weapon contributes explosion hit-events: launcher EXPL
 * payloads, intrinsic explosion mult, or an active Explosive-legendary fold.
 */
export function weaponHasExplosion(
  weapon: Weapon,
  modifiers: Modifier[],
  ctx: ResolveContext,
): boolean {
  if ((weapon.components ?? []).some((c) => c.fromExplosion)) return true;
  if ((weapon.explosionBaseWeaponDamageMult ?? 0) > 0) return true;
  const payload = foldBucket(
    modifiers,
    'explosivePayload',
    weapon.explosionBaseWeaponDamageMult ?? 0,
    ctx,
  );
  return payload > 0;
}

/**
 * Onslaught stacks consumed per attack event under reverse mode (per projectile
 * physical hit + per-projectile explosion × targets).
 */
export function perShotOnslaughtConsume(
  weapon: Weapon,
  modifiers: Modifier[],
  ctx: ResolveContext,
  targets: number,
): number {
  const projectileCount = weapon.projectileCount ?? 1;
  const physicalHits = weaponHasNonExplosionPhysical(weapon) ? projectileCount : 0;
  const explosionHits = weaponHasExplosion(weapon, modifiers, ctx) ? projectileCount : 0;
  return physicalHits + explosionHits * targets;
}

/**
 * Steady-state average Onslaught stack count during sustained fire under
 * reverse mode. Simulates the mag+reload sawtooth (or continuous fire when
 * there is no magazine) until the cycle converges.
 */
export function reverseOnslaughtAvgStacks(params: {
  max: number;
  regen?: number;
  perShotConsume: number;
  fireRate: number;
  weapon: Weapon;
  /**
   * Seconds per Battle-Loader's bash, threaded to `sustainTiming` (defaults
   * inside it — sustain.ts `DEFAULT_BATTLE_LOADERS_BASH_SEC`). REQUIRED
   * thread, not just API consistency: the mag-cycle regen term below reads
   * `timing.reloadSec` directly, so a Gunslinger Master + Battle-Loader's
   * build would silently miss the bash-time correction without it.
   */
  bashAnimationSec?: number;
}): number {
  const { max, perShotConsume, fireRate, weapon, bashAnimationSec } = params;
  const regen = params.regen ?? ONSLAUGHT_REGEN_PER_SEC;

  if (max <= 0 || fireRate <= 0) return 0;

  const timing = sustainTiming(weapon, fireRate, bashAnimationSec);

  if (timing.shotsPerMag <= 0) {
    return reverseOnslaughtContinuousAvg(max, regen, perShotConsume, fireRate);
  }

  return reverseOnslaughtMagCycleAvg(max, regen, perShotConsume, fireRate, timing);
}

function reverseOnslaughtMagCycleAvg(
  max: number,
  regen: number,
  perShotConsume: number,
  fireRate: number,
  timing: { shotsPerMag: number; magDumpSec: number; reloadSec: number },
): number {
  const { shotsPerMag, magDumpSec, reloadSec } = timing;
  let startStacks = max;

  for (let iter = 0; iter < 500; iter++) {
    let stacks = startStacks;
    let t = 0;
    const shotLevels: number[] = [];

    for (let i = 0; i < shotsPerMag; i++) {
      const shotTime = i / fireRate;
      stacks = clampStacks(stacks + regen * (shotTime - t), max);
      t = shotTime;
      shotLevels.push(stacks);
      stacks = clampStacks(stacks - perShotConsume, max);
    }

    stacks = clampStacks(stacks + regen * (magDumpSec - t), max);
    stacks = clampStacks(stacks + regen * reloadSec, max);

    if (Math.abs(stacks - startStacks) < 1e-4) {
      return shotLevels.reduce((a, b) => a + b, 0) / shotLevels.length;
    }
    startStacks = stacks;
  }

  // Did not converge — return the last cycle's average as a best effort.
  return startStacks;
}

function reverseOnslaughtContinuousAvg(
  max: number,
  regen: number,
  perShotConsume: number,
  fireRate: number,
): number {
  const interval = 1 / fireRate;
  let startStacks = max;

  for (let iter = 0; iter < 500; iter++) {
    const preShot = clampStacks(startStacks + regen * interval, max);
    const postShot = clampStacks(preShot - perShotConsume, max);

    if (Math.abs(postShot - startStacks) < 1e-4) {
      return preShot;
    }
    startStacks = postShot;
  }

  return clampStacks(startStacks + regen * interval, max);
}
