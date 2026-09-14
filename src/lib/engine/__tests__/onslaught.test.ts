import { describe, it, expect } from 'bun:test';
import type { Weapon } from '@/types';
import type { Modifier } from '@/types/modifiers';
import { foldBucket } from '@/lib/engine/resolve';
import {
  onslaughtHitEventsPerShot,
  reverseOnslaughtAvgStacks,
  forwardOnslaughtAvgStacks,
  weaponHasExplosion,
  weaponHasNonExplosionPhysical,
} from '@/lib/engine/onslaught';
import { computeScenarios } from '@/lib/engine/scenarios';
import {
  FLAT_100,
  makeWeapon,
  makeCtx,
  scenarioInput,
} from '@/lib/engine/__tests__/engine-fixture';

const furiousDbm: Modifier = {
  id: 'furious-dbm',
  source: { kind: 'omod', formId: '0x0', edid: 'Furious', name: 'Furious' },
  bucket: 'dbm',
  op: 'ADD',
  value: 0.05,
  conditions: [{ kind: 'stacks', counter: 'onslaught', max: 99 }],
};

describe('reverseOnslaughtAvgStacks', () => {
  it('fast multi-projectile auto with explosive payload drains to ~0', () => {
    const weapon = makeWeapon({
      isAutomatic: true,
      projectileCount: 4,
      capacity: 20,
      ammoPerShot: 1,
      animationReloadSec: 2,
      reloadSpeed: 1,
      speed: 4,
      animDurationSec: 0.25,
      components: [
        { damageType: 'ballistic', tier: -1, levelCap: 50, curvePoints: FLAT_100 },
        {
          damageType: 'explosive',
          tier: -1,
          levelCap: 50,
          curvePoints: FLAT_100,
          fromExplosion: true,
        },
      ],
    });
    const consume = 4 + 4 * 1; // physical + explosion × 1 target
    const avg = reverseOnslaughtAvgStacks({
      max: 10,
      perShotConsume: consume,
      fireRate: 4,
      weapon,
    });
    expect(avg).toBeLessThan(1.5);
  });

  it('slow single-projectile rifle stays near max', () => {
    const weapon = makeWeapon({
      animDelaySec: 2,
      capacity: 5,
      ammoPerShot: 1,
      animationReloadSec: 3,
      reloadSpeed: 1,
    });
    const avg = reverseOnslaughtAvgStacks({
      max: 10,
      perShotConsume: 1,
      fireRate: 0.5,
      weapon,
    });
    expect(avg).toBeGreaterThan(9);
  });

  it('more targets hit increases consumption and lowers the average', () => {
    const weapon = makeWeapon({
      explosionBaseWeaponDamageMult: 0.15,
      animDelaySec: 0.5,
      capacity: 10,
      ammoPerShot: 1,
      animationReloadSec: 2,
    });
    const ctx = makeCtx(weapon);
    const consume1 = onslaughtHitEventsPerShot(weapon, [], ctx, 1);
    const consume3 = onslaughtHitEventsPerShot(weapon, [], ctx, 3);
    expect(consume3).toBeGreaterThan(consume1);

    const avg1 = reverseOnslaughtAvgStacks({
      max: 10,
      perShotConsume: consume1,
      fireRate: 2,
      weapon,
    });
    const avg3 = reverseOnslaughtAvgStacks({
      max: 10,
      perShotConsume: consume3,
      fireRate: 2,
      weapon,
    });
    expect(avg3).toBeLessThan(avg1);
  });

  it('pure-explosive launcher counts only explosion hits (no physical)', () => {
    const launcher = makeWeapon({
      components: [
        {
          damageType: 'explosive',
          tier: -1,
          levelCap: 50,
          curvePoints: FLAT_100,
          fromExplosion: true,
        },
      ],
    });
    expect(weaponHasNonExplosionPhysical(launcher)).toBe(false);
    expect(weaponHasExplosion(launcher, [], makeCtx(launcher))).toBe(true);
    expect(onslaughtHitEventsPerShot(launcher, [], makeCtx(launcher), 3)).toBe(3);
  });

  it("the average changes with bashAnimationSec when a Battle-Loader's bash source is present (Phase C — a Gunslinger Master build must see the bash-time correction)", () => {
    const weapon = makeWeapon({
      animDelaySec: 0.5,
      capacity: 5,
      ammoPerShot: 1,
      animationReloadSec: 3,
      reloadSpeed: 1,
      reloadSkipChanceBash: 0.5, // mid Battle-Loader's tier: half of reloads are a bash instead
    });
    const fastBash = reverseOnslaughtAvgStacks({
      max: 10,
      perShotConsume: 1,
      fireRate: 2,
      weapon,
      bashAnimationSec: 0,
    });
    const slowBash = reverseOnslaughtAvgStacks({
      max: 10,
      perShotConsume: 1,
      fireRate: 2,
      weapon,
      bashAnimationSec: 3,
    });
    // A longer bash time means a longer effective reload window, so more
    // passive regen accrues before the next mag starts — a strictly higher
    // average stack level.
    expect(slowBash).toBeGreaterThan(fastBash);
  });

  it('bashAnimationSec has no effect when no bash source is equipped (reloadSkipChanceBash absent)', () => {
    const weapon = makeWeapon({
      animDelaySec: 0.5,
      capacity: 5,
      ammoPerShot: 1,
      animationReloadSec: 3,
      reloadSpeed: 1,
    });
    const zero = reverseOnslaughtAvgStacks({
      max: 10,
      perShotConsume: 1,
      fireRate: 2,
      weapon,
      bashAnimationSec: 0,
    });
    const large = reverseOnslaughtAvgStacks({
      max: 10,
      perShotConsume: 1,
      fireRate: 2,
      weapon,
      bashAnimationSec: 3,
    });
    expect(zero).toBeCloseTo(large, 10);
  });
});

