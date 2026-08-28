import { describe, it, expect } from 'bun:test';
import type { EsmSource, EsmListRow, EsmRecord } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';
import {
  effectiveFamilyMaxRank,
  extractPerks,
  resolveRankSources,
  toGeneratedPerkCard,
} from '../extract-perks';
import { flattenPerkConditionRows, translateConditions } from '../normalize/conditions';
import tenderizerCard from './fixtures/pcrd-tenderizercard.json';
import commandoCard from './fixtures/pcrd-commandocard.json';
import actionBoyGirlCard from './fixtures/pcrd-actionboygirlcard.json';
import lgnWhatRadsCard from './fixtures/pcrd-lgnwhatradscard.json';
import ghlGlowingCriticals01 from './fixtures/perk-ghlglowingcriticals01.json';
import quickHands01 from './fixtures/perk-quickhands01.json';
import bandito01 from './fixtures/perk-bandito01.json';
import gunFu01 from './fixtures/perk-gunfu01.json';
import gunFu02 from './fixtures/perk-gunfu02.json';
import gunFu03 from './fixtures/perk-gunfu03.json';
import ghlMadScientist01 from './fixtures/perk-ghlmadscientist01.json';
import ghlBombScientist01 from './fixtures/perk-ghl-bombscientist01.json';
import abPerkBombScientist from './fixtures/spel-ghl-abperkbombscientist.json';
import abPerkFortifyDmgGrenades from './fixtures/mgef-abperkfortifydmggrenades.json';
import grenadier01 from './fixtures/perk-grenadier01.json';
import grenadier02 from './fixtures/perk-grenadier02.json';
import abPerkGrenadier from './fixtures/spel-abperkgrenadier.json';
import abPerkFortifyExplosionRadius from './fixtures/mgef-abperkfortifyexplosionradius.json';
import barbarian01 from './fixtures/perk-barbarian01.json';
import abPerkBarbarian from './fixtures/spel-abperkbarbarian.json';
import abPerkFortifyResistDamage from './fixtures/mgef-abperkfortifyresistdamage.json';
import { foldBucket } from '@/lib/engine/resolve';
import { createDefaultEnemyConditions } from '@/types';
import { makeResolvedPlayer } from '@/lib/engine/__tests__/resolved-player-fixture';

// Fixtures are verbatim `esm get <formid> --json` output (20260710 ESM).
// These tests pin the PCRD → GeneratedPerkCard normalization and the new
// glowAtLeast (Rads AV) condition translation.

describe('toGeneratedPerkCard', () => {
  it('TenderizerCard (0x003E2202): Charisma, single rank costing 2, not legendary, no race restriction', () => {
    const { card, rankPerkFormIds } = toGeneratedPerkCard(tenderizerCard as unknown as EsmRecord);
    expect(card.special).toBe('Charisma');
    expect(card.costs).toEqual([2]);
    expect(card.minLevel).toBe(46);
    expect(card.raceRestriction).toBeNull();
    expect(card.isLegendaryCard).toBe(false);
    expect(rankPerkFormIds).toEqual([['0x003E21F4']]);
  });

  it('CommandoCard (0x0031AEF6): Perception, 3 ranks costing 1/2/3', () => {
    const { card, rankPerkFormIds } = toGeneratedPerkCard(commandoCard as unknown as EsmRecord);
    expect(card.special).toBe('Perception');
    expect(card.costs).toEqual([1, 2, 3]);
    expect(card.isLegendaryCard).toBe(false);
    expect(rankPerkFormIds).toEqual([['0x0031AEEF'], ['0x0031AEF0'], ['0x0031AEF1']]);
  });

  it('ActionBoyGirlCard (0x00093E84): gender twin — both Male and Female Perk formids surfaced per rank', () => {
    const { card, rankPerkFormIds } = toGeneratedPerkCard(
      actionBoyGirlCard as unknown as EsmRecord,
    );
    expect(card.special).toBe('Agility');
    expect(card.costs).toEqual([1, 2, 3]);
    expect(card.minLevel).toBe(2);
    // [Male Perk, Female Perk] per rank, in rank order.
    expect(rankPerkFormIds).toEqual([
      ['0x0004D869', '0x0004D872'],
      ['0x00065DF5', '0x00065DF6'],
      ['0x0017ED8A', '0x0017ED8B'],
    ]);
  });

  it('LGN_WhatRads_Card (0x005A5943): isLegendaryCard true via "Perk Card Flags", human race restriction', () => {
    const { card, rankPerkFormIds } = toGeneratedPerkCard(lgnWhatRadsCard as unknown as EsmRecord);
    expect(card.isLegendaryCard).toBe(true);
    expect(card.raceRestriction).toBe('human');
    expect(card.special).toBe('Strength');
    expect(card.minLevel).toBe(50);
    expect(card.costs).toEqual([1, 1, 1, 1]);
    expect(rankPerkFormIds).toHaveLength(4);
  });

  it('GHL_GlowingCriticalsCard-style ghoul restriction maps to "ghoul" (name-based, not the raw numeric value)', () => {
    // Constructed record: verifies the mapping is driven by Race Restriction's
    // resolved `.name` ("Ghoul"), not a hardcoded numeric constant — real ghoul
    // cards (e.g. GHL_GlowingCriticalsCard 0x00797E0E) carry value 2/"Ghoul".
    const record = {
      header: { signature: 'PCRD', form_id: '0xTEST' },
      editor_id: 'TestGhoulCard',
      fields: {
        Unknown: {
          Value: 0,
          'Min Level': 100,
          Special: { value: 6, name: 'Luck' },
          'Race Restriction': { value: 2, name: 'Ghoul' },
        },
        Perks: [{ Perk: { 'Card Rank Cost': 1, 'Male Perk': '0xPERK' } }],
      },
    } as unknown as EsmRecord;
    const { card } = toGeneratedPerkCard(record);
    expect(card.raceRestriction).toBe('ghoul');
  });
});

