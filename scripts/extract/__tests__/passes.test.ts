import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'bun:test';
import type { GeneratedArmor, GeneratedPerk, GeneratedWeapon } from '../../../src/types/generated';
import type { EsmRecord, EsmSource } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';
import { createPassContext, writeOutput, type ExtractorName } from '../pass';
import type { ExtractWeaponsResult } from '../extract-weapons';
import * as extractOmodsModule from '../extract-omods';
import * as conditionsModule from '../normalize/conditions';
import { omodsPass, weaponsPass, bodypartsPass, constantsPass, curvetablesPass } from '../passes';
import fixer from './fixtures/weap-fixer.json';
import avifStrength from './fixtures/avif-strength.json';
import gmstVatsCritBase from './fixtures/gmst-vats-critical-charge-base.json';
import gmstAmmoPerStack from './fixtures/gmst-ammo-spender-ammo-use-per-stack.json';
import gmstCloseDistance from './fixtures/gmst-distance-for-close-damage.json';
import raceHuman from './fixtures/race-human.json';
import racePowerArmor from './fixtures/race-powerarmor.json';
import human from './fixtures/bptd-human.json';
import armorTier22 from './fixtures/curv-creatures-armor-tier22.json';
import percentOfMinToMaxRange from './fixtures/curv-player-range-percentofmintomaxrangedamagemult.json';
import luckVatsCriticalCharge from './fixtures/curv-player-vats-luckvatscriticalcharge.json';
import chargedMeleeAttack from './fixtures/curv-legendarymods-weapon-chargedmeleeattack.json';
import specialLevelReward from './fixtures/curv-player-special-levelrewardcurve.json';
import legendaryPerkSlotCount from './fixtures/curv-player-perks-legendaryperkslotcount.json';

/**
 * Direct coverage for `passes.ts` real pass bodies — complements
 * `pass.test.ts`, which exercises the runner framework with synthetic fake
 * passes. Focus: the stateful `omodsPass` (variant-container rewrite +
 * optionalNeeds disk fallbacks) plus light smoke tests for a few thin passes.
 */

function minimalWeapon(
  overrides: Partial<GeneratedWeapon> & Pick<GeneratedWeapon, 'id' | 'formId'>,
): GeneratedWeapon {
  return {
    name: overrides.name ?? overrides.id,
    weaponTypeName: 'Gun',
    keywords: [],
    isAutomaticFlag: false,
    critDamageMult: 2,
    critChargeBonus: 0,
    sneakAttackMult: 2,
    speed: 1,
    attackDelaySec: 0.1,
    animationAttackSec: 0.1,
    animationFireSec: 0.1,
    reloadSpeed: 1,
    capacity: 10,
    ammoPerShot: 1,
    actionPointCost: 10,
    projectileCount: 1,
    reach: 0,
    secondaryDamage: 0,
    damageBonusMult: 1,
    components: [
      {
        damageType: 'ballistic',
        damageTypeEdid: null,
        amount: 10,
        tier: 1,
        curve: null,
      },
    ],
    defaultModFormIds: overrides.defaultModFormIds ?? [],
    templateModFormIds: overrides.templateModFormIds ?? [],
    eligibleLevels: overrides.eligibleLevels ?? [],
    attachParentSlots: overrides.attachParentSlots ?? [],
    modifiers: overrides.modifiers ?? [],
    ...overrides,
  };
}

function makeOmodsCtx(
  client: EsmSource,
  weapons: GeneratedWeapon[],
  memoryExtras: ReadonlyMap<ExtractorName, unknown> = new Map(),
) {
  const memory = new Map<ExtractorName, unknown>([
    ['weapons', weaponsMemory(weapons)],
    ...memoryExtras.entries(),
  ]);
  return createPassContext(client, 'live', '/unused/out', memory);
}

function weaponsMemory(weapons: GeneratedWeapon[]): ExtractWeaponsResult {
  return {
    weapons,
    excluded: {},
    excludedDetailed: {},
    unresolved: [],
    obtainableFormIds: new Set(weapons.map((w) => w.formId)),
  };
}

function kywdPlaceholder(formId: string): EsmRecord {
  return {
    header: { signature: 'KYWD', form_id: formId },
    editor_id: formId,
    fields: {},
  } as unknown as EsmRecord;
}

