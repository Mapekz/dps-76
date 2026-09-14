import { describe, it, expect } from 'bun:test';
import { getWeapons } from '@/data';
import { getBuffModifiers } from '@/data/buffs';
import { getOmodById, getOmodSlots } from '@/data/omods';
import { getArmorEffectModifiers } from '@/data/armor-modifiers';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { PerkId } from '@/data/perk-ids';
import { weaponCharges } from '@/lib/charge';
import { computeDotDps } from '@/lib/engine/paper-damage';
import { computeScenarios } from '@/lib/engine/scenarios';
import type { Weapon } from '@/types';
import { makeResolvedPlayer } from '@/lib/engine/__tests__/resolved-player-fixture';
import {
  FLAT_10,
  FLAT_100,
  effective,
  makeCtx,
  makeOmod,
  makeWeapon,
  omodModifiers,
  scenarioInput,
} from '@/lib/engine/__tests__/engine-fixture';
import type { Bucket, CurveInput, Modifier } from '@/types/modifiers';

/** Heavy launcher: a ballistic impact on `impactCurve` + a flat 100 fromExplosion component. */
function makeHeavyLauncher(impactCurve: typeof FLAT_100, overrides: Partial<Weapon> = {}): Weapon {
  return makeWeapon({
    components: [
      { damageType: 'ballistic', tier: -1, levelCap: 50, curvePoints: impactCurve },
      {
        damageType: 'explosive',
        tier: -1,
        levelCap: 50,
        curvePoints: FLAT_100,
        fromExplosion: true,
      },
    ],
    weaponClass: 'heavy',
    ...overrides,
  });
}

const legendarySource = {
  kind: 'omod' as const,
  formId: '0xEXPL2',
  edid: 'mod_Legendary_Weapon2_Guns_ExplosiveBullets',
  name: 'Explosive',
};

/** Mirrors the real Explosive 2★'s ESM shape: one unconditioned ADD 0.2. */
function makeExplosiveOmod() {
  return makeOmod({
    id: 'mod_Legendary_Weapon2_Guns_ExplosiveBullets',
    formId: '0xEXPL2',
    attachPointEdid: 'ap_Legendary2',
    modifiers: omodModifiers(legendarySource, [
      { bucket: 'explosivePayload', op: 'ADD', value: 0.2 },
    ]),
  });
}

