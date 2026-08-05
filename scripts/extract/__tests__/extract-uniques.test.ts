import { describe, it, expect } from 'bun:test';
import type { GeneratedOmod, GeneratedWeapon } from '../../../src/types/generated';
import type { EsmClient, EsmRecord } from '../esm-client';
import { extractUniques, isExcludedIdentityOmod } from '../extract-uniques';
import { hiddenOmodIds } from '../../../src/data/overrides/omod-corrections';
import doubleBarrel from './fixtures/weap-double-barrel-shotgun.json';

const omods: GeneratedOmod[] = [
  {
    id: 'mod_Custom_SaltOfTheEarth',
    formId: '0x008F0DCD',
    name: 'Salt Of The Earth',
    description: '',
    attachPointFormId: '0x0047A264',
    attachPointEdid: 'ap_customName',
    targetKeywords: [],
    modifiers: [],
    addedKeywords: ['ObjectTypeUnique'],
    hasEnchantments: false,
  },
  {
    id: 'mod_Legendary_Weapon1_Guns_AmmoCapacity4x',
    formId: '0x004F6AB1',
    name: 'Quad',
    description: '',
    attachPointFormId: '0x004E89A8',
    attachPointEdid: 'ap_Legendary1',
    targetKeywords: [],
    modifiers: [],
    addedKeywords: [],
    hasEnchantments: false,
  },
  {
    id: 'mod_Legendary_Weapon3_Guns_ReloadSpeed',
    formId: '0x00524150',
    name: 'Swift',
    description: '',
    attachPointFormId: '0x004E89A9',
    attachPointEdid: 'ap_Legendary3',
    targetKeywords: [],
    modifiers: [],
    addedKeywords: [],
    hasEnchantments: false,
  },
  {
    id: 'mod_custom_Coldshoulder_DmgvsCryptid',
    formId: '0x00690C7D',
    name: 'Paranormal Mod',
    description: '',
    attachPointFormId: '0x0047A264',
    attachPointEdid: 'ap_customName',
    targetKeywords: [],
    modifiers: [],
    addedKeywords: ['ObjectTypeUnique'],
    hasEnchantments: false,
  },
  {
    id: 'mod_DoubleBarrelShotgun_Receiver_FastTrigger-HipAccuracy',
    formId: '0x0029D4C4',
    name: 'Steadfast',
    description: '',
    attachPointFormId: '0x00024004',
    attachPointEdid: 'ap_gun_Receiver',
    targetKeywords: [],
    modifiers: [],
    addedKeywords: [],
    hasEnchantments: false,
  },
];

const weapons: GeneratedWeapon[] = [
  {
    id: 'DoubleBarrelShotgun',
    formId: '0x00092217',
    name: 'Double-Barrel Shotgun',
    weaponTypeName: 'Gun',
    keywords: [],
    components: [
      { damageType: 'ballistic', damageTypeEdid: null, amount: 1, tier: 1, curve: null },
    ],
    isAutomaticFlag: false,
    critDamageMult: 2,
    critChargeBonus: 1,
    sneakAttackMult: 2,
    speed: 1,
    attackDelaySec: 0,
    animationAttackSec: 0,
    animationFireSec: 0,
    reloadSpeed: 1,
    capacity: 2,
    ammoPerShot: 1,
    actionPointCost: 0,
    projectileCount: 1,
    reach: 1,
    secondaryDamage: 0,
    damageBonusMult: 1,
    eligibleLevels: [50],
    templateModFormIds: [],
    defaultModFormIds: [],
    attachParentSlots: [],
    modifiers: [],
  },
];

// Real formIds from the live ESM (verified 2026-07-15, Foundation's Vengeance
// / Cryptid Jawbone Knife audit): the shared "this star rolls at random" pool
// selectors, which the double-barrel fixture's raw Includes lists also
// reference (Cold Shoulder's ★2/★3, Salt's ★2) — Form Type "None", so they
// never appear in the `omods` array above, exactly like the live dataset.
const RANDOM_POOL_EDIDS: Record<string, string> = {
  '0x007904EB': 'modcol_Legendary_Crafting_Weapon2',
  '0x007904EC': 'modcol_Legendary_Crafting_Weapon3',
};

const stubClient = {
  async get(): Promise<EsmRecord> {
    return doubleBarrel as unknown as EsmRecord;
  },
  async resolveEdid(formId: string): Promise<string> {
    return RANDOM_POOL_EDIDS[formId] ?? `<unresolved:${formId}>`;
  },
} as unknown as EsmClient;