describe('resolveRankSources', () => {
  it('maps a full-length card to the identity [1..n]', () => {
    expect(resolveRankSources([['0xA'], ['0xB'], ['0xC']], ['0xA', '0xB', '0xC'])).toEqual([
      1, 2, 3,
    ]);
  });

  it('maps a compressed card to the family rank prefix (LifegiverCard: 1 entry, 3 family ranks)', () => {
    expect(
      resolveRankSources([['0x0004A0CF']], ['0x0004A0CF', '0x001D2465', '0x001D2467']),
    ).toEqual([1]);
  });

  it("maps StarchedGenesCard's single entry to family rank 2 (the live card is the old rank-2 record)", () => {
    expect(resolveRankSources([['0x00397CB1']], ['0x00397CB0', '0x00397CB1'])).toEqual([2]);
  });

  it('resolves a gender-twin entry against the female family too', () => {
    expect(resolveRankSources([['0x0004D869', '0x0004D872']], ['0x0004D872', '0xFEM2'])).toEqual([
      1,
    ]);
  });

  it('returns null when an entry matches no rank of the family', () => {
    expect(resolveRankSources([['0xA'], ['0xNOPE']], ['0xA', '0xB'])).toBeNull();
  });
});

describe('effectiveFamilyMaxRank (cut-rank fix, 2026-07-16)', () => {
  it('caps a compressed card at the highest referenced rank (Lock and Load: 3-record chain, card references only rank 1 → maxRank 1)', () => {
    expect(effectiveFamilyMaxRank(3, [1])).toBe(1);
  });

  it("keeps a StarchedGenes-shaped card's full reach (single entry at family rank 2, out of a 2-record chain → maxRank 2, not 1)", () => {
    expect(effectiveFamilyMaxRank(2, [2])).toBe(2);
  });

  it('is the identity for a full-length card ([1..n])', () => {
    expect(effectiveFamilyMaxRank(3, [1, 2, 3])).toBe(3);
  });

  it('keeps the full chain length for a card-less family (rankSources undefined)', () => {
    expect(effectiveFamilyMaxRank(3, undefined)).toBe(3);
  });

  it('keeps the full chain length when rankSources is empty (defensive — should not occur in practice)', () => {
    expect(effectiveFamilyMaxRank(3, [])).toBe(3);
  });
});

