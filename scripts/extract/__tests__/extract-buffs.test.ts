import { describe, it, expect } from 'vitest';
import type { EsmClient, EsmRecord } from '../esm-client';
import {
  isExcludedConsumableEdid,
  classifyConsumableCategory,
  buildDispelKeys,
  resolveAddiction,
  extractMutation,
  extractAddictionEffects,
} from '../extract-buffs';
import type { SpellEffect, AvifRoute } from '../normalize/mgef';
import mutationEggHead from './fixtures/spel-mutation-egghead.json';
import mgefTreatedEffect from './fixtures/mgef-mutation-treatedeffect.json';
import mgefReduceStrength from './fixtures/mgef-mutation-reducestrength.json';
import mgefReduceEndurance from './fixtures/mgef-mutation-reduceendurance.json';
import mgefFortifyIntelligence from './fixtures/mgef-mutation-fortifyintelligence.json';
import mgefAbMutationCount from './fixtures/mgef-abmutationcount.json';
import addictionAlcohol from './fixtures/spel-abaddictionalcohol.json';
import mgefReduceAgilityAlcohol from './fixtures/mgef-abreduceagilityalcoholaddiction.json';
import mgefReduceCharismaAlcohol from './fixtures/mgef-abreducecharismaalcoholaddiction.json';
import mgefAbAddictionCount from './fixtures/mgef-abaddictioncount.json';

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

describe('extractMutation (penaltyModifierIds tagging, 2026-07-14)', () => {
  // Real ESM fixtures (20260710 dump): Mutation_EggHead SPEL (0x003C4045) and
  // its five distinct effect MGEFs. FortifyIntelligence appears TWICE in the
  // Effects list (magnitude 6 gated by Mutation_Check_UseNormalVersion,
  // magnitude 8 gated by Mutation_Check_UseSuperVersion — the strangeInNumbers
  // tiers); Mutation_Treated_Effect is suppressed by IsSpellTarget(RadX)=1 and
  // abMutationCount has no AVIF route, so both contribute zero modifiers.
  // The remaining formid/edid pairs (condition params, actor values, the
  // penalty-tag keywords) are resolved via client.resolveEdid — verified
  // against the same dump rather than fixture files, since only their
  // editor_id matters here (see buildDispelKeys' keywordRecords above for the
  // same inline-stub precedent).
  const edidOnly = (formId: string, signature: string, editorId: string): EsmRecord =>
    record({ header: { signature, form_id: formId }, editor_id: editorId });

  const mutationClient = stubClientFor({
    Mutation_EggHead: mutationEggHead as unknown as EsmRecord,
    '0x0028D3BD': mgefTreatedEffect as unknown as EsmRecord,
    '0x003C4038': mgefReduceStrength as unknown as EsmRecord,
    '0x003C4048': mgefReduceEndurance as unknown as EsmRecord,
    '0x003C404A': mgefFortifyIntelligence as unknown as EsmRecord,
    '0x006C2DBC': mgefAbMutationCount as unknown as EsmRecord,
    // Condition-row Parameter 1 formids.
    '0x00024057': edidOnly('0x00024057', 'ALCH', 'RadX'),
    '0x0050A5CB': edidOnly('0x0050A5CB', 'ALCH', 'Serum_EggHead'),
    '0x00467939': edidOnly('0x00467939', 'CNDF', 'Mutation_Check_UseNormalVersion'),
    '0x0046793B': edidOnly('0x0046793B', 'CNDF', 'Mutation_Check_UseSuperVersion'),
    // Actor Value formids the effects target.
    '0x000002C2': edidOnly('0x000002C2', 'AVIF', 'Strength'),
    '0x000002C4': edidOnly('0x000002C4', 'AVIF', 'Endurance'),
    '0x000002C6': edidOnly('0x000002C6', 'AVIF', 'Intelligence'),
    '0x006C2DBA': edidOnly('0x006C2DBA', 'AVIF', 'MutationCount'),
    // Penalty-tag keyword formids, resolved in extractMutation's own loop.
    '0x00391F0F': edidOnly('0x00391F0F', 'KYWD', 'AbilityTypeMutation_NegativeEffect'),
    '0x003808CE': edidOnly('0x003808CE', 'KYWD', 'AbilityTypeMutation'),
    '0x003808D3': edidOnly('0x003808D3', 'KYWD', 'AbilityTypeMutation_PositiveEffect'),
  });

  it('emits specialStrength/specialEndurance −3 and specialIntelligence +6/+8, tagging exactly the two negatives as penaltyModifierIds', async () => {
    const notes: string[] = [];
    const unmapped = new Set<string>();
    const buff = await extractMutation(
      mutationClient,
      'Mutation_EggHead',
      new Map<string, AvifRoute[]>(),
      new Map<string, string>(),
      notes,
      unmapped
    );

    expect(buff).not.toBeNull();
    const mods = buff!.modifiers;
    // Order mirrors the SPEL's Effects list; Mutation_Treated_Effect and
    // abMutationCount contribute zero modifiers each (see comment above).
    expect(mods).toHaveLength(4);
    expect(mods[0]).toMatchObject({ bucket: 'specialStrength', op: 'ADD', value: -3, conditions: [] });
    expect(mods[1]).toMatchObject({ bucket: 'specialEndurance', op: 'ADD', value: -3, conditions: [] });
    expect(mods[2]).toMatchObject({
      bucket: 'specialIntelligence',
      op: 'ADD',
      value: 6,
      conditions: [{ kind: 'strangeInNumbers', value: false }],
    });
    expect(mods[3]).toMatchObject({
      bucket: 'specialIntelligence',
      op: 'ADD',
      value: 8,
      conditions: [{ kind: 'strangeInNumbers', value: true }],
    });

    expect(buff!.penaltyModifierIds).toEqual([mods[0].id, mods[1].id]);
  });
});