describe('reverse onslaught scenarios (GSM + Furious)', () => {
  const gsmSource: Modifier['source'] = {
    kind: 'perk',
    formId: '0x0004A09F',
    edid: 'GunslingerMaster',
    name: 'Gunslinger Master',
    rank: 1,
  };
  const gsmReverse: Modifier = {
    id: 'gsm-reverse',
    source: gsmSource,
    bucket: 'onslaughtReverse',
    op: 'ADD',
    value: 1,
    conditions: [],
  };
  const gsmMax: Modifier = {
    id: 'gsm-max',
    source: gsmSource,
    bucket: 'onslaughtMaxStacks',
    op: 'ADD',
    value: 10,
    conditions: [],
  };

  function furiousBonusRatio(weapon: Weapon, extraMods: Modifier[] = []) {
    const base = computeScenarios(
      scenarioInput(weapon, { modifiers: [...extraMods, gsmMax, gsmReverse, furiousDbm] }),
    );
    const noFurious = computeScenarios(
      scenarioInput(weapon, { modifiers: [...extraMods, gsmMax, gsmReverse] }),
    );
    const withDmg = base.freeAim.perHit.total;
    const withoutDmg = noFurious.freeAim.perHit.total;
    return (withDmg - withoutDmg) / withoutDmg;
  }

  it('GSM+Furious on a fast explosive scattergun yields a small Furious bonus', () => {
    const scattergun = makeWeapon({
      weaponClass: 'shotgun',
      isAutomatic: true,
      projectileCount: 4,
      capacity: 8,
      ammoPerShot: 1,
      animationReloadSec: 2,
      speed: 4,
      animDurationSec: 0.25,
      components: [
        { damageType: 'ballistic', tier: -1, levelCap: 50, curvePoints: FLAT_100 },
        {
          damageType: 'explosive',
          tier: -1,
          levelCap: 50,
          curvePoints: FLAT_100,
          fromExplosion: true,
        },
      ],
    });
    const ratio = furiousBonusRatio(scattergun);
    // Full stacks at max 10 with +5%/stack → +50%; drained stacks → much less.
    expect(ratio).toBeLessThan(0.15);
  });

  it('GSM+Furious on a slow single-shot rifle keeps most of the Furious bonus', () => {
    const rifle = makeWeapon({
      animDelaySec: 2,
      capacity: 5,
      ammoPerShot: 1,
      animationReloadSec: 3,
    });
    const ratio = furiousBonusRatio(rifle);
    // Near-max stacks → close to the +50% ceiling (allow headroom for rounding).
    expect(ratio).toBeGreaterThan(0.35);
  });

  it('surfaces reverse mode and avg stacks on ScenarioSet', () => {
    const result = computeScenarios(
      scenarioInput(makeWeapon({ animDelaySec: 2, capacity: 5, animationReloadSec: 3 }), {
        modifiers: [gsmMax, gsmReverse],
      }),
    );
    expect(result.onslaughtReverse).toBe(true);
    expect(result.onslaughtEffectiveStacks).toBeGreaterThan(0);
    expect(result.onslaughtMaxStacks).toBe(10);
  });

  it('folds onslaughtReverse from modifiers', () => {
    const weapon = makeWeapon();
    const ctx = makeCtx(weapon);
    expect(foldBucket([gsmReverse], 'onslaughtReverse', 0, ctx)).toBe(1);
  });
});

