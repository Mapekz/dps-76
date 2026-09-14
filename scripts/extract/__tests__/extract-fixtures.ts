import type { EsmRecord, EsmSource } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';
import { kywdPlaceholder, listRows, stubRecord } from './esm-stubs';
import armorTier22 from './fixtures/curv-creatures-armor-tier22.json';
import armorTier49Zzz from './fixtures/curv-creatures-armor-tier49-zzz.json';
import percentOfMinToMaxRange from './fixtures/curv-player-range-percentofmintomaxrangedamagemult.json';
import luckVatsCriticalCharge from './fixtures/curv-player-vats-luckvatscriticalcharge.json';
import chargedMeleeAttack from './fixtures/curv-legendarymods-weapon-chargedmeleeattack.json';
import specialLevelReward from './fixtures/curv-player-special-levelrewardcurve.json';
import legendaryPerkSlotCount from './fixtures/curv-player-perks-legendaryperkslotcount.json';
import gmstVatsCritBase from './fixtures/gmst-vats-critical-charge-base.json';
import gmstAmmoPerStack from './fixtures/gmst-ammo-spender-ammo-use-per-stack.json';
import gmstCloseDistance from './fixtures/gmst-distance-for-close-damage.json';
import raceHuman from './fixtures/race-human.json';
import racePowerArmor from './fixtures/race-powerarmor.json';
import human from './fixtures/bptd-human.json';

// ── Variant container (extract-omods variant split + omodsPass template rewrite) ──

export const CONTAINER_ID = '0x00CA0001';
export const VARIANT_FIRE_ID = '0x00CA0002';
export const VARIANT_POISON_ID = '0x00CA0003';
const AP_CUSTOM = '0x0047A264';
const FIRE_ENCH = '0x00CA00E1';
const POISON_ENCH = '0x00CA00E2';

function variantOmod(formId: string, editorId: string, enchFormId: string): EsmRecord {
  return stubRecord('OMOD', formId, editorId, {
    Data: {
      'Property Count': 1,
      'Form Type': { name: 'Weapon' },
      'Attach Point': AP_CUSTOM,
      Properties: [
        {
          'Function Type': { name: 'ADD' },
          Property: { name: 'Enchantments' },
          'Value 1': enchFormId,
          'Value 2': 1,
        },
      ],
    },
  });
}

function contactEnch(
  formId: string,
  editorId: string,
  mgefFormId: string,
  magnitude: number,
  duration: number,
): EsmRecord {
  return stubRecord('ENCH', formId, editorId, {
    'Effect Data': { 'Target Type': { name: 'Contact' } },
    Effects: [
      {
        Effect: {
          'Base Effect': mgefFormId,
          'Effect Item Data': { Magnitude: magnitude, Duration: duration },
        },
      },
    ],
  });
}

function contactDamageMgef(formId: string, editorId: string): EsmRecord {
  return stubRecord('MGEF', formId, editorId, {
    'Magic Effect Data': {
      Data: {
        Archetype: { name: 'Damage' },
        Delivery: { name: 'Contact' },
        'Actor Value': '0x00000000',
      },
    },
  });
}

/** "Test Whacker" container OMOD whose `Don't Use All` Includes split into Fire/Poison variants. */
export function variantContainerClient(): EsmSource {
  const records: Record<string, EsmRecord> = {
    [CONTAINER_ID]: stubRecord('OMOD', CONTAINER_ID, 'mod_Test_VariantContainer', {
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
    }),
    [VARIANT_FIRE_ID]: variantOmod(VARIANT_FIRE_ID, 'mod_Test_VariantContainer_Fire', FIRE_ENCH),
    [VARIANT_POISON_ID]: variantOmod(
      VARIANT_POISON_ID,
      'mod_Test_VariantContainer_Poison',
      POISON_ENCH,
    ),
    [FIRE_ENCH]: contactEnch(FIRE_ENCH, 'ench_Test_Fire', '0x00CA00A1', 10, 3),
    [POISON_ENCH]: contactEnch(POISON_ENCH, 'ench_Test_Poison', '0x00CA00A2', 5, 5),
    '0x00CA00A1': contactDamageMgef('0x00CA00A1', 'mgef_Test_Fire'),
    '0x00CA00A2': contactDamageMgef('0x00CA00A2', 'mgef_Test_Poison'),
    [AP_CUSTOM]: stubRecord('KYWD', AP_CUSTOM, 'ap_customName'),
  };
  return createInMemoryEsmSource({
    records,
    rows: listRows(Object.values(records).filter((r) => r.header.signature === 'OMOD')),
    getFallback: kywdPlaceholder,
  });
}

