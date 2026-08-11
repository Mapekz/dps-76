import { describe, it, expect } from 'bun:test';
import type { Weapon } from '@/types';
import type { Modifier } from '@/types/modifiers';
import { createDefaultEnemyConditions } from '@/types';
import { BULLET_STORM_AMMO_PER_STACK, bulletStormAvgStacks } from '@/lib/engine/bulletstorm';
import { computeScenarios } from '@/lib/engine/scenarios';
import { makeResolvedPlayer } from '@/lib/engine/__tests__/resolved-player-fixture';

const FLAT_100 = [
  { x: 1, y: 100 },
  { x: 50, y: 100 },
];

function makeWeapon(overrides: Partial<Weapon> = {}): Weapon {
  return {
    id: 'test_weapon',
    name: 'Test Weapon',
    components: [{ damageType: 'ballistic', tier: -1, levelCap: 50, curvePoints: FLAT_100 }],
    damageType: 'ballistic',
    weaponClass: 'rifle',
    isAutomatic: false,
    isPhysical: true,
    critDamageMult: 2.0,
    critChargeBonus: 1.0,
    sneakAttackMult: 2.0,
    damageBonusMult: 1.0,
    ...overrides,
  };
}

describe('bulletStormAvgStacks — accrual pinning (2-shot magazine, retention 0)', () => {
  // With retention 0 and a 2-shot magazine, the converged per-shot average is
  // exactly accrual/2 (see doc comment in bulletstorm.ts): shot 1 always
  // lands at post-reload 0 (the mag reset from the prior cycle), shot 2 lands
  // at accrual. Choosing max/min far outside the accrual range means neither
  // clamp interferes, so this isolates the accrual formula itself.
  it('projectileCount 8 + ammoPerShot 5 → 12/30 accrual/shot', () => {
    const weapon = makeWeapon({
      projectileCount: 8,
      ammoPerShot: 5,
      capacity: 10,
      animDelaySec: 0.5,
    });
    const accrual = (8 + 5 - 1) / BULLET_STORM_AMMO_PER_STACK;
    expect(accrual).toBeCloseTo(12 / 30, 10);
    const avg = bulletStormAvgStacks({ max: 1000, min: 0, retention: 0, weapon, fireRate: 2 });
    expect(avg).toBeCloseTo(accrual / 2, 6);
  });

  it('projectileCount 9 + ammoPerShot 5 → 13/30 accrual/shot (+1 projectile, e.g. Two Shot)', () => {
    const weapon = makeWeapon({
      projectileCount: 9,
      ammoPerShot: 5,
      capacity: 10,
      animDelaySec: 0.5,
    });
    const accrual = (9 + 5 - 1) / BULLET_STORM_AMMO_PER_STACK;
    expect(accrual).toBeCloseTo(13 / 30, 10);
    const avg = bulletStormAvgStacks({ max: 1000, min: 0, retention: 0, weapon, fireRate: 2 });
    expect(avg).toBeCloseTo(accrual / 2, 6);
  });
});

