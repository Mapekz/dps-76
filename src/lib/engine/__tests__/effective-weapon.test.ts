import { describe, it, expect } from 'vitest';
import { getWeapons } from '@/data';
import { getOmodById, getOmodSlots } from '@/data/omods';
import { buildEffectiveWeapon } from '@/lib/engine/effective-weapon';
import { computeScenarios } from '@/lib/engine/scenarios';
import { createDefaultEnemyConditions, createDefaultPlayerConditions } from '@/types';

// Phase 5 milestone: Powerful Automatic Receiver on The Fixer gives
// +0.25 dbm, SET Speed 0.8248, automatic fire, and MUL_ADD −20% crit/sneak base.

describe('buildEffectiveWeapon with real OMOD data', () => {
  const fixer = getWeapons('live')['CombatRifle_Fixer'];
  const receiver = getOmodById('live', 'mod_CombatRifle_Receiver_Damage-Auto')!;

  it('the receiver is offered in the Fixer receiver slot', () => {
    const slots = getOmodSlots('live', fixer);
    const receiverSlot = slots.find(s => s.slot === 'ap_gun_Receiver');
    expect(receiverSlot?.options.some(o => o.id === receiver.id)).toBe(true);
    // Cosmetic and legendary slots are hidden from the standard picker — except
    // ap_customName, which now surfaces the Fixer's own identity unique mod.
    expect(slots.some(s => /legendary|Appearance|Description/i.test(s.slot))).toBe(false);

    const uniqueSlot = slots.find(s => s.slot === 'ap_customName');
    expect(uniqueSlot?.label).toBe('Unique');
    expect(uniqueSlot?.options.map(o => o.id)).toEqual(['P01B_mod_Custom_Fixer']);
  });

  it('unique-effect mods on cosmetic slots surface only on their own weapons', () => {
    // Perfect Storm's payload rides ap_customName and is listed in the 10mm
    // SMG's templateModFormIds — offered there, never on the Fixer.
    const smgSlots = getOmodSlots('live', getWeapons('live')['10mmSMG']);
    const customSlot = smgSlots.find(s => s.slot === 'ap_customName');
    expect(customSlot?.options.some(o => o.id === 'mod_Custom_PerfectStorm')).toBe(true);

    // The V.A.T.S. Unknown crit-perk variants: badge-rescued + restricted to
    // the unique alien blaster. Re-homed 2026-07-13 (unique-weapons rework)
    // from the now-hidden legacy W05_COMP_Astronaut_AlienBlaster_QuestReward
    // WEAP to base 'AlienBlaster', which already lists ap_customName in its
    // own attachParentSlots.
    const vatsUnknown = getWeapons('live')['AlienBlaster'];
    const vatsSlots = getOmodSlots('live', vatsUnknown);
    const vatsCustom = vatsSlots.find(s => s.slot === 'ap_customName');
    expect(vatsCustom?.options.map(o => o.id)).toContain('mod_Custom_TheVATSUnknown_BetterCriticals');
    expect(vatsCustom?.options.filter(o => o.id.startsWith('mod_Custom_TheVATSUnknown_'))).toHaveLength(5);
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
          source: { kind: 'omod' as const, formId: '0x0', edid: 'test_mag', name: 'Test Drum Magazine' },
          bucket: 'ammoCapacity' as const,
          op: 'MUL_ADD' as const,
          value: 0.5,
          conditions: [],
        },
        {
          id: '0x0:1',
          source: { kind: 'omod' as const, formId: '0x0', edid: 'test_mag', name: 'Test Drum Magazine' },
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

  it('folds weapon-stat modifiers ONLY when their condition matches (synthetic, Stage C3 killStreakCount)', () => {
    // Thrill-Seeker's shape: 3 mutually-exclusive killStreakCount tiers on
    // reloadSpeed. Before Stage C3, foldWeaponStat ignored conditions
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
      modifiers: [1, 2, 3].map(n => ({
        id: `0x0:${n}`,
        source: { kind: 'omod' as const, formId: '0x0', edid: 'test_thrill_seeker', name: "Test Thrill-Seeker's" },
        bucket: 'reloadSpeed' as const,
        op: 'ADD' as const,
        value: 0.03 * n,
        conditions: [{ kind: 'killStreakCount' as const, count: n }],
      })),
    };
    const base = fixer.reloadSpeed ?? 1.0;

    const at0 = buildEffectiveWeapon(fixer, [thrillSeekerLike], 50, { ...createDefaultPlayerConditions(), adrenalineStacks: 0 });
    expect(at0.weapon.reloadSpeed).toBeCloseTo(base, 6); // no tier matches 0 stacks

    const at2 = buildEffectiveWeapon(fixer, [thrillSeekerLike], 50, { ...createDefaultPlayerConditions(), adrenalineStacks: 2 });
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
          source: { kind: 'omod' as const, formId: '0x0', edid: 'test_vats_optimized', name: 'Test V.A.T.S. Optimized' },
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

describe('materializeDamageTypeComponents (DamageTypeValues conversion, 2026-07-13)', () => {
  const fixer = getWeapons('live')['CombatRifle_Fixer']; // ballistic-only
  const gaussMinigun = getWeapons('live')['GaussMinigun']; // ballistic-only, base 53 @ level 50
  // Tesla Coil Capacitor: baseDamage MUL_ADD −0.2 ballistic-scoped, +0.5
  // energy-scoped — the +0.5 used to silently no-op with no energy component.
  const teslaCapacitor = getOmodById('live', 'mod_GaussMinigun_Tesla_Capacitor')!;

  /** A synthetic blanket "−30% on every damage type" barrel/receiver shape. */
  function blanketBaseDamageOmod(id: string, types: Array<'ballistic' | 'energy' | 'cryo' | 'fire' | 'poison' | 'radiation'>, value: number) {
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

    expect(weapon.components.map(c => c.damageType)).toEqual(['ballistic', 'energy']);
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
    const baseDamageMods = modifiers.filter(m => m.bucket === 'baseDamage');
    expect(baseDamageMods).toHaveLength(1);
    expect(baseDamageMods[0].conditions).toEqual([{ kind: 'damageTypeScope', types: ['ballistic'] }]);
  });

  it('feeds through the engine with no double count: ballistic 53×0.8, energy 53×0.5 (plus their intrinsic 15% explosive twins)', () => {
    const { weapon, modifiers } = buildEffectiveWeapon(gaussMinigun, [teslaCapacitor]);
    const base = {
      mode: 'live' as const, itemLevel: 50,
      player: createDefaultPlayerConditions(), enemy: createDefaultEnemyConditions(), weakpointMult: 2.0,
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
      -0.3
    );
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [blanket]);

    // Every non-ballistic type saw ONLY a dropped negative — nothing materializes.
    expect(weapon.components.map(c => c.damageType)).toEqual(['ballistic']);
    // Nothing was consumed: no type materialized, so all 6 baseDamage mods survive
    // (the 5 non-ballistic ones stay inert — no matching component to fold over).
    expect(modifiers.filter(m => m.bucket === 'baseDamage')).toHaveLength(6);
  });

  it('negative MULs on a missing type are dropped, not netted: Tesla + a synthetic −0.3 energy blanket still materializes scale 0.5', () => {
    const energyBlanket = blanketBaseDamageOmod('test_energy_blanket', ['energy'], -0.3);
    const { weapon } = buildEffectiveWeapon(gaussMinigun, [teslaCapacitor, energyBlanket]);

    const energy = weapon.components.find(c => c.damageType === 'energy');
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
          source: { kind: 'omod' as const, formId: '0x0', edid: 'test_flat_conversion', name: 'Test Flat Conversion Mod' },
          bucket: 'baseDamage' as const,
          op: 'SET' as const,
          value: 0,
          conditions: [{ kind: 'damageTypeScope' as const, types: ['energy' as const] }],
        },
        {
          id: '0x0:1',
          source: { kind: 'omod' as const, formId: '0x0', edid: 'test_flat_conversion', name: 'Test Flat Conversion Mod' },
          bucket: 'baseDamage' as const,
          op: 'ADD' as const,
          value: 5,
          conditions: [{ kind: 'damageTypeScope' as const, types: ['energy' as const] }],
        },
      ],
    };
    const { weapon } = buildEffectiveWeapon(fixer, [flatConversionLike]);

    const energy = weapon.components.find(c => c.damageType === 'energy');
    expect(energy).toBeDefined();
    expect(energy!.scale).toBeCloseTo(0, 10);
    expect(energy!.flatBonus).toBeCloseTo(5, 10);
  });
});
