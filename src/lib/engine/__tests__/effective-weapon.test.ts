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
    // Cosmetic and legendary slots are hidden from the standard picker.
    expect(slots.some(s => /legendary|customName|Appearance|Description/i.test(s.slot))).toBe(false);
  });

  it('unique-effect mods on cosmetic slots surface only on their own weapons', () => {
    // Perfect Storm's payload rides ap_customName and is listed in the 10mm
    // SMG's templateModFormIds — offered there, never on the Fixer.
    const smgSlots = getOmodSlots('live', getWeapons('live')['10mmSMG']);
    const customSlot = smgSlots.find(s => s.slot === 'ap_customName');
    expect(customSlot?.options.some(o => o.id === 'mod_Custom_PerfectStorm')).toBe(true);

    // The V.A.T.S. Unknown crit-perk variants: badge-rescued + restricted to
    // the unique alien blaster (weaponCorrections adds its missing slot).
    const vatsUnknown = getWeapons('live')['W05_COMP_Astronaut_AlienBlaster_QuestReward'];
    const vatsSlots = getOmodSlots('live', vatsUnknown);
    const vatsCustom = vatsSlots.find(s => s.slot === 'ap_customName');
    expect(vatsCustom?.options.map(o => o.id)).toContain('mod_Custom_TheVATSUnknown_BetterCriticals');
    expect(vatsCustom?.options.filter(o => o.id.startsWith('mod_Custom_TheVATSUnknown_'))).toHaveLength(5);
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