/** Harmless PERK stub — `buildAvifRoutes` bulk-gets plumbing perks by editor_id. */
function plumbingPerkFallback(target: string): EsmRecord {
  return {
    header: { signature: 'PERK', form_id: target },
    editor_id: target,
    fields: { Effects: [] },
  } as unknown as EsmRecord;
}

/** Empty OMOD list — no variant containers in the run. */
function emptyOmodsClient(): EsmSource {
  return createInMemoryEsmSource({
    records: {},
    rows: [],
    getFallback: plumbingPerkFallback,
  });
}

describe('omodsPass', () => {
  const CONTAINER_ID = '0x00CA0001';
  const VARIANT_FIRE_ID = '0x00CA0002';
  const VARIANT_POISON_ID = '0x00CA0003';
  const AP_CUSTOM = '0x0047A264';
  const FIRE_ENCH = '0x00CA00E1';
  const POISON_ENCH = '0x00CA00E2';
  const UNRELATED_TEMPLATE_MOD = '0x00CA0099';

  function makeVariantContainerClient(): EsmSource {
    const records: Record<string, EsmRecord> = {
      [CONTAINER_ID]: {
        header: { signature: 'OMOD', form_id: CONTAINER_ID },
        editor_id: 'mod_Test_VariantContainer',
        fields: {
          Name: 'Test Whacker',
          Data: {
            'Property Count': 0,
            'Form Type': { name: 'Weapon' },
            'Attach Point': AP_CUSTOM,
            Includes: [
              { Mod: VARIANT_FIRE_ID, "Don't Use All": { value: 1, name: 'True' } },
              { Mod: VARIANT_POISON_ID, "Don't Use All": { value: 1, name: 'True' } },
            ],
          },
        },
      } as unknown as EsmRecord,
      [VARIANT_FIRE_ID]: {
        header: { signature: 'OMOD', form_id: VARIANT_FIRE_ID },
        editor_id: 'mod_Test_VariantContainer_Fire',
        fields: {
          Data: {
            'Property Count': 1,
            'Form Type': { name: 'Weapon' },
            'Attach Point': AP_CUSTOM,
            Properties: [
              {
                'Function Type': { name: 'ADD' },
                Property: { name: 'Enchantments' },
                'Value 1': FIRE_ENCH,
                'Value 2': 1,
              },
            ],
          },
        },
      } as unknown as EsmRecord,
      [VARIANT_POISON_ID]: {
        header: { signature: 'OMOD', form_id: VARIANT_POISON_ID },
        editor_id: 'mod_Test_VariantContainer_Poison',
        fields: {
          Data: {
            'Property Count': 1,
            'Form Type': { name: 'Weapon' },
            'Attach Point': AP_CUSTOM,
            Properties: [
              {
                'Function Type': { name: 'ADD' },
                Property: { name: 'Enchantments' },
                'Value 1': POISON_ENCH,
                'Value 2': 1,
              },
            ],
          },
        },
      } as unknown as EsmRecord,
      [FIRE_ENCH]: {
        header: { signature: 'ENCH', form_id: FIRE_ENCH },
        editor_id: 'ench_Test_Fire',
        fields: {
          'Effect Data': { 'Target Type': { name: 'Contact' } },
          Effects: [
            {
              Effect: {
                'Base Effect': '0x00CA00A1',
                'Effect Item Data': { Magnitude: 10, Duration: 3 },
              },
            },
          ],
        },
      } as unknown as EsmRecord,
      [POISON_ENCH]: {
        header: { signature: 'ENCH', form_id: POISON_ENCH },
        editor_id: 'ench_Test_Poison',
        fields: {
          'Effect Data': { 'Target Type': { name: 'Contact' } },
          Effects: [
            {
              Effect: {
                'Base Effect': '0x00CA00A2',
                'Effect Item Data': { Magnitude: 5, Duration: 5 },
              },
            },
          ],
        },
      } as unknown as EsmRecord,
      '0x00CA00A1': {
        header: { signature: 'MGEF', form_id: '0x00CA00A1' },
        editor_id: 'mgef_Test_Fire',
        fields: {
          'Magic Effect Data': {
            Data: {
              Archetype: { name: 'Damage' },
              Delivery: { name: 'Contact' },
              'Actor Value': '0x00000000',
            },
          },
        },
      } as unknown as EsmRecord,
      '0x00CA00A2': {
        header: { signature: 'MGEF', form_id: '0x00CA00A2' },
        editor_id: 'mgef_Test_Poison',
        fields: {
          'Magic Effect Data': {
            Data: {
              Archetype: { name: 'Damage' },
              Delivery: { name: 'Contact' },
              'Actor Value': '0x00000000',
            },
          },
        },
      } as unknown as EsmRecord,
      [AP_CUSTOM]: {
        header: { signature: 'KYWD', form_id: AP_CUSTOM },
        editor_id: 'ap_customName',
        fields: {},
      } as unknown as EsmRecord,
    };

    return createInMemoryEsmSource({
      records,
      rows: Object.values(records)
        .filter((r) => r.header.signature === 'OMOD')
        .map((r) => ({
          form_id: r.header.form_id,
          record_type: 'OMOD',
          editor_id: r.editor_id,
          name: (r.fields['Name'] as string) ?? r.editor_id,
        })),
      getFallback: kywdPlaceholder,
    });
  }

  it('with no variant containers: allWeapons untouched and outputs omit weapons.json', async () => {
    const weapon = minimalWeapon({
      id: 'weap_plain',
      formId: '0x00WE0001',
      templateModFormIds: [UNRELATED_TEMPLATE_MOD],
    });
    const before = [...weapon.templateModFormIds];
    const ctx = makeOmodsCtx(emptyOmodsClient(), [weapon]);
    const { result } = await omodsPass.run(ctx);

    expect(weapon.templateModFormIds).toEqual(before);
    expect(result.outputs.map((o) => o.path)).toEqual(['omods.json', 'armor-omods.json']);
  });

  it('rewrites templateModFormIds in place and emits weapons.json when a container matches', async () => {
    const weapon = minimalWeapon({
      id: 'weap_whacker',
      formId: '0x00WE0002',
      templateModFormIds: [CONTAINER_ID, UNRELATED_TEMPLATE_MOD],
    });
    const ctx = makeOmodsCtx(makeVariantContainerClient(), [weapon]);
    const { result } = await omodsPass.run(ctx);

    expect(weapon.templateModFormIds).toEqual([
      VARIANT_FIRE_ID,
      VARIANT_POISON_ID,
      UNRELATED_TEMPLATE_MOD,
    ]);
    const weaponsOutput = result.outputs.find((o) => o.path === 'weapons.json');
    expect(weaponsOutput).toBeDefined();
    expect(weaponsOutput!.content).toBe(ctx.memoryOf('weapons')!.weapons);
    expect((weaponsOutput!.content as GeneratedWeapon[])[0].templateModFormIds).toEqual([
      VARIANT_FIRE_ID,
      VARIANT_POISON_ID,
      UNRELATED_TEMPLATE_MOD,
    ]);
  });

  it('emits weapons.json when any variant container exists, even if one weapon’s templates do not match', async () => {
    const matching = minimalWeapon({
      id: 'weap_match',
      formId: '0x00WE0003',
      templateModFormIds: [CONTAINER_ID],
    });
    const nonMatching = minimalWeapon({
      id: 'weap_other',
      formId: '0x00WE0004',
      templateModFormIds: [UNRELATED_TEMPLATE_MOD],
    });
    const unchanged = [...nonMatching.templateModFormIds];
    const ctx = makeOmodsCtx(makeVariantContainerClient(), [matching, nonMatching]);
    const { result } = await omodsPass.run(ctx);

    expect(matching.templateModFormIds).toEqual([VARIANT_FIRE_ID, VARIANT_POISON_ID]);
    expect(nonMatching.templateModFormIds).toEqual(unchanged);
    expect(result.outputs.some((o) => o.path === 'weapons.json')).toBe(true);
  });

  describe('optionalNeeds disk fallbacks', () => {
    let dir: string;

    beforeEach(async () => {
      dir = await mkdtemp(path.join(tmpdir(), 'passes-test-'));
    });
    afterEach(async () => {
      vi.restoreAllMocks();
      await rm(dir, { recursive: true, force: true });
    });

    it('reads perks.json from disk when perks are not in memory', async () => {
      const perksOnDisk: GeneratedPerk[] = [
        {
          family: 'TestPerk',
          name: 'Test Perk',
          formIds: ['0x00PE0001'],
          maxRank: 1,
          descriptions: ['desc'],
          ranks: [{ rank: 1, modifiers: [] }],
          hasCard: false,
          notes: [],
        },
      ];
      await writeOutput(dir, { path: 'perks.json', content: perksOnDisk });

      const spy = vi.spyOn(conditionsModule, 'buildCrossFamilyRankMap');
      const weapon = minimalWeapon({ id: 'weap_perks', formId: '0x00WE0005' });
      const ctx = createPassContext(
        emptyOmodsClient(),
        'live',
        dir,
        new Map([['weapons', weaponsMemory([weapon])]]),
      );
      await omodsPass.run(ctx);

      expect(spy).toHaveBeenCalledWith([{ family: 'TestPerk', formIds: ['0x00PE0001'] }]);
    });

    it('warns and omits crossFamilyRank when perks.json is missing', async () => {
      const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const spy = vi.spyOn(conditionsModule, 'buildCrossFamilyRankMap');
      const weapon = minimalWeapon({ id: 'weap_no_perks', formId: '0x00WE0006' });
      const ctx = createPassContext(
        emptyOmodsClient(),
        'live',
        dir,
        new Map([['weapons', weaponsMemory([weapon])]]),
      );
      await omodsPass.run(ctx);

      expect(warnSpy.mock.calls.some((c) => String(c[0]).includes('no perks.json found'))).toBe(
        true,
      );
      expect(spy).not.toHaveBeenCalled();
    });

    it('reads armor.json from disk and passes obtainable formIds to extractOmods', async () => {
      const armorOnDisk: GeneratedArmor[] = [
        { id: 'armor_obtain', formId: '0x00AR0001', name: 'Obtainable', obtainable: true },
        { id: 'armor_hidden', formId: '0x00AR0002', name: 'Hidden', obtainable: false },
        { id: 'armor_default', formId: '0x00AR0003', name: 'Default obtainable' },
      ];
      await writeOutput(dir, { path: 'armor.json', content: armorOnDisk });

      const extractSpy = vi.spyOn(extractOmodsModule, 'extractOmods');
      const weapon = minimalWeapon({ id: 'weap_armor', formId: '0x00WE0007' });
      const ctx = createPassContext(
        emptyOmodsClient(),
        'live',
        dir,
        new Map([['weapons', weaponsMemory([weapon])]]),
      );
      await omodsPass.run(ctx);

      const obtainableArmor = extractSpy.mock.calls[0]?.[0]?.obtainableArmorFormIds;
      expect(obtainableArmor).toEqual(new Set(['0x00AR0001', '0x00AR0003']));
    });
  });
});

