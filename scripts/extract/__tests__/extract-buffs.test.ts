import { describe, it, expect } from 'vitest';
import type { EsmClient, EsmRecord } from '../esm-client';
import {
  isExcludedConsumableEdid,
  classifyConsumableCategory,
  buildDispelKeys,
  resolveAddiction,
} from '../extract-buffs';
import type { SpellEffect } from '../normalize/mgef';

// Stubbed-client pattern from obtainability.test.ts: cast a plain object
// implementing only the EsmClient methods each helper actually calls.

function record(overrides: Partial<EsmRecord> & { fields?: Record<string, unknown> } = {}): EsmRecord {
  return {
    header: { signature: 'ALCH', form_id: '0xDEFAULT' },
    editor_id: 'Default',
    fields: {},
    ...overrides,
  } as EsmRecord;
}

describe('isExcludedConsumableEdid', () => {
  it('filters junk-prefixed edids (zzz_/cut_/DEPRECATED_/deleted/test/debug/post_)', () => {
    expect(isExcludedConsumableEdid('zzz_Psycho_Babylon')).toBe(true);
    expect(isExcludedConsumableEdid('cut_RefreshingBeverage')).toBe(true);
    expect(isExcludedConsumableEdid('DEPRECATED_SomeChem')).toBe(true);
    expect(isExcludedConsumableEdid('deleted_Foo')).toBe(true);
    expect(isExcludedConsumableEdid('test_Something')).toBe(true);
    expect(isExcludedConsumableEdid('debug_Something')).toBe(true);
    expect(isExcludedConsumableEdid('post_Something')).toBe(true);
  });

  it('keeps real content (Buffout survives the pre-filter)', () => {
    expect(isExcludedConsumableEdid('Buffout')).toBe(false);
    expect(isExcludedConsumableEdid('Psycho')).toBe(false);
  });
});

describe('classifyConsumableCategory', () => {
  it('magazine (dedicated MagazineKeyword, e.g. Guns and Bullets issues)', () => {
    expect(classifyConsumableCategory(['MagazineKeyword', 'MagazineTypeGunsAndBullets'])).toBe('magazine');
  });

  it('bobblehead (dedicated BobbleheadKeyword, e.g. Strength/Small Guns bobbleheads)', () => {
    expect(classifyConsumableCategory(['BobbleheadKeyword', 'BobbleheadTypeStrength'])).toBe('bobblehead');
  });

  it('chem takes top priority', () => {
    expect(classifyConsumableCategory(['ObjectTypeChem', 'ChemTutorialKeyword'])).toBe('chem');
  });

  it('alcohol = ObjectTypeDrink ∧ DrinkTypeAlcohol', () => {
    expect(classifyConsumableCategory(['ObjectTypeDrink', 'DrinkTypeAlcohol'])).toBe('alcohol');
  });

  it('plain drink when the alcohol keyword is absent', () => {
    expect(classifyConsumableCategory(['ObjectTypeDrink', 'DrinkIconGeneric'])).toBe('drink');
  });

  it('purified water case: food+drink keywords both present → drink wins (priority order)', () => {
    expect(classifyConsumableCategory(['ObjectTypeFood', 'ObjectTypeDrink'])).toBe('drink');
  });

  it('plain food', () => {
    expect(classifyConsumableCategory(['ObjectTypeFood', 'MealTypeCooked'])).toBe('food');
  });

  it('serums / raw ingredients / generic potions with none of the category keywords → null', () => {
    expect(classifyConsumableCategory(['ObjectTypeSerum'])).toBeNull();
    expect(classifyConsumableCategory([])).toBeNull();
  });
});

function stubClientFor(records: Record<string, EsmRecord>): EsmClient {
  return {
    async get(target: string): Promise<EsmRecord> {
      const rec = records[target];
      if (!rec) throw new Error(`not found: ${target}`);
      return rec;
    },
    async resolveEdid(formId: string): Promise<string> {
      return records[formId]?.editor_id ?? `<unresolved:${formId}>`;
    },
  } as unknown as EsmClient;
}

function spellEffect(mgefFormId: string): SpellEffect {
  return {
    mgefFormId,
    magnitude: 0,
    duration: 0,
    conditionRows: [],
    curvePoints: null,
    curveInputAv: null,
    magnitudeGlobal: null,
  };
}