/** Alternate Current muzzle shape: its projectile chases a Chain EXPL. */
function makeChainOmod() {
  return makeOmod({
    id: 'test_ac_muzzle',
    attachPointEdid: 'ap_gun_Muzzle',
    chainSuppressesExplosion: true,
  });
}

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
  });

  it('equipping Perfect Storm on the 10mm SMG changes freeAim.perHit.total vs stock', () => {
    const smg = getWeapons('live')['10mmSMG'];
    const perfectStorm = getOmodById('live', 'mod_Custom_PerfectStorm')!;
    const stock = computeScenarios(scenarioInput(smg, { critRate: 0 }));
    const { weapon, modifiers } = effective(smg, [perfectStorm]);
    const modded = computeScenarios(scenarioInput(weapon, { modifiers, critRate: 0 }));

    expect(modded.freeAim.perHit.total).not.toBeCloseTo(stock.freeAim.perHit.total, 5);
  });

  it('rewrites speed/automatic state and merges keywords', () => {
    const { weapon } = effective(fixer, [receiver]);
    expect(weapon.speed).toBeCloseTo(0.8248, 4);
    expect(weapon.isAutomatic).toBe(true);
    expect(weapon.keywords).toContain('WeaponTypeAutomatic');
  });

  it('feeds −30% base damage, +25% dbm, and −20% crit/sneak base through the engine', () => {
    const stock = computeScenarios(scenarioInput(fixer, { critRate: 0 }));
    const { weapon, modifiers } = effective(fixer, [receiver]);
    const modded = computeScenarios(scenarioInput(weapon, { modifiers, critRate: 0 }));

    // AttackDamage MUL_ADD −0.3 scales base BEFORE dbm: 103 × 0.7 × 1.25 = 90.125
    expect(modded.freeAim.perHit.total).toBeCloseTo(stock.freeAim.perHit.total * 0.7 * 1.25, 5);

    // crit-weighted VATS: crit mult = 2.0 × 0.8 = 1.6 → crit term +0.6
    const critted = computeScenarios(scenarioInput(weapon, { modifiers, critRate: 1 }));
    const perHitNoCrit = modded.vats.perHit.total;
    expect(critted.vats.perHit.total / perHitNoCrit).toBeCloseTo((1.25 + 0.6) / 1.25, 6);

    // automatic receiver: fire rate = 0.8248 / 0.11 ≈ 7.5
    expect(modded.vats.fireRate).toBeCloseTo(0.8248 / 0.11, 3);
  });

  it('folds ammoCapacity / reloadSpeed OMOD buckets into the effective weapon (synthetic)', () => {
    const magazineOmod = makeOmod({
      id: 'test_mag',
      attachPointEdid: 'ap_gun_Magazine',
      modifiers: omodModifiers({ formId: '0x0', edid: 'test_mag', name: 'Test Drum Magazine' }, [
        { bucket: 'ammoCapacity', op: 'MUL_ADD', value: 0.5 },
        { bucket: 'reloadSpeed', op: 'MUL_ADD', value: 0.25 },
      ]),
    });
    const { weapon, modifiers } = effective(fixer, [magazineOmod]);
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
    const doolin = makeOmod({
      id: 'mod_custom_Doolin',
      formId: '0x007CFAAC',
      modifiers: omodModifiers(
        { formId: '0x007CFAAC', edid: 'mod_custom_Doolin', name: 'The Dragon Doolin' },
        [{ bucket: 'animDelaySec', op: 'SET', value: 0 }],
      ),
    });
    const { weapon } = effective(fixer, [doolin]);
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
    const thrillSeekerLike = makeOmod({
      id: 'test_thrill_seeker',
      attachPointEdid: 'ap_Legendary4',
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
    });
    const base = fixer.reloadSpeed ?? 1.0;

    const at0 = effective(fixer, [thrillSeekerLike], {
      ...makeResolvedPlayer(),
      killStreak: 0,
    });
    expect(at0.weapon.reloadSpeed).toBeCloseTo(base, 6); // no tier matches 0 stacks

    const at2 = effective(fixer, [thrillSeekerLike], {
      ...makeResolvedPlayer(),
      killStreak: 2,
    });
    expect(at2.weapon.reloadSpeed).toBeCloseTo(base + 0.06, 6); // ONLY the count:2 tier fires
  });

  it('folds the vatsApCost OMOD bucket into the effective weapon (synthetic, Stage B)', () => {
    const vatsOptimizedLike = makeOmod({
      id: 'test_vats_optimized',
      modifiers: omodModifiers(
        { formId: '0x0', edid: 'test_vats_optimized', name: 'Test V.A.T.S. Optimized' },
        [{ bucket: 'vatsApCost', op: 'MUL_ADD', value: -0.35 }],
      ),
    });
    const { weapon, modifiers } = effective(fixer, [vatsOptimizedLike]);
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
    const { weapon, modifiers } = effective(fixer, [], makeResolvedPlayer(), [perkReload]);
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
    const asHuman = effective(fixer, [], makeResolvedPlayer(), [ghoulReload]);
    expect(asHuman.weapon.reloadSpeed).toBeCloseTo(base, 6);

    const asGhoul = effective(fixer, [], { ...makeResolvedPlayer(), isGhoul: true }, [ghoulReload]);
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
    const player = makeResolvedPlayer();

    // No cap source equipped → the curve clamps to 0 stacks → inert.
    const withoutCap = effective(fixer, [], player, [guerrillaExpertLike]);
    expect(withoutCap.weapon.reloadSpeed).toBeCloseTo(base, 6);

    // Cap 10 equipped → follow-max resolves to 10 → curve Y = 0.1.
    const withCap = effective(fixer, [], player, [guerrillaExpertLike, capSource]);
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
    const player = makeResolvedPlayer();

    // No move-speed source equipped → curve reads 0 → inert.
    const alone = effective(fixer, [], player, [fastFighterLike]);
    expect(alone.weapon.reloadSpeed).toBeCloseTo(base, 6);

    // Speed Demon's +20% move speed → +10% reload speed.
    const withSpeedDemon = effective(fixer, [], player, [fastFighterLike, speedDemonLike(0.2)]);
    expect(withSpeedDemon.weapon.reloadSpeed).toBeCloseTo(base + 0.1, 6);

    // A net move-speed PENALTY clamps at the curve's (0,0) endpoint — never
    // slows reload.
    const withPenalty = effective(fixer, [], player, [fastFighterLike, speedDemonLike(-0.4)]);
    expect(withPenalty.weapon.reloadSpeed).toBeCloseTo(base, 6);
  });

  it('Gun Runner moveSpeedBonus feeds Fast Fighter on ranged weapons only', () => {
    const fastFighter = getLoadoutModifiers('live', [{ perkId: PerkId.FastFighter, rank: 1 }]);
    const gunRunner = getLoadoutModifiers('live', [{ perkId: PerkId.GunRunner, rank: 2 }]);
    const player = makeResolvedPlayer();

    const ranged = effective(fixer, [], player, [...fastFighter, ...gunRunner]);
    expect(ranged.weapon.reloadSpeed).toBeCloseTo(base + 0.1, 6); // +20% move → +10% reload

    const melee = getWeapons('live')['DeathclawGauntlet'];
    const meleeBase = melee.reloadSpeed ?? 1.0;
    const onMelee = effective(melee, [], player, [...fastFighter, ...gunRunner]);
    expect(onMelee.weapon.reloadSpeed).toBeCloseTo(meleeBase, 6);
  });

  it('Wasteland Fish Sandwich (real consumable data) feeds Fast Fighter reload speed', () => {
    const mods = getBuffModifiers('live', [], ['SeasonalFish_Meal_SummerWastelandFishSandwich']);
    expect(mods).toEqual(
      expect.arrayContaining([expect.objectContaining({ bucket: 'moveSpeedBonus', value: 0.2 })]),
    );
    const fastFighter = getLoadoutModifiers('live', [{ perkId: PerkId.FastFighter, rank: 1 }]);
    const player = makeResolvedPlayer();
    const result = effective(fixer, [], player, [...fastFighter, ...mods]);
    expect(result.weapon.reloadSpeed).toBeCloseTo(base + 0.1, 6);
  });

  it('Emergency Protocols (real armor data) feeds Fast Fighter reload speed only below 20% HP in power armor', () => {
    const mods = getArmorEffectModifiers('live', {
      mod_PowerArmor_Excavator_Torso_Misc_Emergency: 1,
    });
    expect(mods).toEqual(
      expect.arrayContaining([expect.objectContaining({ bucket: 'moveSpeedBonus', value: 0.25 })]),
    );
    const fastFighter = getLoadoutModifiers('live', [{ perkId: PerkId.FastFighter, rank: 1 }]);

    // Full health, in power armor: gate fails on health, no reload-speed change.
    const healthyInPa = { ...makeResolvedPlayer(), isInPowerArmor: true };
    const atFullHealth = effective(fixer, [], healthyInPa, [...fastFighter, ...mods]);
    expect(atFullHealth.weapon.reloadSpeed).toBeCloseTo(base, 6);

    // Below 20% HP but NOT in power armor: gate fails on inPowerArmor.
    const lowHealthNoPa = { ...makeResolvedPlayer(), healthPercent: 15 };
    const outsidePa = effective(fixer, [], lowHealthNoPa, [...fastFighter, ...mods]);
    expect(outsidePa.weapon.reloadSpeed).toBeCloseTo(base, 6);

    // Below 20% HP AND in power armor: both gates pass — +25% move speed → +12.5% reload speed
    // (Fast Fighter's override is an identity curve × 0.5).
    const lowHealthInPa = {
      ...makeResolvedPlayer(),
      healthPercent: 15,
      isInPowerArmor: true,
    };
    const bothGates = effective(fixer, [], lowHealthInPa, [...fastFighter, ...mods]);
    expect(bothGates.weapon.reloadSpeed).toBeCloseTo(base + 0.125, 6);
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
      player: makeResolvedPlayer(),
    },
    {
      bucket: 'bulletStormMaxStacks' as const,
      input: 'bulletStormStacks' as const,
      modifiers: [add('bulletStormMaxStacks', 9)],
      expected: 9,
      scenarioValue: (result: ReturnType<typeof computeScenarios>) => result.bulletStormMaxStacks,
      player: makeResolvedPlayer(),
    },
    {
      bucket: 'bulletStormMinStacks' as const,
      input: 'bulletStormStacks' as const,
      modifiers: [add('bulletStormMaxStacks', 10, 'max-for-min'), add('bulletStormMinStacks', 4)],
      expected: 4,
      scenarioValue: (result: ReturnType<typeof computeScenarios>) => result.bulletStormMinStacks,
      player: { ...makeResolvedPlayer(), bulletStormStacks: 0 },
    },
  ])(
    '$bucket produces the same value in effective-weapon and scenarios',
    ({ input, modifiers, expected, scenarioValue, player }) => {
      const identicalModifiers = [...modifiers, observer(input)];
      const effectiveSite = effective(fixer, [], player, identicalModifiers);
      const effectiveSiteValue = effectiveSite.weapon.reloadSpeed! - (fixer.reloadSpeed ?? 1);
      const scenarios = computeScenarios(
        scenarioInput(fixer, { modifiers: identicalModifiers, player, critRate: 0 }),
      );

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
    return makeOmod({
      id,
      attachPointEdid: 'ap_gun_Receiver',
      modifiers: omodModifiers(
        { formId: '0x0', edid: id, name: `Test ${id}` },
        types.map((type) => ({
          bucket: 'baseDamage',
          op: 'MUL_ADD',
          value,
          conditions: [{ kind: 'damageTypeScope', types: [type] }],
        })),
      ),
    });
  }

  it('materializes an energy component on the ballistic-only Gauss Minigun with the real Tesla Coil Capacitor', () => {
    const { weapon, modifiers } = effective(gaussMinigun, [teslaCapacitor]);

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
    const { weapon, modifiers } = effective(gaussMinigun, [teslaCapacitor]);
    const result = computeScenarios(scenarioInput(weapon, { modifiers, critRate: 0 }));
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
    const { weapon, modifiers } = effective(fixer, [blanket]);

    // Every non-ballistic type saw ONLY a dropped negative — nothing materializes.
    expect(weapon.components.map((c) => c.damageType)).toEqual(['ballistic']);
    // Nothing was consumed: no type materialized, so all 6 baseDamage mods survive
    // (the 5 non-ballistic ones stay inert — no matching component to fold over).
    expect(modifiers.filter((m) => m.bucket === 'baseDamage')).toHaveLength(6);
  });

  it('negative MULs on a missing type are dropped, not netted: Tesla + a synthetic −0.3 energy blanket still materializes scale 0.5', () => {
    const energyBlanket = blanketBaseDamageOmod('test_energy_blanket', ['energy'], -0.3);
    const { weapon } = effective(gaussMinigun, [teslaCapacitor, energyBlanket]);

    const energy = weapon.components.find((c) => c.damageType === 'energy');
    expect(energy).toBeDefined();
    // NOT 0.5 − 0.3 = 0.2 — the negative multiplies energy's own zero base
    // and contributes nothing, dropped per-modifier.
    expect(energy!.scale).toBeCloseTo(0.5, 10);
  });

  it('a synthetic SET 0 + ADD 5 materializes a flat-only component (no MUL_ADD present)', () => {
    const flatConversionLike = makeOmod({
      id: 'test_flat_conversion',
      attachPointEdid: 'ap_melee_MeleeMod',
      modifiers: omodModifiers(
        { formId: '0x0', edid: 'test_flat_conversion', name: 'Test Flat Conversion Mod' },
        [
          {
            bucket: 'baseDamage',
            op: 'SET',
            value: 0,
            conditions: [{ kind: 'damageTypeScope' as const, types: ['energy' as const] }],
          },
          {
            bucket: 'baseDamage',
            op: 'ADD',
            value: 5,
            conditions: [{ kind: 'damageTypeScope' as const, types: ['energy' as const] }],
          },
        ],
      ),
    });
    const { weapon } = effective(fixer, [flatConversionLike]);

    const energy = weapon.components.find((c) => c.damageType === 'energy');
    expect(energy).toBeDefined();
    expect(energy!.scale).toBeCloseTo(0, 10);
    expect(energy!.flatBonus).toBeCloseTo(5, 10);
  });
});