describe('translateConditions (glowAtLeast — Rads AV 0x000002E1, 2026-07-13)', () => {
  it("translates a literal GetValue(Rads) >= 180 row to glowAtLeast (GHL_GlowingCriticals01's entry-point gate)", () => {
    const effects = (ghlGlowingCriticals01 as unknown as EsmRecord).fields['Effects'] as Array<
      Record<string, unknown>
    >;
    const perkConditions = (effects[0]['Effect'] as Record<string, unknown>)['Perk Conditions'];
    const rows = flattenPerkConditionRows(perkConditions);
    const { conditions } = translateConditions(rows, { edidByFormId: new Map() });
    expect(conditions).toContainEqual({ kind: 'glowAtLeast', min: 180 });
  });

  it("resolves a GLOB-compared Rads row via globalValues (GHL_MadScientist01's ability grant: GetValue(Rads) >= GLOB GHL_BasicGlowUse=5)", () => {
    const effects = (ghlMadScientist01 as unknown as EsmRecord).fields['Effects'] as Array<
      Record<string, unknown>
    >;
    // Effects[1] is the "Ability" entry whose tab-0 Perk Conditions carry the
    // GLOB-compared Rads gate (0x007F68B6 = GHL_BasicGlowUse, Value 5.0).
    const abilityEffect = effects[1]['Effect'] as Record<string, unknown>;
    const rows = flattenPerkConditionRows(abilityEffect['Perk Conditions']);
    const { conditions } = translateConditions(rows, {
      edidByFormId: new Map(),
      globalValues: new Map([['0x007F68B6', 5]]),
    });
    expect(conditions).toContainEqual({ kind: 'glowAtLeast', min: 5 });
  });

  it('leaves a Rads GetValue row unresolved for a non-≥ comparison (e.g. "Less Than")', () => {
    const row = {
      Function: 'GetValue',
      'Parameter 1': '0x000002E1',
      'Comparison Value': 200,
      Operator: 'Less Than',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'unresolved', raw: 'GetValue(0x000002E1) Less Than 200' }]);
  });

  it('leaves a GLOB-compared Rads row unresolved when the global is not pre-resolved', () => {
    const row = {
      Function: 'GetValue',
      'Parameter 1': '0x000002E1',
      'Comparison Value': '0x007F68B6',
      Operator: 'Greater Than Or Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([
      { kind: 'unresolved', raw: 'GetValue(0x000002E1) Greater Than Or Equal To 0x007F68B6' },
    ]);
  });
});