describe('extractAddictionEffects (2026-07-14)', () => {
  // Real ESM fixtures: AbAddictionAlcohol SPEL (0x0003E061), whose Effects
  // list is exactly [abReduceAgilityAlcoholAddiction, abReduceCharismaAlcoholAddiction,
  // abAddictionCount] — the last MUST be skipped by edid (bookkeeping, no AV
  // route note) per ADDICTION_BOOKKEEPING_MGEF_EDIDS.
  const edidOnly = (formId: string, editorId: string): EsmRecord =>
    record({ header: { signature: 'AVIF', form_id: formId }, editor_id: editorId });

  const addictionClient = stubClientFor({
    '0x0010224F': mgefReduceAgilityAlcohol as unknown as EsmRecord,
    '0x00102251': mgefReduceCharismaAlcohol as unknown as EsmRecord,
    '0x001EB997': mgefAbAddictionCount as unknown as EsmRecord,
    '0x000002C7': edidOnly('0x000002C7', 'Agility'),
    '0x000002C5': edidOnly('0x000002C5', 'Charisma'),
  });

  it('emits unconditional specialAgility/specialCharisma −1 addiction modifiers and skips abAddictionCount entirely', async () => {
    const unmapped = new Set<string>();
    const { modifiers, notes } = await extractAddictionEffects(
      addictionClient,
      addictionAlcohol as unknown as EsmRecord,
      new Map<string, AvifRoute[]>(),
      new Map<string, string>(),
      unmapped
    );

    expect(modifiers).toHaveLength(2);
    expect(modifiers[0]).toMatchObject({ bucket: 'specialAgility', op: 'ADD', value: -1, conditions: [] });
    expect(modifiers[1]).toMatchObject({ bucket: 'specialCharisma', op: 'ADD', value: -1, conditions: [] });
    expect(modifiers[0].source.kind).toBe('addiction');
    expect(modifiers[1].source.kind).toBe('addiction');

    // abAddictionCount is bookkeeping-only: no "no route for AV" note leaks
    // through (it would if the skip-by-edid guard regressed).
    expect(notes.some(n => n.includes('no route for AV'))).toBe(false);
  });
});