describe('isExcludedIdentityOmod', () => {
  const base: GeneratedOmod = {
    id: 'ATX_mod_44_Weapon_Custom_Lawbringer',
    formId: '0x0090AB94',
    name: 'Lawbringer',
    description: '',
    attachPointFormId: '0x0047A264',
    attachPointEdid: 'ap_customName',
    targetKeywords: ['ma_44'],
    modifiers: [],
    addedKeywords: [],
    hasEnchantments: false,
    obtainable: true,
  };

  it('allows obtainable ap_customName mods without ObjectTypeUnique', () => {
    expect(isExcludedIdentityOmod(base)).toBe(false);
  });

  it('excludes Burn_Bounty bounty-target enchantments', () => {
    expect(
      isExcludedIdentityOmod({
        ...base,
        id: 'Burn_Bounty_mod_custom_BleedEffect',
        obtainable: true,
      }),
    ).toBe(true);
  });

  it('excludes unobtainable identity mods', () => {
    expect(isExcludedIdentityOmod({ ...base, obtainable: false })).toBe(true);
  });

  it('excludes creature-prefixed edids', () => {
    expect(isExcludedIdentityOmod({ ...base, id: 'crAssaultRifle_Custom' })).toBe(true);
  });
});

describe('extractUniques', () => {
  it('emits identity, preset mods, and positional legendaries from named combinations', async () => {
    const { uniques } = await extractUniques(stubClient, weapons, omods);
    const salt = uniques.find((u) => u.id === 'mod_Custom_SaltOfTheEarth');
    expect(salt).toMatchObject({
      name: 'Salt Of The Earth',
      baseWeaponId: 'DoubleBarrelShotgun',
      mods: expect.objectContaining({
        ap_customName: 'mod_Custom_SaltOfTheEarth',
        ap_gun_Receiver: 'mod_DoubleBarrelShotgun_Receiver_FastTrigger-HipAccuracy',
      }),
      legendaryEffects: [null, null, 'mod_Legendary_Weapon3_Guns_ReloadSpeed'],
    });
    // Cold Shoulder: ★1 fixed (Quad), ★2/★3 resolve only via the random-pool
    // fallback (not in `omods`) — regression guard for the 2026-07-15
    // legendary-null-truncation bug (Foundation's Vengeance/Cryptid Jawbone
    // Knife both had their random ★2/★3 silently dropped instead of null'd).
    const cold = uniques.find((u) => u.id === 'mod_custom_Coldshoulder_DmgvsCryptid');
    expect(cold?.legendaryEffects).toEqual([
      'mod_Legendary_Weapon1_Guns_AmmoCapacity4x',
      null,
      null,
    ]);
  });

  it('prefers identity OMOD Name over Combination.Name (combo "Default" → "Love Tap")', async () => {
    const loveTapOmod: GeneratedOmod = {
      id: 'E09C_mod_Custom_LoveTap',
      formId: '0x00663B0C',
      name: 'Love Tap',
      description: '',
      attachPointFormId: '0x0047A264',
      attachPointEdid: 'ap_customName',
      targetKeywords: [],
      modifiers: [],
      addedKeywords: ['ObjectTypeUnique'],
      hasEnchantments: false,
      obtainable: true,
    };
    const comboFixture = {
      ...doubleBarrel,
      fields: {
        ...doubleBarrel.fields,
        'Object Template': {
          Count: 2,
          Combinations: [
            doubleBarrel.fields['Object Template'].Combinations[0],
            {
              Combination: {
                Name: 'Default',
                'Object Mod Template Item': {
                  Includes: [{ Mod: '0x00663B0C' }],
                },
              },
            },
          ],
        },
      },
    };
    const client = {
      async get(): Promise<EsmRecord> {
        return comboFixture as unknown as EsmRecord;
      },
      async resolveEdid(): Promise<string> {
        return '<unresolved>';
      },
    } as unknown as EsmClient;

    const { uniques } = await extractUniques(client, weapons, [...omods, loveTapOmod]);
    expect(uniques.find((u) => u.id === 'E09C_mod_Custom_LoveTap')?.name).toBe('Love Tap');
  });

  it('uses distinct OMOD names for Tesla presets (V63-BERTHA vs Night Light)', async () => {
    const teslaMods: GeneratedOmod[] = [
      {
        id: 'mod_custom_V63-BERTHA_customName',
        formId: '0x0075C3B7',
        name: 'V63-BERTHA',
        description: '',
        attachPointFormId: '0x0047A264',
        attachPointEdid: 'ap_customName',
        targetKeywords: ['DLC01ma_LightningGun'],
        modifiers: [],
        addedKeywords: ['ObjectTypeUnique'],
        hasEnchantments: false,
        obtainable: true,
      },
      {
        id: 'mod_Custom_NightLight',
        formId: '0x008F0DD3',
        name: 'Night Light',
        description: '',
        attachPointFormId: '0x0047A264',
        attachPointEdid: 'ap_customName',
        targetKeywords: ['DLC01ma_LightningGun'],
        modifiers: [],
        addedKeywords: ['ObjectTypeUnique'],
        hasEnchantments: false,
        obtainable: true,
      },
    ];
    const teslaFixture = {
      ...doubleBarrel,
      fields: {
        ...doubleBarrel.fields,
        'Object Template': {
          Count: 3,
          Combinations: [
            doubleBarrel.fields['Object Template'].Combinations[0],
            {
              Combination: {
                Name: 'Night Light',
                'Object Mod Template Item': {
                  Includes: [{ Mod: '0x0075C3B7' }],
                },
              },
            },
            {
              Combination: {
                Name: '',
                'Object Mod Template Item': {
                  Includes: [{ Mod: '0x008F0DD3' }],
                },
              },
            },
          ],
        },
      },
    };
    const client = {
      async get(): Promise<EsmRecord> {
        return teslaFixture as unknown as EsmRecord;
      },
      async resolveEdid(): Promise<string> {
        return '<unresolved>';
      },
    } as unknown as EsmClient;

    const { uniques } = await extractUniques(client, weapons, [...omods, ...teslaMods]);
    expect(uniques.find((u) => u.id === 'mod_custom_V63-BERTHA_customName')?.name).toBe(
      'V63-BERTHA',
    );
    expect(uniques.find((u) => u.id === 'mod_Custom_NightLight')?.name).toBe('Night Light');
  });

  it('emits COBJ-granted sibling identity mods sharing a target-keyword gate', async () => {
    const cosmicMods: GeneratedOmod[] = [
      {
        id: 'mod_custom_CosmicKnife',
        formId: '0x00832CB6',
        name: 'Cosmic Knife',
        description: '',
        attachPointFormId: '0x0047A264',
        attachPointEdid: 'ap_customName',
        targetKeywords: ['ma_CosmicKnife'],
        modifiers: [],
        addedKeywords: ['ObjectTypeUnique'],
        hasEnchantments: false,
        obtainable: true,
      },
      {
        id: 'mod_custom_CosmicKnife_Superheated',
        formId: '0x00837E13',
        name: 'Cosmic Knife Super-Heated',
        description: '',
        attachPointFormId: '0x0047A264',
        attachPointEdid: 'ap_customName',
        targetKeywords: ['ma_CosmicKnife'],
        modifiers: [],
        addedKeywords: [],
        hasEnchantments: false,
        obtainable: true,
      },
    ];
    const cosmicFixture = {
      ...doubleBarrel,
      fields: {
        ...doubleBarrel.fields,
        'Object Template': {
          Count: 2,
          Combinations: [
            doubleBarrel.fields['Object Template'].Combinations[0],
            {
              Combination: {
                Name: '',
                'Object Mod Template Item': {
                  Includes: [{ Mod: '0x00832CB6' }],
                },
              },
            },
          ],
        },
      },
    };
    const client = {
      async get(): Promise<EsmRecord> {
        return cosmicFixture as unknown as EsmRecord;
      },
      async resolveEdid(): Promise<string> {
        return '<unresolved>';
      },
    } as unknown as EsmClient;

    const { uniques } = await extractUniques(client, weapons, [...omods, ...cosmicMods]);
    const superheated = uniques.find((u) => u.id === 'mod_custom_CosmicKnife_Superheated');
    expect(superheated).toMatchObject({
      name: 'Cosmic Knife Super-Heated',
      baseWeaponId: 'DoubleBarrelShotgun',
      mods: { ap_customName: 'mod_custom_CosmicKnife_Superheated' },
      legendaryEffects: [],
    });
  });
});