describe('translateConditions (radResistAtLeast — RadResistExposure AV 0x000002EA, 20260724 Daisy Cutter rebuild)', () => {
  it("translates a literal GetValue(RadResistExposure) >= 1000 row to radResistAtLeast (Perk_Daisycutter's ladder, verified via esm chase 0x00471882)", () => {
    const row = {
      Function: 'GetValue',
      'Parameter 1': '0x000002EA',
      'Comparison Value': 1000,
      Operator: 'Greater Than Or Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'radResistAtLeast', min: 1000 }]);
  });

  it('translates the top step of the ladder (>= 8000, the +160% cap)', () => {
    const row = {
      Function: 'GetValue',
      'Parameter 1': '0x000002EA',
      'Comparison Value': 8000,
      Operator: 'Greater Than Or Equal To',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([{ kind: 'radResistAtLeast', min: 8000 }]);
  });

  it('leaves a RadResistExposure GetValue row unresolved for a non-≥ comparison (e.g. "Less Than")', () => {
    const row = {
      Function: 'GetValue',
      'Parameter 1': '0x000002EA',
      'Comparison Value': 1000,
      Operator: 'Less Than',
    };
    const { conditions } = translateConditions([row], { edidByFormId: new Map() });
    expect(conditions).toEqual([
      { kind: 'unresolved', raw: 'GetValue(0x000002EA) Less Than 1000' },
    ]);
  });
});

/**
 * Stub client mirroring Lock and Load's real 20260710 ESM shape (verified via
 * `esm get`/`esm refs`, 2026-07-16): a 3-record edid chain (LockAndLoad01-03)
 * where rank 1 (0x00320168) carries the real EP210 "Mod Ammo Spender Max
 * Reload Stack Mult" entry point (Add Value, Float 0.5, no perk conditions),
 * ranks 2/3 (0x0032016A/0x0032016C) carry `Effects: null` in the raw ESM data
 * (genuinely no effects of their own), and the PCRD (LockAndLoadCard
 * 0x0032016B) lists exactly ONE rank entry pointing at rank 1's formid — the
 * cut-rank fix's motivating example (extract-perks.ts's effectiveFamilyMaxRank).
 */
function makeLockAndLoadStubClient(): EsmSource {
  const rank1FormId = '0x00320168';
  const rank2FormId = '0x0032016A';
  const rank3FormId = '0x0032016C';
  const cardFormId = '0x0032016B';
  const records: Record<string, EsmRecord> = {
    [rank1FormId]: {
      header: { signature: 'PERK', form_id: rank1FormId },
      editor_id: 'LockAndLoad01',
      fields: {
        Name: 'Lock and Load',
        Description: 'Reloading a weapon retains half of its Bullet Storm stacks.',
        Effects: [
          {
            Effect: {
              'Effect Header': { 'Effect Type': { name: 'Entry Point' } },
              'Entry Point': {
                'Entry Point': { name: 'Mod Ammo Spender Max Reload Stack Mult' },
                Function: { name: 'Add Value' },
              },
              Float: 0.5,
            },
          },
        ],
      },
    } as unknown as EsmRecord,
    // Cut content: real ESM data has `Effects: null` on both — no effects to
    // parse, but their formids still exist in the edid chain.
    [rank2FormId]: {
      header: { signature: 'PERK', form_id: rank2FormId },
      editor_id: 'LockAndLoad02',
      fields: { Name: 'Lock and Load', Description: '', Effects: null },
    } as unknown as EsmRecord,
    [rank3FormId]: {
      header: { signature: 'PERK', form_id: rank3FormId },
      editor_id: 'LockAndLoad03',
      fields: { Name: 'Lock and Load', Description: '', Effects: null },
    } as unknown as EsmRecord,
    [cardFormId]: {
      header: { signature: 'PCRD', form_id: cardFormId },
      editor_id: 'LockAndLoadCard',
      fields: {
        Perks: [{ Perk: { 'Card Rank Cost': 2, 'Male Perk': rank1FormId } }],
        'Perk Card Data': { Special: { name: 'Endurance' }, 'Min Level': 25 },
      },
    } as unknown as EsmRecord,
  };
  const rows: EsmListRow[] = [
    {
      form_id: rank1FormId,
      record_type: 'PERK',
      editor_id: 'LockAndLoad01',
      name: 'Lock and Load',
    },
    {
      form_id: rank2FormId,
      record_type: 'PERK',
      editor_id: 'LockAndLoad02',
      name: 'Lock and Load',
    },
    {
      form_id: rank3FormId,
      record_type: 'PERK',
      editor_id: 'LockAndLoad03',
      name: 'Lock and Load',
    },
    { form_id: cardFormId, record_type: 'PCRD', editor_id: 'LockAndLoadCard', name: null },
  ];
  return createInMemoryEsmSource({
    records,
    rows,
    getFallback: (target) =>
      ({
        header: { signature: 'PERK', form_id: target },
        editor_id: target,
        fields: {},
      }) as unknown as EsmRecord,
  });
}

/**
 * Stub client mirroring Barbarian's real 20260702 ESM shape (verified via
 * `esm get`, 2026-08-06): Barbarian01 (0x00242E59) grants AbPerkBarbarian
 * (0x00242E5A) whose AbPerkFortifyResistDamage effect curve-scales STR → DR;
 * Effect 2 is the self-referencing "Mod Spell Magnitude" ×2.0 entry point
 * (post-processed into `unarmored` conditions, not extracted generically).
 */
function makeBarbarianStubClient(): EsmSource {
  const perkFormId = '0x00242E59';
  const spellFormId = '0x00242E5A';
  const mgefFormId = '0x0004A0AC';
  const damageResistAv = '0x000002E3';
  const records: Record<string, EsmRecord> = {
    [perkFormId]: barbarian01 as unknown as EsmRecord,
    [spellFormId]: abPerkBarbarian as unknown as EsmRecord,
    [mgefFormId]: abPerkFortifyResistDamage as unknown as EsmRecord,
    [damageResistAv]: {
      header: { signature: 'AVIF', form_id: damageResistAv },
      editor_id: 'DamageResist',
      fields: {},
    } as unknown as EsmRecord,
    STAT_DamagePerk: {
      header: { signature: 'PERK', form_id: '0x0023A0EB' },
      editor_id: 'STAT_DamagePerk',
      fields: { Effects: [] },
    } as unknown as EsmRecord,
  };
  return createInMemoryEsmSource({
    records,
    rows: [
      {
        form_id: perkFormId,
        record_type: 'PERK',
        editor_id: 'Barbarian01',
        name: 'Barbarian',
      },
    ],
    getFallback: (target) =>
      ({
        header: { signature: 'PERK', form_id: target },
        editor_id: target,
        fields: {},
      }) as unknown as EsmRecord,
  });
}

describe('extractPerks (cut-rank fix — Lock and Load, 2026-07-16)', () => {
  it('a 3-record edid chain with a PCRD listing only rank 1 extracts maxRank 1 and one rank entry, dropping the dead r2/r3 chain records', async () => {
    const result = await extractPerks(makeLockAndLoadStubClient());
    const family = result.perks.find((p) => p.family === 'LockAndLoad');
    expect(family).toBeDefined();
    expect(family!.maxRank).toBe(1);
    expect(family!.ranks).toHaveLength(1);
    expect(family!.formIds).toEqual(['0x00320168']);
    expect(family!.hasCard).toBe(true);
    expect(family!.card?.rankSources).toEqual([1]);
    // Rank 1's real entry point still extracts correctly (proves the mgef.ts
    // EP210 → bulletStormRetention wiring alongside the cut-rank fix).
    expect(family!.ranks[0].modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'bulletStormRetention', op: 'ADD', value: 0.5 }),
    );
  });
});