describe('dotDamage-only foreign damage types (issue #83)', () => {
  // Commie Whacker: ballistic-only melee weapon (single component) that
  // hosts the Camden Whacker unique identity OMODs on its ap_customName slot
  // (the standalone CamdenWhackerWeapon WEAP is a true obtainability
  // negative — see weapon-corrections.ts's forceVisibleWeaponIds comment;
  // this base weapon is the real obtainable host). Its "(Rad)" variant
  // grants a flat 35 dmg/2s radiation dotDamage enchantment with no matching
  // baseDamage property — before the fix, computeDotDps's componentTypes
  // scan (paper-damage.ts) never saw 'radiation' on the weapon and this
  // OMOD's DoT silently folded to 0.
  const commieWhacker = getWeapons('live')['DLC04_CommieWhacker'];
  const radMod = getOmodById('live', 'mod_Custom_CamdenWhacker_RAD')!;

  it('materializes a zero base-damage radiation component alongside the real ballistic one', () => {
    const { weapon } = effective(commieWhacker, [radMod]);
    expect(weapon.components.map((c) => c.damageType)).toEqual(['ballistic', 'radiation']);
    const radiation = weapon.components.find((c) => c.damageType === 'radiation')!;
    expect(radiation.scale).toBe(0);
    expect(radiation.flatBonus).toBe(0);
  });

  it('computeDotDps folds the OMOD-granted radiation DoT to nonzero after the effective-weapon pass', () => {
    const { weapon, modifiers } = effective(commieWhacker, [radMod]);
    const ctx = makeCtx(weapon);
    // Before the fix this was 0 — the DoT's damageTypeScope(['radiation'])
    // condition never matched any componentType the weapon carried.
    expect(computeDotDps(modifiers, weapon, ctx)).toBeCloseTo(35, 10);
  });

  it('leaves per-hit damage unchanged: no phantom radiation row, ballistic total untouched', () => {
    const stock = computeScenarios(scenarioInput(commieWhacker, { critRate: 0 }));
    const { weapon, modifiers } = effective(commieWhacker, [radMod]);
    const modded = computeScenarios(scenarioInput(weapon, { modifiers, critRate: 0 }));

    // The materialized radiation component gets its own per-hit row (same
    // as any other component), but contributes exactly 0 damage — the
    // weapon's own ballistic hit is byte-for-byte unchanged.
    expect(modded.freeAim.perHit.components).toHaveLength(2);
    const [ballistic, radiation] = modded.freeAim.perHit.components;
    expect(ballistic.damageType).toBe('ballistic');
    expect(radiation.damageType).toBe('radiation');
    expect(radiation.base).toBe(0);
    expect(radiation.damage).toBe(0);
    expect(ballistic.damage).toBeCloseTo(stock.freeAim.perHit.components[0].damage, 10);
    expect(modded.freeAim.perHit.total).toBeCloseTo(stock.freeAim.perHit.total, 6);
  });
});