describe('extractUniques (variant container presets)', () => {
  const camdenVariants: GeneratedOmod[] = [
    {
      id: 'mod_Custom_CamdenWhacker_Bleed',
      formId: '0x008EDF27',
      name: 'Camden Whacker (Bleed)',
      description: '',
      attachPointFormId: '0x0047A264',
      attachPointEdid: 'ap_customName',
      targetKeywords: [],
      modifiers: [],
      addedKeywords: [],
      hasEnchantments: true,
      variantOf: 'mod_Custom_CamdenWhacker',
    },
    {
      id: 'mod_Custom_CamdenWhacker_Poison',
      formId: '0x008EDF2C',
      name: 'Camden Whacker (Poison)',
      description: '',
      attachPointFormId: '0x0047A264',
      attachPointEdid: 'ap_customName',
      targetKeywords: [],
      modifiers: [],
      addedKeywords: [],
      hasEnchantments: true,
      variantOf: 'mod_Custom_CamdenWhacker',
    },
    {
      id: 'mod_Custom_CamdenWhacker_Fire',
      formId: '0x008EDF2B',
      name: 'Camden Whacker (Fire)',
      description: '',
      attachPointFormId: '0x0047A264',
      attachPointEdid: 'ap_customName',
      targetKeywords: [],
      modifiers: [],
      addedKeywords: [],
      hasEnchantments: true,
      variantOf: 'mod_Custom_CamdenWhacker',
    },
    {
      id: 'mod_Custom_CamdenWhacker_Cryo',
      formId: '0x008EDF2A',
      name: 'Camden Whacker (Cryo)',
      description: '',
      attachPointFormId: '0x0047A264',
      attachPointEdid: 'ap_customName',
      targetKeywords: [],
      modifiers: [],
      addedKeywords: [],
      hasEnchantments: false,
      variantOf: 'mod_Custom_CamdenWhacker',
    },
    {
      id: 'mod_Custom_CamdenWhacker_Energy',
      formId: '0x008EDF28',
      name: 'Camden Whacker (Energy)',
      description: '',
      attachPointFormId: '0x0047A264',
      attachPointEdid: 'ap_customName',
      targetKeywords: [],
      modifiers: [],
      addedKeywords: [],
      hasEnchantments: false,
      variantOf: 'mod_Custom_CamdenWhacker',
    },
    {
      id: 'mod_Custom_CamdenWhacker_RAD',
      formId: '0x008EDF29',
      name: 'Camden Whacker (Radiation)',
      description: '',
      attachPointFormId: '0x0047A264',
      attachPointEdid: 'ap_customName',
      targetKeywords: [],
      modifiers: [],
      addedKeywords: [],
      hasEnchantments: true,
      variantOf: 'mod_Custom_CamdenWhacker',
    },
  ];

  const commieWhacker = {
    id: 'DLC04_CommieWhacker',
    formId: '0x008EDF25',
    name: 'Commie Whacker',
    templateModFormIds: camdenVariants.map((v) => v.formId),
    obtainable: true,
  } as GeneratedWeapon;

  it('resolves a variant-container OT combo to the lowest-formId default with variantIds', async () => {
    const client = {
      async get(formId: string): Promise<EsmRecord> {
        if (formId === '0x008EDF25') {
          return {
            header: { signature: 'WEAP', form_id: formId },
            editor_id: 'DLC04_CommieWhacker',
            fields: {
              'Object Template': {
                Combinations: [
                  {
                    Combination: {
                      Name: 'Default',
                      'Object Mod Template Item': {
                        Includes: [{ Mod: '0x00000001' }],
                      },
                    },
                  },
                  {
                    Combination: {
                      Name: 'Camden Whacker',
                      'Object Mod Template Item': {
                        Includes: [{ Mod: '0x008EDF26' }],
                      },
                    },
                  },
                ],
              },
            },
          } as unknown as EsmRecord;
        }
        throw new Error(`unexpected get ${formId}`);
      },
      resolveEdid: async (formId: string) => formId,
    } as unknown as EsmClient;

    const variantContainers = {
      '0x008EDF26': camdenVariants,
    };

    const { uniques } = await extractUniques(
      client,
      [commieWhacker],
      camdenVariants,
      variantContainers,
    );
    const camdenPresets = uniques.filter((u) => u.baseWeaponId === 'DLC04_CommieWhacker');
    expect(camdenPresets).toHaveLength(1);
    expect(camdenPresets[0]).toMatchObject({
      id: 'mod_Custom_CamdenWhacker_Bleed',
      name: 'Camden Whacker',
      mods: { ap_customName: 'mod_Custom_CamdenWhacker_Bleed' },
    });
    expect(camdenPresets[0].variantIds).toHaveLength(6);
  });

  it('does not emit P62 Drifter presets when identity mods are hidden', () => {
    expect(hiddenOmodIds.has('P62_Mod_Custom_Splinter_CustomName')).toBe(true);
    expect(hiddenOmodIds.has('P62_Mod_Custom_Tempest_CustomName')).toBe(true);
    expect(hiddenOmodIds.has('P62_Mod_Custom_ChaosEngine_CustomName')).toBe(true);
  });
});
