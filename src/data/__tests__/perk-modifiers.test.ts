import { describe, it, expect } from 'bun:test';
import { PerkId } from '@/data/perk-ids';
import {
  getEquippedPerkFamilyRanks,
  getGeneratedPerk,
  getLoadoutModifiers,
  getUnjoinedPerkIds,
  perkHasEngineEffect,
} from '@/data/perk-modifiers';
import { getPerks, getWeapons } from '@/data';
import { getTargetDebuffModifiers } from '@/data/target-debuffs';
import { computeScenarios } from '@/lib/engine/scenarios';
import { createDefaultEnemyConditions } from '@/types';
import { hasAnyEngineEffect, type Bucket } from '@/types/modifiers';
import { parseSpecialFromUrl } from '@/lib/nukes-dragons';
import { makeResolvedPlayer } from '@/lib/engine/__tests__/resolved-player-fixture';

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

  it('Tenderizer is target-side: no player modifier from the card', () => {
    // Equipping the card contributes nothing — the debuff lives on the target.
    expect(getLoadoutModifiers('live', [{ perkId: PerkId.Tenderizer, rank: 1 }])).toHaveLength(0);
  });

  /**
   * An unjoined PerkId contributes zero modifiers (`perk-modifiers.ts` skips
   * unresolved cards) and shows as inert in the picker. A ceiling assertion lets
   * individual perks silently go dark after an ESM rename; an exact list fails
   * loudly and forces adjudication.
   */
  it('reports unjoined PerkIds without crashing (pinned review list)', () => {
    expect([...getUnjoinedPerkIds('live')].sort()).toEqual([]);
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
    player: makeResolvedPlayer(),
    enemy: createDefaultEnemyConditions(),
    weakpointMult: 2.0,
    critRate: 0,
  };

  it('Center Masochist boosts Fixer torso hits but not weakpoint hits', () => {
    const weapon = getWeapons('live')['CombatRifle_Fixer'];
    const perk = getLoadoutModifiers('live', [{ perkId: PerkId.CenterMasochist, rank: 3 }]);
    const weakpoint = { ...makeResolvedPlayer(), isAimingAtWeakpoint: true };

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
    const weakpoint = { ...makeResolvedPlayer(), isAimingAtWeakpoint: true };

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
    const sneaking = { ...makeResolvedPlayer(), isSneaking: true };

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
      player: { ...makeResolvedPlayer(), tenderizerStacks: 1000 },
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
      player: { ...makeResolvedPlayer(), concentratedFireStacks: 10 },
    });
    // Rank 2 -> 0.02 dbm/stack x 10 stacks = +0.20 -> x1.2 VATS damage.
    expect(stacked.vats.perHit.total).toBeCloseTo(unstacked.vats.perHit.total * 1.2, 6);
    expect(stacked.freeAim.perHit.total).toBeCloseTo(unstacked.freeAim.perHit.total, 6);
  });
});

