import type { Weapon } from '@/types';
import { sustainTiming } from './sustain';

/**
 * Ammo-per-stack divisor (GMST `uAmmoSpenderAmmoUsePerStack`, `0x0083C3D0`):
 * Bullet Storm accrues one stack per 30 "ammo spent" units per shot, where a
 * shot's units are `projectiles + ammoPerShot − 1` (user-measured in-game —
 * docs/assumptions.md "Bullet Storm").
 */
export const BULLET_STORM_AMMO_PER_STACK = 30;

function clampStacks(stacks: number, min: number, max: number): number {
  return Math.max(0, Math.min(Math.max(stacks, min), max));
}

/**
 * Bullet Storm stacks accrued per shot, using the POST-MOD effective
 * weapon's projectile/ammo counts: `(projectileCount + ammoPerShot − 1) /
 * BULLET_STORM_AMMO_PER_STACK` (user-measured, docs/assumptions.md "Bullet
 * Storm" — e.g. 8 projectiles + 5 ammo/shot → 12/30 stack/shot; +1
 * projectile from Two Shot → 13/30).
 */
function accrualPerShot(weapon: Weapon): number {
  const projectiles = weapon.projectileCount ?? 1;
  const ammoPerShot = weapon.ammoPerShot ?? 1;
  return (projectiles + ammoPerShot - 1) / BULLET_STORM_AMMO_PER_STACK;
}

/**
 * Steady-state average Bullet Storm stack count during sustained fire, under
 * the average-mode toggle (`PlayerConditions.bulletStormAverageMode`).
 * Stacks accrue every shot and are (partially) lost on reload — the inverse
 * shape of reverse-Onslaught's regen/consume sawtooth (`onslaught.ts`
 * `reverseOnslaughtAvgStacks`), simulated the same way: fixed-point-iterate
 * mag cycles until the starting stack level converges, then average the
 * per-shot levels of the converged cycle.
 *
 * Instant reloads — free-tier (`reloadSkipChance`: Quick Hands, Wild West
 * Wind) or bash-tier (`reloadSkipChanceBash`: Battle-Loader's) — do NOT lose
 * stacks (user-confirmed game fact, docs/assumptions.md "Bullet Storm"):
 * there's no real reload for Lock and Load's retention to apply to. Both
 * channels compose as independent probabilities into one `skip` fraction,
 * the same way `effective-weapon.ts`'s `foldChanceUnion` composes multiple
 * sources within a single channel; `retention` only affects the remaining
 * non-skipped fraction of reloads.
 */
export function bulletStormAvgStacks(params: {
  max: number;
  min?: number;
  retention?: number;
  weapon: Weapon;
  fireRate: number;
  /** Seconds per Battle-Loader's bash, threaded to `sustainTiming` for API consistency with `computeSustain`/`reverseOnslaughtAvgStacks` (defaults inside it — see sustain.ts `DEFAULT_BATTLE_LOADERS_BASH_SEC`). Doesn't affect stack retention itself, only the mag-timing this function otherwise ignores. */
  bashAnimationSec?: number;
}): number {
  const { max, weapon, fireRate, bashAnimationSec } = params;
  const min = params.min ?? 0;
  const retention = Math.max(0, Math.min(params.retention ?? 0, 1));

  if (max <= 0 || fireRate <= 0) return 0;

  const accrual = accrualPerShot(weapon);
  const timing = sustainTiming(weapon, fireRate, bashAnimationSec);

  // No magazine (melee/unarmed, capacity 0) — there's no reload to lose
  // stacks to, so steady state is simply the cap (simplification: doesn't
  // model an initial ramp-up from 0).
  if (timing.shotsPerMag <= 0) return max;

  // skip = 1 − (1 − pFree)(1 − pBash): the combined chance ANY reload this
  // cycle never happens (free skip or bash skip). effectiveRetention blends
  // Lock and Load's retention over only the non-skipped fraction — skip=1
  // makes retention irrelevant (100% of stacks always kept), skip=0
  // reproduces the old always-apply-retention behavior exactly.
  const pFree = Math.max(0, Math.min(weapon.reloadSkipChance ?? 0, 1));
  const pBash = Math.max(0, Math.min(weapon.reloadSkipChanceBash ?? 0, 1));
  const skip = 1 - (1 - pFree) * (1 - pBash);
  const effectiveRetention = skip + (1 - skip) * retention;

  let startStacks = max;

  for (let iter = 0; iter < 500; iter++) {
    let stacks = startStacks;
    const shotLevels: number[] = [];

    for (let i = 0; i < timing.shotsPerMag; i++) {
      shotLevels.push(stacks);
      stacks = clampStacks(stacks + accrual, min, max);
    }

    stacks = clampStacks(stacks * effectiveRetention, min, max);

    if (Math.abs(stacks - startStacks) < 1e-4) {
      return shotLevels.reduce((a, b) => a + b, 0) / shotLevels.length;
    }
    startStacks = stacks;
  }

  // Did not converge — return the last cycle's starting level as a best effort.
  return startStacks;
}
