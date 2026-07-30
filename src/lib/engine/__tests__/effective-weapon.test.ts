import { describe, it, expect } from 'bun:test';
import { getWeapons } from '@/data';
import { getBuffModifiers } from '@/data/buffs';
import { getOmodById, getOmodSlots } from '@/data/omods';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { PerkId } from '@/data/perk-ids';
import { weaponCharges } from '@/lib/charge';
import { buildEffectiveWeapon } from '@/lib/engine/effective-weapon';
import { computeScenarios } from '@/lib/engine/scenarios';
import { createDefaultEnemyConditions, createDefaultPlayerConditions } from '@/types';
import type { Bucket, CurveInput, Modifier } from '@/types/modifiers';

// Phase 5 milestone: Powerful Automatic Receiver on The Fixer gives
// +0.25 dbm, SET Speed 0.8248, automatic fire, and MUL_ADD −20% crit/sneak base.

describe('buildEffectiveWeapon with real OMOD data', () => {
  const fixer = getWeapons('live')['CombatRifle_Fixer'];
  const receiver = getOmodById('live', 'mod_CombatRifle_Receiver_Damage-Auto')!;

  it('the receiver is offered in the Fixer receiver slot', () => {
    const slots = getOmodSlots('live', fixer);
    const receiverSlot = slots.find((s) => s.slot === 'ap_gun_Receiver');
    expect(receiverSlot?.options.some((o) => o.id === receiver.id)).toBe(true);
    // Cosmetic and legendary slots are hidden from the standard picker — except
    // ap_customName, which now surfaces the Fixer's own identity unique mod.
    expect(slots.some((s) => /legendary|Appearance|Description/i.test(s.slot))).toBe(false);

    const uniqueSlot = slots.find((s) => s.slot === 'ap_customName');
    expect(uniqueSlot?.label).toBe('Unique');
    expect(uniqueSlot?.options.map((o) => o.id)).toEqual(['P01B_mod_Custom_Fixer']);
  });

  it('unique-effect mods on cosmetic slots surface only on their own weapons', () => {
    // Perfect Storm's payload rides ap_customName and is listed in the 10mm
    // SMG's templateModFormIds — offered there, never on the Fixer.
    const smgSlots = getOmodSlots('live', getWeapons('live')['10mmSMG']);
    const customSlot = smgSlots.find((s) => s.slot === 'ap_customName');
    expect(customSlot?.options.some((o) => o.id === 'mod_Custom_PerfectStorm')).toBe(true);

    // The V.A.T.S. Unknown: base 'AlienBlaster' lists ap_customName in its own
    // attachParentSlots and hosts mod_Custom_TheVATSUnknown in its
    // templateModFormIds. Its five sibling "variant" OMODs (BetterCriticals/
    // CritSavvy/GlowingCriticals/GrimReapersSprint/Psychopath) turned out to
    // be unreferenced legacy/cut records (2026-07-16) — the base mod is the
    // unique's sole real effect (see corrections.ts omodModifierAdditions).
    const vatsUnknown = getWeapons('live')['AlienBlaster'];
    const vatsSlots = getOmodSlots('live', vatsUnknown);
    const vatsCustom = vatsSlots.find((s) => s.slot === 'ap_customName');
    expect(vatsCustom?.options.map((o) => o.id)).toContain('mod_Custom_TheVATSUnknown');
    expect(
      vatsCustom?.options.filter((o) => o.id.startsWith('mod_Custom_TheVATSUnknown_')),
    ).toHaveLength(0);
  });

  it('equipping Perfect Storm on the 10mm SMG changes freeAim.perHit.total vs stock', () => {
    const smg = getWeapons('live')['10mmSMG'];
    const perfectStorm = getOmodById('live', 'mod_Custom_PerfectStorm')!;
    const base = {
      mode: 'live' as const,
      itemLevel: 50,
      player: createDefaultPlayerConditions(),
      enemy: createDefaultEnemyConditions(),
      weakpointMult: 2.0,
    };
    const stock = computeScenarios({ ...base, weapon: smg, modifiers: [], critRate: 0 });
    const { weapon, modifiers } = buildEffectiveWeapon(smg, [perfectStorm]);
    const modded = computeScenarios({ ...base, weapon, modifiers, critRate: 0 });

    expect(modded.freeAim.perHit.total).not.toBeCloseTo(stock.freeAim.perHit.total, 5);
  });

  it('rewrites speed/automatic state and merges keywords', () => {
    const { weapon } = buildEffectiveWeapon(fixer, [receiver]);
    expect(weapon.speed).toBeCloseTo(0.8248, 4);
    expect(weapon.isAutomatic).toBe(true);
    expect(weapon.keywords).toContain('WeaponTypeAutomatic');
  });

  it('feeds −30% base damage, +25% dbm, and −20% crit/sneak base through the engine', () => {
    const base = {
      mode: 'live' as const,
      itemLevel: 50,
      player: createDefaultPlayerConditions(),
      enemy: createDefaultEnemyConditions(),
      weakpointMult: 2.0,
    };
    const stock = computeScenarios({ ...base, weapon: fixer, modifiers: [], critRate: 0 });
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [receiver]);
    const modded = computeScenarios({ ...base, weapon, modifiers, critRate: 0 });

    // AttackDamage MUL_ADD −0.3 scales base BEFORE dbm: 103 × 0.7 × 1.25 = 90.125
    expect(modded.freeAim.perHit.total).toBeCloseTo(stock.freeAim.perHit.total * 0.7 * 1.25, 5);

    // crit-weighted VATS: crit mult = 2.0 × 0.8 = 1.6 → crit term +0.6
    const critted = computeScenarios({ ...base, weapon, modifiers, critRate: 1 });
    const perHitNoCrit = modded.vats.perHit.total;
    expect(critted.vats.perHit.total / perHitNoCrit).toBeCloseTo((1.25 + 0.6) / 1.25, 6);

    // automatic receiver: fire rate = 0.8248 / 0.11 ≈ 7.5
    expect(modded.vats.fireRate).toBeCloseTo(0.8248 / 0.11, 3);
  });

  it('folds ammoCapacity / reloadSpeed OMOD buckets into the effective weapon (synthetic)', () => {
    const magazineOmod = {
      id: 'test_mag',
      formId: '0x0',
      name: 'Test Drum Magazine',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_gun_Magazine',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [
        {
          id: '0x0:0',
          source: {
            kind: 'omod' as const,
            formId: '0x0',
            edid: 'test_mag',
            name: 'Test Drum Magazine',
          },
          bucket: 'ammoCapacity' as const,
          op: 'MUL_ADD' as const,
          value: 0.5,
          conditions: [],
        },
        {
          id: '0x0:1',
          source: {
            kind: 'omod' as const,
            formId: '0x0',
            edid: 'test_mag',
            name: 'Test Drum Magazine',
          },
          bucket: 'reloadSpeed' as const,
          op: 'MUL_ADD' as const,
          value: 0.25,
          conditions: [],
        },
      ],
    };
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [magazineOmod]);
    expect(weapon.capacity).toBeCloseTo((fixer.capacity ?? 0) * 1.5, 6);
    expect(weapon.reloadSpeed).toBeCloseTo((fixer.reloadSpeed ?? 1) * 1.25, 6);
    // Weapon-stat buckets never leak into the resolver's modifier list.
    expect(modifiers).toHaveLength(0);
  });

  it('clamps animDelaySec to MIN_ANIM_DELAY_SEC when SET to zero by OMOD (issue #43)', () => {
    // mod_custom_Doolin (The Dragon's ap_Legendary3) carries a real
    // `SET animDelaySec 0` that would produce Infinity fire rate without
    // clamping. The 0.001s floor is deliberately absurd (far below realistic
    // 0.11s) to make the bug obvious. buildEffectiveWeapon doesn't validate
    // OMOD/weapon slot compatibility (getOmodSlots does), so this reuses
    // `fixer` like every other synthetic-OMOD test in this file rather than
    // depending on The Dragon's exact generated-data id.
    const doolin = {
      id: 'mod_custom_Doolin',
      formId: '0x007CFAAC',
      name: 'The Dragon Doolin',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_Legendary3',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [
        {
          id: '0x007CFAAC:0',
          source: {
            kind: 'omod' as const,
            formId: '0x007CFAAC',
            edid: 'mod_custom_Doolin',
            name: 'The Dragon Doolin',
          },
          bucket: 'animDelaySec' as const,
          op: 'SET' as const,
          value: 0,
          conditions: [],
        },
      ],
    };
    const { weapon } = buildEffectiveWeapon(fixer, [doolin]);
    // animDelaySec should be clamped to 0.001, not 0.
    expect(weapon.animDelaySec).toBe(0.001);
    // Fire rate must be finite and not absurdly high.
    const fireRate = (weapon.speed ?? 1.0) / weapon.animDelaySec!;
    expect(isFinite(fireRate)).toBe(true);
    expect(fireRate).toBeLessThan(2000); // ~1000/sec (1.0 speed / 0.001), not Infinity
  });

  it('folds weapon-stat modifiers ONLY when their condition matches (synthetic, Stage C3 killStreakCount)', () => {
    // Thrill-Seeker's shape: 3 mutually-exclusive killStreakCount tiers on
    // reloadSpeed. Before Stage C3, the weapon-stat fold ignored conditions
    // entirely and would have summed all 3 unconditionally (0.03+0.06+0.09).
    const thrillSeekerLike = {
      id: 'test_thrill_seeker',
      formId: '0x0',
      name: "Test Thrill-Seeker's",
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_Legendary4',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: true,
      modifiers: [1, 2, 3].map((n) => ({
        id: `0x0:${n}`,
        source: {
          kind: 'omod' as const,
          formId: '0x0',
          edid: 'test_thrill_seeker',
          name: "Test Thrill-Seeker's",
        },
        bucket: 'reloadSpeed' as const,
        op: 'ADD' as const,
        value: 0.03 * n,
        conditions: [{ kind: 'killStreakCount' as const, count: n }],
      })),
    };
    const base = fixer.reloadSpeed ?? 1.0;

    const at0 = buildEffectiveWeapon(fixer, [thrillSeekerLike], 50, {
      ...createDefaultPlayerConditions(),
      adrenalineStacks: 0,
    });
    expect(at0.weapon.reloadSpeed).toBeCloseTo(base, 6); // no tier matches 0 stacks

    const at2 = buildEffectiveWeapon(fixer, [thrillSeekerLike], 50, {
      ...createDefaultPlayerConditions(),
      adrenalineStacks: 2,
    });
    expect(at2.weapon.reloadSpeed).toBeCloseTo(base + 0.06, 6); // ONLY the count:2 tier fires
  });

  it('folds the vatsApCost OMOD bucket into the effective weapon (synthetic, Stage B)', () => {
    const vatsOptimizedLike = {
      id: 'test_vats_optimized',
      formId: '0x0',
      name: 'Test V.A.T.S. Optimized',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_Legendary3',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [
        {
          id: '0x0:0',
          source: {
            kind: 'omod' as const,
            formId: '0x0',
            edid: 'test_vats_optimized',
            name: 'Test V.A.T.S. Optimized',
          },
          bucket: 'vatsApCost' as const,
          op: 'MUL_ADD' as const,
          value: -0.35,
          conditions: [],
        },
      ],
    };
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [vatsOptimizedLike]);
    expect(weapon.apCost).toBeCloseTo((fixer.apCost ?? 0) * 0.65, 6);
    // Weapon-stat buckets never leak into the resolver's modifier list.
    expect(modifiers).toHaveLength(0);
  });
});