/**
 * Stub client mirroring Grenadier's real 20260724 ESM shape (verified via
 * `esm get`, 2026-07-29): Grenadier01 (0x00393F66) grants AbPerkGrenadier
 * (0x00393F67), whose two AbPerkFortifyExplosionRadius effects (50/100) gate
 * on HasPerk(Grenadier02); Grenadier02 (0x00393F69) carries no effects of
 * its own. STAT_DamagePerk Effects[30] supplies the buildAvifRoutes entry
 * for STAT_ExplosionRadius → explosionRadiusBonus ×0.01.
 */
function makeGrenadierStubClient(): EsmSource {
  const rank1FormId = '0x00393F66';
  const rank2FormId = '0x00393F69';
  const spellFormId = '0x00393F67';
  const mgefFormId = '0x00393F68';
  const explosionRadiusAv = '0x00066997';
  const records: Record<string, EsmRecord> = {
    [rank1FormId]: grenadier01 as unknown as EsmRecord,
    [rank2FormId]: grenadier02 as unknown as EsmRecord,
    [spellFormId]: abPerkGrenadier as unknown as EsmRecord,
    [mgefFormId]: abPerkFortifyExplosionRadius as unknown as EsmRecord,
    [explosionRadiusAv]: {
      header: { signature: 'AVIF', form_id: explosionRadiusAv },
      editor_id: 'STAT_ExplosionRadius',
      fields: {},
    } as unknown as EsmRecord,
    STAT_DamagePerk: {
      header: { signature: 'PERK', form_id: '0x0023A0EB' },
      editor_id: 'STAT_DamagePerk',
      fields: {
        Effects: [
          {
            Effect: {
              'Entry Point': {
                'Entry Point': { name: 'Mod Player Explosion Scale' },
              },
              Float: 0.01,
              'Function Parameter 3 (Actor Value)': explosionRadiusAv,
            },
          },
        ],
      },
    } as unknown as EsmRecord,
  };
  return createInMemoryEsmSource({
    records,
    rows: [
      {
        form_id: rank1FormId,
        record_type: 'PERK',
        editor_id: 'Grenadier01',
        name: 'Grenadier',
      },
      {
        form_id: rank2FormId,
        record_type: 'PERK',
        editor_id: 'Grenadier02',
        name: 'Grenadier',
      },
    ],
    getFallback: (target) =>
      ({
        header: { signature: 'PERK', form_id: target },
        editor_id: target,
        fields: {},
      }) as unknown as EsmRecord,
  });
}