describe('explosionRadiusBonus → dbm conversion (Bunker Buster, Grenadier)', () => {
  function makeDualComponentWeapon() {
    return makeHeavyLauncher(FLAT_10, { id: 'test_launcher_bunker_buster', name: 'Test Launcher' });
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

  const bunkerBusterOmod = makeOmod({
    id: 'mod_Custom_BunkerBuster',
    formId: '0xBUNKER',
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
  });

  const grenadierBonus = {
    id: '0xGREN:0',
    source: perkSource,
    bucket: 'explosionRadiusBonus' as const,
    op: 'ADD' as const,
    value: 0.5,
    conditions: [],
  };

  it('synthesizes an explosive-scoped dbm ADD when both buckets are present and nonzero', () => {
    const { modifiers } = effective(
      makeDualComponentWeapon(),
      [bunkerBusterOmod],
      makeResolvedPlayer(),
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
    const { modifiers } = effective(makeDualComponentWeapon(), [], makeResolvedPlayer(), [
      grenadierBonus,
    ]);
    expect(modifiers.some((m) => m.bucket === 'dbm')).toBe(false);
    expect(modifiers.some((m) => m.bucket === 'explosionRadiusBonus')).toBe(false);
  });

  it('does not synthesize dbm when only explosionRadiusToDamage is present', () => {
    const { modifiers } = effective(makeDualComponentWeapon(), [bunkerBusterOmod]);
    expect(modifiers.some((m) => m.bucket === 'dbm')).toBe(false);
    expect(modifiers.some((m) => m.bucket === 'explosionRadiusToDamage')).toBe(false);
  });
});

describe('explosionChase — REPLACE vs ADD decided per weapon, docs/assumptions.md "OMOD-chased launcher payloads" (redesigned 2026-07-30)', () => {
  /** A synthetic launcher-shaped weapon: ballistic impact + its own baseline fromExplosion component. */
  function makeLauncherWeapon() {
    return makeHeavyLauncher(FLAT_100, { id: 'test_launcher', name: 'Test Launcher' });
  }

  /** A synthetic barrel OMOD carrying an explosionChase, no ordinary modifiers (mirrors the real Cryo Payload shape). */
  function makeSwapOmod(baseWeaponDamageMult = 0) {
    return makeOmod({
      id: 'test_cryo_barrel',
      attachPointEdid: 'ap_gun_Barrel',
      explosionChase: {
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
    });
  }

  it('replaces the baseline fromExplosion component with the swap — not both', () => {
    const { weapon } = effective(makeLauncherWeapon(), [makeSwapOmod()]);

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

  it('clears explosionBaseWeaponDamageMult when a chase applies (curve/typed damage supersedes the mult — never copied from the chase)', () => {
    const { weapon } = effective(makeLauncherWeapon(), [makeSwapOmod(0.2)]);
    expect(weapon.explosionBaseWeaponDamageMult).toBe(0);
  });

  it('ADDS the chase (not a no-op) on a weapon with no baseline fromExplosion component at all — redesigned 2026-07-30, replaces "explosionAdd"', () => {
    const { weapon } = effective(makeWeapon(), [makeSwapOmod()]);
    expect(weapon.components.map((c) => c.damageType)).toEqual(['ballistic', 'cryo']);
    expect(weapon.components[1]).toMatchObject({ damageType: 'cryo', fromExplosion: true });
  });

  it('only the LAST equipped omod carrying a swap wins', () => {
    const first = makeSwapOmod();
    const second = {
      ...makeSwapOmod(),
      id: 'test_plasma_barrel',
      explosionChase: {
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
    const { weapon } = effective(makeLauncherWeapon(), [first, second]);
    expect(weapon.components.map((c) => c.damageType)).toEqual(['ballistic', 'energy']);
  });
});

describe('Explosive 2★ dual behavior (explosivePayload branch, docs/assumptions.md "Launcher explosion damage" § "Explosive 2★ dual behavior", user-measured 2026-07-30)', () => {
  /** Plain weapon: single ballistic component, no explosion of any kind. */
  function makePlainWeapon() {
    return makeWeapon({ id: 'test_plain_rifle' });
  }

  /** Projectile-Scaling Explosion: Gauss-shape, real direct component + explosionBaseWeaponDamageMult, no fromExplosion component. */
  function makeProjectileScalingWeapon() {
    return makeWeapon({ id: 'test_gauss', explosionBaseWeaponDamageMult: 0.15 });
  }

  /** Curve-Table Explosion, Missile-Launcher shape: real direct component + a fromExplosion component. */
  function makeCurveExplosionWeapon() {
    return makeHeavyLauncher(FLAT_10, {
      id: 'test_missile_launcher',
      name: 'Test Missile Launcher',
    });
  }

  /** Curve-Table Explosion, Gamma-Gun shape: NO direct component — the explosion is the weapon's only damage. */
  function makeNoDirectExplosionWeapon() {
    return makeWeapon({
      id: 'test_gamma_gun',
      name: 'Test Gamma Gun',
      components: [
        {
          damageType: 'radiation',
          tier: -1,
          levelCap: 50,
          curvePoints: FLAT_100,
          fromExplosion: true,
        },
        {
          damageType: 'energy',
          tier: -1,
          levelCap: 50,
          curvePoints: FLAT_100,
          fromExplosion: true,
        },
      ],
      damageType: 'radiation',
      weaponClass: 'heavy',
    });
  }

  it('Projectile-Scaling Explosion: explosivePayload passes through untouched (paper-damage.ts folds it as the twin base)', () => {
    const { modifiers } = effective(makeProjectileScalingWeapon(), [makeExplosiveOmod()]);
    expect(modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'explosivePayload', value: 0.2 }),
    );
    expect(modifiers.some((m) => m.bucket === 'baseDamage')).toBe(false);
  });

  it('plain weapon (no explosion at all): explosivePayload also passes through untouched', () => {
    const { modifiers } = effective(makePlainWeapon(), [makeExplosiveOmod()]);
    expect(modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'explosivePayload', value: 0.2 }),
    );
  });

  it('Curve-Table Explosion: rewrites explosivePayload into an explosive-scoped baseDamage MUL_ADD, strips explosivePayload', () => {
    const { modifiers } = effective(makeCurveExplosionWeapon(), [makeExplosiveOmod()]);
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
    const { modifiers } = effective(makeNoDirectExplosionWeapon(), [makeExplosiveOmod()]);
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
    expect(modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'baseDamage', op: 'MUL_ADD', value: 0.2 }),
    );
  });

  it('Curve-Table Explosion with no legendary equipped: no baseDamage synthesized, nothing to strip', () => {
    const { modifiers } = effective(makeCurveExplosionWeapon());
    expect(modifiers.some((m) => m.bucket === 'baseDamage')).toBe(false);
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
  });

  it('branch is chosen POST-chase: an explosionChase applied to a Curve-Table-Explosion weapon still keys off the effective components', () => {
    // A chase on a weapon that already has a baseline fromExplosion
    // component REPLACES it (see the explosionChase describe block above) —
    // so it doesn't change which branch a launcher takes, only WHICH curve.
    // Confirm the rewrite still fires on a swapped-in explosion.
    const swapOmod = makeOmod({
      id: 'test_barrel',
      attachPointEdid: 'ap_gun_Barrel',
      explosionChase: {
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
    });
    const { modifiers } = effective(makeCurveExplosionWeapon(), [swapOmod, makeExplosiveOmod()]);
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
    expect(modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'baseDamage', op: 'MUL_ADD', value: 0.2 }),
    );
  });

  it('chain-suppressed (Tesla + AC muzzle shape): clears explosionBaseWeaponDamageMult AND strips explosivePayload — no fallback twin', () => {
    const { weapon, modifiers } = effective(makeProjectileScalingWeapon(), [
      makeChainOmod(),
      makeExplosiveOmod(),
    ]);
    expect(weapon.explosionBaseWeaponDamageMult).toBe(0);
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
    expect(modifiers.some((m) => m.bucket === 'baseDamage')).toBe(false);
  });

  it('chain-suppressed with no legendary equipped: still clears explosionBaseWeaponDamageMult', () => {
    const { weapon } = effective(makeProjectileScalingWeapon(), [makeChainOmod()]);
    expect(weapon.explosionBaseWeaponDamageMult).toBe(0);
  });
});