describe('loadout-sourced weapon-stat folding (perk weapon-stat fold gap, docs/assumptions.md "Onslaught")', () => {
  const fixer = getWeapons('live')['CombatRifle_Fixer'];
  const base = fixer.reloadSpeed ?? 1.0;
  const perkSource = { kind: 'perk' as const, formId: '0x1', edid: 'test_perk', name: 'Test Perk' };

  it('folds a perk reloadSpeed ADD with NO OMODs equipped (Swift-Footed shape)', () => {
    const perkReload = {
      id: '0x1:0',
      source: perkSource,
      bucket: 'reloadSpeed' as const,
      op: 'ADD' as const,
      value: 0.4,
      conditions: [],
    };
    const { weapon, modifiers } = buildEffectiveWeapon(
      fixer,
      [],
      50,
      createDefaultPlayerConditions(),
      createDefaultEnemyConditions(),
      [perkReload],
    );
    expect(weapon.reloadSpeed).toBeCloseTo(base + 0.4, 6);
    // Loadout modifiers stay owned by the caller — the returned list only
    // ever carries leftover OMOD modifiers.
    expect(modifiers).toHaveLength(0);
  });

  it('evaluates perk condition gates (Gun Tricks shape: playerIsGhoul)', () => {
    const ghoulReload = {
      id: '0x1:0',
      source: perkSource,
      bucket: 'reloadSpeed' as const,
      op: 'ADD' as const,
      value: 0.3,
      conditions: [{ kind: 'playerIsGhoul' as const, value: true }],
    };
    const asHuman = buildEffectiveWeapon(
      fixer,
      [],
      50,
      createDefaultPlayerConditions(),
      createDefaultEnemyConditions(),
      [ghoulReload],
    );
    expect(asHuman.weapon.reloadSpeed).toBeCloseTo(base, 6);

    const asGhoul = buildEffectiveWeapon(
      fixer,
      [],
      50,
      { ...createDefaultPlayerConditions(), isGhoul: true },
      createDefaultEnemyConditions(),
      [ghoulReload],
    );
    expect(asGhoul.weapon.reloadSpeed).toBeCloseTo(base + 0.3, 6);
  });

  it('Guerrilla Expert shape: an onslaughtStacks reload curve reads the cap folded from a co-equipped onslaughtMaxStacks source', () => {
    // Real extracted curve: +1% reload per Onslaught stack.
    const guerrillaExpertLike = {
      id: '0x1:0',
      source: perkSource,
      bucket: 'reloadSpeed' as const,
      op: 'ADD' as const,
      curve: {
        input: 'onslaughtStacks' as const,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 0.01 },
          { x: 100, y: 1 },
        ],
      },
      curveScale: 1,
      conditions: [],
    };
    const capSource = {
      id: '0x2:0',
      source: {
        kind: 'perk' as const,
        formId: '0x2',
        edid: 'test_onslaught_cap',
        name: 'Test Onslaught Cap',
      },
      bucket: 'onslaughtMaxStacks' as const,
      op: 'ADD' as const,
      value: 10,
      conditions: [],
    };
    // Default onslaughtStacks is -1 ("follow the computed max").
    const player = createDefaultPlayerConditions();

    // No cap source equipped → the curve clamps to 0 stacks → inert.
    const withoutCap = buildEffectiveWeapon(fixer, [], 50, player, createDefaultEnemyConditions(), [
      guerrillaExpertLike,
    ]);
    expect(withoutCap.weapon.reloadSpeed).toBeCloseTo(base, 6);

    // Cap 10 equipped → follow-max resolves to 10 → curve Y = 0.1.
    const withCap = buildEffectiveWeapon(fixer, [], 50, player, createDefaultEnemyConditions(), [
      guerrillaExpertLike,
      capSource,
    ]);
    expect(withCap.weapon.reloadSpeed).toBeCloseTo(base + 0.1, 6);
  });

  it('Fast Fighter shape: a moveSpeedBonus reload curve reads the bootstrap-folded move-speed sources', () => {
    // The real override: identity curve × 0.5 — half the bonus move speed.
    const fastFighterLike = {
      id: '0x1:0',
      source: perkSource,
      bucket: 'reloadSpeed' as const,
      op: 'ADD' as const,
      curve: {
        input: 'moveSpeedBonus' as const,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
        ],
      },
      curveScale: 0.5,
      conditions: [],
    };
    const speedDemonLike = (value: number) => ({
      id: '0x3:0',
      source: {
        kind: 'mutation' as const,
        formId: '0x3',
        edid: 'test_move_speed',
        name: 'Test Move Speed',
      },
      bucket: 'moveSpeedBonus' as const,
      op: 'ADD' as const,
      value,
      conditions: [],
    });
    const player = createDefaultPlayerConditions();

    // No move-speed source equipped → curve reads 0 → inert.
    const alone = buildEffectiveWeapon(fixer, [], 50, player, createDefaultEnemyConditions(), [
      fastFighterLike,
    ]);
    expect(alone.weapon.reloadSpeed).toBeCloseTo(base, 6);

    // Speed Demon's +20% move speed → +10% reload speed.
    const withSpeedDemon = buildEffectiveWeapon(
      fixer,
      [],
      50,
      player,
      createDefaultEnemyConditions(),
      [fastFighterLike, speedDemonLike(0.2)],
    );
    expect(withSpeedDemon.weapon.reloadSpeed).toBeCloseTo(base + 0.1, 6);

    // A net move-speed PENALTY clamps at the curve's (0,0) endpoint — never
    // slows reload.
    const withPenalty = buildEffectiveWeapon(
      fixer,
      [],
      50,
      player,
      createDefaultEnemyConditions(),
      [fastFighterLike, speedDemonLike(-0.4)],
    );
    expect(withPenalty.weapon.reloadSpeed).toBeCloseTo(base, 6);
  });

  it('Gun Runner moveSpeedBonus feeds Fast Fighter on ranged weapons only', () => {
    const fastFighter = getLoadoutModifiers('live', [{ perkId: PerkId.FastFighter, rank: 1 }]);
    const gunRunner = getLoadoutModifiers('live', [{ perkId: PerkId.GunRunner, rank: 2 }]);
    const player = createDefaultPlayerConditions();

    const ranged = buildEffectiveWeapon(fixer, [], 50, player, createDefaultEnemyConditions(), [
      ...fastFighter,
      ...gunRunner,
    ]);
    expect(ranged.weapon.reloadSpeed).toBeCloseTo(base + 0.1, 6); // +20% move → +10% reload

    const melee = getWeapons('live')['DeathclawGauntlet'];
    const meleeBase = melee.reloadSpeed ?? 1.0;
    const onMelee = buildEffectiveWeapon(melee, [], 50, player, createDefaultEnemyConditions(), [
      ...fastFighter,
      ...gunRunner,
    ]);
    expect(onMelee.weapon.reloadSpeed).toBeCloseTo(meleeBase, 6);
  });

  it('Wasteland Fish Sandwich (real consumable data) feeds Fast Fighter reload speed', () => {
    const mods = getBuffModifiers('live', [], ['SeasonalFish_Meal_SummerWastelandFishSandwich']);
    expect(mods).toEqual(
      expect.arrayContaining([expect.objectContaining({ bucket: 'moveSpeedBonus', value: 0.2 })]),
    );
    const fastFighter = getLoadoutModifiers('live', [{ perkId: PerkId.FastFighter, rank: 1 }]);
    const player = createDefaultPlayerConditions();
    const result = buildEffectiveWeapon(fixer, [], 50, player, createDefaultEnemyConditions(), [
      ...fastFighter,
      ...mods,
    ]);
    expect(result.weapon.reloadSpeed).toBeCloseTo(base + 0.1, 6);
  });
});