describe('extractPerks (Grenadier / explosion radius bonus, 2026-07-29)', () => {
  it('rank 1: AbPerkFortifyExplosionRadius magnitude 50 → explosionRadiusBonus 0.5', async () => {
    const result = await extractPerks(makeGrenadierStubClient());
    const family = result.perks.find((p) => p.family === 'Grenadier');
    expect(family).toBeDefined();
    expect(family!.ranks).toHaveLength(2);
    expect(family!.ranks[0].modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'explosionRadiusBonus', op: 'ADD', value: 0.5 }),
    );
  });

  it('rank 2: AbPerkFortifyExplosionRadius magnitude 100 → explosionRadiusBonus 1.0', async () => {
    const result = await extractPerks(makeGrenadierStubClient());
    const family = result.perks.find((p) => p.family === 'Grenadier');
    expect(family).toBeDefined();
    expect(family!.ranks[1].modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'explosionRadiusBonus', op: 'ADD', value: 1.0 }),
    );
  });
});

/**
 * Stub client mirroring GHL_BombScientist's real 20260821 ESM shape (verified
 * via `esm get`, 2026-08-28): rank 1 grants GHL_AbPerkBombScientist
 * (0x0084BF8A) whose AbPerkFortifyDmgGrenades effects (20/35/50) gate on
 * HasPerk sibling ranks + GetIsPlayerGhoul + glow-spend rows.
 */
function makeBombScientistStubClient(): EsmSource {
  const rank1FormId = '0x007A18EB';
  const rank2FormId = '0x007A159A';
  const rank3FormId = '0x007A159B';
  const spellFormId = '0x0084BF8A';
  const mgefFormId = '0x00854902';
  const grenadeAv = '0x008548FF';
  const records: Record<string, EsmRecord> = {
    [rank1FormId]: ghlBombScientist01 as unknown as EsmRecord,
    [rank2FormId]: {
      header: { signature: 'PERK', form_id: rank2FormId },
      editor_id: 'GHL_BombScientist02',
      fields: { Name: 'Bomb Scientist', Effects: null },
    } as unknown as EsmRecord,
    [rank3FormId]: {
      header: { signature: 'PERK', form_id: rank3FormId },
      editor_id: 'GHL_BombScientist03',
      fields: { Name: 'Bomb Scientist', Effects: null },
    } as unknown as EsmRecord,
    [spellFormId]: abPerkBombScientist as unknown as EsmRecord,
    [mgefFormId]: abPerkFortifyDmgGrenades as unknown as EsmRecord,
    [grenadeAv]: {
      header: { signature: 'AVIF', form_id: grenadeAv },
      editor_id: 'STAT_DmgGrenade',
      fields: {},
    } as unknown as EsmRecord,
    ...plumbingPerkRecords(),
  };
  return createInMemoryEsmSource({
    records,
    rows: [
      {
        form_id: rank1FormId,
        record_type: 'PERK',
        editor_id: 'GHL_BombScientist01',
        name: 'Bomb Scientist',
      },
      {
        form_id: rank2FormId,
        record_type: 'PERK',
        editor_id: 'GHL_BombScientist02',
        name: 'Bomb Scientist',
      },
      {
        form_id: rank3FormId,
        record_type: 'PERK',
        editor_id: 'GHL_BombScientist03',
        name: 'Bomb Scientist',
      },
    ],
    resolveEdidFallback: (id) =>
      ({
        [rank2FormId]: 'GHL_BombScientist02',
        [rank3FormId]: 'GHL_BombScientist03',
        '0x007F68BB': 'GHL_PowerGlowUseBasic',
      })[id] ?? id,
    getFallback: (target) =>
      ({
        header: { signature: 'PERK', form_id: target },
        editor_id: target,
        fields: {},
      }) as unknown as EsmRecord,
  });
}

describe('extractPerks (GHL_BombScientist / STAT_DmgGrenade, 2026-08-28)', () => {
  it('rank 1: AbPerkFortifyDmgGrenades magnitude 20 → thrown-grenade-scoped dbm 0.2 with playerIsGhoul gate', async () => {
    const result = await extractPerks(makeBombScientistStubClient());
    const family = result.perks.find((p) => p.family === 'GHL_BombScientist');
    expect(family).toBeDefined();
    expect(family!.ranks[0].modifiers).toContainEqual(
      expect.objectContaining({
        bucket: 'dbm',
        op: 'ADD',
        value: 0.2,
        conditions: expect.arrayContaining([
          { kind: 'playerIsGhoul', value: true },
          { kind: 'weaponKeyword', keyword: 'WeaponTypeThrown', present: true },
          { kind: 'weaponKeyword', keyword: 'WeaponTypeGrenade', present: true },
          { kind: 'weaponKeyword', keyword: 'WeaponTypeThrowingKnife', present: false },
        ]),
      }),
    );
  });

  it('rank 3: AbPerkFortifyDmgGrenades magnitude 50 → dbm 0.5', async () => {
    const result = await extractPerks(makeBombScientistStubClient());
    const family = result.perks.find((p) => p.family === 'GHL_BombScientist');
    expect(family!.ranks[2].modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'dbm', op: 'ADD', value: 0.5 }),
    );
  });
});