describe('pass smoke tests', () => {
  it('weaponsPass wires extractWeapons → weapons.json output', async () => {
    const fixerRecord = fixer as unknown as EsmRecord;
    const client = createInMemoryEsmSource({
      records: { '0x0046D2A1': fixerRecord },
      rows: [
        {
          form_id: '0x0046D2A1',
          record_type: 'WEAP',
          editor_id: 'CombatRifle_Fixer',
          name: 'The Fixer',
        },
      ],
      resolveEdidMap: {
        '0x0004A0A1': 'WeaponTypeRifle',
      },
      resolveEdidFallback: (formId) => `kw_${formId}`,
      getFallback: plumbingPerkFallback,
    });
    const ctx = createPassContext(client, 'live', '/unused/out', new Map());
    const { raw, result } = await weaponsPass.run(ctx);

    expect(result.outputs).toEqual([{ path: 'weapons.json', content: raw.weapons }]);
    expect(raw.weapons.some((w) => w.id === 'CombatRifle_Fixer')).toBe(true);
    expect(result.counts).toEqual({ weapons: raw.weapons.length });
  });

  it('bodypartsPass wires extractBodyParts → bodyparts.json output', async () => {
    const records: Record<string, EsmRecord> = {
      HumanRace: {
        header: { signature: 'RACE', form_id: '0x00013746' },
        editor_id: 'HumanRace',
        fields: {
          'Body Part Data': '0x00017AD4',
          Keywords: { Keywords: ['0x0002CB72'] },
        },
      } as unknown as EsmRecord,
      '0x0002CB72': {
        header: { signature: 'KYWD', form_id: '0x0002CB72' },
        editor_id: 'ActorTypeHuman',
        fields: {},
      } as unknown as EsmRecord,
      '0x00017AD4': {
        header: { signature: 'BPTD', form_id: '0x00017AD4' },
        editor_id: 'HumanBodyPartData',
        fields: (human as { fields: unknown }).fields as Record<string, unknown>,
      } as unknown as EsmRecord,
    };
    const client = createInMemoryEsmSource({ records });
    const ctx = createPassContext(client, 'live', '/unused/out', new Map());
    const { raw, result } = await bodypartsPass.run(ctx);

    expect(result.outputs).toEqual([{ path: 'bodyparts.json', content: raw.races }]);
    expect(raw.races.some((r) => r.id === 'HumanRace')).toBe(true);
    expect(result.counts).toEqual({ bodypartRaces: raw.races.length });
  });

  it('constantsPass wires extractConstants → constants.json output', async () => {
    const SPECIAL_FORM_IDS = [
      '0x000002C2',
      '0x000002C3',
      '0x000002C4',
      '0x000002C5',
      '0x000002C6',
      '0x000002C7',
      '0x000002C8',
    ];
    const records: Record<string, EsmRecord> = {
      '0x000002C2': avifStrength as unknown as EsmRecord,
      [gmstVatsCritBase.header.form_id]: gmstVatsCritBase as unknown as EsmRecord,
      [gmstAmmoPerStack.header.form_id]: gmstAmmoPerStack as unknown as EsmRecord,
      [gmstCloseDistance.header.form_id]: gmstCloseDistance as unknown as EsmRecord,
      [raceHuman.header.form_id]: raceHuman as unknown as EsmRecord,
      [racePowerArmor.header.form_id]: racePowerArmor as unknown as EsmRecord,
    };
    for (const formId of SPECIAL_FORM_IDS.slice(1)) {
      records[formId] = {
        header: { signature: 'AVIF', form_id: formId },
        editor_id: 'stub',
        fields: { 'Minimum Value': 1, 'Maximum Value': 100 },
      } as unknown as EsmRecord;
    }
    const RESIST_EXPONENT_FORM_IDS = [
      '0x0017D8A9',
      '0x0017D8A6',
      '0x0017D8AB',
      '0x0017D8A7',
      '0x0017D8A8',
      '0x0017D8AA',
      '0x0017D8AC',
    ];
    const DAMAGE_FACTOR_FORM_IDS = [
      '0x000769CB',
      '0x000769C8',
      '0x000769CD',
      '0x000769C9',
      '0x000769CA',
      '0x000769CC',
      '0x000769CE',
    ];
    const MIN_DAMAGE_REDUCTION_FORM_IDS = [
      '0x00066DC7',
      '0x0006461D',
      '0x0006461C',
      '0x00064620',
      '0x00064623',
    ];
    const MAX_DAMAGE_REDUCTION_FORM_IDS = [
      '0x00066DC6',
      '0x0006461E',
      '0x000559A3',
      '0x0006461B',
      '0x0006461F',
      '0x003C295D',
      '0x00064624',
    ];
    const gmstStub = (formId: string, value: number): EsmRecord =>
      ({
        header: { signature: 'GMST', form_id: formId },
        editor_id: formId,
        fields: { Float: value },
      }) as unknown as EsmRecord;
    for (const formId of RESIST_EXPONENT_FORM_IDS) records[formId] = gmstStub(formId, 0.365);
    for (const formId of DAMAGE_FACTOR_FORM_IDS) records[formId] = gmstStub(formId, 0.15);
    for (const formId of MIN_DAMAGE_REDUCTION_FORM_IDS) records[formId] = gmstStub(formId, 0.01);
    for (const formId of MAX_DAMAGE_REDUCTION_FORM_IDS) records[formId] = gmstStub(formId, 0.99);
    records['0x0004D878'] = gmstStub('0x0004D878', 60);
    records['0x0004D879'] = gmstStub('0x0004D879', 10);

    const client = createInMemoryEsmSource({ records });
    const ctx = createPassContext(client, 'live', '/unused/out', new Map());
    const { raw, result } = await constantsPass.run(ctx);

    expect(result.outputs).toEqual([{ path: 'constants.json', content: raw.constants }]);
    expect(raw.constants.special).toEqual({ min: 1, max: 100 });
    expect(result.counts).toEqual({ constants: 1 });
  });

  it('curvetablesPass routes outputs to ../curvetables (outside outDir)', async () => {
    function dfobRecord(formId: string, editorId: string, target: string): EsmRecord {
      return {
        header: { signature: 'DFOB', form_id: formId },
        editor_id: editorId,
        fields: { Object: target },
      } as unknown as EsmRecord;
    }

    const records: Record<string, EsmRecord> = {
      '0x0076E999': armorTier22 as unknown as EsmRecord,
      '0x008407AD': dfobRecord(
        '0x008407AD',
        'CombatFormulaPercentOfMinToMaxRangeDMGMult_DO',
        '0x008407AC',
      ),
      '0x0065562A': dfobRecord('0x0065562A', 'LuckVATSCriticalChargeCurve_DO', '0x00655629'),
      '0x0089A83C': dfobRecord(
        '0x0089A83C',
        'WeaponSecondaryChargeUpDamageBonusCurve_DO',
        '0x008A3B85',
      ),
      '0x004F4740': dfobRecord('0x004F4740', 'SpecialPointCurve_DO', '0x004F473F'),
      '0x005B67A1': dfobRecord('0x005B67A1', 'LegendaryPerkSlotCurve_DO', '0x005B67A0'),
      '0x008407AC': percentOfMinToMaxRange as unknown as EsmRecord,
      '0x00655629': luckVatsCriticalCharge as unknown as EsmRecord,
      '0x008A3B85': chargedMeleeAttack as unknown as EsmRecord,
      '0x004F473F': specialLevelReward as unknown as EsmRecord,
      '0x005B67A0': legendaryPerkSlotCount as unknown as EsmRecord,
      CT_Player_PercentOfMinToMaxRangeDMGMult: percentOfMinToMaxRange as unknown as EsmRecord,
      CT_LuckVATSCriticalCharge: luckVatsCriticalCharge as unknown as EsmRecord,
      CT_Legendary_Weapon_ChargedUpWeapon: chargedMeleeAttack as unknown as EsmRecord,
      SPECIAL_LevelRewardCurve: specialLevelReward as unknown as EsmRecord,
      LegendaryPerkSlotCount: legendaryPerkSlotCount as unknown as EsmRecord,
    };

    const base = createInMemoryEsmSource({ records });
    const client: EsmSource = {
      ...base,
      async search(pattern, opts = {}) {
        if (pattern.includes('Creatures_Armor') && opts.type === 'CURV') {
          return [
            {
              form_id: '0x0076E999',
              record_type: 'CURV',
              editor_id: 'CT_Creatures_Armor_Universal_Tier22',
              name: null,
            },
          ];
        }
        return base.search(pattern, opts);
      },
    };

    const outDir = await mkdtemp(path.join(tmpdir(), 'passes-curvetables-'));
    const curveDir = path.join(outDir, '..', 'curvetables');
    const ctx = createPassContext(client, 'live', outDir, new Map());
    const { raw, result } = await curvetablesPass.run(ctx);

    expect(
      raw.files.some((f) => f.relativePath === 'creatures/armor/armor_universal_tier22.json'),
    ).toBe(true);
    expect(
      result.outputs.some(
        (o) =>
          o.path === path.join(curveDir, 'creatures/armor/armor_universal_tier22.json') &&
          !o.path.startsWith(outDir),
      ),
    ).toBe(true);
    expect(
      result.outputs.some((o) => o.raw === true && o.path.endsWith('index.generated.ts')),
    ).toBe(true);

    await rm(outDir, { recursive: true, force: true });
  });
});