describe('forwardOnslaughtAvgStacks', () => {
  it('fast multi-projectile auto stacks near the cap', () => {
    const weapon = makeWeapon({
      isAutomatic: true,
      projectileCount: 4,
      capacity: 20,
      ammoPerShot: 1,
      animationReloadSec: 2,
      reloadSpeed: 1,
      speed: 4,
      animDurationSec: 0.25,
    });
    const gain = 4; // 4 projectiles per shot
    const avg = forwardOnslaughtAvgStacks({
      max: 100,
      gainPerShot: gain,
      fireRate: 4,
      weapon,
    });
    // Fast firing (4 shots/sec) with 4 gain/shot = 16 stacks/sec gain, vs 1 decay/sec
    // Should converge near the cap (100)
    expect(avg).toBeGreaterThan(90);
  });

  it('slow single-projectile rifle stacks near 0', () => {
    const weapon = makeWeapon({
      animDelaySec: 2,
      capacity: 5,
      ammoPerShot: 1,
      animationReloadSec: 3,
      reloadSpeed: 1,
    });
    const gain = 1; // 1 projectile per shot
    const avg = forwardOnslaughtAvgStacks({
      max: 100,
      gainPerShot: gain,
      fireRate: 0.5, // 0.5 shots/sec
      weapon,
    });
    expect(avg).toBeLessThan(5);
  });
  it('medium-speed weapon with slow accrual vs decay stays moderate', () => {
    const weapon = makeWeapon({
      animDelaySec: 1,
      capacity: 10,
      ammoPerShot: 1,
      animationReloadSec: 2,
      reloadSpeed: 1,
    });
    const gain = 0.6; // Very slow gain
    const avg = forwardOnslaughtAvgStacks({
      max: 100,
      gainPerShot: gain,
      fireRate: 1, // 1 shot/sec × 0.6 gain = 0.6 stacks/sec gain, vs 1 decay/sec
      weapon,
    });
    // Decay (1/sec) outpaces gain (0.6/sec), converges to near 0
    expect(avg).toBeGreaterThanOrEqual(0);
    expect(avg).toBeLessThan(30);
  });
});
describe('forward onslaught scenarios (non-reverse Onslaught sources)', () => {
  const furiousMax: Modifier = {
    id: 'furious-max',
    source: { kind: 'omod', formId: '0x0', edid: 'Furious', name: 'Furious' },
    bucket: 'onslaughtMaxStacks',
    op: 'ADD',
    value: 9,
    conditions: [],
  };

  it('surfaces forward mode avg stacks on ScenarioSet when not reverse', () => {
    const rifle = makeWeapon({
      animDelaySec: 0.5,
      capacity: 5,
      ammoPerShot: 1,
      animationReloadSec: 2,
    });
    const result = computeScenarios(scenarioInput(rifle, { modifiers: [furiousMax, furiousDbm] }));
    expect(result.onslaughtReverse).toBe(false);
    expect(result.onslaughtMaxStacks).toBe(9);
    expect(result.onslaughtEffectiveStacks).toBeGreaterThan(0);
  });

  it('fast-firing weapon forward average is high, slow-firing is low', () => {
    const fastWeapon = makeWeapon({
      isAutomatic: true,
      projectileCount: 1,
      capacity: 20,
      ammoPerShot: 1,
      speed: 10, // very fast
      animDurationSec: 0.1,
      animationReloadSec: 1.5,
    });
    const slowWeapon = makeWeapon({
      animDelaySec: 2,
      capacity: 5,
      ammoPerShot: 1,
      animationReloadSec: 3,
    });
    const fastResult = computeScenarios(
      scenarioInput(fastWeapon, { modifiers: [furiousMax, furiousDbm] }),
    );
    const slowResult = computeScenarios(
      scenarioInput(slowWeapon, { modifiers: [furiousMax, furiousDbm] }),
    );
    expect(fastResult.onslaughtEffectiveStacks).toBeGreaterThan(
      slowResult.onslaughtEffectiveStacks,
    );
  });
});
