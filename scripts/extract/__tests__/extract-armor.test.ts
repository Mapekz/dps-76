import { describe, it, expect } from 'bun:test';
import type { EsmClient, EsmListRow, EsmRecord, EsmRefRow } from '../esm-client';
import { extractArmor, isExcludedArmorEdid } from '../extract-armor';

/**
 * Phase 3 armor pipeline (go-through-every-single-silly-whistle.md):
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

/** Minimal stub EsmClient: canned ARMO rows/records + refs for the obtainability pass. */
function makeStubClient(): EsmClient {
  const rows: EsmListRow[] = [
    {
      form_id: '0xARMO_REAL',
      record_type: 'ARMO',
      editor_id: 'Armor_Test_Torso',
      name: 'Test Torso',
    },
    {
      form_id: '0xARMO_UNREACHABLE',
      record_type: 'ARMO',
      editor_id: 'Armor_Test_Unreachable',
      name: 'Unreachable Torso',
    },
    { form_id: '0xARMO_NONAME', record_type: 'ARMO', editor_id: 'Armor_Test_NoName', name: null },
    { form_id: '0xARMO_SKIN', record_type: 'ARMO', editor_id: 'SkinTestJunk', name: 'Junk Skin' },
  ];
  const records: Record<string, EsmRecord> = {
    '0xARMO_REAL': {
      header: { signature: 'ARMO', form_id: '0xARMO_REAL' },
      editor_id: 'Armor_Test_Torso',
      fields: { Name: 'Test Torso' },
    } as unknown as EsmRecord,
    '0xARMO_UNREACHABLE': {
      header: { signature: 'ARMO', form_id: '0xARMO_UNREACHABLE' },
      editor_id: 'Armor_Test_Unreachable',
      fields: { Name: 'Unreachable Torso' },
    } as unknown as EsmRecord,
    '0xARMO_NONAME': {
      header: { signature: 'ARMO', form_id: '0xARMO_NONAME' },
      editor_id: 'Armor_Test_NoName',
      fields: {},
    } as unknown as EsmRecord,
    '0xARMO_SKIN': {
      header: { signature: 'ARMO', form_id: '0xARMO_SKIN' },
      editor_id: 'SkinTestJunk',
      fields: { Name: 'Junk Skin' },
    } as unknown as EsmRecord,
  };
  const refs: Record<string, EsmRefRow[]> = {
    '0xARMO_REAL': [
      {
        form_id: '0xCOBJ1',
        record_type: 'COBJ',
        editor_id: 'co_armor_Test_Torso',
        name: null,
        depth: 1,
      },
    ],
    '0xARMO_UNREACHABLE': [],
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      return type === 'ARMO' ? rows : [];
    },
    async get(formId: string): Promise<EsmRecord> {
      const r = records[formId];
      if (!r) throw new Error(`unknown formid ${formId}`);
      return r;
    },
    async refs(formId: string): Promise<EsmRefRow[]> {
      return refs[formId] ?? [];
    },
  } as unknown as EsmClient;
}

describe('extractArmor', () => {
  it('pre-filters junk/non-equippable edids and no-Name records before touching obtainability', async () => {
    const result = await extractArmor(makeStubClient());
    const ids = result.armors.map((a) => a.id);
    expect(ids).not.toContain('SkinTestJunk');
    expect(ids).not.toContain('Armor_Test_NoName');
    expect(ids).toContain('Armor_Test_Torso');
    expect(ids).toContain('Armor_Test_Unreachable');
  });

  it('derives obtainable via reverse references, same as weapons (COBJ referencer → obtainable)', async () => {
    const result = await extractArmor(makeStubClient());
    const real = result.armors.find((a) => a.id === 'Armor_Test_Torso')!;
    expect(real.obtainable).toBe(true);
    expect(result.obtainableFormIds.has('0xARMO_REAL')).toBe(true);
  });

  it('keeps an unreachable armor piece in the data flagged obtainable:false (review/rescue, not silently dropped)', async () => {
    const result = await extractArmor(makeStubClient());
    const unreachable = result.armors.find((a) => a.id === 'Armor_Test_Unreachable')!;
    expect(unreachable).toBeDefined();
    expect(unreachable.obtainable).toBe(false);
    expect(result.obtainableFormIds.has('0xARMO_UNREACHABLE')).toBe(false);
  });
});