describe('dual-site bootstrap folds', () => {
  const fixer = getWeapons('live')['CombatRifle_Fixer'];
  const source = {
    kind: 'perk' as const,
    formId: '0xB00',
    edid: 'test_bootstrap',
    name: 'Test Bootstrap',
  };

  function add(bucket: Bucket, value: number, id: string = bucket): Modifier {
    return { id, source, bucket, op: 'ADD', value, conditions: [] };
  }

  function observer(input: CurveInput): Modifier {
    return {
      id: `observe:${input}`,
      source,
      bucket: 'reloadSpeed',
      op: 'ADD',
      curve: {
        input,
        points: [
          { x: 0, y: 0 },
          { x: 100, y: 100 },
        ],
      },
      curveScale: 1,
      conditions: [],
    };
  }

  it.each([
    {
      bucket: 'onslaughtMaxStacks' as const,
      input: 'onslaughtStacks' as const,
      modifiers: [add('onslaughtMaxStacks', 7)],
      expected: 7,
      scenarioValue: (result: ReturnType<typeof computeScenarios>) => result.onslaughtMaxStacks,
      player: createDefaultPlayerConditions(),
    },
    {
      bucket: 'bulletStormMaxStacks' as const,
      input: 'bulletStormStacks' as const,
      modifiers: [add('bulletStormMaxStacks', 9)],
      expected: 9,
      scenarioValue: (result: ReturnType<typeof computeScenarios>) => result.bulletStormMaxStacks,
      player: createDefaultPlayerConditions(),
    },
    {
      bucket: 'bulletStormMinStacks' as const,
      input: 'bulletStormStacks' as const,
      modifiers: [add('bulletStormMaxStacks', 10, 'max-for-min'), add('bulletStormMinStacks', 4)],
      expected: 4,
      scenarioValue: (result: ReturnType<typeof computeScenarios>) => result.bulletStormMinStacks,
      player: { ...createDefaultPlayerConditions(), bulletStormStacks: 0 },
    },
  ])(
    '$bucket produces the same value in effective-weapon and scenarios',
    ({ input, modifiers, expected, scenarioValue, player }) => {
      const identicalModifiers = [...modifiers, observer(input)];
      const effective = buildEffectiveWeapon(
        fixer,
        [],
        50,
        player,
        createDefaultEnemyConditions(),
        identicalModifiers,
      );
      const effectiveSiteValue = effective.weapon.reloadSpeed! - (fixer.reloadSpeed ?? 1);
      const scenarios = computeScenarios({
        mode: 'live',
        weapon: fixer,
        itemLevel: 50,
        modifiers: identicalModifiers,
        player,
        enemy: createDefaultEnemyConditions(),
        weakpointMult: 2,
        critRate: 0,
      });

      expect(effectiveSiteValue).toBeCloseTo(expected, 10);
      expect(scenarioValue(scenarios)).toBeCloseTo(effectiveSiteValue, 10);
    },
  );
});