describe('stream-delivery suppression (Cryolator/Flamer defaults, Plasma thrower-barrel OMODs — USER-CONFIRMED 2026-08-15, not ESM-provable)', () => {
  function makeNamedWeapon(id: string, explosionBaseWeaponDamageMult?: number) {
    return makeWeapon({
      id,
      name: id,
      ...(explosionBaseWeaponDamageMult !== undefined ? { explosionBaseWeaponDamageMult } : {}),
    });
  }

  it('Cryolator (weapon-level default): strips explosivePayload and clears explosionBaseWeaponDamageMult even when the base weapon carries one', () => {
    const { weapon, modifiers } = effective(makeNamedWeapon('Cryolator', 0.15), [
      makeExplosiveOmod(),
    ]);
    expect(weapon.explosionBaseWeaponDamageMult).toBe(0);
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
    expect(modifiers.some((m) => m.bucket === 'baseDamage')).toBe(false);
  });

  it('Flamer (weapon-level default): same suppression', () => {
    const { modifiers } = effective(makeNamedWeapon('Flamer'), [makeExplosiveOmod()]);
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
  });

  it('Cryolator with a real explosive-conversion barrel (explosionChase) equipped: suppression lifts, matching "the calculus changes if an explosive-capable barrel is added"', () => {
    const polarLobberBarrel = makeOmod({
      id: 'mod_Cryolator_Barrel_PolarLobber',
      attachPointEdid: 'ap_gun_Barrel',
      explosionChase: {
        explEdid: 'TestPolarLobberExplosion',
        baseWeaponDamageMult: 0,
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
    });
    const { weapon, modifiers } = effective(makeNamedWeapon('Cryolator'), [
      polarLobberBarrel,
      makeExplosiveOmod(),
    ]);
    expect(weapon.components.some((c) => c.damageType === 'cryo' && c.fromExplosion)).toBe(true);
    // Curve-Table Explosion branch now applies: rewritten into baseDamage, not stripped outright.
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
    expect(modifiers).toContainEqual(expect.objectContaining({ bucket: 'baseDamage', value: 0.2 }));
  });

  it('Plasma Gun with a Thrower Barrel equipped: suppressed even though the weapon itself is not in the default-stream list', () => {
    const throwerBarrel = makeOmod({
      id: 'mod_PlasmaGun_barrel_Flamer_Base',
      attachPointEdid: 'ap_gun_Barrel',
    });
    const { modifiers } = effective(makeNamedWeapon('PlasmaGun'), [
      throwerBarrel,
      makeExplosiveOmod(),
    ]);
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
  });

  it('Plasma Gun WITHOUT a Thrower Barrel: explosivePayload passes through untouched', () => {
    const { modifiers } = effective(makeNamedWeapon('PlasmaGun'), [makeExplosiveOmod()]);
    expect(modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'explosivePayload', value: 0.2 }),
    );
  });
});

