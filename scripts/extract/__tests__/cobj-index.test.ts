import { describe, it, expect } from 'vitest';
import type { EsmClient, EsmListRow, EsmRecord } from '../esm-client';
import { buildCobjIndex, isNonGrantingCobj, type CobjInfo } from '../cobj-index';
import cobj10mmBarrelLong from './fixtures/cobj-10mm-barrel-long.json';
import cobjThirstZapper from './fixtures/cobj-thirstzapper-scrap.json';
import cobjChainsawNocraft from './fixtures/cobj-chainsaw-nocraft.json';
import cobjFastTriggerPlan from './fixtures/cobj-assaultrifle-fasttrigger-plan.json';
import cobjBayonetScrap from './fixtures/cobj-blackpowder-bayonet-scrap.json';
import cobj44RepairOnly from './fixtures/cobj-44-repaironly.json';

// Fixtures are verbatim `esm -p get <formid> --json` output (20260710 ESM),
// one per Learn Method / Repair Method shape the parser must handle:
//   cobj-10mm-barrel-long.json              co_mod_10mm_Barrel_Long_Base                       0x002E6947
//     Learn Method 3 (known by default), Repair Method 0, no Learn Recipe From
//   cobj-thirstzapper-scrap.json            co_Weapon_Ranged_NWOT_ThirstZapper                 0x00004174
//     Learn Method 1 (scrapping), Learn Recipe From = its own Created Object,
//     Repair Method 5 on a REAL recipe (proof RM≠5 is not a NOCRAFT signal)
//   cobj-chainsaw-nocraft.json              co_Weapon_Melee_Chainsaw_76_NOCRAFT                0x0001A6E5
//     Learn Method 0, Learn Recipe From = recipe_Dummy_Uncraftable_Item_NOCRAFT
//   cobj-assaultrifle-fasttrigger-plan.json co_mod_AssaultRifle_Receiver_FastTrigger-CritDMG   0x00525025
//     Learn Method 4 (from plan), Learn Recipe From = BOOK 0x00000871
//   cobj-blackpowder-bayonet-scrap.json     co_mod_BlackPowder_Rifle_Bayonet                   0x0032E23F
//     Learn Method 1, Learn Recipe From = WEAP BlackPowder_Rifle 0x00091BB4
//   cobj-44-repaironly.json                 SURVIVAL_co_Weapon_Ranged_44_REPAIRONLY            0x004059D6
const FIXTURES = [
  cobj10mmBarrelLong,
  cobjThirstZapper,
  cobjChainsawNocraft,
  cobjFastTriggerPlan,
  cobjBayonetScrap,
  cobj44RepairOnly,
] as unknown as EsmRecord[];

/** Learn-from targets referenced by the fixtures — minimal records, only the
 *  header/editor_id fields buildCobjIndex reads. */
const LEARN_FROM_RECORDS: EsmRecord[] = [
  {
    header: { signature: 'WEAP', form_id: '0x001128F2' },
    editor_id: 'NWOT_ThirstZapper',
    fields: {},
  },
  {
    header: { signature: 'MISC', form_id: '0x00054A1F' },
    editor_id: 'recipe_Dummy_Uncraftable_Item_NOCRAFT',
    fields: {},
  },
  {
    header: { signature: 'BOOK', form_id: '0x00000871' },
    editor_id: 'recipe_mod_AssaultRifle_Receiver_FastTrigger-CritDMG',
    fields: {},
  },
  {
    header: { signature: 'WEAP', form_id: '0x00091BB4' },
    editor_id: 'BlackPowder_Rifle',
    fields: {},
  },
];

function makeStubClient(): EsmClient {
  const known = new Map<string, EsmRecord>(
    [...FIXTURES, ...LEARN_FROM_RECORDS].map((r) => [r.header.form_id, r]),
  );
  const get = async (target: string): Promise<EsmRecord> => {
    const record = known.get(target);
    if (!record) throw new Error(`stub get: unknown ${target}`);
    return record;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      expect(type).toBe('COBJ');
      return FIXTURES.map((r) => ({
        form_id: r.header.form_id,
        record_type: 'COBJ',
        editor_id: r.editor_id,
        name: null,
      }));
    },
    get,
    bulkGet: (targets: string[]) => Promise.all(targets.map(get)),
  } as unknown as EsmClient;
}