describe('materializeDamageTypeComponents (DamageTypeValues conversion, 2026-07-13)', () => {
  const fixer = getWeapons('live')['CombatRifle_Fixer']; // ballistic-only
  const gaussMinigun = getWeapons('live')['GaussMinigun']; // ballistic-only, base 53 @ level 50
  // Tesla Coil Capacitor: baseDamage MUL_ADD −0.2 ballistic-scoped, +0.5
  // energy-scoped — the +0.5 used to silently no-op with no energy component.
  const teslaCapacitor = getOmodById('live', 'mod_GaussMinigun_Tesla_Capacitor')!;

  /** A synthetic blanket "−30% on every damage type" barrel/receiver shape. */
  function blanketBaseDamageOmod(
    id: string,
    types: Array<'ballistic' | 'energy' | 'cryo' | 'fire' | 'poison' | 'radiation'>,
    value: number,
  ) {
    return {
      id,
      formId: '0x0',
      name: `Test ${id}`,
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_gun_Receiver',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: types.map((type, i) => ({
        id: `0x0:${i}`,
        source: { kind: 'omod' as const, formId: '0x0', edid: id, name: `Test ${id}` },
        bucket: 'baseDamage' as const,
        op: 'MUL_ADD' as const,
        value,
        conditions: [{ kind: 'damageTypeScope' as const, types: [type] }],
      })),
    };
  }

  it('materializes an energy component on the ballistic-only Gauss Minigun with the real Tesla Coil Capacitor', () => {
    const { weapon, modifiers } = buildEffectiveWeapon(gaussMinigun, [teslaCapacitor]);

    expect(weapon.components.map((c) => c.damageType)).toEqual(['ballistic', 'energy']);
    const [ballistic, energy] = weapon.components;
    expect(energy.scale).toBeCloseTo(0.5, 10);
    expect(energy.flatBonus ?? 0).toBeCloseTo(0, 10);
    // Curve borrowed from the fallback (the weapon's own ballistic component).
    expect(energy.tier).toBe(ballistic.tier);
    expect(energy.levelCap).toBe(ballistic.levelCap);
    expect(energy.curvePoints).toBe(ballistic.curvePoints);

    // The energy-scoped baseDamage MUL_ADD fed the materialization and is
    // consumed; the ballistic-scoped one targets an EXISTING component and
    // survives untouched for the normal per-component fold.
    const baseDamageMods = modifiers.filter((m) => m.bucket === 'baseDamage');
    expect(baseDamageMods).toHaveLength(1);
    expect(baseDamageMods[0].conditions).toEqual([
      { kind: 'damageTypeScope', types: ['ballistic'] },
    ]);
  });

  it('feeds through the engine with no double count: ballistic 53×0.8, energy 53×0.5 (plus their intrinsic 15% explosive twins)', () => {
    const { weapon, modifiers } = buildEffectiveWeapon(gaussMinigun, [teslaCapacitor]);
    const base = {
      mode: 'live' as const,
      itemLevel: 50,
      player: createDefaultPlayerConditions(),
      enemy: createDefaultEnemyConditions(),
      weakpointMult: 2.0,
    };
    const result = computeScenarios({ ...base, weapon, modifiers, critRate: 0 });
    const components = result.freeAim.perHit.components;
    // GaussMinigun's intrinsic 15% explosive payload (Gauss family,
    // unconditional) spawns a twin for EACH declared component, so ballistic
    // and the materialized energy component each contribute a hit + a twin —
    // the plan's "Tesla Gauss 15% tick = phys + energy" example, reproduced.
    expect(components).toHaveLength(4);
    const [ballisticHit, ballisticTwin, energyHit, energyTwin] = components;
    expect(ballisticHit).toMatchObject({ damageType: 'ballistic' });
    expect(ballisticHit.base).toBeCloseTo(53 * 0.8, 6); // 53 × (1 − 0.2)
    expect(ballisticTwin).toMatchObject({ damageType: 'ballistic' });
    expect(ballisticTwin.base).toBeCloseTo(53 * 0.8 * 0.15, 6);
    expect(energyHit).toMatchObject({ damageType: 'energy' });
    expect(energyHit.base).toBeCloseTo(53 * 0.5, 6); // materialized scale 0.5, no flat bonus — NOT 53×1.5
    expect(energyTwin).toMatchObject({ damageType: 'energy' });
    expect(energyTwin.base).toBeCloseTo(53 * 0.5 * 0.15, 6);
  });

  it('a synthetic blanket −30%-on-every-type omod spawns no phantom components on the ballistic-only Fixer', () => {
    const blanket = blanketBaseDamageOmod(
      'test_blanket_receiver',
      ['ballistic', 'energy', 'cryo', 'fire', 'poison', 'radiation'],
      -0.3,
    );
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [blanket]);

    // Every non-ballistic type saw ONLY a dropped negative — nothing materializes.
    expect(weapon.components.map((c) => c.damageType)).toEqual(['ballistic']);
    // Nothing was consumed: no type materialized, so all 6 baseDamage mods survive
    // (the 5 non-ballistic ones stay inert — no matching component to fold over).
    expect(modifiers.filter((m) => m.bucket === 'baseDamage')).toHaveLength(6);
  });

  it('negative MULs on a missing type are dropped, not netted: Tesla + a synthetic −0.3 energy blanket still materializes scale 0.5', () => {
    const energyBlanket = blanketBaseDamageOmod('test_energy_blanket', ['energy'], -0.3);
    const { weapon } = buildEffectiveWeapon(gaussMinigun, [teslaCapacitor, energyBlanket]);

    const energy = weapon.components.find((c) => c.damageType === 'energy');
    expect(energy).toBeDefined();
    // NOT 0.5 − 0.3 = 0.2 — the negative multiplies energy's own zero base
    // and contributes nothing, dropped per-modifier.
    expect(energy!.scale).toBeCloseTo(0.5, 10);
  });

  it('a synthetic SET 0 + ADD 5 materializes a flat-only component (no MUL_ADD present)', () => {
    const flatConversionLike = {
      id: 'test_flat_conversion',
      formId: '0x0',
      name: 'Test Flat Conversion Mod',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_melee_MeleeMod',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [
        {
          id: '0x0:0',
          source: {
            kind: 'omod' as const,
            formId: '0x0',
            edid: 'test_flat_conversion',
            name: 'Test Flat Conversion Mod',
          },
          bucket: 'baseDamage' as const,
          op: 'SET' as const,
          value: 0,
          conditions: [{ kind: 'damageTypeScope' as const, types: ['energy' as const] }],
        },
        {
          id: '0x0:1',
          source: {
            kind: 'omod' as const,
            formId: '0x0',
            edid: 'test_flat_conversion',
            name: 'Test Flat Conversion Mod',
          },
          bucket: 'baseDamage' as const,
          op: 'ADD' as const,
          value: 5,
          conditions: [{ kind: 'damageTypeScope' as const, types: ['energy' as const] }],
        },
      ],
    };
    const { weapon } = buildEffectiveWeapon(fixer, [flatConversionLike]);

    const energy = weapon.components.find((c) => c.damageType === 'energy');
    expect(energy).toBeDefined();
    expect(energy!.scale).toBeCloseTo(0, 10);
    expect(energy!.flatBonus).toBeCloseTo(5, 10);
  });
});