describe('extractPerks (Barbarian unarmored ×2 post-process, 2026-08-06)', () => {
  it('splits rank-1 damageResistGain into armored (curveScale 1) and unarmored (×2) modifiers', async () => {
    const result = await extractPerks(makeBarbarianStubClient());
    const family = result.perks.find((p) => p.family === 'Barbarian');
    expect(family).toBeDefined();
    expect(family!.ranks).toHaveLength(1);
    expect(family!.ranks[0].modifiers).toHaveLength(2);

    const armored = family!.ranks[0].modifiers.find((m) =>
      m.conditions.some((c) => c.kind === 'unarmored' && c.value === false),
    );
    const unarmored = family!.ranks[0].modifiers.find((m) =>
      m.conditions.some((c) => c.kind === 'unarmored' && c.value === true),
    );
    expect(armored).toMatchObject({
      bucket: 'damageResistGain',
      op: 'ADD',
      curveScale: 1,
      curve: {
        input: 'strength',
        points: [
          { x: 1, y: 18 },
          { x: 15, y: 61 },
          { x: 30, y: 96 },
          { x: 60, y: 131 },
          { x: 100, y: 175 },
        ],
      },
    });
    expect(unarmored).toMatchObject({
      bucket: 'damageResistGain',
      op: 'ADD',
      curveScale: 2,
    });
  });

  it('at STR 15, armored contributes DR 61 and unarmored DR 122', async () => {
    const result = await extractPerks(makeBarbarianStubClient());
    const mods = result.perks.find((p) => p.family === 'Barbarian')!.ranks[0].modifiers;
    const weapon = {
      id: '__test__',
      name: 'Test',
      components: [],
      damageType: 'ballistic' as const,
      weaponClass: 'unarmed' as const,
      isAutomatic: false,
      isPhysical: true,
    };
    const basePlayer = {
      ...makeResolvedPlayer(),
      strength: 15,
      armorWorn: 'body' as const,
      playerDamageResist: 0,
    };
    const armoredCtx = {
      weapon,
      player: { ...basePlayer, armorWorn: 'body' as const },
      enemy: createDefaultEnemyConditions(),
      scenario: { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false },
      itemLevel: 50,
      onslaughtMaxStacks: 0,
    };
    const unarmoredCtx = {
      ...armoredCtx,
      player: { ...basePlayer, armorWorn: 'none' as const },
    };
    expect(foldBucket(mods, 'damageResistGain', 0, armoredCtx)).toBe(61);
    expect(foldBucket(mods, 'damageResistGain', 0, unarmoredCtx)).toBe(122);
  });
});

function plumbingPerkRecords(): Record<string, EsmRecord> {
  return Object.fromEntries(
    ['STAT_DamagePerk', 'STAT_CritDamagePerk', 'STAT_DamageVsPerk'].map((edid) => [
      edid,
      {
        header: { signature: 'PERK', form_id: edid },
        editor_id: edid,
        fields: { Effects: [] },
      } as unknown as EsmRecord,
    ]),
  );
}

function makeDirectEntryPointPerkClient(
  family: string,
  rank1: EsmRecord,
  formId: string,
): EsmSource {
  return createInMemoryEsmSource({
    records: {
      [formId]: rank1,
      ...plumbingPerkRecords(),
    },
    rows: [{ form_id: formId, record_type: 'PERK', editor_id: `${family}01`, name: family }],
    getFallback: (target) =>
      ({
        header: { signature: 'PERK', form_id: target },
        editor_id: target,
        fields: {},
      }) as unknown as EsmRecord,
  });
}