describe('buildCobjIndex', () => {
  it('parses Learn Method / Repair Method / Created Object / Learn Recipe From across all fixture shapes', async () => {
    const index = await buildCobjIndex(makeStubClient());
    expect(index.byFormId.size).toBe(6);

    const barrel = index.byFormId.get('0x002E6947')!;
    expect(barrel).toMatchObject({
      edid: 'co_mod_10mm_Barrel_Long_Base',
      createdObjectFormId: '0x0000469C',
      learnMethod: 3,
      repairMethod: 0,
      learnRecipeFrom: null,
    });

    const zapper = index.byFormId.get('0x00004174')!;
    expect(zapper.learnMethod).toBe(1);
    expect(zapper.repairMethod).toBe(5);
    expect(zapper.createdObjectFormId).toBe('0x001128F2');
    expect(zapper.learnRecipeFrom).toEqual({
      formId: '0x001128F2',
      recordType: 'WEAP',
      edid: 'NWOT_ThirstZapper',
    });

    const plan = index.byFormId.get('0x00525025')!;
    expect(plan.learnMethod).toBe(4);
    expect(plan.learnRecipeFrom).toMatchObject({ recordType: 'BOOK', formId: '0x00000871' });

    const bayonet = index.byFormId.get('0x0032E23F')!;
    expect(bayonet.learnMethod).toBe(1);
    expect(bayonet.learnRecipeFrom).toMatchObject({
      recordType: 'WEAP',
      edid: 'BlackPowder_Rifle',
    });
  });

  it('groups by created object', async () => {
    const index = await buildCobjIndex(makeStubClient());
    expect(index.byCreatedObject.get('0x00080DF5')?.map((c) => c.edid)).toEqual([
      'co_mod_BlackPowder_Rifle_Bayonet',
    ]);
    // Every fixture has a distinct created object → six groups.
    expect(index.byCreatedObject.size).toBe(6);
  });
});

describe('isNonGrantingCobj', () => {
  const info = (overrides: Partial<CobjInfo>): CobjInfo => ({
    formId: '0xC0BA',
    edid: 'co_Something',
    createdObjectFormId: null,
    learnMethod: null,
    repairMethod: null,
    learnRecipeFrom: null,
    ...overrides,
  });

  it('legacy edid suffixes still match without an index entry', () => {
    expect(isNonGrantingCobj(undefined, 'SURVIVAL_co_Weapon_Ranged_44_REPAIRONLY')).toBe(true);
    expect(isNonGrantingCobj(undefined, 'co_Weapon_Melee_Chainsaw_76_NOCRAFT')).toBe(true);
    expect(isNonGrantingCobj(undefined, 'co_mod_10mm_Barrel_Long_Base')).toBe(false);
  });

  it('the dummy uncraftable learn-from marks a recipe non-granting even when the edid lacks the suffix', () => {
    const dummy = info({
      edid: 'co_Weapon_SomethingRealSounding',
      learnRecipeFrom: {
        formId: '0x00054A1F',
        recordType: 'MISC',
        edid: 'recipe_Dummy_Uncraftable_Item_NOCRAFT',
      },
    });
    expect(isNonGrantingCobj(dummy, dummy.edid)).toBe(true);
  });

  it('Repair Method 5 alone does NOT mark a recipe non-granting (real scrap-learn recipes carry it)', () => {
    const zapperish = info({
      edid: 'co_Weapon_Ranged_NWOT_ThirstZapper',
      repairMethod: 5,
      learnMethod: 1,
      learnRecipeFrom: { formId: '0x001128F2', recordType: 'WEAP', edid: 'NWOT_ThirstZapper' },
    });
    expect(isNonGrantingCobj(zapperish, zapperish.edid)).toBe(false);
  });
});
