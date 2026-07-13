import { describe, it, expect } from 'vitest';
import type { EsmRecord } from '../esm-client';
import { toGeneratedPerkCard } from '../extract-perks';
import { flattenPerkConditionRows, translateConditions } from '../normalize/conditions';
import tenderizerCard from './fixtures/pcrd-tenderizercard.json';
import commandoCard from './fixtures/pcrd-commandocard.json';
import actionBoyGirlCard from './fixtures/pcrd-actionboygirlcard.json';
import lgnWhatRadsCard from './fixtures/pcrd-lgnwhatradscard.json';
import ghlGlowingCriticals01 from './fixtures/perk-ghlglowingcriticals01.json';
import ghlMadScientist01 from './fixtures/perk-ghlmadscientist01.json';

// Fixtures are verbatim `esm -p get <formid> --json` output (20260710 ESM).
// These tests pin the PCRD → GeneratedPerkCard normalization and the new
// glowAtLeast (Rads AV) condition translation.

describe('toGeneratedPerkCard', () => {
  it('TenderizerCard (0x003E2202): Charisma, single rank costing 2, not legendary, no race restriction', () => {
    const { card, perkFormIds } = toGeneratedPerkCard(tenderizerCard as unknown as EsmRecord);
    expect(card.special).toBe('Charisma');
    expect(card.costs).toEqual([2]);
    expect(card.minLevel).toBe(46);
    expect(card.raceRestriction).toBeNull();
    expect(card.isLegendaryCard).toBe(false);
    expect(perkFormIds).toEqual(['0x003E21F4']);
  });

  it('CommandoCard (0x0031AEF6): Perception, 3 ranks costing 1/2/3', () => {
    const { card, perkFormIds } = toGeneratedPerkCard(commandoCard as unknown as EsmRecord);
    expect(card.special).toBe('Perception');
    expect(card.costs).toEqual([1, 2, 3]);
    expect(card.isLegendaryCard).toBe(false);
    expect(perkFormIds).toEqual(['0x0031AEEF', '0x0031AEF0', '0x0031AEF1']);
  });

  it('ActionBoyGirlCard (0x00093E84): gender twin — both Male and Female Perk formids surfaced per rank', () => {
    const { card, perkFormIds } = toGeneratedPerkCard(actionBoyGirlCard as unknown as EsmRecord);
    expect(card.special).toBe('Agility');
    expect(card.costs).toEqual([1, 2, 3]);
    expect(card.minLevel).toBe(2);
    // Male Perk then Female Perk, one pair per rank, in rank order.
    expect(perkFormIds).toEqual([
      '0x0004D869',
      '0x0004D872',
      '0x00065DF5',
      '0x00065DF6',
      '0x0017ED8A',
      '0x0017ED8B',
    ]);
  });

  it('LGN_WhatRads_Card (0x005A5943): isLegendaryCard true via "Perk Card Flags", human race restriction', () => {
    const { card, perkFormIds } = toGeneratedPerkCard(lgnWhatRadsCard as unknown as EsmRecord);
    expect(card.isLegendaryCard).toBe(true);
    expect(card.raceRestriction).toBe('human');
    expect(card.special).toBe('Strength');
    expect(card.minLevel).toBe(50);
    expect(card.costs).toEqual([1, 1, 1, 1]);
    expect(perkFormIds).toHaveLength(4);
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

describe('translateConditions (glowAtLeast — Rads AV 0x000002E1, 2026-07-13)', () => {
  it("translates a literal GetValue(Rads) >= 180 row to glowAtLeast (GHL_GlowingCriticals01's entry-point gate)", () => {
    const effects = (ghlGlowingCriticals01 as unknown as EsmRecord).fields['Effects'] as Array<Record<string, unknown>>;
    const perkConditions = (effects[0]['Effect'] as Record<string, unknown>)['Perk Conditions'];
    const rows = flattenPerkConditionRows(perkConditions);
    const { conditions } = translateConditions(rows, { edidByFormId: new Map() });
    expect(conditions).toContainEqual({ kind: 'glowAtLeast', min: 180 });
  });

  it("resolves a GLOB-compared Rads row via globalValues (GHL_MadScientist01's ability grant: GetValue(Rads) >= GLOB GHL_BasicGlowUse=5)", () => {
    const effects = (ghlMadScientist01 as unknown as EsmRecord).fields['Effects'] as Array<Record<string, unknown>>;
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