describe('extractPerks (direct entry-point special cases, 2026-08-28)', () => {
  it('QuickHands01 folds GetRandomPercent into reloadSkipChance ADD 0.06', async () => {
    const formId = '0x000221FC';
    const result = await extractPerks(
      makeDirectEntryPointPerkClient('QuickHands', quickHands01 as EsmRecord, formId),
    );
    const family = result.perks.find((p) => p.family === 'QuickHands');
    expect(family?.ranks[0].modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'reloadSkipChance', op: 'ADD', value: 0.06 }),
    );
    expect(result.unresolved.some((u) => u.includes('GetRandomPercent'))).toBe(false);
  });

  it('Bandito01 EP141 → weaponMinRange + weaponMaxRange MUL_ADD 0.25', async () => {
    const formId = '0x002593D5';
    const client = createInMemoryEsmSource({
      records: {
        [formId]: bandito01 as EsmRecord,
        ...plumbingPerkRecords(),
        '0x0004A0A0': {
          header: { signature: 'KYWD', form_id: '0x0004A0A0' },
          editor_id: 'WeaponTypePistol',
          fields: {},
        } as EsmRecord,
        '0x0004A0A2': {
          header: { signature: 'KYWD', form_id: '0x0004A0A2' },
          editor_id: 'WeaponTypeShotgun',
          fields: {},
        } as EsmRecord,
        '0x0004A0A3': {
          header: { signature: 'KYWD', form_id: '0x0004A0A3' },
          editor_id: 'WeaponTypeRifle',
          fields: {},
        } as EsmRecord,
      },
      rows: [{ form_id: formId, record_type: 'PERK', editor_id: 'Bandito01', name: 'Bandito' }],
      resolveEdidFallback: (id) =>
        ({
          '0x0004A0A0': 'WeaponTypePistol',
          '0x0004A0A2': 'WeaponTypeShotgun',
          '0x0004A0A3': 'WeaponTypeRifle',
          '0x002593D5': 'Bandito02',
        })[id] ?? id,
    });
    const result = await extractPerks(client);
    const family = result.perks.find((p) => p.family === 'Bandito');
    expect(family?.ranks[0].modifiers.filter((m) => m.bucket === 'weaponMinRange')).toEqual([
      expect.objectContaining({ op: 'MUL_ADD', value: 0.25 }),
    ]);
    expect(family?.ranks[0].modifiers.filter((m) => m.bucket === 'weaponMaxRange')).toEqual([
      expect.objectContaining({ op: 'MUL_ADD', value: 0.25 }),
    ]);
  });

  it('GunFu01–03 extract dbm bonuses for 2nd/3rd/4th+ VATS targets', async () => {
    const ranks = [
      { formId: '0x0004D881', perk: gunFu01 as EsmRecord, min: 2, value: 0.3 },
      { formId: '0x001D244F', perk: gunFu02 as EsmRecord, min: 3, value: 0.6 },
      { formId: '0x001D245C', perk: gunFu03 as EsmRecord, min: 4, value: 0.9 },
    ] as const;
    const records: Record<string, EsmRecord> = { ...plumbingPerkRecords() };
    const rows: Array<{ form_id: string; record_type: string; editor_id: string; name: string }> =
      [];
    ranks.forEach(({ formId, perk }, i) => {
      records[formId] = perk;
      rows.push({
        form_id: formId,
        record_type: 'PERK',
        editor_id: `GunFu0${i + 1}`,
        name: 'Gun Fu',
      });
    });
    const client = createInMemoryEsmSource({
      records,
      rows,
      getFallback: (target) =>
        ({
          header: { signature: 'PERK', form_id: target },
          editor_id: target,
          fields: {},
        }) as unknown as EsmRecord,
    });
    const result = await extractPerks(client);
    const family = result.perks.find((p) => p.family === 'GunFu');
    expect(family).toBeDefined();
    for (const { min, value } of ranks) {
      const mod = family!.ranks
        .flatMap((r) => r.modifiers)
        .find(
          (m) =>
            m.bucket === 'dbm' &&
            m.conditions.some((c) => c.kind === 'vatsTargetIndex' && c.min === min),
        );
      expect(mod).toEqual(
        expect.objectContaining({
          bucket: 'dbm',
          op: 'MUL_ADD',
          value: expect.closeTo(value, 10),
          conditions: expect.arrayContaining([
            { kind: 'vatsOnly', value: true },
            { kind: 'vatsTargetIndex', min },
          ]),
        }),
      );
    }
  });
});