describe('explosionRadiusBonus → dbm conversion (Bunker Buster, Grenadier)', () => {
  const FLAT_CURVE = [
    { x: 1, y: 100 },
    { x: 50, y: 100 },
  ];
  const FLAT_10 = [
    { x: 1, y: 10 },
    { x: 50, y: 10 },
  ];

  function makeDualComponentWeapon() {
    return {
      id: 'test_launcher_bunker_buster',
      name: 'Test Launcher',
      components: [
        { damageType: 'ballistic' as const, tier: -1, levelCap: 50, curvePoints: FLAT_10 },
        {
          damageType: 'explosive' as const,
          tier: -1,
          levelCap: 50,
          curvePoints: FLAT_CURVE,
          fromExplosion: true,
        },
      ],
      damageType: 'ballistic' as const,
      weaponClass: 'heavy' as const,
      isAutomatic: false,
      isPhysical: true,
      critDamageMult: 2.0,
      critChargeBonus: 1.0,
      sneakAttackMult: 2.0,
      damageBonusMult: 1.0,
    };
  }

  const omodSource = {
    kind: 'omod' as const,
    formId: '0xBUNKER',
    edid: 'mod_Custom_BunkerBuster',
    name: 'Bunker Buster',
  };
  const perkSource = {
    kind: 'perk' as const,
    formId: '0xGREN',
    edid: 'perk_Grenadier',
    name: 'Grenadier',
  };

  const bunkerBusterOmod = {
    id: 'mod_Custom_BunkerBuster',
    formId: '0xBUNKER',
    name: 'Bunker Buster',
    description: '',
    attachPointFormId: '0x0',
    attachPointEdid: 'ap_Legendary3',
    targetKeywords: [],
    addedKeywords: [],
    hasEnchantments: false,
    modifiers: [
      {
        id: '0xBUNKER:0',
        source: omodSource,
        bucket: 'explosionRadiusToDamage' as const,
        op: 'ADD' as const,
        value: 1.0,
        conditions: [],
      },
    ],
  };

  const grenadierBonus = {
    id: '0xGREN:0',
    source: perkSource,
    bucket: 'explosionRadiusBonus' as const,
    op: 'ADD' as const,
    value: 0.5,
    conditions: [],
  };

  it('synthesizes an explosive-scoped dbm ADD when both buckets are present and nonzero', () => {
    const { modifiers } = buildEffectiveWeapon(
      makeDualComponentWeapon(),
      [bunkerBusterOmod],
      50,
      createDefaultPlayerConditions(),
      createDefaultEnemyConditions(),
      [grenadierBonus],
    );

    const converted = modifiers.find((m) => m.id.endsWith(':explosionRadiusConversion'));
    expect(converted).toBeDefined();
    expect(converted).toMatchObject({
      bucket: 'dbm',
      op: 'ADD',
      value: 0.5,
      source: omodSource,
      conditions: [{ kind: 'damageTypeScope', types: ['explosive'] }],
    });
    expect(modifiers.some((m) => m.bucket === 'explosionRadiusBonus')).toBe(false);
    expect(modifiers.some((m) => m.bucket === 'explosionRadiusToDamage')).toBe(false);
  });

  it('does not synthesize dbm when only explosionRadiusBonus is present', () => {
    const { modifiers } = buildEffectiveWeapon(
      makeDualComponentWeapon(),
      [],
      50,
      createDefaultPlayerConditions(),
      createDefaultEnemyConditions(),
      [grenadierBonus],
    );
    expect(modifiers.some((m) => m.bucket === 'dbm')).toBe(false);
    expect(modifiers.some((m) => m.bucket === 'explosionRadiusBonus')).toBe(false);
  });

  it('does not synthesize dbm when only explosionRadiusToDamage is present', () => {
    const { modifiers } = buildEffectiveWeapon(makeDualComponentWeapon(), [bunkerBusterOmod]);
    expect(modifiers.some((m) => m.bucket === 'dbm')).toBe(false);
    expect(modifiers.some((m) => m.bucket === 'explosionRadiusToDamage')).toBe(false);
  });
});