describe('bulletStormAvgStacks — retention, floor, no-magazine', () => {
  const twoShotWeapon = makeWeapon({
    projectileCount: 1,
    ammoPerShot: 1,
    capacity: 2,
    animDelaySec: 0.5,
  });
  const accrual = 1 / BULLET_STORM_AMMO_PER_STACK; // (1+1-1)/30

  it('Lock and Load retention (0.5) yields a strictly higher average than no retention', () => {
    const avg0 = bulletStormAvgStacks({
      max: 1000,
      min: 0,
      retention: 0,
      weapon: twoShotWeapon,
      fireRate: 2,
    });
    const avg50 = bulletStormAvgStacks({
      max: 1000,
      min: 0,
      retention: 0.5,
      weapon: twoShotWeapon,
      fireRate: 2,
    });
    expect(avg0).toBeCloseTo(accrual / 2, 6);
    // Converged post-mag floor s = 2·accrual·retention/(1−retention) = 2·accrual
    // at retention 0.5; per-shot average = s + accrual/2 = 2.5·accrual. Loose
    // precision: the fixed-point loop stops within its own 1e-4 tolerance,
    // and that residual compounds slightly across iterations.
    expect(avg50).toBeCloseTo(2.5 * accrual, 3);
    expect(avg50).toBeGreaterThan(avg0);
  });

  it('Resolute Veteran-style floor (min 5) keeps the average at or above the floor, every reload', () => {
    const avg = bulletStormAvgStacks({
      max: 1000,
      min: 5,
      retention: 0,
      weapon: twoShotWeapon,
      fireRate: 2,
    });
    // Post-retention level clamps up to the floor every cycle (0 < 5), so the
    // converged post-reload level IS the floor, and the per-shot average is
    // floor + accrual/2.
    expect(avg).toBeCloseTo(5 + accrual / 2, 6);
    expect(avg).toBeGreaterThanOrEqual(5);
  });

  it('a weapon with no magazine (capacity 0) never reloads — returns the max directly', () => {
    const meleeShaped = makeWeapon({ weaponClass: 'melee', capacity: undefined });
    const avg = bulletStormAvgStacks({
      max: 10,
      min: 0,
      retention: 0,
      weapon: meleeShaped,
      fireRate: 5,
    });
    expect(avg).toBe(10);
  });

  it('guards: max <= 0 or fireRate <= 0 both return 0', () => {
    expect(
      bulletStormAvgStacks({ max: 0, min: 0, retention: 0, weapon: twoShotWeapon, fireRate: 2 }),
    ).toBe(0);
    expect(
      bulletStormAvgStacks({ max: 10, min: 0, retention: 0, weapon: twoShotWeapon, fireRate: 0 }),
    ).toBe(0);
  });
});

describe('bulletStormAvgStacks — expected-retention fix (Phase C, instant reloads keep stacks)', () => {
  const twoShotWeapon = makeWeapon({
    projectileCount: 1,
    ammoPerShot: 1,
    capacity: 2,
    animDelaySec: 0.5,
  });

  it('skip=1 via a 100% free-tier reload skip keeps stacks at max regardless of retention (retention irrelevant)', () => {
    const weapon = { ...twoShotWeapon, reloadSkipChance: 1 };
    const avgRetention0 = bulletStormAvgStacks({
      max: 10,
      min: 0,
      retention: 0,
      weapon,
      fireRate: 2,
    });
    const avgRetention1 = bulletStormAvgStacks({
      max: 10,
      min: 0,
      retention: 1,
      weapon,
      fireRate: 2,
    });
    expect(avgRetention0).toBeCloseTo(10, 6);
    expect(avgRetention1).toBeCloseTo(10, 6);
  });

  it('the bash-tier channel (reloadSkipChanceBash=1) counts as instant for stacks too, same as the free tier', () => {
    const weapon = { ...twoShotWeapon, reloadSkipChanceBash: 1 };
    const avg = bulletStormAvgStacks({ max: 10, min: 0, retention: 0, weapon, fireRate: 2 });
    expect(avg).toBeCloseTo(10, 6);
  });

  it('skip=0 (no reload-skip sources) reproduces the old always-apply-retention behavior exactly', () => {
    const withExplicitZeroes = bulletStormAvgStacks({
      max: 1000,
      min: 0,
      retention: 0.5,
      weapon: { ...twoShotWeapon, reloadSkipChance: 0, reloadSkipChanceBash: 0 },
      fireRate: 2,
    });
    const withFieldsOmitted = bulletStormAvgStacks({
      max: 1000,
      min: 0,
      retention: 0.5,
      weapon: twoShotWeapon,
      fireRate: 2,
    });
    expect(withExplicitZeroes).toBeCloseTo(withFieldsOmitted, 10);
  });

  it('combined free+bash sources compose into one effectiveRetention exactly like foldChanceUnion', () => {
    const pFree = 0.6;
    const pBash = 0.5;
    const skip = 1 - (1 - pFree) * (1 - pBash);
    const combined = bulletStormAvgStacks({
      max: 1000,
      min: 0,
      retention: 0,
      weapon: { ...twoShotWeapon, reloadSkipChance: pFree, reloadSkipChanceBash: pBash },
      fireRate: 2,
    });
    // Same effectiveRetention (= skip, since retention=0) reproduced directly
    // via a no-skip weapon with retention set to `skip`.
    const equivalent = bulletStormAvgStacks({
      max: 1000,
      min: 0,
      retention: skip,
      weapon: twoShotWeapon,
      fireRate: 2,
    });
    expect(combined).toBeCloseTo(equivalent, 6);
  });
});

