import { describe, it, expect } from 'bun:test';
import { PerkId } from '@/data/perk-ids';
import {
  getEquippedPerkFamilyRanks,
  getGeneratedPerk,
  getLoadoutModifiers,
  getUnjoinedPerkIds,
  perkHasEngineEffect,
} from '@/data/perk-modifiers';
import { getWeapons } from '@/data';
import { getTargetDebuffModifiers } from '@/data/target-debuffs';
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
    expect(
      perk?.ranks[2].modifiers.some((m) => m.bucket === 'dbm' && !m.curve && m.value === 0.75),
    ).toBe(true);
  });

  it('Tenderizer is target-side: no player modifier from the card, 0.001/stack from target-debuffs', () => {
    // Equipping the card contributes nothing — the debuff lives on the target.
    expect(getLoadoutModifiers('live', [{ perkId: PerkId.Tenderizer, rank: 1 }])).toHaveLength(0);
    const mods = getTargetDebuffModifiers({});
    expect(mods).toHaveLength(1);
    expect(mods[0]).toMatchObject({ bucket: 'dbm', op: 'ADD', value: 0.001 });
    expect(mods[0].conditions[0]).toMatchObject({
      kind: 'stacks',
      counter: 'tenderizer',
      max: 1000,
    });
  });

  it('reports unjoined PerkIds without crashing (review list, not a failure)', () => {
    const unjoined = getUnjoinedPerkIds('live');
    // Sanity ceiling: the bulk of the registry must join.
    expect(unjoined.length).toBeLessThan(60);
  });

  it('getEquippedPerkFamilyRanks maps a mixed loadout to family → highest owned rank (perkFamilyRank input)', () => {
    const ranks = getEquippedPerkFamilyRanks('live', [
      { perkId: PerkId.LockAndLoad, rank: 1 },
      { perkId: PerkId.BulletStorm, rank: 2 },
      // Duplicate family at a lower rank must not downgrade the map.
      { perkId: PerkId.BulletStorm, rank: 1 },
    ]);
    expect(ranks['LockAndLoad']).toBe(1);
    // Bullet Storm's registry entry joins the HeavyGunner ESM family.
    expect(ranks['HeavyGunner']).toBe(2);
    // Unjoined/absent families simply don't appear.
    expect(ranks['MakeshiftWarrior']).toBeUndefined();
  });

  it('joins the reclassified legendary perks to their LGN_ families', () => {
    expect(getGeneratedPerk('live', PerkId.TakingOneForTheTeam)?.family).toBe(
      'LGN_TakingOneForTheTeam_Perk',
    );
    // Pinned via perkFamilyOverrides — two families share the name "Blood Sacrifice!".
    expect(getGeneratedPerk('live', PerkId.BloodSacrifice)?.family).toBe('LGN_BloodSacrifice_Perk');
    // Registry name fixed from "Breath It In" — joins the GHL_ ghoul family.
    expect(getGeneratedPerk('live', PerkId.BreathItIn)?.family).toBe('GHL_BreatheItIn');
    expect(getGeneratedPerk('live', PerkId.ActionDiet)?.family).toBe('GHL_LGN_ActionDiet');
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
    const perk = getLoadoutModifiers('live', [{ perkId: PerkId.CenterMasochist, rank: 3 }]);
    const weakpoint = { ...createDefaultPlayerConditions(), isAimingAtWeakpoint: true };

    const noPerk = computeScenarios({ ...base, weapon, modifiers: [] });
    const withPerk = computeScenarios({ ...base, weapon, modifiers: perk });
    expect(withPerk.freeAim.perHit.total).toBeCloseTo(noPerk.freeAim.perHit.total * 1.75, 6);

    const noPerkWeak = computeScenarios({ ...base, weapon, modifiers: [], player: weakpoint });
    const withPerkWeak = computeScenarios({ ...base, weapon, modifiers: perk, player: weakpoint });
    expect(withPerkWeak.freeAim.perHit.total).toBeCloseTo(noPerkWeak.freeAim.perHit.total, 6);
  });

  it('Center Masochist location is decoupled from the body-part mult (BPTD partType, not mult sign)', () => {
    const weapon = getWeapons('live')['CombatRifle_Fixer'];
    const perk = getLoadoutModifiers('live', [{ perkId: PerkId.CenterMasochist, rank: 3 }]);
    const weakpoint = { ...createDefaultPlayerConditions(), isAimingAtWeakpoint: true };

    // A non-torso part at mult 1.0 (e.g. an arm) must NOT trigger Center
    // Masochist — this was the bug: bodyPart was derived from the mult's
    // sign (1.0 → 'torso') rather than the picked part's identity.
    const noPerkLimb = computeScenarios({
      ...base,
      weapon,
      modifiers: [],
      player: weakpoint,
      weakpointMult: 1.0,
      targetIsTorso: false,
    });
    const withPerkLimb = computeScenarios({
      ...base,
      weapon,
      modifiers: perk,
      player: weakpoint,
      weakpointMult: 1.0,
      targetIsTorso: false,
    });
    expect(withPerkLimb.freeAim.perHit.total).toBeCloseTo(noPerkLimb.freeAim.perHit.total, 6);

    // A torso-weakpoint part (mult > 1, e.g. a Deathclaw's belly) must
    // trigger Center Masochist AND stack with the weakpoint bonus mult.
    const noPerkTorsoWeak = computeScenarios({
      ...base,
      weapon,
      modifiers: [],
      player: weakpoint,
      weakpointMult: 3.0,
      targetIsTorso: true,
    });
    const withPerkTorsoWeak = computeScenarios({
      ...base,
      weapon,
      modifiers: perk,
      player: weakpoint,
      weakpointMult: 3.0,
      targetIsTorso: true,
    });
    expect(withPerkTorsoWeak.freeAim.perHit.total).toBeCloseTo(
      noPerkTorsoWeak.freeAim.perHit.total * 1.75,
      6,
    );
  });

  it('Ninja boosts sneak damage for melee but not for the Fixer', () => {
    const fixer = getWeapons('live')['CombatRifle_Fixer'];
    const sledge = getWeapons('live')['SuperSledge'];
    const ninja = getLoadoutModifiers('live', [{ perkId: PerkId.Ninja, rank: 1 }]);
    const sneaking = { ...createDefaultPlayerConditions(), isSneaking: true };

    const fixerBase = computeScenarios({ ...base, weapon: fixer, modifiers: [], player: sneaking });
    const fixerNinja = computeScenarios({
      ...base,
      weapon: fixer,
      modifiers: ninja,
      player: sneaking,
    });
    expect(fixerNinja.vats.perHit.total).toBeCloseTo(fixerBase.vats.perHit.total, 6);

    const sledgeBase = computeScenarios({
      ...base,
      weapon: sledge,
      modifiers: [],
      player: sneaking,
    });
    const sledgeNinja = computeScenarios({
      ...base,
      weapon: sledge,
      modifiers: ninja,
      player: sneaking,
    });
    expect(sledgeNinja.vats.perHit.total).toBeGreaterThan(sledgeBase.vats.perHit.total);
  });

  it('Tenderizer stacks scale dbm through player conditions (no card equipped)', () => {
    const weapon = getWeapons('live')['CombatRifle_Fixer'];
    const mods = getTargetDebuffModifiers({});
    const stacked = computeScenarios({
      ...base,
      weapon,
      modifiers: mods,
      // 1000 stacks × 0.001 = +1.0 dbm → exactly double the per-hit damage.
      player: { ...createDefaultPlayerConditions(), tenderizerStacks: 1000 },
    });
    const unstacked = computeScenarios({ ...base, weapon, modifiers: mods });
    expect(stacked.freeAim.perHit.total).toBeCloseTo(unstacked.freeAim.perHit.total * 2.0, 6);
  });

  it('Concentrated Fire stacks scale VATS dbm only (rank 2 x 10 stacks = +20%, freeAim untouched)', () => {
    const weapon = getWeapons('live')['CombatRifle_Fixer'];
    const perk = getLoadoutModifiers('live', [{ perkId: PerkId.ConcentratedFire, rank: 2 }]);
    const unstacked = computeScenarios({ ...base, weapon, modifiers: perk });
    const stacked = computeScenarios({
      ...base,
      weapon,
      modifiers: perk,
      player: { ...createDefaultPlayerConditions(), concentratedFireStacks: 10 },
    });
    // Rank 2 -> 0.02 dbm/stack x 10 stacks = +0.20 -> x1.2 VATS damage.
    expect(stacked.vats.perHit.total).toBeCloseTo(unstacked.vats.perHit.total * 1.2, 6);
    expect(stacked.freeAim.perHit.total).toBeCloseTo(unstacked.freeAim.perHit.total, 6);
  });
});