describe('explosionSwap replacement (launcher-family projectile-swap, docs/assumptions.md "OMOD-chased launcher payloads" § Launcher-family replacement, 2026-07-29)', () => {
  const FLAT_100 = [
    { x: 1, y: 100 },
    { x: 50, y: 100 },
  ];

  /** A synthetic launcher-shaped weapon: ballistic impact + its own baseline fromExplosion component. */
  function makeLauncherWeapon() {
    return {
      id: 'test_launcher',
      name: 'Test Launcher',
      components: [
        { damageType: 'ballistic' as const, tier: -1, levelCap: 50, curvePoints: FLAT_100 },
        {
          damageType: 'explosive' as const,
          tier: -1,
          levelCap: 50,
          curvePoints: FLAT_100,
          fromExplosion: true,
        },
      ],
      damageType: 'ballistic' as const,
      weaponClass: 'heavy' as const,
      isAutomatic: false,
      isPhysical: true,
      critDamageMult: 2.0,
      critChargeBonus: 1.0,
      sneakAttackMult: 2.0,
      damageBonusMult: 1.0,
    };
  }

  /** A synthetic non-launcher weapon: plain ballistic-only, no fromExplosion component at all. */
  function makeBallisticOnlyWeapon() {
    return {
      id: 'test_rifle',
      name: 'Test Rifle',
      components: [
        { damageType: 'ballistic' as const, tier: -1, levelCap: 50, curvePoints: FLAT_100 },
      ],
      damageType: 'ballistic' as const,
      weaponClass: 'rifle' as const,
      isAutomatic: false,
      isPhysical: true,
      critDamageMult: 2.0,
      critChargeBonus: 1.0,
      sneakAttackMult: 2.0,
      damageBonusMult: 1.0,
    };
  }

  /** A synthetic barrel OMOD carrying an explosionSwap, no ordinary modifiers (mirrors the real Cryo Payload shape). */
  function makeSwapOmod(baseWeaponDamageMult = 0) {
    return {
      id: 'test_cryo_barrel',
      formId: '0x0',
      name: 'Test Cryo Barrel',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_gun_Barrel',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [],
      explosionSwap: {
        explEdid: 'TestSwapExplosion',
        baseWeaponDamageMult,
        components: [
          {
            damageType: 'cryo' as const,
            damageTypeEdid: 'dtCryo',
            amount: 0,
            tier: 15,
            curve: [
              { x: 1, y: 10 },
              { x: 50, y: 40 },
            ],
            fromExplosion: true,
          },
        ],
      },
    };
  }

  it('replaces the baseline fromExplosion component with the swap — not both', () => {
    const { weapon } = buildEffectiveWeapon(makeLauncherWeapon(), [makeSwapOmod()]);

    expect(weapon.components.map((c) => c.damageType)).toEqual(['ballistic', 'cryo']);
    const [ballistic, cryo] = weapon.components;
    // Untouched ballistic component survives unchanged.
    expect(ballistic).toMatchObject({ damageType: 'ballistic' });
    expect(ballistic.fromExplosion).toBeUndefined();
    // Swapped-in component: engine shape (curvePoints/levelCap), not the extractor shape.
    expect(cryo).toMatchObject({
      damageType: 'cryo',
      tier: 15,
      levelCap: 50, // borrowed from the base weapon's own components, not the swap
      curvePoints: [
        { x: 1, y: 10 },
        { x: 50, y: 40 },
      ],
      fromExplosion: true,
    });
  });

  it('overrides explosionBaseWeaponDamageMult from the swap when it applies', () => {
    const { weapon } = buildEffectiveWeapon(makeLauncherWeapon(), [makeSwapOmod(0.2)]);
    expect(weapon.explosionBaseWeaponDamageMult).toBe(0.2);
  });

  it('is a no-op on a weapon with no baseline fromExplosion component at all', () => {
    const { weapon } = buildEffectiveWeapon(makeBallisticOnlyWeapon(), [makeSwapOmod()]);
    expect(weapon.components.map((c) => c.damageType)).toEqual(['ballistic']);
    expect(weapon.explosionBaseWeaponDamageMult).toBeUndefined();
  });

  it('only the LAST equipped omod carrying a swap wins', () => {
    const first = makeSwapOmod();
    const second = {
      ...makeSwapOmod(),
      id: 'test_plasma_barrel',
      explosionSwap: {
        explEdid: 'TestSwapExplosionPlasma',
        baseWeaponDamageMult: 0,
        components: [
          {
            damageType: 'energy' as const,
            damageTypeEdid: 'dtEnergy',
            amount: 0,
            tier: 20,
            curve: [
              { x: 1, y: 20 },
              { x: 50, y: 80 },
            ],
            fromExplosion: true,
          },
        ],
      },
    };
    const { weapon } = buildEffectiveWeapon(makeLauncherWeapon(), [first, second]);
    expect(weapon.components.map((c) => c.damageType)).toEqual(['ballistic', 'energy']);
  });
});

describe('Explosive 2★ dual behavior (explosivePayload branch, docs/assumptions.md "Launcher explosion damage" § "Explosive 2★ dual behavior", user-measured 2026-07-30)', () => {
  const FLAT_100 = [
    { x: 1, y: 100 },
    { x: 50, y: 100 },
  ];
  const FLAT_10 = [
    { x: 1, y: 10 },
    { x: 50, y: 10 },
  ];

  const legendarySource = {
    kind: 'omod' as const,
    formId: '0xEXPL2',
    edid: 'mod_Legendary_Weapon2_Guns_ExplosiveBullets',
    name: 'Explosive',
  };

  /** Mirrors the real Explosive 2★'s ESM shape: one unconditioned ADD 0.2. */
  function makeExplosiveOmod() {
    return {
      id: 'mod_Legendary_Weapon2_Guns_ExplosiveBullets',
      formId: '0xEXPL2',
      name: 'Explosive',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_Legendary2',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [
        {
          id: '0xEXPL2:0',
          source: legendarySource,
          bucket: 'explosivePayload' as const,
          op: 'ADD' as const,
          value: 0.2,
          conditions: [],
        },
      ],
    };
  }

  /** Plain weapon: single ballistic component, no explosion of any kind. */
  function makePlainWeapon() {
    return {
      id: 'test_plain_rifle',
      name: 'Test Rifle',
      components: [
        { damageType: 'ballistic' as const, tier: -1, levelCap: 50, curvePoints: FLAT_100 },
      ],
      damageType: 'ballistic' as const,
      weaponClass: 'rifle' as const,
      isAutomatic: false,
      isPhysical: true,
      critDamageMult: 2.0,
      critChargeBonus: 1.0,
      sneakAttackMult: 2.0,
      damageBonusMult: 1.0,
    };
  }

  /** Projectile-Scaling Explosion: Gauss-shape, real direct component + explosionBaseWeaponDamageMult, no fromExplosion component. */
  function makeProjectileScalingWeapon() {
    return { ...makePlainWeapon(), id: 'test_gauss', explosionBaseWeaponDamageMult: 0.15 };
  }

  /** Curve-Table Explosion, Missile-Launcher shape: real direct component + a fromExplosion component. */
  function makeCurveExplosionWeapon() {
    return {
      id: 'test_missile_launcher',
      name: 'Test Missile Launcher',
      components: [
        { damageType: 'ballistic' as const, tier: -1, levelCap: 50, curvePoints: FLAT_10 },
        {
          damageType: 'explosive' as const,
          tier: -1,
          levelCap: 50,
          curvePoints: FLAT_100,
          fromExplosion: true,
        },
      ],
      damageType: 'ballistic' as const,
      weaponClass: 'heavy' as const,
      isAutomatic: false,
      isPhysical: true,
      critDamageMult: 2.0,
      critChargeBonus: 1.0,
      sneakAttackMult: 2.0,
      damageBonusMult: 1.0,
    };
  }

  /** Curve-Table Explosion, Gamma-Gun shape: NO direct component — the explosion is the weapon's only damage. */
  function makeNoDirectExplosionWeapon() {
    return {
      id: 'test_gamma_gun',
      name: 'Test Gamma Gun',
      components: [
        {
          damageType: 'radiation' as const,
          tier: -1,
          levelCap: 50,
          curvePoints: FLAT_100,
          fromExplosion: true,
        },
        {
          damageType: 'energy' as const,
          tier: -1,
          levelCap: 50,
          curvePoints: FLAT_100,
          fromExplosion: true,
        },
      ],
      damageType: 'radiation' as const,
      weaponClass: 'heavy' as const,
      isAutomatic: false,
      isPhysical: true,
      critDamageMult: 2.0,
      critChargeBonus: 1.0,
      sneakAttackMult: 2.0,
      damageBonusMult: 1.0,
    };
  }

  it('Projectile-Scaling Explosion: explosivePayload passes through untouched (paper-damage.ts folds it as the twin base)', () => {
    const { modifiers } = buildEffectiveWeapon(makeProjectileScalingWeapon(), [
      makeExplosiveOmod(),
    ]);
    expect(modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'explosivePayload', value: 0.2 }),
    );
    expect(modifiers.some((m) => m.bucket === 'baseDamage')).toBe(false);
  });

  it('plain weapon (no explosion at all): explosivePayload also passes through untouched', () => {
    const { modifiers } = buildEffectiveWeapon(makePlainWeapon(), [makeExplosiveOmod()]);
    expect(modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'explosivePayload', value: 0.2 }),
    );
  });

  it('Curve-Table Explosion: rewrites explosivePayload into an explosive-scoped baseDamage MUL_ADD, strips explosivePayload', () => {
    const { modifiers } = buildEffectiveWeapon(makeCurveExplosionWeapon(), [makeExplosiveOmod()]);
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
    const synthesized = modifiers.find((m) => m.bucket === 'baseDamage');
    expect(synthesized).toMatchObject({
      bucket: 'baseDamage',
      op: 'MUL_ADD',
      value: 0.2,
      source: legendarySource,
      conditions: [{ kind: 'damageTypeScope', types: ['explosive'] }],
    });
  });

  it('Curve-Table Explosion with no direct component (Gamma Gun shape): still rewrites — the legendary is not dead weight', () => {
    const { modifiers } = buildEffectiveWeapon(makeNoDirectExplosionWeapon(), [
      makeExplosiveOmod(),
    ]);
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
    expect(modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'baseDamage', op: 'MUL_ADD', value: 0.2 }),
    );
  });

  it('Curve-Table Explosion with no legendary equipped: no baseDamage synthesized, nothing to strip', () => {
    const { modifiers } = buildEffectiveWeapon(makeCurveExplosionWeapon(), []);
    expect(modifiers.some((m) => m.bucket === 'baseDamage')).toBe(false);
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
  });

  it('branch is chosen POST-swap: an explosionSwap onto a plain weapon (hypothetically) still keys off the effective components', () => {
    // The launcher-family swap only ever applies when the base weapon
    // already has a baseline fromExplosion component (see the
    // explosionSwap describe block above) — so swapping doesn't change
    // which branch a launcher takes, only WHICH curve. Confirm the rewrite
    // still fires on a swapped-in explosion.
    const swapOmod = {
      id: 'test_barrel',
      formId: '0x0',
      name: 'Test Barrel',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_gun_Barrel',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [],
      explosionSwap: {
        explEdid: 'TestSwapExplosion',
        baseWeaponDamageMult: 0,
        components: [
          {
            damageType: 'cryo' as const,
            damageTypeEdid: 'dtCryo',
            amount: 0,
            tier: 15,
            curve: FLAT_100,
            fromExplosion: true,
          },
        ],
      },
    };
    const { modifiers } = buildEffectiveWeapon(makeCurveExplosionWeapon(), [
      swapOmod,
      makeExplosiveOmod(),
    ]);
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
    expect(modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'baseDamage', op: 'MUL_ADD', value: 0.2 }),
    );
  });

  it('chain-suppressed (Tesla + AC muzzle shape): clears explosionBaseWeaponDamageMult AND strips explosivePayload — no fallback twin', () => {
    const chainOmod = {
      id: 'test_ac_muzzle',
      formId: '0x0',
      name: 'Alternate Current Muzzle',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_gun_Muzzle',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [],
      chainSuppressesExplosion: true,
    };
    const { weapon, modifiers } = buildEffectiveWeapon(makeProjectileScalingWeapon(), [
      chainOmod,
      makeExplosiveOmod(),
    ]);
    expect(weapon.explosionBaseWeaponDamageMult).toBe(0);
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
    expect(modifiers.some((m) => m.bucket === 'baseDamage')).toBe(false);
  });

  it('chain-suppressed with no legendary equipped: still clears explosionBaseWeaponDamageMult', () => {
    const chainOmod = {
      id: 'test_ac_muzzle',
      formId: '0x0',
      name: 'Alternate Current Muzzle',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_gun_Muzzle',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [],
      chainSuppressesExplosion: true,
    };
    const { weapon } = buildEffectiveWeapon(makeProjectileScalingWeapon(), [chainOmod]);
    expect(weapon.explosionBaseWeaponDamageMult).toBe(0);
  });
});

