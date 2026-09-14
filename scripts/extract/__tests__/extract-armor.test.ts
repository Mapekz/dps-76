import { beforeAll, describe, it, expect } from 'bun:test';
import type { EsmRecord, EsmRefRow } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';
import { extractArmor, isExcludedArmorEdid } from '../extract-armor';
import { listRows, refRow, stubRecord } from './esm-stubs';

/**
 * Phase 3 armor pipeline (docs/assumptions.md "Armor extraction pipeline"):
 * extract-armor.ts is obtainability-grounding only (no resistances, no mod
 * slots — see its own doc comment). These tests pin the two things it's
 * responsible for: the dev/non-equippable-prefix pre-filter, and that
 * obtainability derivation reuses the same reverse-reference machinery as
 * weapons (ObtainabilityClassifier, no special-casing needed).
 */

describe('isExcludedArmorEdid', () => {
  it('drops creature/actor skins, FX camera overlays, and NPC-only creature clothes', () => {
    expect(isExcludedArmorEdid('SkinMothman')).toBe(true);
    expect(isExcludedArmorEdid('SkinNaked')).toBe(true);
    expect(isExcludedArmorEdid('FX1stPersonGroggyWakeArmor')).toBe(true);
    expect(isExcludedArmorEdid('CreatureClothes_FeralGhoulParkUniform')).toBe(true);
  });

  it('drops standard dev/dead-record prefixes', () => {
    expect(isExcludedArmorEdid('zzz_TestArmor')).toBe(true);
    expect(isExcludedArmorEdid('cut_OldArmor')).toBe(true);
    expect(isExcludedArmorEdid('DEBUG_Armor')).toBe(true);
  });

  it('keeps real player-equippable armor edids', () => {
    expect(isExcludedArmorEdid('Armor_Combat_Torso')).toBe(false);
    expect(isExcludedArmorEdid('Armor_Enclave_Underarmor_Uniform')).toBe(false);
    expect(isExcludedArmorEdid('ATX_Clothes_MilitaryOfficerUniform')).toBe(false);
  });
});

/** Minimal in-memory source: canned ARMO rows/records + refs for the obtainability pass. */
function makeStubClient() {
  const records: Record<string, EsmRecord> = {
    '0xARMO_REAL': stubRecord('ARMO', '0xARMO_REAL', 'Armor_Test_Torso', { Name: 'Test Torso' }),
    '0xARMO_UNREACHABLE': stubRecord('ARMO', '0xARMO_UNREACHABLE', 'Armor_Test_Unreachable', {
      Name: 'Unreachable Torso',
    }),
    '0xARMO_NONAME': stubRecord('ARMO', '0xARMO_NONAME', 'Armor_Test_NoName'),
    '0xARMO_SKIN': stubRecord('ARMO', '0xARMO_SKIN', 'SkinTestJunk', { Name: 'Junk Skin' }),
  };
  const refs: Record<string, EsmRefRow[]> = {
    '0xARMO_REAL': [refRow('COBJ', '0xCOBJ1', 'co_armor_Test_Torso')],
    '0xARMO_UNREACHABLE': [],
  };
  return createInMemoryEsmSource({ rows: listRows(Object.values(records)), records, refs });
}

describe('extractArmor', () => {
  let result: Awaited<ReturnType<typeof extractArmor>>;
  beforeAll(async () => {
    result = await extractArmor(makeStubClient());
  });

  it('pre-filters junk/non-equippable edids and no-Name records before touching obtainability', () => {
    const ids = result.armors.map((a) => a.id);
    expect(ids).not.toContain('SkinTestJunk');
    expect(ids).not.toContain('Armor_Test_NoName');
    expect(ids).toContain('Armor_Test_Torso');
    expect(ids).toContain('Armor_Test_Unreachable');
  });

  it('derives obtainable via reverse references, same as weapons (COBJ referencer → obtainable)', () => {
    const real = result.armors.find((a) => a.id === 'Armor_Test_Torso')!;
    expect(real.obtainable).toBe(true);
    expect(result.obtainableFormIds.has('0xARMO_REAL')).toBe(true);
  });

  it('keeps an unreachable armor piece in the data flagged obtainable:false (review/rescue, not silently dropped)', () => {
    const unreachable = result.armors.find((a) => a.id === 'Armor_Test_Unreachable')!;
    expect(unreachable).toBeDefined();
    expect(unreachable.obtainable).toBe(false);
    expect(result.obtainableFormIds.has('0xARMO_UNREACHABLE')).toBe(false);
  });
});
