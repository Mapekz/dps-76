import { describe, expect, it } from 'bun:test';
import type { Weapon } from '@/types';
import { createDefaultEnemyConditions, createDefaultPlayerConditions } from '@/types';
import type { Bucket, Condition, ModOp, Modifier } from '@/types/modifiers';
import { foldBucket, type ResolveContext } from '@/lib/engine/resolve';

const FLAT_100 = [
  { x: 1, y: 100 },
  { x: 50, y: 100 },
];

function makeWeapon(overrides: Partial<Weapon> = {}): Weapon {
  return {
    id: 'test_rifle',
    name: 'Test Rifle',
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

function mod(partial: {
  bucket: Bucket;
  op: ModOp;
  value: number;
  conditions?: Condition[];
}): Modifier {
  return {
    id: 'test-mod',
    source: { kind: 'perk', formId: '0x0', edid: 'TestSource', name: 'Test Source' },
    bucket: partial.bucket,
    op: partial.op,
    value: partial.value,
    conditions: partial.conditions ?? [],
  };
}

function makeCtx(weapon: Weapon, overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    weapon,
    player: createDefaultPlayerConditions(),
    enemy: createDefaultEnemyConditions(),
    scenario: { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false },
    ...overrides,
  };
}

describe('scaledByMissingHealth', () => {
  const weapon = makeWeapon();
  const bloodiedLike = mod({
    bucket: 'dbm',
    op: 'ADD',
    value: 1,
    conditions: [{ kind: 'scaledByMissingHealth', cap: 0.6 }],
  });

  it('is inactive at full health (identity)', () => {
    expect(foldBucket([bloodiedLike], 'dbm', 1.0, makeCtx(weapon))).toBe(1.0);
  });

  it('scales linearly with missing health up to the cap', () => {
    // 50% HP → missing 0.5 → +1.0 × 0.5 = +0.5 dbm
    const half = makeCtx(weapon, {
      player: { ...createDefaultPlayerConditions(), healthPercent: 50 },
    });
    expect(foldBucket([bloodiedLike], 'dbm', 1.0, half)).toBeCloseTo(1.5, 10);
  });

  it('saturates at cond.cap even when more health is missing', () => {
    // 0% HP → missing 1.0, capped at 0.6 → +1.0 × 0.6 = +0.6 dbm
    const empty = makeCtx(weapon, {
      player: { ...createDefaultPlayerConditions(), healthPercent: 0 },
    });
    expect(foldBucket([bloodiedLike], 'dbm', 1.0, empty)).toBeCloseTo(1.6, 10);

    // 20% HP → missing 0.8, still capped at 0.6
    const low = makeCtx(weapon, {
      player: { ...createDefaultPlayerConditions(), healthPercent: 20 },
    });
    expect(foldBucket([bloodiedLike], 'dbm', 1.0, low)).toBeCloseTo(1.6, 10);
  });
});

describe('scaledByCaps', () => {
  const weapon = makeWeapon();
  const capsScaled = mod({
    bucket: 'dbm',
    op: 'ADD',
    value: 0.4,
    conditions: [{ kind: 'scaledByCaps', capsForMax: 10_000 }],
  });

  it('is inactive with zero caps (identity)', () => {
    const broke = makeCtx(weapon, {
      player: { ...createDefaultPlayerConditions(), capsOnHand: 0 },
    });
    expect(foldBucket([capsScaled], 'dbm', 1.0, broke)).toBe(1.0);
  });

  it('scales linearly with caps on hand', () => {
    // 5_000 / 10_000 = 0.5 → +0.4 × 0.5 = +0.2 dbm
    const mid = makeCtx(weapon, {
      player: { ...createDefaultPlayerConditions(), capsOnHand: 5_000 },
    });
    expect(foldBucket([capsScaled], 'dbm', 1.0, mid)).toBeCloseTo(1.2, 10);
  });

  it('saturates at 1 once caps reach capsForMax', () => {
    const maxed = makeCtx(weapon, {
      player: { ...createDefaultPlayerConditions(), capsOnHand: 10_000 },
    });
    expect(foldBucket([capsScaled], 'dbm', 1.0, maxed)).toBeCloseTo(1.4, 10);

    const beyond = makeCtx(weapon, {
      player: { ...createDefaultPlayerConditions(), capsOnHand: 25_000 },
    });
    expect(foldBucket([capsScaled], 'dbm', 1.0, beyond)).toBeCloseTo(1.4, 10);
  });
});

describe('scaledByWeaponApCost', () => {
  const numberCruncherLike = mod({
    bucket: 'dbm',
    op: 'ADD',
    value: 0.01,
    conditions: [{ kind: 'scaledByWeaponApCost' }],
  });

  it('is inactive when the weapon has no AP cost (identity)', () => {
    expect(foldBucket([numberCruncherLike], 'dbm', 1.0, makeCtx(makeWeapon()))).toBe(1.0);
    expect(foldBucket([numberCruncherLike], 'dbm', 1.0, makeCtx(makeWeapon({ apCost: 0 })))).toBe(
      1.0,
    );
  });

  it('multiplies the modifier value by the effective per-shot AP cost', () => {
    // apCost 35 → scale 35 → +0.01 × 35 = +0.35 dbm
    const ctx = makeCtx(makeWeapon({ apCost: 35 }));
    expect(foldBucket([numberCruncherLike], 'dbm', 1.0, ctx)).toBeCloseTo(1.35, 10);
  });
});

describe('perCrippledLimb', () => {
  const weapon = makeWeapon();
  const bullyLike = mod({
    bucket: 'dbm',
    op: 'ADD',
    value: 0.1,
    conditions: [{ kind: 'perCrippledLimb', max: 4 }],
  });

  it('is inactive with zero crippled limbs (identity)', () => {
    expect(foldBucket([bullyLike], 'dbm', 1.0, makeCtx(weapon))).toBe(1.0);
  });

  it('scales by the crippled-limb count at mid range', () => {
    // 2 limbs → +0.1 × 2 = +0.2 dbm
    const two = makeCtx(weapon, {
      enemy: { ...createDefaultEnemyConditions(), crippledLimbCount: 2 },
    });
    expect(foldBucket([bullyLike], 'dbm', 1.0, two)).toBeCloseTo(1.2, 10);
  });

  it('clamps to cond.max, not the enemy race crippable-part count', () => {
    // cond.max = 4, but count = 8 (above any realistic race cap) → still +0.4 dbm
    const overRaceCap = makeCtx(weapon, {
      enemy: { ...createDefaultEnemyConditions(), crippledLimbCount: 8 },
    });
    expect(foldBucket([bullyLike], 'dbm', 1.0, overRaceCap)).toBeCloseTo(1.4, 10);

    // cond.max = 2 with count = 5 → +0.1 × 2 = +0.2 dbm (engine clamp, not race clamp)
    const tightCap = mod({
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [{ kind: 'perCrippledLimb', max: 2 }],
    });
    expect(foldBucket([tightCap], 'dbm', 1.0, overRaceCap)).toBeCloseTo(1.2, 10);
  });
});