describe('charging weapon-stat buckets (chargeFullPowerSec/chargeFullPowerDamageMult)', () => {
  const fixer = getWeapons('live')['CombatRifle_Fixer'];

  it('an OMOD SET chargeFullPowerSec turns charging ON for a base weapon that has FPDM but FPS 0 (tesla pattern)', () => {
    // Tesla/gamma/laser charging-barrel shape: the base WEAP already carries
    // a Full Power Damage Mult, but Full Power Seconds is 0 (charging is OFF)
    // until a charging-barrel OMOD SETs it.
    const teslaLikeBase = { ...fixer, fullPowerSeconds: 0, fullPowerDamageMult: 1.25 };
    expect(weaponCharges(teslaLikeBase)).toBe(false);

    const chargingBarrelLike = {
      id: 'test_charging_barrel',
      formId: '0x0',
      name: 'Test Charging Barrel',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_gun_Barrel',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [
        {
          id: '0x0:0',
          source: {
            kind: 'omod' as const,
            formId: '0x0',
            edid: 'test_charging_barrel',
            name: 'Test Charging Barrel',
          },
          bucket: 'chargeFullPowerSec' as const,
          op: 'SET' as const,
          value: 1.0,
          conditions: [],
        },
      ],
    };
    const { weapon } = buildEffectiveWeapon(teslaLikeBase, [chargingBarrelLike]);
    expect(weaponCharges(weapon)).toBe(true);
    expect(weapon.fullPowerSeconds).toBeCloseTo(1.0, 10);
    expect(weapon.fullPowerDamageMult).toBeCloseTo(1.25, 10); // untouched — no chargeFullPowerDamageMult modifier equipped
  });
});

describe('range weapon-stat buckets (weaponMinRange/weaponMaxRange/weaponOutOfRangeMult, Phase 1 engine half)', () => {
  it("a Long Barrel MUL_ADDs +50% onto Hunting Rifle's base min/max range", () => {
    // ESM: Hunting Rifle minRange 2612, maxRange 5225, outOfRangeDamageMult
    // 0.5; mod_HuntingRifle_barrel_Long_Base MUL_ADD +0.5 on both range
    // fields, no OutOfRangeMult property (unchanged).
    const huntingRifle = getWeapons('live')['HuntingRifle'];
    expect(huntingRifle.minRange).toBe(2612);
    expect(huntingRifle.maxRange).toBe(5225);
    expect(huntingRifle.outOfRangeDamageMult).toBe(0.5);

    const longBarrel = getOmodById('live', 'mod_HuntingRifle_barrel_Long_Base')!;
    const { weapon } = buildEffectiveWeapon(huntingRifle, [longBarrel]);
    expect(weapon.minRange).toBeCloseTo(2612 * 1.5, 6);
    expect(weapon.maxRange).toBeCloseTo(5225 * 1.5, 6);
    expect(weapon.outOfRangeDamageMult).toBeCloseTo(0.5, 6); // untouched — no weaponOutOfRangeMult modifier on this OMOD
  });

  it('the Abraxo Barrel SETs weaponOutOfRangeMult to 0.7 (the one OMOD in the dump that touches it)', () => {
    const plasmaGun = getWeapons('live')['PlasmaGun'];
    expect(plasmaGun.outOfRangeDamageMult).toBe(0.5);

    const abraxoBarrel = getOmodById('live', 'mod_PlasmaGun_barrel_Flamer_Abraxo')!;
    const { weapon } = buildEffectiveWeapon(plasmaGun, [abraxoBarrel]);
    expect(weapon.outOfRangeDamageMult).toBeCloseTo(0.7, 6);
  });

  it("an equipped OMOD with no range buckets leaves the base weapon's range fields untouched", () => {
    // Forces the non-early-return fold path (a real equipped OMOD) while
    // exercising a bucket unrelated to range — the base ?? fallback in the
    // weaponMinRange/weaponMaxRange/weaponOutOfRangeMult folds should be a
    // no-op when nothing targets those buckets.
    const huntingRifle = getWeapons('live')['HuntingRifle'];
    const unrelatedMod = getOmodById('live', 'mod_HuntingRifle_Barrel_Short_Recoil')!; // real equipped OMOD, zero modifiers of its own
    const { weapon } = buildEffectiveWeapon(huntingRifle, [unrelatedMod]);
    expect(weapon.minRange).toBe(2612);
    expect(weapon.maxRange).toBe(5225);
    expect(weapon.outOfRangeDamageMult).toBe(0.5);
  });
});