describe('explosionChase ADDs to a weapon with no baseline explosion, docs/assumptions.md "OMOD-chased launcher payloads" (2026-07-30)', () => {
  function makePlainBow() {
    return makeWeapon({ id: 'test_bow', name: 'Test Bow', weaponClass: 'bow' });
  }

  function makeExplosiveArrowsOmod() {
    return makeOmod({
      id: 'mod_RegularBow_Bolt_Explosive',
      attachPointEdid: 'ap_gun_Bolt',
      explosionChase: {
        explEdid: 'ExplosionArrowExplosive',
        baseWeaponDamageMult: 0,
        components: [
          {
            damageType: 'explosive' as const,
            damageTypeEdid: null,
            amount: 15,
            tier: 24,
            curve: [
              { x: 1, y: 31 },
              { x: 50, y: 103 },
            ],
            fromExplosion: true,
          },
        ],
      },
    });
  }

  it('ADDS a fromExplosion component to a weapon with no baseline explosion at all', () => {
    const { weapon } = effective(makePlainBow(), [makeExplosiveArrowsOmod()]);
    expect(weapon.components.map((c) => c.damageType)).toEqual(['ballistic', 'explosive']);
    const [ballistic, explosive] = weapon.components;
    expect(ballistic.fromExplosion).toBeUndefined();
    expect(explosive).toMatchObject({
      damageType: 'explosive',
      tier: 24,
      levelCap: 50,
      fromExplosion: true,
      curvePoints: [
        { x: 1, y: 31 },
        { x: 50, y: 103 },
      ],
    });
  });

  it('the added component makes the weapon a Curve-Table Explosion for the Explosive 2★ branch', () => {
    const { modifiers } = effective(makePlainBow(), [
      makeExplosiveArrowsOmod(),
      makeExplosiveOmod(),
    ]);
    expect(modifiers.some((m) => m.bucket === 'explosivePayload')).toBe(false);
    expect(modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'baseDamage', op: 'MUL_ADD', value: 0.2 }),
    );
  });
});