describe('buildDispelKeys', () => {
  // Mirrors the real proof point (esm get FortifyStrengthChemEffect /
  // FortifyStrengthFood, 20260710 ESM — see fixtures/mgef-fortifystrengthchemeffect.json):
  // both are "Dispel with Keywords" MGEFs carrying a broad shared keyword
  // (ChemEffect / FoodEffect) plus ONE discriminating keyword
  // (StackBuffStrength / FoodDispelEffect_Strength) — different
  // discriminators ⇒ different dispel keys, so chem STR never collides with
  // food STR even though both are "+Strength".
  function mgefRecord(formId: string, edid: string, opts: { dispel: boolean; keywords: string[] }): EsmRecord {
    return {
      header: { signature: 'MGEF', form_id: formId },
      editor_id: edid,
      fields: {
        Keywords: { Keywords: opts.keywords },
        'Magic Effect Data': {
          Data: {
            Archetype: { name: 'Peak Value Modifier' },
            Flags: { value: '0x0', flags: opts.dispel ? ['Dispel with Keywords'] : [] },
          },
        },
      },
    } as unknown as EsmRecord;
  }

  const strChem = mgefRecord('0xCHEM_STR', 'FortifyStrengthChemEffect', {
    dispel: true,
    keywords: ['0xKW_CHEM_EFFECT', '0xKW_STACK_STR', '0xKW_CHEM_DISPEL'],
  });
  const strFood = mgefRecord('0xFOOD_STR', 'FortifyStrengthFood', {
    dispel: true,
    keywords: ['0xKW_FOOD_EFFECT', '0xKW_FOOD_DISPEL_STR', '0xKW_SURV_FOOD'],
  });
  const nonDispel = mgefRecord('0xNON_DISPEL', 'SomeOtherEffect', { dispel: false, keywords: ['0xKW_WHATEVER'] });
  const keywordRecords: Record<string, EsmRecord> = {
    '0xKW_CHEM_EFFECT': mgefRecord('0xKW_CHEM_EFFECT', 'ChemEffect', { dispel: false, keywords: [] }),
    '0xKW_STACK_STR': mgefRecord('0xKW_STACK_STR', 'StackBuffStrength', { dispel: false, keywords: [] }),
    '0xKW_CHEM_DISPEL': mgefRecord('0xKW_CHEM_DISPEL', 'ChemDispelEffects', { dispel: false, keywords: [] }),
    '0xKW_FOOD_EFFECT': mgefRecord('0xKW_FOOD_EFFECT', 'FoodEffect', { dispel: false, keywords: [] }),
    '0xKW_FOOD_DISPEL_STR': mgefRecord('0xKW_FOOD_DISPEL_STR', 'FoodDispelEffect_Strength', { dispel: false, keywords: [] }),
    '0xKW_SURV_FOOD': mgefRecord('0xKW_SURV_FOOD', 'SURV_EffectTypeFoodBuff', { dispel: false, keywords: [] }),
    '0xKW_WHATEVER': mgefRecord('0xKW_WHATEVER', 'SomeKeyword', { dispel: false, keywords: [] }),
  };

  it('a dispel-flagged effect contributes a sorted, joined keyword-set key', async () => {
    const client = stubClientFor({ '0xCHEM_STR': strChem, ...keywordRecords });
    const keys = await buildDispelKeys(client, [spellEffect('0xCHEM_STR')]);
    expect(keys).toEqual(['ChemDispelEffects|ChemEffect|StackBuffStrength']);
  });

  it('a non-dispel-flagged effect contributes nothing', async () => {
    const client = stubClientFor({ '0xNON_DISPEL': nonDispel, ...keywordRecords });
    const keys = await buildDispelKeys(client, [spellEffect('0xNON_DISPEL')]);
    expect(keys).toEqual([]);
  });

  it('chem STR and food STR carry DIFFERENT keys (different discriminating keyword)', async () => {
    const client = stubClientFor({ '0xCHEM_STR': strChem, '0xFOOD_STR': strFood, ...keywordRecords });
    const chemKeys = await buildDispelKeys(client, [spellEffect('0xCHEM_STR')]);
    const foodKeys = await buildDispelKeys(client, [spellEffect('0xFOOD_STR')]);
    expect(chemKeys).not.toEqual(foodKeys);
  });

  it('dedupes identical keys across multiple effects on the same buff', async () => {
    const client = stubClientFor({ '0xCHEM_STR': strChem, ...keywordRecords });
    const keys = await buildDispelKeys(client, [spellEffect('0xCHEM_STR'), spellEffect('0xCHEM_STR')]);
    expect(keys).toEqual(['ChemDispelEffects|ChemEffect|StackBuffStrength']);
  });
});

describe('resolveAddiction', () => {
  it('resolves a valid Addiction SPEL formid to id/formId/name (Buffout → AbAddictionBuffout)', async () => {
    const addictionSpel: EsmRecord = {
      header: { signature: 'SPEL', form_id: '0x0004BAE0' },
      editor_id: 'AbAddictionBuffout',
      fields: { Name: 'Buffout Addiction' },
    } as unknown as EsmRecord;
    const client = stubClientFor({ '0x0004BAE0': addictionSpel });
    const buffout = record({ fields: { 'Effect Data': { Addiction: '0x0004BAE0' } } });
    const notes = new Set<string>();
    const ref = await resolveAddiction(client, buffout, notes);
    expect(ref).toEqual({ id: 'AbAddictionBuffout', formId: '0x0004BAE0', name: 'Buffout Addiction' });
    expect(notes.size).toBe(0);
  });

  it('returns undefined when Effect Data.Addiction is absent (null) — e.g. Milk_Chally', async () => {
    const client = stubClientFor({});
    const milkChally = record({ fields: { 'Effect Data': { Addiction: null } } });
    const ref = await resolveAddiction(client, milkChally, new Set());
    expect(ref).toBeUndefined();
  });

  it("returns undefined for the zero formid '0x00000000'", async () => {
    const client = stubClientFor({});
    const nonAddictive = record({ fields: { 'Effect Data': { Addiction: '0x00000000' } } });
    const ref = await resolveAddiction(client, nonAddictive, new Set());
    expect(ref).toBeUndefined();
  });

  it('returns undefined when Effect Data is entirely missing', async () => {
    const client = stubClientFor({});
    const bare = record({ fields: {} });
    const ref = await resolveAddiction(client, bare, new Set());
    expect(ref).toBeUndefined();
  });
});