describe('perkHasEngineEffect (drives the perk picker\'s "no effect yet" badge)', () => {
  const rows: { name: string; perkId: string; expected: boolean }[] = [
    {
      name: 'is true for a perk that moves paper damage (Gunslinger)',
      perkId: PerkId.Gunslinger,
      expected: true,
    },
    {
      name: 'is false for a perk that only affects a non-combat mechanic (Green Thumb)',
      perkId: PerkId.GreenThumb,
      expected: false,
    },
    {
      name: "is true for Picklock (feeds Pirate Punch's lockpickSkill curve since 2026-08-04)",
      perkId: PerkId.Picklock,
      expected: true,
    },
    // "Your Fists deal more damage based on your DR" reads the WIELDER's own
    // DamageResist AV (0x000002E3, same AV Berserker's reads) — was
    // `enemyDamageResist` (hardcoded to always evaluate at 0) pre-rename;
    // now a real, badge-clearing curve input (docs/assumptions.md
    // "Berserker's (Damage Unarmored)").
    {
      name: 'is true for Iron Fist (DR-scaled dbm curve, wired to the playerDamageResist manual knob — Phase 2)',
      perkId: PerkId.IronFist,
      expected: true,
    },
    {
      name: 'is true for Barbarian (STR→DR damageResistGain fold + Iron Fist synergy)',
      perkId: PerkId.Barbarian,
      expected: true,
    },
    // Quick Hands / Wild West Hands were the subject of concurrent work
    // (perk-overrides.ts's extraPerkModifiers, reloadSkipChance) — guard that
    // they read as effective so the picker never badges them inert.
    {
      name: 'is true for Quick Hands (effect hand-authored via extraPerkModifiers)',
      perkId: PerkId.QuickHands,
      expected: true,
    },
    {
      name: 'is true for Wild West Hands (effect hand-authored via extraPerkModifiers)',
      perkId: PerkId.WildWestHands,
      expected: true,
    },
    {
      name: 'is true for Gunslinger Master (reverse onslaught — pinned in perkForceEffectivePerkIds)',
      perkId: PerkId.GunslingerMaster,
      expected: true,
    },
    {
      name: 'is true for Gunslinger Expert (Gunslinger/Guerrilla onslaught line)',
      perkId: PerkId.GunslingerExpert,
      expected: true,
    },
    {
      name: 'is true for Guerrilla (Gunslinger/Guerrilla onslaught line)',
      perkId: PerkId.Guerrilla,
      expected: true,
    },
    {
      name: 'is true for Guerrilla Expert (Gunslinger/Guerrilla onslaught line)',
      perkId: PerkId.GuerrillaExpert,
      expected: true,
    },
    {
      name: 'is true for Guerrilla Master (Gunslinger/Guerrilla onslaught line)',
      perkId: PerkId.GuerrillaMaster,
      expected: true,
    },
    {
      name: 'is true for Legendary Strength (baseSpecial pathway, no modifiers by design)',
      perkId: PerkId.LegendaryStrength,
      expected: true,
    },
    {
      name: 'is true for Legendary Luck (baseSpecial pathway, no modifiers by design)',
      perkId: PerkId.LegendaryLuck,
      expected: true,
    },
    // Cross-family audit (Phase 0): these families extract with zero modifiers
    // of their own, but are named by another family's perkFamilyRank condition
    // — the BringingOutTheBigGuns-shaped hole. Both gate real `dbm` modifiers
    // (Mechanic's Best Friend / The Pipe, perk + legendary OMOD), so they're
    // pinned in perkForceEffectivePerkIds.
    {
      name: "is true for Makeshift Warrior (gates Mechanic's Best Friend's dbm modifiers)",
      perkId: PerkId.MakeshiftWarrior,
      expected: true,
    },
    {
      name: "is true for Licensed Plumber (gates The Pipe's dbm modifiers)",
      perkId: PerkId.LicensedPlumber,
      expected: true,
    },
    {
      name: 'is true for Tenderizer (Target-section tenderizerStacks knob — pinned in perkForceEffectivePerkIds)',
      perkId: PerkId.Tenderizer,
      expected: true,
    },
    {
      name: 'is true for Mad Scientist (IsPowerAttacking=0 gate now resolves)',
      perkId: PerkId.MadScientist,
      expected: true,
    },
    {
      name: 'is true for Radiation Power (IsPowerAttacking=0 gate now resolves)',
      perkId: PerkId.RadiationPower,
      expected: true,
    },
    {
      name: 'is true for Psychopath (GetIsInVATS=0 gate now resolves)',
      perkId: PerkId.Psychopath,
      expected: true,
    },
    {
      name: 'is false for an unjoined/unknown PerkId',
      perkId: 'NotARealPerkId',
      expected: false,
    },
  ];

  for (const row of rows) {
    it(row.name, () => {
      expect(perkHasEngineEffect('live', row.perkId)).toBe(row.expected);
    });
  }

  const extractRoutedRows: { name: string; perkId: string; bucket: Bucket }[] = [
    {
      name: 'is true for Hacker now that extract routes STAT_HackingTier (hackingSkill bucket)',
      perkId: PerkId.Hacker,
      bucket: 'hackingSkill',
    },
    {
      name: 'is true for First Aid now that extract routes STAT_HealMultStimpak (stimpakHealMult bucket)',
      perkId: PerkId.FirstAid,
      bucket: 'stimpakHealMult',
    },
  ];

  for (const row of extractRoutedRows) {
    it(row.name, () => {
      const mods = getGeneratedPerk('live', row.perkId)?.ranks[0]?.modifiers ?? [];
      expect(hasAnyEngineEffect(mods.filter((m) => m.bucket === row.bucket))).toBe(true);
      expect(perkHasEngineEffect('live', row.perkId)).toBe(true);
    });
  }

  it('the Gunslinger/Guerrilla onslaught line is exactly the six cards pinned above', () => {
    const registry = getPerks('live');
    const onslaughtLine = Object.keys(registry).filter((id) =>
      /Gunslinger|Guerrilla/i.test(registry[id as keyof typeof registry].name),
    );
    expect(onslaughtLine.sort()).toEqual(
      [
        PerkId.Guerrilla,
        PerkId.GuerrillaExpert,
        PerkId.GuerrillaMaster,
        PerkId.Gunslinger,
        PerkId.GunslingerExpert,
        PerkId.GunslingerMaster,
      ].sort(),
    );
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