describe('procChase → Weapon.procs (issue #42, PROC_DAMAGE_PLAN.md commit 6)', () => {
  function makePlainWeapon() {
    return makeWeapon({ id: 'test_proc_weapon', name: 'Test Proc Weapon' });
  }

  /** Mirrors Fracturer's real procChase shape: onCripple, one curve-bearing explosive component. */
  function makeFracturersOmod(formId = '0xFRACTURER', id = 'mod_Legendary_Weapon4_Fracturers') {
    return makeOmod({
      id,
      formId,
      attachPointEdid: 'ap_Legendary4',
      procChase: [
        {
          trigger: 'onCripple' as const,
          cooldownSec: 3,
          components: [
            {
              damageType: 'explosive' as const,
              damageTypeEdid: null,
              amount: 150,
              tier: null,
              curve: [
                { x: 1, y: 22 },
                { x: 50, y: 50 },
              ],
            },
          ],
        },
      ],
    });
  }

  /** Mirrors Circuit Breaker's real shape: identical procChase content on two different formids/ids. */
  function makeCircuitBreakerOmod(formId: string, id: string, attachPointEdid: string) {
    return makeOmod({
      id,
      formId,
      attachPointEdid,
      procChase: [
        {
          trigger: 'lastRound' as const,
          components: [
            {
              damageType: 'energy' as const,
              damageTypeEdid: 'EnergyResist',
              amount: 31,
              tier: null,
              curve: [
                { x: 1, y: 31 },
                { x: 50, y: 103 },
              ],
              isAoe: false,
            },
          ],
        },
      ],
    });
  }

  it('folds a single equipped procChase into Weapon.procs, mapping trigger/cooldown/curve', () => {
    const { weapon } = effective(makePlainWeapon(), [makeFracturersOmod()]);
    expect(weapon.procs).toHaveLength(1);
    const [proc] = weapon.procs!;
    expect(proc.id).toBe('0xFRACTURER:proc:0');
    expect(proc.source).toMatchObject({ kind: 'omod', formId: '0xFRACTURER' });
    expect(proc.trigger).toEqual({ kind: 'onCripple', cooldownSec: 3 });
    expect(proc.conditions).toEqual([]);
    expect(proc.components).toEqual([
      {
        damageType: 'explosive',
        curve: {
          input: 'itemLevel',
          points: [
            { x: 1, y: 22 },
            { x: 50, y: 50 },
          ],
        },
        value: undefined,
        isAoe: undefined,
      },
    ]);
  });

  it('a flat-amount component (no curve) becomes a plain `value`, not a curve', () => {
    const flatOmod = {
      ...makeFracturersOmod(),
      procChase: [
        {
          trigger: 'reloadCycle' as const,
          components: [
            {
              damageType: 'fire' as const,
              damageTypeEdid: null,
              amount: 12,
              tier: null,
              curve: null,
            },
          ],
        },
      ],
    };
    const { weapon } = effective(makePlainWeapon(), [flatOmod]);
    expect(weapon.procs![0].components[0]).toMatchObject({
      damageType: 'fire',
      value: 12,
      curve: undefined,
    });
  });

  it('collects procs from MULTIPLE distinct equipped omods (not last-wins like explosionChase)', () => {
    const { weapon } = effective(makePlainWeapon(), [
      makeFracturersOmod(),
      makeCircuitBreakerOmod('0xCB_IDENTITY', 'mod_Custom_CircuitBreaker', 'ap_customName'),
    ]);
    expect(weapon.procs).toHaveLength(2);
    expect(weapon.procs!.map((p) => p.trigger.kind).sort()).toEqual(['lastRound', 'onCripple']);
  });

  it('dedupes byte-identical procChase content across two different equipped omods — the real Circuit Breaker identity/effect-mod shape', () => {
    const { weapon } = effective(makePlainWeapon(), [
      makeCircuitBreakerOmod('0x006DC8DD', 'mod_Custom_CircuitBreaker', 'ap_customName'),
      makeCircuitBreakerOmod('0x006EBCD5', 'mod_Custom_CircuitBreaker_Effect', 'ap_Legendary3'),
    ]);
    // Both omods carry the SAME procChase content (byte-identical trigger +
    // components) — only one ProcSource should survive, not two (would
    // double-count Circuit Breaker's discharge damage).
    expect(weapon.procs).toHaveLength(1);
    expect(weapon.procs![0].source.formId).toBe('0x006DC8DD');
  });

  it('a weapon with no procChase-carrying omods gets no procs field at all', () => {
    const { weapon } = effective(makePlainWeapon());
    expect(weapon.procs).toBeUndefined();
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

    const chargingBarrelLike = makeOmod({
      id: 'test_charging_barrel',
      attachPointEdid: 'ap_gun_Barrel',
      modifiers: omodModifiers(
        { formId: '0x0', edid: 'test_charging_barrel', name: 'Test Charging Barrel' },
        [{ bucket: 'chargeFullPowerSec', op: 'SET', value: 1.0 }],
      ),
    });
    const { weapon } = effective(teslaLikeBase, [chargingBarrelLike]);
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
    const { weapon } = effective(huntingRifle, [longBarrel]);
    expect(weapon.minRange).toBeCloseTo(2612 * 1.5, 6);
    expect(weapon.maxRange).toBeCloseTo(5225 * 1.5, 6);
    expect(weapon.outOfRangeDamageMult).toBeCloseTo(0.5, 6); // untouched — no weaponOutOfRangeMult modifier on this OMOD
  });

  it('the Abraxo Barrel SETs weaponOutOfRangeMult to 0.7 (the one OMOD in the dump that touches it)', () => {
    const plasmaGun = getWeapons('live')['PlasmaGun'];
    expect(plasmaGun.outOfRangeDamageMult).toBe(0.5);

    const abraxoBarrel = getOmodById('live', 'mod_PlasmaGun_barrel_Flamer_Abraxo')!;
    const { weapon } = effective(plasmaGun, [abraxoBarrel]);
    expect(weapon.outOfRangeDamageMult).toBeCloseTo(0.7, 6);
  });

  it("an equipped OMOD with no range buckets leaves the base weapon's range fields untouched", () => {
    // Forces the non-early-return fold path (a real equipped OMOD) while
    // exercising a bucket unrelated to range — the base ?? fallback in the
    // weaponMinRange/weaponMaxRange/weaponOutOfRangeMult folds should be a
    // no-op when nothing targets those buckets.
    const huntingRifle = getWeapons('live')['HuntingRifle'];
    const unrelatedMod = getOmodById('live', 'mod_HuntingRifle_Barrel_Short_Recoil')!; // real equipped OMOD, zero modifiers of its own
    const { weapon } = effective(huntingRifle, [unrelatedMod]);
    expect(weapon.minRange).toBe(2612);
    expect(weapon.maxRange).toBe(5225);
    expect(weapon.outOfRangeDamageMult).toBe(0.5);
  });

  it('Long Shot range MUL_ADD applies only when the weapon carries a scope keyword', () => {
    const huntingRifle = getWeapons('live')['HuntingRifle'];
    const scopedMod = makeOmod({
      id: 'test_scope',
      attachPointEdid: 'ap_gun_Sights',
      modifiers: [
        {
          id: 'test_scope:0',
          source: {
            kind: 'omod' as const,
            formId: '0x0',
            edid: 'test_scope',
            name: 'Scoped test',
          },
          bucket: 'weaponMinRange' as const,
          op: 'MUL_ADD' as const,
          value: 0.3,
          conditions: [
            { kind: 'aimingDownSights' as const, value: true },
            { kind: 'weaponKeywordAny' as const, keywords: ['HasScope', 'HasScopeRecon'] },
          ],
        },
      ],
      addedKeywords: ['HasScope'],
      obtainable: true,
      notes: [],
    });
    const { weapon } = effective(
      huntingRifle,
      [scopedMod],
      makeResolvedPlayer({ isAimingDownSights: true }),
    );
    expect(weapon.minRange).toBeCloseTo(2612 * 1.3, 6);

    const { weapon: ironSightsOnly } = effective(
      huntingRifle,
      [
        {
          ...scopedMod,
          addedKeywords: [],
          modifiers: scopedMod.modifiers.map((m) => ({ ...m })),
        },
      ],
      makeResolvedPlayer({ isAimingDownSights: true }),
    );
    expect(ironSightsOnly.minRange).toBe(2612);
  });
});

