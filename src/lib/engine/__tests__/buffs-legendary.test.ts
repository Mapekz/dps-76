import { describe, it, expect } from 'vitest';
import { getWeapons } from '@/data';
import { getBuffModifiers } from '@/data/buffs';
import { getOmodById } from '@/data/omods';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { PerkId } from '@/data/perk-ids';
import { buildEffectiveWeapon } from '@/lib/engine/effective-weapon';
import { computeScenarios, type ScenarioInput } from '@/lib/engine/scenarios';
import { createDefaultEnemyConditions, createDefaultPlayerConditions } from '@/types';

// Phase 7 milestone: legendary effects, mutations, and consumables move the
// numbers per wiki values (pending in-game golden validation).

const fixer = getWeapons('live')['CombatRifle_Fixer'];

function base(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    mode: 'live',
    weapon: fixer,
    itemLevel: 50,
    modifiers: [],
    player: createDefaultPlayerConditions(),
    enemy: createDefaultEnemyConditions(),
    weakpointMult: 2.0,
    critRate: 0,
    ...overrides,
  };
}

const stockTotal = computeScenarios(base()).manualAim.perHit.total;

describe('legendary weapon effects', () => {
  it('Bloodied follows its extracted ENCH curve: (5% HP → +130) … (100% HP → 0)', () => {
    const bloodied = getOmodById('live', 'mod_Legendary_Weapon1_DamageInverseHealth')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [bloodied]);
    // At 20% HP: linear between (0.05, 130) and (1.0, 0) → +109.47% dbm.
    const at20 = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), healthPercent: 20 } }));
    const expected = 130 * (1 - (0.2 - 0.05) / 0.95) * 0.01;
    expect(at20.manualAim.perHit.total / stockTotal).toBeCloseTo(1 + expected, 3);
  });

  it('Bloodied at full HP adds nothing; below the first curve point clamps to +130%', () => {
    const bloodied = getOmodById('live', 'mod_Legendary_Weapon1_DamageInverseHealth')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [bloodied]);
    const full = computeScenarios(base({ weapon, modifiers }));
    expect(full.manualAim.perHit.total).toBeCloseTo(stockTotal, 4);
    const dying = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), healthPercent: 1 } }));
    expect(dying.manualAim.perHit.total / stockTotal).toBeCloseTo(2.3, 3);
  });

  it('Instigating doubles damage only against full-health targets', () => {
    const instigating = getOmodById('live', 'mod_Legendary_Weapon1_DamageFirstBlood')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [instigating]);
    const vsHurt = computeScenarios(base({ weapon, modifiers }));
    expect(vsHurt.manualAim.perHit.total).toBeCloseTo(stockTotal, 6);
    const vsFull = computeScenarios(base({ weapon, modifiers, enemy: { ...createDefaultEnemyConditions(), isFullHealth: true } }));
    expect(vsFull.manualAim.perHit.total).toBeCloseTo(stockTotal * 2.0, 6);
  });

  it('legendary Adrenal follows its extracted curve: +10% per kill-streak stack, max 10', () => {
    const adrenal = getOmodById('live', 'mod_Legendary_Weapon1_Adrenal')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [adrenal]);
    const at5 = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), adredalineStacks: 5 } }));
    expect(at5.manualAim.perHit.total / stockTotal).toBeCloseTo(1.5, 4);
    const at10 = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), adredalineStacks: 10 } }));
    expect(at10.manualAim.perHit.total / stockTotal).toBeCloseTo(2.0, 4);
  });

  it('Adrenaline perk follows its extracted curve: +10%/kill-streak stack (distinct from mutation/legendary)', () => {
    const adrenaline = getLoadoutModifiers('live', [{ perkId: PerkId.Adrenaline, rank: 1 }]);
    const at10 = computeScenarios(base({ modifiers: adrenaline, player: { ...createDefaultPlayerConditions(), adredalineStacks: 10 } }));
    expect(at10.manualAim.perHit.total / stockTotal).toBeCloseTo(2.0, 4);
    const at0 = computeScenarios(base({ modifiers: adrenaline, player: { ...createDefaultPlayerConditions(), adredalineStacks: 0 } }));
    expect(at0.manualAim.perHit.total / stockTotal).toBeCloseTo(1.0, 6);
  });

  it("Junkie's follows its extracted curve: +10% per addiction", () => {
    const junkies = getOmodById('live', 'mod_Legendary_Weapon1_DamageAddiction')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [junkies]);
    const withAddictions = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), addictionCount: 3 } }));
    expect(withAddictions.manualAim.perHit.total / stockTotal).toBeCloseTo(1.3, 4);
  });
});

describe('mutations and consumables', () => {
  it('Psychobuff adds +25% dbm', () => {
    const mods = getBuffModifiers('live', [], ['Psychobuff']);
    const result = computeScenarios(base({ modifiers: mods }));
    // ESM stores float32 (0.2499999944…) — compare at 5 decimals.
    expect(result.manualAim.perHit.total).toBeCloseTo(stockTotal * 1.25, 5);
  });

  it('Adrenal Reaction (override from ESM curves) scales with kill streak: +5%/stack, ×1.25 with Strange in Numbers', () => {
    const mods = getBuffModifiers('live', ['Mutation_AdrenalReaction'], []);
    const player = { ...createDefaultPlayerConditions(), adredalineStacks: 10 };
    const solo = computeScenarios(base({ modifiers: mods, player }));
    expect(solo.manualAim.perHit.total).toBeCloseTo(stockTotal * 1.5, 6);

    const team = computeScenarios(base({ modifiers: mods, player: { ...player, strangeInNumbers: true } }));
    expect(team.manualAim.perHit.total).toBeCloseTo(stockTotal * 1.625, 6);
  });

  it('Nerd Rage follows its extracted curve: +80% damage at 5% HP, 0 at full HP', () => {
    const nerdRage = getLoadoutModifiers('live', [{ perkId: PerkId.NerdRage, rank: 1 }]);
    const at5 = computeScenarios(base({ modifiers: nerdRage, player: { ...createDefaultPlayerConditions(), healthPercent: 5 } }));
    expect(at5.manualAim.perHit.total / stockTotal).toBeCloseTo(1.8, 4);
    const atFull = computeScenarios(base({ modifiers: nerdRage }));
    expect(atFull.manualAim.perHit.total / stockTotal).toBeCloseTo(1.0, 6);
  });

  it('Eagle Eyes adds +50% crit damage (+62.5% with Strange in Numbers)', () => {
    const mods = getBuffModifiers('live', ['Mutation_EagleEyes'], []);
    // full-crit VATS parenthesis = 1 + (critMult − 1); crit mult 2.0 → 2.5 solo, 2.625 team.
    const solo = computeScenarios(base({ modifiers: mods, critRate: 1 }));
    const none = computeScenarios(base({ critRate: 1 }));
    expect(solo.vats.perHit.total / none.vats.perHit.total).toBeCloseTo(2.5 / 2.0, 6);

    const team = computeScenarios(base({ modifiers: mods, critRate: 1, player: { ...createDefaultPlayerConditions(), strangeInNumbers: true } }));
    expect(team.vats.perHit.total / none.vats.perHit.total).toBeCloseTo(2.625 / 2.0, 6);
  });
});