// ── Curve tables (extractCurveTables + curvetablesPass) ──

/**
 * Every singleton's DFOB-first chain (DFOB by formid → `Object` → CURV by
 * formid, same as `resolveSingletonRecord`) plus the Armor Tier22/Tier49 group
 * CURVs. Singleton CURVs are ALSO keyed by editor_id for the DFOB-failure
 * fallback path.
 */
export function curveTableRecords(): Record<string, EsmRecord> {
  const dfob = (formId: string, editorId: string, target: string) =>
    stubRecord('DFOB', formId, editorId, { Object: target });
  return {
    '0x0076E999': armorTier22 as unknown as EsmRecord,
    '0x0076E9B4': armorTier49Zzz as unknown as EsmRecord,
    '0x008407AD': dfob('0x008407AD', 'CombatFormulaPercentOfMinToMaxRangeDMGMult_DO', '0x008407AC'),
    '0x0065562A': dfob('0x0065562A', 'LuckVATSCriticalChargeCurve_DO', '0x00655629'),
    '0x0089A83C': dfob('0x0089A83C', 'WeaponSecondaryChargeUpDamageBonusCurve_DO', '0x008A3B85'),
    '0x004F4740': dfob('0x004F4740', 'SpecialPointCurve_DO', '0x004F473F'),
    '0x005B67A1': dfob('0x005B67A1', 'LegendaryPerkSlotCurve_DO', '0x005B67A0'),
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
}

/**
 * Only the Creatures/Armor group's pattern is served from `searchRows` — the
 * other 3 groups return empty (landing in `files: []`, not `unresolved`).
 * Intentionally looser than real esm glob matching so a search hit with no
 * parseable tier suffix still surfaces.
 */
export function curveTableClient(
  searchRows: Array<{ form_id: string; editor_id: string }>,
  records: Record<string, EsmRecord> = curveTableRecords(),
): EsmSource {
  const base = createInMemoryEsmSource({ records });
  return {
    ...base,
    async search(pattern, opts = {}) {
      if (pattern.includes('Creatures_Armor') && opts.type === 'CURV') {
        return searchRows.map((r) => ({ ...r, record_type: 'CURV', name: null }));
      }
      return base.search(pattern, opts);
    },
  };
}

// ── Constants (extractConstants + constantsPass) ──

// Mirrors extract-constants.ts's own SPECIAL AVIF and GMST family FormID
// lists (duplicated here rather than exported).
export const SPECIAL_FORM_IDS = [
  '0x000002C2',
  '0x000002C3',
  '0x000002C4',
  '0x000002C5',
  '0x000002C6',
  '0x000002C7',
  '0x000002C8',
];
const RESIST_EXPONENT_FORM_IDS = [
  '0x0017D8A9',
  '0x0017D8A6',
  '0x0017D8AB',
  '0x0017D8A7',
  '0x0017D8A8',
  '0x0017D8AA',
  '0x0017D8AC',
];
export const DAMAGE_FACTOR_FORM_IDS = [
  '0x000769CB',
  '0x000769C8',
  '0x000769CD',
  '0x000769C9',
  '0x000769CA',
  '0x000769CC',
  '0x000769CE',
];
export const MIN_DAMAGE_REDUCTION_FORM_IDS = [
  '0x00066DC7',
  '0x0006461D',
  '0x0006461C',
  '0x00064620',
  '0x00064623',
];
export const MAX_DAMAGE_REDUCTION_FORM_IDS = [
  '0x00066DC6',
  '0x0006461E',
  '0x000559A3',
  '0x0006461B',
  '0x0006461F',
  '0x003C295D',
  '0x00064624',
];

/** Mirrors extract-constants.ts's own vatsCrit/actionPoints/bulletStorm FormIDs (duplicated, same convention as the lists above). */
export const VATS_CRIT_CHARGE_BASE_FORM_ID = '0x00249662';
export const AP_POOL_BASE_FORM_ID = '0x0004D878';
const AP_POOL_PER_AGILITY_FORM_ID = '0x0004D879';
export const BULLET_STORM_AMMO_PER_STACK_FORM_ID = '0x0083C3D0';
export const HUMAN_RACE_FORM_ID = '0x00013746';
export const POWER_ARMOR_RACE_FORM_ID = '0x0001D31E';
export const CLOSE_THRESHOLD_FORM_ID = '0x007D2391';

export function avifStub(formId: string, editorId: string, min: number, max: number): EsmRecord {
  return stubRecord('AVIF', formId, editorId, { 'Minimum Value': min, 'Maximum Value': max });
}

export function gmstStub(formId: string, editorId: string, value: number): EsmRecord {
  return stubRecord('GMST', formId, editorId, { Float: value });
}

export function gmstUIntStub(formId: string, editorId: string, value: number): EsmRecord {
  return stubRecord('GMST', formId, editorId, { UInt: value });
}

/** A full set of valid SPECIAL AVIF records (uniform [1, 100] stubs). */
export function uniformSpecialRecords(): Record<string, EsmRecord> {
  const records: Record<string, EsmRecord> = {};
  for (const formId of SPECIAL_FORM_IDS) records[formId] = avifStub(formId, 'stub', 1, 100);
  return records;
}

/** A full set of valid mitigation GMST records (uniform, real values) — merged into SPECIAL-focused fixtures so they don't spuriously flag mitigation as unresolved. */
export function uniformMitigationRecords(): Record<string, EsmRecord> {
  const records: Record<string, EsmRecord> = {};
  for (const formId of RESIST_EXPONENT_FORM_IDS) records[formId] = gmstStub(formId, 'stub', 0.365);
  for (const formId of DAMAGE_FACTOR_FORM_IDS) records[formId] = gmstStub(formId, 'stub', 0.15);
  for (const formId of MIN_DAMAGE_REDUCTION_FORM_IDS)
    records[formId] = gmstStub(formId, 'stub', 0.01);
  for (const formId of MAX_DAMAGE_REDUCTION_FORM_IDS)
    records[formId] = gmstStub(formId, 'stub', 0.99);
  return records;
}

/** A full set of valid vatsCrit/actionPoints/bulletStorm/distance records (uniform, real values) — merged into SPECIAL/mitigation-focused fixtures so they don't spuriously flag these families as unresolved. */
export function uniformNewConstantsRecords(): Record<string, EsmRecord> {
  return {
    [VATS_CRIT_CHARGE_BASE_FORM_ID]: gmstVatsCritBase as unknown as EsmRecord,
    [AP_POOL_BASE_FORM_ID]: gmstStub(AP_POOL_BASE_FORM_ID, 'fAVDActionPointsBase', 60),
    [AP_POOL_PER_AGILITY_FORM_ID]: gmstStub(
      AP_POOL_PER_AGILITY_FORM_ID,
      'fAVDActionPointsMult',
      10,
    ),
    [BULLET_STORM_AMMO_PER_STACK_FORM_ID]: gmstAmmoPerStack as unknown as EsmRecord,
    [HUMAN_RACE_FORM_ID]: raceHuman as unknown as EsmRecord,
    [POWER_ARMOR_RACE_FORM_ID]: racePowerArmor as unknown as EsmRecord,
    [CLOSE_THRESHOLD_FORM_ID]: gmstCloseDistance as unknown as EsmRecord,
  };
}

/** Every constants family resolving cleanly from uniform stubs + real fixtures. */
export function validConstantsRecords(): Record<string, EsmRecord> {
  return {
    ...uniformSpecialRecords(),
    ...uniformMitigationRecords(),
    ...uniformNewConstantsRecords(),
  };
}

// ── Human body parts (extractBodyParts + bodypartsPass) ──

/** HumanRace keyed by edid and formid, its three KWDA keywords, and the real Human BPTD. */
export function humanBodyPartRecords(): Record<string, EsmRecord> {
  const humanRace = stubRecord('RACE', '0x00013746', 'HumanRace', {
    'Body Part Data': '0x00017AD4',
    // Mixed KWDA: only the ActorType* entries survive into `keywords`.
    Keywords: { Keywords: ['0x0002CB72', '0x00013794', '0x00249612'] },
  });
  return {
    HumanRace: humanRace,
    '0x00013746': humanRace,
    '0x0002CB72': stubRecord('KYWD', '0x0002CB72', 'ActorTypeHuman'),
    '0x00013794': stubRecord('KYWD', '0x00013794', 'ActorTypeNPC'),
    '0x00249612': stubRecord('KYWD', '0x00249612', 'NoPowerArmorUse'),
    '0x00017AD4': stubRecord(
      'BPTD',
      '0x00017AD4',
      'HumanBodyPartData',
      (human as { fields: unknown }).fields as Record<string, unknown>,
    ),
  };
}