describe('sustain chance buckets (foldChanceUnion)', () => {
  const fixer = getWeapons('live')['CombatRifle_Fixer'];
  const baseCapacity = fixer.capacity ?? 0;
  const sustainSource = { formId: '0x0', edid: 'test_sustain', name: 'Test Sustain Mod' };
  const perkSource = { kind: 'perk' as const, formId: '0x1', edid: 'test_perk', name: 'Test Perk' };

  it('lastShotChance folds a single modifier to its value', () => {
    const lastShotOmod = makeOmod({
      id: 'test_last_shot',
      modifiers: omodModifiers(sustainSource, [
        { bucket: 'lastShotChance', op: 'ADD', value: 0.25 },
      ]),
    });
    const { weapon } = effective(fixer, [lastShotOmod]);
    expect(weapon.lastShotChance).toBeCloseTo(0.25, 10);
  });

  const unionRows: Array<{
    name: string;
    bucket: 'lastShotChance' | 'reloadSkipChance' | 'reloadSkipChanceBash';
    c1: number;
    c2: number;
    zeroChannel?: 'reloadSkipChance';
  }> = [
    {
      name: 'two lastShotChance sources compose as 1 − (1 − c1)(1 − c2), same union as reloadSkipChance',
      bucket: 'lastShotChance',
      c1: 0.25,
      c2: 0.25,
    },
    {
      name: 'two reload-skip sources compose as 1 − (1 − c1)(1 − c2)',
      bucket: 'reloadSkipChance',
      c1: 0.06,
      c2: 0.12,
    },
    {
      name: 'two reloadSkipChanceBash sources compose as 1 − (1 − c1)(1 − c2), same union as reloadSkipChance',
      bucket: 'reloadSkipChanceBash',
      c1: 0.15,
      c2: 0.3,
      // Folded from a DISJOINT source list, so the passive channel reads 0 — no
      // cross-channel bleed.
      zeroChannel: 'reloadSkipChance',
    },
  ];

  for (const row of unionRows) {
    it(row.name, () => {
      const omod = makeOmod({
        id: `test_${row.bucket}_union`,
        modifiers: omodModifiers(
          sustainSource,
          [row.c1, row.c2].map((value) => ({ bucket: row.bucket, op: 'ADD', value })),
        ),
      });
      const { weapon } = effective(fixer, [omod]);
      expect(weapon[row.bucket]).toBeCloseTo(1 - (1 - row.c1) * (1 - row.c2), 10);
      if (row.zeroChannel) expect(weapon[row.zeroChannel]).toBeCloseTo(0, 10);
    });
  }

  it('lastShotChance reads 0 when the fold runs but no lastShotChance modifier is present', () => {
    const reloadSkipOnly = makeOmod({
      id: 'test_reload_skip_only',
      modifiers: omodModifiers(sustainSource, [
        { bucket: 'reloadSkipChance', op: 'ADD', value: 0.2 },
      ]),
    });
    const { weapon } = effective(fixer, [reloadSkipOnly]);
    expect(weapon.lastShotChance).toBeCloseTo(0, 10);
  });

  it('ammoFreeChance stacks with Quad multiplicatively, not additively', () => {
    const quadLike = makeOmod({
      id: 'test_quad',
      attachPointEdid: 'ap_Legendary1',
      hasEnchantments: true,
      modifiers: omodModifiers(sustainSource, [
        { bucket: 'ammoCapacity', op: 'MUL_ADD', value: 3.0 },
      ]),
    });
    const fortunateLike = makeOmod({
      id: 'test_fortunate',
      formId: '0x1',
      attachPointEdid: 'ap_gun_Magazine',
      modifiers: omodModifiers({ ...sustainSource, formId: '0x1' }, [
        { bucket: 'ammoFreeChance', op: 'ADD', value: 0.2 },
      ]),
    });
    const quadOnly = effective(fixer, [quadLike]);
    const both = effective(fixer, [quadLike, fortunateLike]);

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
    const splitChannels = makeOmod({
      id: 'test_reload_skip_split',
      modifiers: omodModifiers(sustainSource, [
        { bucket: 'reloadSkipChance', op: 'ADD', value: cFree },
        { bucket: 'reloadSkipChanceBash', op: 'ADD', value: cBash },
      ]),
    });
    const { weapon } = effective(fixer, [splitChannels]);
    expect(weapon.reloadSkipChance).toBeCloseTo(cFree, 10);
    expect(weapon.reloadSkipChanceBash).toBeCloseTo(cBash, 10);
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
    const asHuman = effective(fixer, [], makeResolvedPlayer(), [ghoulReloadSkip]);
    expect(asHuman.weapon.reloadSkipChance).toBeCloseTo(0, 10);

    const asGhoul = effective(fixer, [], { ...makeResolvedPlayer(), isGhoul: true }, [
      ghoulReloadSkip,
    ]);
    expect(asGhoul.weapon.reloadSkipChance).toBeCloseTo(0.36, 10);
  });
});