describe('perkHasEngineEffect (drives the perk picker\'s "no effect yet" badge)', () => {
  it('is true for a perk that moves paper damage (Gunslinger)', () => {
    expect(perkHasEngineEffect('live', PerkId.Gunslinger)).toBe(true);
  });

  it('is false for a perk that only affects a non-combat mechanic (Green Thumb)', () => {
    expect(perkHasEngineEffect('live', PerkId.GreenThumb)).toBe(false);
  });

  it("is true for Picklock (feeds Pirate Punch's lockpickSkill curve since 2026-08-04)", () => {
    expect(perkHasEngineEffect('live', PerkId.Picklock)).toBe(true);
  });

  it('is true for Iron Fist (DR-scaled dbm curve, wired to the playerDamageResist manual knob — Phase 2)', () => {
    // "Your Fists deal more damage based on your DR" reads the WIELDER's own
    // DamageResist AV (0x000002E3, same AV Berserker's reads) — was
    // `enemyDamageResist` (hardcoded to always evaluate at 0) pre-rename;
    // now a real, badge-clearing curve input (docs/assumptions.md
    // "Berserker's (Damage Unarmored)").
    expect(perkHasEngineEffect('live', PerkId.IronFist)).toBe(true);
  });

  // Quick Hands / Wild West Hands were the subject of concurrent work
  // (perk-overrides.ts's extraPerkModifiers, reloadSkipChance) — guard that
  // they read as effective so the picker never badges them inert.
  it('is true for perks whose effect is hand-authored via extraPerkModifiers (Quick Hands, Wild West Hands)', () => {
    expect(perkHasEngineEffect('live', PerkId.QuickHands)).toBe(true);
    expect(perkHasEngineEffect('live', PerkId.WildWestHands)).toBe(true);
  });

  it('is true for Gunslinger Master (reverse onslaught — pinned in perkForceEffectivePerkIds)', () => {
    expect(perkHasEngineEffect('live', PerkId.GunslingerMaster)).toBe(true);
  });

  it('is true for the Legendary SPECIAL cards (baseSpecial pathway, no modifiers by design)', () => {
    expect(perkHasEngineEffect('live', PerkId.LegendaryStrength)).toBe(true);
    expect(perkHasEngineEffect('live', PerkId.LegendaryLuck)).toBe(true);
  });

  // Cross-family audit (Phase 0): these families extract with zero modifiers
  // of their own, but are named by another family's perkFamilyRank condition
  // — the BringingOutTheBigGuns-shaped hole. Both gate real `dbm` modifiers
  // (Mechanic's Best Friend / The Pipe, perk + legendary OMOD), so they're
  // pinned in perkForceEffectivePerkIds.
  it("is true for Makeshift Warrior (gates Mechanic's Best Friend's dbm modifiers)", () => {
    expect(perkHasEngineEffect('live', PerkId.MakeshiftWarrior)).toBe(true);
  });

  it("is true for Licensed Plumber (gates The Pipe's dbm modifiers)", () => {
    expect(perkHasEngineEffect('live', PerkId.LicensedPlumber)).toBe(true);
  });

  it('is false for an unjoined/unknown PerkId', () => {
    expect(perkHasEngineEffect('live', 'NotARealPerkId')).toBe(false);
  });
});

describe('parseSpecialFromUrl', () => {
  it('decodes the 7-hex-digit s= param in SPECIAL order', () => {
    const special = parseSpecialFromUrl(
      'https://nukesdragons.com/fallout-76/character?v=1&s=8c114f9&p=xyz',
    );
    expect(special).toEqual({
      strength: 8,
      perception: 12,
      endurance: 1,
      charisma: 1,
      intelligence: 4,
      agility: 15,
      luck: 9,
    });
  });

  it('returns null when s= is absent or malformed', () => {
    expect(parseSpecialFromUrl('https://nukesdragons.com/fallout-76/character?p=xyz')).toBeNull();
    expect(parseSpecialFromUrl('https://nukesdragons.com/fallout-76/character?s=zz')).toBeNull();
  });
});