describe('sustain chance buckets (foldChanceUnion)', () => {
  const fixer = getWeapons('live')['CombatRifle_Fixer'];
  const baseCapacity = fixer.capacity ?? 0;
  const omodSource = {
    kind: 'omod' as const,
    formId: '0x0',
    edid: 'test_sustain',
    name: 'Test Sustain Mod',
  };
  const perkSource = { kind: 'perk' as const, formId: '0x1', edid: 'test_perk', name: 'Test Perk' };

  it('two reload-skip sources compose as 1 − (1 − c1)(1 − c2)', () => {
    const c1 = 0.06;
    const c2 = 0.12;
    const reloadSkipOmod = {
      id: 'test_reload_skip',
      formId: '0x0',
      name: 'Test Reload Skip',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_Legendary3',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [c1, c2].map((value, i) => ({
        id: `0x0:${i}`,
        source: omodSource,
        bucket: 'reloadSkipChance' as const,
        op: 'ADD' as const,
        value,
        conditions: [],
      })),
    };
    const { weapon } = buildEffectiveWeapon(fixer, [reloadSkipOmod]);
    expect(weapon.reloadSkipChance).toBeCloseTo(1 - (1 - c1) * (1 - c2), 10);
  });

  it('ammoFreeChance stacks with Quad multiplicatively, not additively', () => {
    const quadLike = {
      id: 'test_quad',
      formId: '0x0',
      name: 'Test Quad',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_Legendary1',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: true,
      modifiers: [
        {
          id: '0x0:0',
          source: omodSource,
          bucket: 'ammoCapacity' as const,
          op: 'MUL_ADD' as const,
          value: 3.0,
          conditions: [],
        },
      ],
    };
    const fortunateLike = {
      id: 'test_fortunate',
      formId: '0x1',
      name: 'Test Fortunate',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_gun_Magazine',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [
        {
          id: '0x1:0',
          source: omodSource,
          bucket: 'ammoFreeChance' as const,
          op: 'ADD' as const,
          value: 0.2,
          conditions: [],
        },
      ],
    };
    const quadOnly = buildEffectiveWeapon(fixer, [quadLike]);
    const both = buildEffectiveWeapon(fixer, [quadLike, fortunateLike]);

    expect(quadOnly.weapon.capacity).toBeCloseTo(baseCapacity * 4, 6);
    expect(both.weapon.capacity).toBeCloseTo(baseCapacity * 4, 6);
    expect(both.weapon.ammoFreeChance).toBeCloseTo(0.2, 10);
    // Wrong additive model would fold chance into capacity or sum chances with capacity bonus.
    expect(both.weapon.capacity).not.toBeCloseTo(baseCapacity * 4 * 1.2, 6);
    expect(both.weapon.ammoFreeChance).not.toBeCloseTo(0.2 + 3.0, 6);
  });

  it('reloadSkipChanceBash folds independently of reloadSkipChance (separate bash-tier channel, Phase C)', () => {
    const cFree = 0.2;
    const cBash = 0.45;
    const splitChannels = {
      id: 'test_reload_skip_split',
      formId: '0x0',
      name: 'Test Reload Skip Split',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_Legendary3',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [
        {
          id: '0x0:0',
          source: omodSource,
          bucket: 'reloadSkipChance' as const,
          op: 'ADD' as const,
          value: cFree,
          conditions: [],
        },
        {
          id: '0x0:1',
          source: omodSource,
          bucket: 'reloadSkipChanceBash' as const,
          op: 'ADD' as const,
          value: cBash,
          conditions: [],
        },
      ],
    };
    const { weapon } = buildEffectiveWeapon(fixer, [splitChannels]);
    expect(weapon.reloadSkipChance).toBeCloseTo(cFree, 10);
    expect(weapon.reloadSkipChanceBash).toBeCloseTo(cBash, 10);
  });

  it('two reloadSkipChanceBash sources compose as 1 − (1 − c1)(1 − c2), same union as reloadSkipChance', () => {
    const c1 = 0.15;
    const c2 = 0.3;
    const bashOmod = {
      id: 'test_bash_skip',
      formId: '0x0',
      name: 'Test Bash Skip',
      description: '',
      attachPointFormId: '0x0',
      attachPointEdid: 'ap_Legendary3',
      targetKeywords: [],
      addedKeywords: [],
      hasEnchantments: false,
      modifiers: [c1, c2].map((value, i) => ({
        id: `0x0:${i}`,
        source: omodSource,
        bucket: 'reloadSkipChanceBash' as const,
        op: 'ADD' as const,
        value,
        conditions: [],
      })),
    };
    const { weapon } = buildEffectiveWeapon(fixer, [bashOmod]);
    expect(weapon.reloadSkipChanceBash).toBeCloseTo(1 - (1 - c1) * (1 - c2), 10);
    // Folded from a DISJOINT source list, so the passive channel reads 0 — no
    // cross-channel bleed.
    expect(weapon.reloadSkipChance).toBeCloseTo(0, 10);
  });

  it('evaluates reloadSkipChance condition gates (playerIsGhoul)', () => {
    const ghoulReloadSkip = {
      id: '0x1:0',
      source: perkSource,
      bucket: 'reloadSkipChance' as const,
      op: 'ADD' as const,
      value: 0.36,
      conditions: [{ kind: 'playerIsGhoul' as const, value: true }],
    };
    const asHuman = buildEffectiveWeapon(
      fixer,
      [],
      50,
      createDefaultPlayerConditions(),
      createDefaultEnemyConditions(),
      [ghoulReloadSkip],
    );
    expect(asHuman.weapon.reloadSkipChance).toBeCloseTo(0, 10);

    const asGhoul = buildEffectiveWeapon(
      fixer,
      [],
      50,
      { ...createDefaultPlayerConditions(), isGhoul: true },
      createDefaultEnemyConditions(),
      [ghoulReloadSkip],
    );
    expect(asGhoul.weapon.reloadSkipChance).toBeCloseTo(0.36, 10);
  });
});
