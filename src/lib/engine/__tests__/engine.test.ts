import { describe, it, expect } from 'vitest';
import type { Weapon } from '@/types';
import type { Bucket, Condition, ModOp, Modifier } from '@/types/modifiers';
import { createDefaultEnemyConditions, createDefaultPlayerConditions } from '@/types';
import { foldBucket, foldOps, type ResolveContext } from '@/lib/engine/resolve';
import { computeDotDps, computePaperDamage, totalCritMult, totalSneakMult } from '@/lib/engine/paper-damage';
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

describe('Onslaught (2026-07-12): max-stack fold + shared-counter sentinel/clamp', () => {
  const weapon = makeWeapon();

  it('folds onslaughtMaxStacks contributions additively (base 0) — Furious alone → max 9', () => {
    const furious = mod({ bucket: 'onslaughtMaxStacks', op: 'ADD', value: 9 });
    expect(foldBucket([furious], 'onslaughtMaxStacks', 0, makeCtx(weapon))).toBe(9);
    const guerrillaExpert = mod({ bucket: 'onslaughtMaxStacks', op: 'ADD', value: 3 });
    expect(foldBucket([furious, guerrillaExpert], 'onslaughtMaxStacks', 0, makeCtx(weapon))).toBe(12);
  });

  it('sentinel -1 assumes full stacks (the app-wide assume-max convention)', () => {
    const perStack = mod({
      bucket: 'dbm', op: 'ADD', value: 0.01,
      conditions: [{ kind: 'stacks', counter: 'onslaught', max: 99 }],
    });
    const atDefault = makeCtx(weapon, {
      player: { ...createDefaultPlayerConditions(), onslaughtStacks: -1 },
      onslaughtMaxStacks: 9,
    });
    expect(foldBucket([perStack], 'dbm', 1.0, atDefault)).toBeCloseTo(1.09, 10);
  });

  it('an explicit stack selection scales the per-stack bonus (Furious Fixer-style: 4 stacks → +4%)', () => {
    const perStack = mod({
      bucket: 'dbm', op: 'ADD', value: 0.01,
      conditions: [{ kind: 'stacks', counter: 'onslaught', max: 99 }],
    });
    const explicit4 = makeCtx(weapon, {
      player: { ...createDefaultPlayerConditions(), onslaughtStacks: 4 },
      onslaughtMaxStacks: 9,
    });
    expect(foldBucket([perStack], 'dbm', 1.0, explicit4)).toBeCloseTo(1.04, 10);
  });

  it('an explicit selection above the computed max clamps down to the max', () => {
    const perStack = mod({
      bucket: 'dbm', op: 'ADD', value: 0.01,
      conditions: [{ kind: 'stacks', counter: 'onslaught', max: 99 }],
    });
    const overMax = makeCtx(weapon, {
      player: { ...createDefaultPlayerConditions(), onslaughtStacks: 999 },
      onslaughtMaxStacks: 9,
    });
    expect(foldBucket([perStack], 'dbm', 1.0, overMax)).toBeCloseTo(1.09, 10);
  });

  it('zero Onslaught sources equipped (max 0) → no bonus even at an explicit stored value of 10', () => {
    const perStack = mod({
      bucket: 'dbm', op: 'ADD', value: 0.01,
      conditions: [{ kind: 'stacks', counter: 'onslaught', max: 99 }],
    });
    const noSources = makeCtx(weapon, {
      player: { ...createDefaultPlayerConditions(), onslaughtStacks: 10 },
      // onslaughtMaxStacks omitted → defaults to 0 (ctx.onslaughtMaxStacks ?? 0).
    });
    expect(foldBucket([perStack], 'dbm', 1.0, noSources)).toBe(1.0);
  });

  it("Whacker Smacker-style curve (onslaughtStacks input) scales with the clamped shared counter", () => {
    const curveMod: Modifier = {
      id: 'whacker-smacker',
      source: { kind: 'omod', formId: '0x0', edid: 'E09B_mod_Custom_WhackerSmacker', name: 'Whacker Smacker' },
      bucket: 'powerAttackBonus',
      op: 'ADD',
      curve: { input: 'onslaughtStacks', points: [{ x: 0, y: 0 }, { x: 1, y: 5 }, { x: 100, y: 500 }] },
      curveScale: 0.01,
      conditions: [],
    };
    // No max-stack sources of its own (Whacker Smacker has NO EP190) — but
    // still reads the SHARED counter once something else grants a max.
    const atFive = makeCtx(weapon, {
      player: { ...createDefaultPlayerConditions(), onslaughtStacks: 5 },
      onslaughtMaxStacks: 10,
    });
    expect(foldBucket([curveMod], 'powerAttackBonus', 0, atFive)).toBeCloseTo(0.25, 10); // interpolate(5)=25, ×0.01
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

describe('power-attack race multiplier (Stage C1, RACE record Damage Mult)', () => {
  // HumanRace (0x00013746) = 1.5, PowerArmorRace (0x0001D31E) = 2.0 — the PA
  // race swap IS the multiplier, applied as a whole factor OUTSIDE the dbm
  // parenthesis (distinct from the additive powerAttackBonus bucket). Zero
  // strength isolates the race mult from the STR melee term.
  const zeroStr = { ...createDefaultPlayerConditions(), strength: 0 };
  const paFlags = { isVats: false, isSneaking: false, isPowerAttack: true, isCrit: false };

  it('multiplies a melee power attack ×1.5 normally', () => {
    const melee = makeWeapon({ weaponClass: 'melee' });
    const result = computePaperDamage({
      mode: 'live', weapon: melee, itemLevel: 50, modifiers: [],
      ctx: makeCtx(melee, { player: zeroStr, scenario: paFlags }), bodyPartMult: 1, bodyPart: 'torso',
    });
    expect(result.total).toBeCloseTo(150, 6); // 100 × 1.0 × 1.5
  });

  it('multiplies a melee power attack ×2.0 in Power Armor', () => {
    const melee = makeWeapon({ weaponClass: 'melee' });
    const result = computePaperDamage({
      mode: 'live', weapon: melee, itemLevel: 50, modifiers: [],
      ctx: makeCtx(melee, { player: { ...zeroStr, isInPowerArmor: true }, scenario: paFlags }),
      bodyPartMult: 1, bodyPart: 'torso',
    });
    expect(result.total).toBeCloseTo(200, 6); // 100 × 1.0 × 2.0
  });

  it('does not apply to a non-power-attack hit', () => {
    const melee = makeWeapon({ weaponClass: 'melee' });
    const result = computePaperDamage({
      mode: 'live', weapon: melee, itemLevel: 50, modifiers: [],
      ctx: makeCtx(melee, { player: zeroStr }), bodyPartMult: 1, bodyPart: 'torso',
    });
    expect(result.total).toBeCloseTo(100, 6);
  });

  it('excludes automatic "power tool" melee (WeaponTypeAutomaticMelee — Ripper/Shredder/Auto Axe)', () => {
    const autoMelee = makeWeapon({ weaponClass: 'melee', keywords: ['WeaponTypeAutomaticMelee'] });
    const result = computePaperDamage({
      mode: 'live', weapon: autoMelee, itemLevel: 50, modifiers: [],
      ctx: makeCtx(autoMelee, { player: zeroStr, scenario: paFlags }), bodyPartMult: 1, bodyPart: 'torso',
    });
    expect(result.total).toBeCloseTo(100, 6); // no race mult
  });

  it('excludes unarmed power attacks (unarmed power events are not Power-Attack-flagged in RACE data)', () => {
    const unarmed = makeWeapon({ weaponClass: 'unarmed' });
    const result = computePaperDamage({
      mode: 'live', weapon: unarmed, itemLevel: 50, modifiers: [],
      ctx: makeCtx(unarmed, { player: zeroStr, scenario: paFlags }), bodyPartMult: 1, bodyPart: 'torso',
    });
    expect(result.total).toBeCloseTo(100, 6); // no race mult
  });
});

describe('Charged cadence (Stage C2, cycle folded into sustained DPS)', () => {
  // ESM: OMOD mod_Legendary_Weapon4_Melee_Charged ADDs WeaponHasSecondaryCharging
  // (no enchantment); CURV weapon_chargedmeleeattack.json: charges 1/2/3 →
  // +0.5/+1.5/+3.0 damage bonus, max 3. Modeled cycle: 3 light (normal) hits
  // + 1 full-charge detonation (full power-attack treatment × (1 + 3.0)).
  const chargedWeapon = makeWeapon({ weaponClass: 'melee', keywords: ['WeaponHasSecondaryCharging'] });
  const zeroStr = { ...createDefaultPlayerConditions(), strength: 0 };
  const baseInput = {
    mode: 'live' as const, weapon: chargedWeapon, itemLevel: 50, modifiers: [],
    player: zeroStr, enemy: createDefaultEnemyConditions(), weakpointMult: 2.0, critRate: 0,
  };

  it('averages 3 normal hits + 1 detonation over the 4-attack cycle', () => {
    const s = computeScenarios(baseInput);
    // normal hit = 100 (dbm 1.0, strTerm 0, no power-attack terms).
    // detonation = 100 × 1.5 (race mult, not in Power Armor) × (1 + 3.0) = 600.
    // cycle avg = (100×3 + 600) / 4 = 225; fireRate 1.0/s (unmodified melee
    // stub) → burst = sustained = 225 (melee has no magazine to reload).
    expect(s.freeAim.perHit.total).toBeCloseTo(100, 6); // per-hit display stays the plain hit
    expect(s.freeAim.burstDps).toBeCloseTo(225, 6);
    expect(s.freeAim.sustain.sustainedDps).toBeCloseTo(225, 6);
  });

  it('applies regardless of the isPowerAttacking toggle', () => {
    const on = computeScenarios({ ...baseInput, player: { ...zeroStr, isPowerAttacking: true } });
    const off = computeScenarios({ ...baseInput, player: { ...zeroStr, isPowerAttacking: false } });
    expect(on.freeAim.burstDps).toBeCloseTo(225, 6);
    expect(off.freeAim.burstDps).toBeCloseTo(225, 6);
  });

  it('doubles the detonation race mult in Power Armor (×2.0 instead of ×1.5)', () => {
    const inPa = computeScenarios({ ...baseInput, player: { ...zeroStr, isInPowerArmor: true } });
    // detonation = 100 × 2.0 × 4.0 = 800; cycle = (300 + 800) / 4 = 275.
    expect(inPa.freeAim.burstDps).toBeCloseTo(275, 6);
  });

  it('a non-Charged melee weapon is unaffected (plain hit × fire rate, no cycle)', () => {
    const plainMelee = makeWeapon({ weaponClass: 'melee' });
    const s = computeScenarios({ ...baseInput, weapon: plainMelee });
    expect(s.freeAim.burstDps).toBeCloseTo(100, 6);
  });
});

describe('explosive payload twins (Stage A1, Explosive 2★)', () => {
  const weapon = makeWeapon(); // 1 ballistic component, base 100, damageBonusMult 1.0

  it('an explosive-scoped dbm modifier boosts ONLY the payload portion', () => {
    const mods = [
      mod({ bucket: 'explosivePayload', op: 'ADD', value: 0.2 }),
      mod({ bucket: 'dbm', op: 'ADD', value: 0.5, conditions: [{ kind: 'damageTypeScope', types: ['explosive'] }] }),
    ];
    const result = computePaperDamage({
      mode: 'live', weapon, itemLevel: 50, modifiers: mods, ctx: makeCtx(weapon), bodyPartMult: 1.0, bodyPart: 'torso',
    });
    expect(result.components).toHaveLength(2);
    expect(result.components[0]).toMatchObject({ damageType: 'ballistic' });
    expect(result.components[0].damage).toBeCloseTo(100, 6); // ballistic untouched
    expect(result.components[1]).toMatchObject({ damageType: 'explosive' });
    // Twin base = 100 × 0.2 = 20; twin dbm = 1.0 (weapon base) + 0.5 (explosive-scoped) = 1.5.
    expect(result.components[1].base).toBeCloseTo(20, 6);
    expect(result.components[1].damage).toBeCloseTo(20 * 1.5, 6);
    expect(result.total).toBeCloseTo(100 + 30, 6);
  });

  it('explosionMult multiplies only the twin', () => {
    const mods = [
      mod({ bucket: 'explosivePayload', op: 'ADD', value: 0.2 }),
      mod({ bucket: 'explosionMult', op: 'MUL_ADD', value: 0.5 }),
    ];
    const result = computePaperDamage({
      mode: 'live', weapon, itemLevel: 50, modifiers: mods, ctx: makeCtx(weapon), bodyPartMult: 1.0, bodyPart: 'torso',
    });
    expect(result.components[0].damage).toBeCloseTo(100, 6); // original component unaffected
    // Twin base 20, dbm fold 1.0 (no dbm mods), explosionMult 1.0 + 0.5×1.0 = 1.5 → 20 × 1.0 × 1.5 = 30.
    expect(result.components[1].damage).toBeCloseTo(30, 6);
    expect(result.total).toBeCloseTo(130, 6);
  });

  it('no twin is spawned when explosivePayload is inactive', () => {
    const result = computePaperDamage({
      mode: 'live', weapon, itemLevel: 50, modifiers: [], ctx: makeCtx(weapon), bodyPartMult: 1.0, bodyPart: 'torso',
    });
    expect(result.components).toHaveLength(1);
    expect(result.total).toBeCloseTo(100, 6);
  });
});

describe('computeDotDps (Stage A2, DoT line)', () => {
  it('sums an active dotDamage magnitude into dotDps, 0 when its conditions fail', () => {
    const weapon = makeWeapon({
      components: [{ damageType: 'fire', tier: -1, levelCap: 50, curvePoints: FLAT_100 }],
    });
    const ctx = makeCtx(weapon);
    const active = mod({
      bucket: 'dotDamage', op: 'ADD', value: 3,
      conditions: [{ kind: 'damageTypeScope', types: ['fire'] }],
    });
    expect(computeDotDps([active], weapon, ctx)).toBeCloseTo(3, 10);

    // Scope names a type the weapon doesn't deal — the condition never matches.
    const mismatched = mod({
      bucket: 'dotDamage', op: 'ADD', value: 3,
      conditions: [{ kind: 'damageTypeScope', types: ['poison'] }],
    });
    expect(computeDotDps([mismatched], weapon, ctx)).toBe(0);
  });

  it('surfaces on ScenarioResult.dotDps without moving perHit/burstDps/sustain', () => {
    const weapon = makeWeapon({
      components: [{ damageType: 'fire', tier: -1, levelCap: 50, curvePoints: FLAT_100 }],
    });
    const mods = [mod({ bucket: 'dotDamage', op: 'ADD', value: 3, conditions: [{ kind: 'damageTypeScope', types: ['fire'] }] })];
    const input = {
      mode: 'live' as const, weapon, itemLevel: 50, modifiers: mods,
      player: createDefaultPlayerConditions(), enemy: createDefaultEnemyConditions(),
      weakpointMult: 2.0, critRate: 0,
    };
    const withDot = computeScenarios(input);
    const withoutDot = computeScenarios({ ...input, modifiers: [] });
    expect(withDot.freeAim.dotDps).toBeCloseTo(3, 10);
    expect(withDot.vats.dotDps).toBeCloseTo(3, 10);
    expect(withDot.freeAim.perHit.total).toBeCloseTo(withoutDot.freeAim.perHit.total, 10);
    expect(withDot.freeAim.burstDps).toBeCloseTo(withoutDot.freeAim.burstDps, 10);
    expect(withoutDot.freeAim.dotDps).toBe(0);
  });
});

describe('computeScenarios AP economy (Stage B, ap-economy.ts)', () => {
  // 20-round mag, 1 shot/s fire rate, 4s reload → magDumpSec 20s, reloadSec 4s,
  // reload-inclusive shots/s = 20/24 (effectiveShotsPerSecond, NOT the raw 1.0/s
  // fire rate — see ap-economy.ts's doc comment on why reload downtime counts).
  const apWeapon = makeWeapon({
    animDelaySec: 1.0, isPhysical: false, apCost: 16,
    capacity: 20, ammoPerShot: 1, reloadSpeed: 1.0, animationReloadSec: 4.0,
  });
  const baseInput = {
    mode: 'live' as const, weapon: apWeapon, itemLevel: 50, modifiers: [],
    player: { ...createDefaultPlayerConditions(), agility: 15 },
    enemy: createDefaultEnemyConditions(), weakpointMult: 2.0, critRate: 0,
  };

  it('surfaces an ap-limited uptime for a ranged weapon with a real VATS AP cost', () => {
    const s = computeScenarios(baseInput);
    // shotsPerSec = 20/24; drainPerSec = 16×20/24 = 40/3; regenPerSec = 4
    // (no apRegen mods); apGainPerSec = 4 (no apPerCrit mods) → uptime = 4/(40/3) = 0.3.
    expect(s.vats.ap).toBeDefined();
    expect(s.vats.ap!.uptime).toBeCloseTo(0.3, 10);
    expect(s.vats.ap!.apLimitedDps).toBeCloseTo(s.vats.sustain.sustainedDps * 0.3, 10);
    expect(s.vats.ap!.secondsToEmpty).toBeDefined();
    // AP economy is a VATS-only concept — free aim never carries it.
    expect(s.freeAim.ap).toBeUndefined();
  });

  it('omits ap for melee weapons (AP-limited uptime is undefined for melee) and for zero-cost weapons', () => {
    const meleeWeapon = makeWeapon({ weaponClass: 'melee', apCost: 52 });
    expect(computeScenarios({ ...baseInput, weapon: meleeWeapon }).vats.ap).toBeUndefined();

    const noCostWeapon = makeWeapon({ animDelaySec: 1.0, isPhysical: false, apCost: 0 });
    expect(computeScenarios({ ...baseInput, weapon: noCostWeapon }).vats.ap).toBeUndefined();
  });

  it('apRegen/apPerCrit modifiers raise the gain rate and can saturate uptime at 1', () => {
    const richRegen = [mod({ bucket: 'apRegen', op: 'ADD', value: 10 })]; // absurd but isolates the math
    const s = computeScenarios({ ...baseInput, modifiers: richRegen });
    expect(s.vats.ap!.uptime).toBe(1);
    expect(s.vats.ap!.secondsToEmpty).toBeUndefined();
  });
});

describe('computeScenarios hit rate (Stage B, manual-aim only)', () => {
  const weapon = makeWeapon({
    animDelaySec: 1.0, isPhysical: false, capacity: 20, ammoPerShot: 1, reloadSpeed: 1.0, animationReloadSec: 4.0,
  });
  const input = {
    mode: 'live' as const, weapon, itemLevel: 50, modifiers: [],
    player: createDefaultPlayerConditions(), enemy: createDefaultEnemyConditions(),
    weakpointMult: 2.0, critRate: 0,
  };

  it('scales free-aim SUSTAINED dps only — burst, per-hit, and VATS stay unchanged', () => {
    const full = computeScenarios(input);
    const half = computeScenarios({ ...input, player: { ...input.player, hitRatePct: 50 } });

    expect(half.freeAim.sustain.sustainedDps).toBeCloseTo(full.freeAim.sustain.sustainedDps * 0.5, 10);
    expect(half.freeAim.burstDps).toBeCloseTo(full.freeAim.burstDps, 10);
    expect(half.freeAim.perHit.total).toBeCloseTo(full.freeAim.perHit.total, 10);
    expect(half.vats.sustain.sustainedDps).toBeCloseTo(full.vats.sustain.sustainedDps, 10);
    expect(half.vats.burstDps).toBeCloseTo(full.vats.burstDps, 10);
  });

  it('defaults to unscaled (100%) when hitRatePct is entirely omitted from player state', () => {
    const playerWithoutHitRate = createDefaultPlayerConditions();
    delete playerWithoutHitRate.hitRatePct;
    const withField = computeScenarios(input); // default factory sets hitRatePct: 100
    const withoutField = computeScenarios({ ...input, player: playerWithoutHitRate });
    expect(withoutField.freeAim.sustain.sustainedDps).toBeCloseTo(withField.freeAim.sustain.sustainedDps, 10);
  });
});

describe('computeScenarios', () => {
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
  const withConditions = (patch: Partial<ReturnType<typeof createDefaultPlayerConditions>>) => ({
    ...input,
    player: { ...input.player, ...patch },
  });

  it('weights VATS per-hit by the crit rate and keeps free aim crit-free', () => {
    const s = computeScenarios(input); // defaults: torso, no sneak
    expect(s.freeAim.perHit.total).toBeCloseTo(100, 6);
    // VATS torso: crit hit = 100 × (1 + (3−1)) = 300; avg = 0.5×100 + 0.5×300 = 200.
    expect(s.vats.perHit.total).toBeCloseTo(200, 6);
    expect(s.vats.burstDps).toBeCloseTo(200 * s.vats.fireRate, 6);
  });

  it('applies the weakpoint toggle to both scenarios', () => {
    const s = computeScenarios(withConditions({ isAimingAtWeakpoint: true }));
    expect(s.freeAim.perHit.total).toBeCloseTo(200, 6);
    // VATS weakpoint: non-crit 200, crit 100×3×2=600, avg = 400.
    expect(s.vats.perHit.total).toBeCloseTo(400, 6);
  });

  it('applies the sneak toggle to both scenarios (free aim included)', () => {
    const s = computeScenarios(withConditions({ isSneaking: true, isAimingAtWeakpoint: true }));
    // Sneak term +1.0 → free aim 100×2×2 = 400 (sneak now works outside VATS).
    expect(s.freeAim.perHit.total).toBeCloseTo(400, 6);
    // VATS: non-crit 400, crit 100×4×2=800, avg 600.
    expect(s.vats.perHit.total).toBeCloseTo(600, 6);
  });

  it('forwards the full crit-meter economy on the VATS result', () => {
    const s = computeScenarios({ ...input, critRate: undefined });
    expect(s.vats.critMeter).toBeDefined();
    expect(s.vats.critRate).toBeCloseTo(s.vats.critMeter!.critRate, 10);
    expect(s.freeAim.critMeter).toBeUndefined();
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

describe('body-part damage direction (sub-1 multipliers = limb hits)', () => {
  it("a <1 body-part mult scales damage down and doesn't trigger weakpoint bonuses via scenarios", () => {
    const weapon = makeWeapon({ animDelaySec: 1.0 });
    const input = {
      mode: 'live' as const, weapon, itemLevel: 50,
      modifiers: [mod({ bucket: 'weakpointBonus', op: 'ADD', value: 0.3 })],
      player: { ...createDefaultPlayerConditions(), isAimingAtWeakpoint: true },
      enemy: createDefaultEnemyConditions(),
      weakpointMult: 0.5, critRate: 0,
    };
    const result = computeScenarios(input);
    // ×0.5 body part, weakpointBonus must NOT apply (bodyPart resolves to 'limb', not 'weakpoint').
    expect(result.freeAim.perHit.total).toBeCloseTo(100 * 0.5, 6);
  });

  it('torso-gated modifiers are inert on limb hits', () => {
    const weapon = makeWeapon();
    const mods = [mod({ bucket: 'dbm', op: 'ADD', value: 0.5, conditions: [{ kind: 'bodyPart', part: 'torso' }] })];
    const limb = computePaperDamage({
      mode: 'live', weapon, itemLevel: 50, modifiers: mods, ctx: makeCtx(weapon), bodyPartMult: 0.5, bodyPart: 'limb',
    });
    expect(limb.total).toBeCloseTo(100 * 0.5, 6);
  });
});

describe('computeScenarios body-part hit rate (weakpoint aiming only)', () => {
  const weapon = makeWeapon({
    animDelaySec: 1.0, isPhysical: false, capacity: 20, ammoPerShot: 1, reloadSpeed: 1.0, animationReloadSec: 4.0,
  });
  const base = {
    mode: 'live' as const, weapon, itemLevel: 50, modifiers: [] as Modifier[],
    player: { ...createDefaultPlayerConditions(), isAimingAtWeakpoint: true },
    enemy: createDefaultEnemyConditions(),
    weakpointMult: 2.0, critRate: 0,
  };

  it('blends the aimed-part hit with a torso hit by the rate', () => {
    const full = computeScenarios(base);
    const blended = computeScenarios({ ...base, player: { ...base.player, bodyPartHitRatePct: 75 } });
    // 75% land at ×2, 25% at ×1 → 100 × (0.75×2 + 0.25×1) = 175
    expect(full.freeAim.perHit.total).toBeCloseTo(200, 6);
    expect(blended.freeAim.perHit.total).toBeCloseTo(175, 6);
    expect(blended.vats.perHit.total).toBeCloseTo(175, 6);
  });

  it('is a no-op at 100% and when not aiming at a weakpoint', () => {
    const at100 = computeScenarios({ ...base, player: { ...base.player, bodyPartHitRatePct: 100 } });
    expect(at100.freeAim.perHit.total).toBeCloseTo(computeScenarios(base).freeAim.perHit.total, 10);

    const notAiming = computeScenarios({
      ...base,
      player: { ...base.player, isAimingAtWeakpoint: false, bodyPartHitRatePct: 25 },
    });
    expect(notAiming.freeAim.perHit.total).toBeCloseTo(100, 6);
  });

  it('applies inside the Charged cycle too', () => {
    const charged = makeWeapon({ weaponClass: 'melee', keywords: ['WeaponHasSecondaryCharging'] });
    const input = { ...base, weapon: charged };
    const full = computeScenarios(input);
    const blended = computeScenarios({ ...input, player: { ...input.player, bodyPartHitRatePct: 50 } });
    // Every leg of the cycle blends ×2 and ×1 hits at 50% → the whole sustained metric scales by 0.75.
    expect(blended.freeAim.sustain.sustainedDps).toBeCloseTo(full.freeAim.sustain.sustainedDps * 0.75, 6);
  });
});

describe('target status effect conditions (bleed/cryo)', () => {
  const weapon = makeWeapon();

  it.each([
    ['DamageTypeBleed', 'isBleeding'],
    ['DamageTypeCryo', 'isFrozen'],
    ['DamageTypeFire', 'isBurning'],
    ['DamageTypePoison', 'isPoisoned'],
  ] as const)('%s gates on enemy.%s', (keyword, flag) => {
    const m = mod({ bucket: 'dbm', op: 'ADD', value: 0.5, conditions: [{ kind: 'enemyHasActiveEffect', keyword }] });
    const off = makeCtx(weapon);
    const on = makeCtx(weapon, { enemy: { ...createDefaultEnemyConditions(), [flag]: true } });
    expect(foldBucket([m], 'dbm', 1.0, off)).toBeCloseTo(1.0, 10);
    expect(foldBucket([m], 'dbm', 1.0, on)).toBeCloseTo(1.5, 10);
  });
});

describe('hasKillStreakSources detection', () => {
  const weapon = makeWeapon({ animDelaySec: 1.0 });
  const base = {
    mode: 'live' as const, weapon, itemLevel: 50, modifiers: [] as Modifier[],
    player: createDefaultPlayerConditions(), enemy: createDefaultEnemyConditions(),
    weakpointMult: 2.0, critRate: 0,
  };

  it('is false with no kill-streak reader equipped', () => {
    expect(computeScenarios(base).hasKillStreakSources).toBe(false);
  });

  it('detects killStreak curves, killStreakCount conditions, and adrenaline stack counters', () => {
    const curveMod: Modifier = {
      id: 'ks-curve',
      source: { kind: 'perk', formId: '0x0', edid: 'TestSource', name: 'Test Source' },
      bucket: 'dbm',
      op: 'ADD',
      curve: { input: 'killStreak', points: [{ x: 0, y: 0 }, { x: 10, y: 50 }] },
      curveScale: 0.01,
      conditions: [],
    };
    expect(computeScenarios({ ...base, modifiers: [curveMod] }).hasKillStreakSources).toBe(true);

    const countMod = mod({ bucket: 'dbm', op: 'ADD', value: 0.3, conditions: [{ kind: 'killStreakCount', count: 10 }] });
    expect(computeScenarios({ ...base, modifiers: [countMod] }).hasKillStreakSources).toBe(true);

    const stackMod = mod({ bucket: 'dbm', op: 'ADD', value: 0.05, conditions: [{ kind: 'stacks', counter: 'adrenaline', max: 10 }] });
    expect(computeScenarios({ ...base, modifiers: [stackMod] }).hasKillStreakSources).toBe(true);
  });
});
