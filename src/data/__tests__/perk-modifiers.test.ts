import { describe, it, expect } from 'vitest';
import { PerkId } from '@/data/perk-ids';
import { getGeneratedPerk, getLoadoutModifiers, getUnjoinedPerkIds } from '@/data/perk-modifiers';
import { getWeapons } from '@/data';
import { computeScenarios } from '@/lib/engine/scenarios';
import { createDefaultEnemyConditions, createDefaultPlayerConditions } from '@/types';
import { parseSpecialFromUrl } from '@/lib/nukes-dragons';

// Integration over the REAL generated data: registry ↔ ESM family join and
// end-to-end perk effects through the engine.

describe('perk registry ↔ generated family join', () => {
  it('joins Center Masochist to the Commando ESM family', () => {
    const perk = getGeneratedPerk('live', PerkId.CenterMasochist);
    expect(perk?.family).toBe('Commando');
    expect(perk?.maxRank).toBe(3);
    // +25/50/75% ranged damage vs torso
    expect(perk?.ranks[2].modifiers.some(m => m.bucket === 'dbm' && !m.curve && m.value === 0.75)).toBe(true);
  });

  it('supplies the Tenderizer override modifier (stacking dbm)', () => {
    const mods = getLoadoutModifiers('live', [{ perkId: PerkId.Tenderizer, rank: 1 }]);
    expect(mods).toHaveLength(1);
    expect(mods[0]).toMatchObject({ bucket: 'dbm', op: 'ADD', value: 0.1 });
    expect(mods[0].conditions[0]).toMatchObject({ kind: 'stacks', counter: 'tenderizer' });
  });

  it('reports unjoined PerkIds without crashing (review list, not a failure)', () => {
    const unjoined = getUnjoinedPerkIds('live');
    // Sanity ceiling: the bulk of the registry must join.
    expect(unjoined.length).toBeLessThan(60);
  });
});

describe('perk effects through the engine (real data)', () => {
  const base = {
    mode: 'live' as const,
    itemLevel: 50,
    player: createDefaultPlayerConditions(),
    enemy: createDefaultEnemyConditions(),
    weakpointMult: 2.0,
    critRate: 0,
  };

  it('Center Masochist boosts Fixer torso hits but not weakpoint hits', () => {
    const weapon = getWeapons('live')['CombatRifle_Fixer'];
    const noPerk = computeScenarios({ ...base, weapon, modifiers: [] });
    const withPerk = computeScenarios({
      ...base,
      weapon,
      modifiers: getLoadoutModifiers('live', [{ perkId: PerkId.CenterMasochist, rank: 3 }]),
    });

    expect(withPerk.manualAim.perHit.total).toBeCloseTo(noPerk.manualAim.perHit.total * 1.75, 6);
    expect(withPerk.manualAim.weakpointPerHit.total).toBeCloseTo(noPerk.manualAim.weakpointPerHit.total, 6);
  });

  it('Ninja boosts sneak damage for melee but not for the Fixer', () => {
    const fixer = getWeapons('live')['CombatRifle_Fixer'];
    const sledge = getWeapons('live')['SuperSledge'];
    const ninja = getLoadoutModifiers('live', [{ perkId: PerkId.Ninja, rank: 1 }]);

    const fixerBase = computeScenarios({ ...base, weapon: fixer, modifiers: [] });
    const fixerNinja = computeScenarios({ ...base, weapon: fixer, modifiers: ninja });
    expect(fixerNinja.vatsSneak.perHit.total).toBeCloseTo(fixerBase.vatsSneak.perHit.total, 6);

    const sledgeBase = computeScenarios({ ...base, weapon: sledge, modifiers: [] });
    const sledgeNinja = computeScenarios({ ...base, weapon: sledge, modifiers: ninja });
    expect(sledgeNinja.vatsSneak.perHit.total).toBeGreaterThan(sledgeBase.vatsSneak.perHit.total);
  });

  it('Tenderizer stacks scale dbm through player conditions', () => {
    const weapon = getWeapons('live')['CombatRifle_Fixer'];
    const mods = getLoadoutModifiers('live', [{ perkId: PerkId.Tenderizer, rank: 1 }]);
    const stacked = computeScenarios({
      ...base,
      weapon,
      modifiers: mods,
      player: { ...createDefaultPlayerConditions(), tenderizerStacks: 10 },
    });
    const unstacked = computeScenarios({ ...base, weapon, modifiers: mods });
    expect(stacked.manualAim.perHit.total).toBeCloseTo(unstacked.manualAim.perHit.total * 2.0, 6);
  });
});

describe('parseSpecialFromUrl', () => {
  it('decodes the 7-hex-digit s= param in SPECIAL order', () => {
    const special = parseSpecialFromUrl('https://nukesdragons.com/fallout-76/character?v=1&s=8c114f9&p=xyz');
    expect(special).toEqual({
      strength: 8, perception: 12, endurance: 1, charisma: 1, intelligence: 4, agility: 15, luck: 9,
    });
  });

  it('returns null when s= is absent or malformed', () => {
    expect(parseSpecialFromUrl('https://nukesdragons.com/fallout-76/character?p=xyz')).toBeNull();
    expect(parseSpecialFromUrl('https://nukesdragons.com/fallout-76/character?s=zz')).toBeNull();
  });
});