describe('effectiveBulletStormStacks (via computeScenarios) — sentinel, clamp, average override', () => {
  const weapon = makeWeapon({
    projectileCount: 8,
    ammoPerShot: 5,
    capacity: 10,
    animDelaySec: 0.5,
  });

  const maxMod = (value: number): Modifier => ({
    id: 'bs-max',
    source: { kind: 'omod', formId: '0x0', edid: 'test', name: 'Test Max' },
    bucket: 'bulletStormMaxStacks',
    op: 'ADD',
    value,
    conditions: [],
  });
  const minMod = (value: number): Modifier => ({
    id: 'bs-min',
    source: { kind: 'omod', formId: '0x0', edid: 'test', name: 'Test Min' },
    bucket: 'bulletStormMinStacks',
    op: 'ADD',
    value,
    conditions: [],
  });
  const retentionMod = (value: number): Modifier => ({
    id: 'bs-retention',
    source: { kind: 'omod', formId: '0x0', edid: 'test', name: 'Test Retention' },
    bucket: 'bulletStormRetention',
    op: 'ADD',
    value,
    conditions: [],
  });
  // +1% dbm per Bullet Storm stack, uncapped by the modifier's own `max` (the
  // engine cap comes from bulletStormMaxStacks instead) — mirrors how
  // onslaught.test.ts's furiousDbm pins the shared-counter clamp via a
  // stack-scaled dbm modifier.
  const stackDbm: Modifier = {
    id: 'bs-stack-dbm',
    source: { kind: 'omod', formId: '0x0', edid: 'test', name: 'Test Stack Dbm' },
    bucket: 'dbm',
    op: 'ADD',
    value: 0.01,
    conditions: [{ kind: 'stacks', counter: 'bulletStorm', max: 999 }],
  };

  function ratioFor(modifiers: Modifier[], bulletStormStacks: number) {
    const base = computeScenarios({
      mode: 'live',
      weapon,
      itemLevel: 50,
      modifiers: [],
      player: makeResolvedPlayer(),
      enemy: createDefaultEnemyConditions(),
      weakpointMult: 2,
    });
    const withMods = computeScenarios({
      mode: 'live',
      weapon,
      itemLevel: 50,
      modifiers,
      player: { ...makeResolvedPlayer(), bulletStormStacks },
      enemy: createDefaultEnemyConditions(),
      weakpointMult: 2,
    });
    return withMods.freeAim.perHit.total / base.freeAim.perHit.total;
  }

  it('an explicit value below the floor clamps up to min', () => {
    expect(ratioFor([maxMod(10), minMod(3), stackDbm], 1)).toBeCloseTo(1.03, 6); // floors to 3 stacks
  });

  it('exposes the fold on ScenarioSet', () => {
    const result = computeScenarios({
      mode: 'live',
      weapon,
      itemLevel: 50,
      modifiers: [maxMod(10), minMod(3)],
      player: makeResolvedPlayer(),
      enemy: createDefaultEnemyConditions(),
      weakpointMult: 2,
    });
    expect(result.bulletStormMaxStacks).toBe(10);
    expect(result.bulletStormMinStacks).toBe(3);
  });

  it('bulletStormAvgStacks is always computed when max > 0', () => {
    // max huge (no cap clamp), retention 0 → converged average = accrual/2
    // (2-shot magazine, projectileCount 8 + ammoPerShot 5 → 12/30 accrual).
    const accrual = (8 + 5 - 1) / BULLET_STORM_AMMO_PER_STACK;
    const expectedAvg = accrual / 2;
    const result = computeScenarios({
      mode: 'live',
      weapon,
      itemLevel: 50,
      modifiers: [maxMod(1000), retentionMod(0), stackDbm],
      player: makeResolvedPlayer(),
      enemy: createDefaultEnemyConditions(),
      weakpointMult: 2,
    });
    expect(result.bulletStormEffectiveStacks).toBeCloseTo(expectedAvg, 3);
  });
});
