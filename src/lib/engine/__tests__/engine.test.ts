import { describe, it, expect } from 'vitest';
import type { Weapon } from '@/types';
import type { Bucket, Condition, ModOp, Modifier } from '@/types/modifiers';
import { createDefaultEnemyConditions, createDefaultPlayerConditions } from '@/types';
import { foldBucket, foldOps, type ResolveContext } from '@/lib/engine/resolve';
import { computePaperDamage, totalCritMult, totalSneakMult } from '@/lib/engine/paper-damage';
import { computeScenarios } from '@/lib/engine/scenarios';

// Engine-core tests: synthetic weapon + hand-fed modifiers, hand-computed
// expectations straight from the spec formula. No extracted data involved.

const FLAT_100 = [{ x: 1, y: 100 }, { x: 50, y: 100 }];

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

function mod(partial: { bucket: Bucket; op: ModOp; value: number; id?: string; conditions?: Condition[] }): Modifier {
  return {
    id: partial.id ?? 'test-mod',
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

describe('foldBucket', () => {
  const weapon = makeWeapon();
  const ctx = makeCtx(weapon);

  it('MUL_ADD multiplies the ORIGINAL base even when a SET replaced it', () => {
    const mods = [
      mod({ bucket: 'dbm', op: 'ADD', value: 0.25 }),
      mod({ bucket: 'dbm', op: 'MUL_ADD', value: 0.5 }),
      mod({ bucket: 'dbm', op: 'SET', value: 2.0 }),
    ];
    // (SET 2.0) + 0.5 × base(1.0) + 0.25
    expect(foldBucket(mods, 'dbm', 1.0, ctx)).toBeCloseTo(2.75, 10);
  });

  it("user's Speed example: base 2.0, SET 0.8248, MUL_ADD 0.3, ADD 0.5 → 1.9248", () => {
    const mods = [
      mod({ bucket: 'fireRateSpeed', op: 'SET', value: 0.8248 }),
      mod({ bucket: 'fireRateSpeed', op: 'MUL_ADD', value: 0.3 }),
      mod({ bucket: 'fireRateSpeed', op: 'ADD', value: 0.5 }),
    ];
    expect(foldBucket(mods, 'fireRateSpeed', 2.0, ctx)).toBeCloseTo(1.9248, 10);
  });

  it('multiple MUL_ADDs stack additively with each other (user-confirmed)', () => {
    const mods = [
      mod({ bucket: 'baseDamage', op: 'MUL_ADD', value: -0.3 }),
      mod({ bucket: 'baseDamage', op: 'MUL_ADD', value: -0.2 }),
    ];
    // 1 × (1 + (−0.3 + −0.2)) = 0.5 — NOT 0.7 × 0.8 = 0.56
    expect(foldBucket(mods, 'baseDamage', 1.0, ctx)).toBeCloseTo(0.5, 10);
  });

  it('last SET wins', () => {
    const mods = [
      mod({ bucket: 'dbm', op: 'SET', value: 5 }),
      mod({ bucket: 'dbm', op: 'SET', value: 3 }),
    ];
    expect(foldBucket(mods, 'dbm', 1.0, ctx)).toBe(3);
  });

  it('ignores modifiers for other buckets', () => {
    const mods = [mod({ bucket: 'critDmgBonus', op: 'ADD', value: 9 })];
    expect(foldBucket(mods, 'dbm', 1.0, ctx)).toBe(1.0);
  });
});

describe('condition evaluation', () => {
  const weapon = makeWeapon();

  it('weaponClass gates on the equipped weapon', () => {
    const rifleOnly = mod({ bucket: 'dbm', op: 'ADD', value: 0.2, conditions: [{ kind: 'weaponClass', classes: ['rifle'] }] });
    const heavyOnly = mod({ bucket: 'dbm', op: 'ADD', value: 0.5, conditions: [{ kind: 'weaponClass', classes: ['heavy'] }] });
    expect(foldBucket([rifleOnly, heavyOnly], 'dbm', 1.0, makeCtx(weapon))).toBeCloseTo(1.2, 10);
  });

  it('stacks conditions scale the value by the clamped counter', () => {
    const tenderizer = mod({
      bucket: 'dbm', op: 'ADD', value: 0.1,
      conditions: [{ kind: 'stacks', counter: 'tenderizer', max: 1000 }],
    });
    const player = { ...createDefaultPlayerConditions(), tenderizerStacks: 100 };
    expect(foldBucket([tenderizer], 'dbm', 1.0, makeCtx(weapon, { player }))).toBeCloseTo(11.0, 10);

    const overMax = { ...player, tenderizerStacks: 5000 };
    expect(foldBucket([tenderizer], 'dbm', 1.0, makeCtx(weapon, { player: overMax }))).toBeCloseTo(101.0, 10);

    const zero = { ...player, tenderizerStacks: 0 };
    expect(foldBucket([tenderizer], 'dbm', 1.0, makeCtx(weapon, { player: zero }))).toBe(1.0);
  });

  it('healthBelowPct, inPowerArmor, and unresolved behave as gates', () => {
    const bloodied = mod({ bucket: 'dbm', op: 'ADD', value: 0.5, conditions: [{ kind: 'healthBelowPct', pct: 20 }] });
    const paOnly = mod({ bucket: 'dbm', op: 'ADD', value: 0.25, conditions: [{ kind: 'inPowerArmor', value: true }] });
    const broken = mod({ bucket: 'dbm', op: 'ADD', value: 99, conditions: [{ kind: 'unresolved', raw: 'GetValue mystery' }] });

    const healthy = makeCtx(weapon);
    expect(foldBucket([bloodied, paOnly, broken], 'dbm', 1.0, healthy)).toBe(1.0);

    const lowHpInPa = makeCtx(weapon, {
      player: { ...createDefaultPlayerConditions(), healthPercent: 15, isInPowerArmor: true },
    });
    expect(foldBucket([bloodied, paOnly, broken], 'dbm', 1.0, lowHpInPa)).toBeCloseTo(1.75, 10);
  });
});

describe('crit and sneak composition (MUL_ADD before ADD)', () => {
  const weapon = makeWeapon(); // critMult 2.0, sneakMult 2.0

  it('MUL_ADD OMODs adjust the weapon base before additive bonuses stack', () => {
    const mods = [
      mod({ bucket: 'critDmgBase', op: 'MUL_ADD', value: -0.25 }), // 2.0 → 1.5
      mod({ bucket: 'critDmgBonus', op: 'ADD', value: 0.65 }),     // Better Criticals-ish
    ];
    expect(totalCritMult(mods, weapon, makeCtx(weapon))).toBeCloseTo(2.15, 10);
  });

  it('sneak composes the same way', () => {
    const mods = [
      mod({ bucket: 'sneakBase', op: 'MUL_ADD', value: 0.375 }), // 2.0 → 2.75
      mod({ bucket: 'sneakBonus', op: 'ADD', value: 1.0 }),      // Ninja-ish
    ];
    expect(totalSneakMult(mods, weapon, makeCtx(weapon))).toBeCloseTo(3.75, 10);
  });
});

describe('computePaperDamage', () => {
  it('reproduces the spec formula on a synthetic case', () => {
    // base 100; dbm ADD 0.4; crit (2.0 base + 0.5 bonus); TOFTT ×1.2 and
    // Follow Through ×1.1 as separate whole-damage mults; weakpoint bonus +0.3;
    // body part ×2. Crit shot while sneaking (sneak 2.0 → term +1.0).
    const weapon = makeWeapon();
    const mods = [
      mod({ bucket: 'dbm', op: 'ADD', value: 0.4 }),
      mod({ bucket: 'critDmgBonus', op: 'ADD', value: 0.5 }),
      mod({ bucket: 'wholeDamage', op: 'ADD', value: 0.2 }),
      mod({ bucket: 'wholeDamage', op: 'ADD', value: 0.1 }),
      mod({ bucket: 'weakpointBonus', op: 'ADD', value: 0.3 }),
    ];
    const ctx = makeCtx(weapon, { scenario: { isVats: true, isSneaking: true, isPowerAttack: false, isCrit: true } });
    const result = computePaperDamage({
      mode: 'live', weapon, itemLevel: 50, modifiers: mods, ctx, bodyPartMult: 2.0, bodyPart: 'weakpoint',
    });
    // parenthesis = 1.4 + (2.5−1) + (2.0−1) = 3.9
    // total = 100 × 3.9 × (1.2 × 1.1) × 2.0 × 1.3 = 1338.48
    expect(result.total).toBeCloseTo(100 * 3.9 * 1.32 * 2.0 * 1.3, 6);
  });

  it('weakpoint bonus is inert when the body-part multiplier is not > 1', () => {
    const weapon = makeWeapon();
    const mods = [mod({ bucket: 'weakpointBonus', op: 'ADD', value: 0.3 })];
    const ctx = makeCtx(weapon);
    const torso = computePaperDamage({ mode: 'live', weapon, itemLevel: 50, modifiers: mods, ctx, bodyPartMult: 1.0, bodyPart: 'torso' });
    expect(torso.total).toBeCloseTo(100, 6);
  });

  it('damage-type-scoped dbm modifiers only boost matching components', () => {
    const weapon = makeWeapon({
      components: [
        { damageType: 'ballistic', tier: -1, levelCap: 50, curvePoints: FLAT_100 },
        { damageType: 'fire', tier: -1, levelCap: 50, curvePoints: FLAT_100 },
      ],
    });
    const mods = [
      mod({ bucket: 'dbm', op: 'ADD', value: 0.5, conditions: [{ kind: 'damageTypeScope', types: ['fire'] }] }),
    ];
    const result = computePaperDamage({
      mode: 'live', weapon, itemLevel: 50, modifiers: mods, ctx: makeCtx(weapon), bodyPartMult: 1.0, bodyPart: 'torso',
    });
    expect(result.components[0].damage).toBeCloseTo(100, 6); // ballistic untouched
    expect(result.components[1].damage).toBeCloseTo(150, 6); // fire boosted
    expect(result.total).toBeCloseTo(250, 6);
  });

  it('applies STR melee scaling: STR/20 for melee, STR/10 for unarmed', () => {
    const player = { ...createDefaultPlayerConditions(), strength: 20 };
    const melee = makeWeapon({ weaponClass: 'melee' });
    const meleeResult = computePaperDamage({
      mode: 'live', weapon: melee, itemLevel: 50, modifiers: [], ctx: makeCtx(melee, { player }), bodyPartMult: 1, bodyPart: 'torso',
    });
    expect(meleeResult.total).toBeCloseTo(100 * (1 + 20 / 20), 6);

    const unarmed = makeWeapon({ weaponClass: 'unarmed' });
    const unarmedResult = computePaperDamage({
      mode: 'live', weapon: unarmed, itemLevel: 50, modifiers: [], ctx: makeCtx(unarmed, { player }), bodyPartMult: 1, bodyPart: 'torso',
    });
    expect(unarmedResult.total).toBeCloseTo(100 * (1 + 20 / 10), 6);
  });
});

describe('computeScenarios', () => {
  it('weights VATS per-hit by the crit rate and keeps manual crit-free', () => {
    const weapon = makeWeapon({ animDelaySec: 1.0, isPhysical: false }); // fireRate 1.0/s for easy math
    const mods = [mod({ bucket: 'critDmgBonus', op: 'ADD', value: 1.0 })]; // crit mult 3.0
    const input = {
      mode: 'live' as const,
      weapon,
      itemLevel: 50,
      modifiers: mods,
      player: { ...createDefaultPlayerConditions(), strength: 0 },
      enemy: createDefaultEnemyConditions(),
      weakpointMult: 2.0,
      critRate: 0.5,
    };
    const s = computeScenarios(input);

    expect(s.manualAim.perHit.total).toBeCloseTo(100, 6);
    expect(s.manualAim.weakpointPerHit.total).toBeCloseTo(200, 6);
    // VATS: weakpoint ×2; non-crit 200, crit adds (3.0−1)×base×bodyPart → 100×3×2=600? No:
    // crit hit = 100 × (1 + (3−1)) × 2 = 600; avg = 0.5×200 + 0.5×600 = 400.
    expect(s.vats.perHit.total).toBeCloseTo(400, 6);
    expect(s.vats.sustainedDps).toBeCloseTo(400 * s.vats.fireRate, 6);
    // Sneak: sneak term +1.0 → non-crit 100×2×2=400, crit 100×4×2=800, avg 600.
    expect(s.vatsSneak.perHit.total).toBeCloseTo(600, 6);
  });
});

describe('foldOps (shared fold arithmetic)', () => {
  it('applies (last SET ?? base) + ΣMUL_ADD×base + ΣADD, MUL_ADD over the original base', () => {
    // base 2.0, SET 0.8248, MUL_ADD 0.3, ADD 0.5 → 0.8248 + 0.3×2 + 0.5 = 1.9248
    const entries = [
      { op: 'SET' as const, value: 0.8248 },
      { op: 'MUL_ADD' as const, value: 0.3 },
      { op: 'ADD' as const, value: 0.5 },
    ];
    expect(foldOps(entries, 2.0)).toBeCloseTo(1.9248, 10);
  });

  it('falls back to base with no entries; last SET wins', () => {
    expect(foldOps([], 3.0)).toBe(3.0);
    expect(foldOps([{ op: 'SET' as const, value: 5 }, { op: 'SET' as const, value: 3 }], 1.0)).toBe(3);
  });
});

describe('crit condition (first-class, symmetric with sneaking/powerAttack)', () => {
  const weapon = makeWeapon();
  const critMod = mod({ bucket: 'dbm', op: 'ADD', value: 0.5, conditions: [{ kind: 'crit' }] });

  it('applies only when the scenario flags a crit', () => {
    const critCtx = makeCtx(weapon, {
      scenario: { isVats: true, isSneaking: false, isPowerAttack: false, isCrit: true },
    });
    expect(foldBucket([critMod], 'dbm', 1.0, critCtx)).toBeCloseTo(1.5, 10);

    // makeCtx default is isCrit: false → the modifier is inactive.
    expect(foldBucket([critMod], 'dbm', 1.0, makeCtx(weapon))).toBeCloseTo(1.0, 10);
  });
});
