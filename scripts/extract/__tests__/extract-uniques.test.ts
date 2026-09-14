import { describe, it, expect } from 'bun:test';
import type { GeneratedOmod, GeneratedWeapon } from '../../../src/types/generated';
import type { EsmRecord } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';
import { extractUniques, isExcludedIdentityOmod } from '../extract-uniques';
import { minimalOmod, minimalWeapon } from './esm-stubs';
import doubleBarrel from './fixtures/weap-double-barrel-shotgun.json';

const omods: GeneratedOmod[] = [
  minimalOmod({
    id: 'mod_Custom_SaltOfTheEarth',
    formId: '0x008F0DCD',
    name: 'Salt Of The Earth',
    addedKeywords: ['ObjectTypeUnique'],
  }),
  minimalOmod({
    id: 'mod_Legendary_Weapon1_Guns_AmmoCapacity4x',
    formId: '0x004F6AB1',
    name: 'Quad',
    attachPointFormId: '0x004E89A8',
    attachPointEdid: 'ap_Legendary1',
  }),
  minimalOmod({
    id: 'mod_Legendary_Weapon3_Guns_ReloadSpeed',
    formId: '0x00524150',
    name: 'Swift',
    attachPointFormId: '0x004E89A9',
    attachPointEdid: 'ap_Legendary3',
  }),
  minimalOmod({
    id: 'mod_custom_Coldshoulder_DmgvsCryptid',
    formId: '0x00690C7D',
    name: 'Paranormal Mod',
    addedKeywords: ['ObjectTypeUnique'],
  }),
  minimalOmod({
    id: 'mod_DoubleBarrelShotgun_Receiver_FastTrigger-HipAccuracy',
    formId: '0x0029D4C4',
    name: 'Steadfast',
    attachPointFormId: '0x00024004',
    attachPointEdid: 'ap_gun_Receiver',
  }),
];

const weapons: GeneratedWeapon[] = [
  minimalWeapon({
    id: 'DoubleBarrelShotgun',
    formId: '0x00092217',
    name: 'Double-Barrel Shotgun',
    eligibleLevels: [50],
  }),
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

const stubClient = createInMemoryEsmSource({
  getFallback: () => doubleBarrel as unknown as EsmRecord,
  resolveEdidMap: RANDOM_POOL_EDIDS,
});

describe('isExcludedIdentityOmod', () => {
  const base = minimalOmod({
    id: 'ATX_mod_44_Weapon_Custom_Lawbringer',
    formId: '0x0090AB94',
    name: 'Lawbringer',
    targetKeywords: ['ma_44'],
    obtainable: true,
  });

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
    const loveTapOmod = minimalOmod({
      id: 'E09C_mod_Custom_LoveTap',
      formId: '0x00663B0C',
      name: 'Love Tap',
      addedKeywords: ['ObjectTypeUnique'],
      obtainable: true,
    });
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
    const client = createInMemoryEsmSource({
      getFallback: () => comboFixture as unknown as EsmRecord,
      resolveEdidFallback: () => '<unresolved>',
    });

    const { uniques } = await extractUniques(client, weapons, [...omods, loveTapOmod]);
    expect(uniques.find((u) => u.id === 'E09C_mod_Custom_LoveTap')?.name).toBe('Love Tap');
  });

  it('uses distinct OMOD names for Tesla presets (V63-BERTHA vs Night Light)', async () => {
    const teslaMods: GeneratedOmod[] = [
      minimalOmod({
        id: 'mod_custom_V63-BERTHA_customName',
        formId: '0x0075C3B7',
        name: 'V63-BERTHA',
        targetKeywords: ['DLC01ma_LightningGun'],
        addedKeywords: ['ObjectTypeUnique'],
        obtainable: true,
      }),
      minimalOmod({
        id: 'mod_Custom_NightLight',
        formId: '0x008F0DD3',
        name: 'Night Light',
        targetKeywords: ['DLC01ma_LightningGun'],
        addedKeywords: ['ObjectTypeUnique'],
        obtainable: true,
      }),
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
    const client = createInMemoryEsmSource({
      getFallback: () => teslaFixture as unknown as EsmRecord,
      resolveEdidFallback: () => '<unresolved>',
    });

    const { uniques } = await extractUniques(client, weapons, [...omods, ...teslaMods]);
    expect(uniques.find((u) => u.id === 'mod_custom_V63-BERTHA_customName')?.name).toBe(
      'V63-BERTHA',
    );
    expect(uniques.find((u) => u.id === 'mod_Custom_NightLight')?.name).toBe('Night Light');
  });

  it('prefers obtainable base weapons when identity mod is shared (Love Tap regression)', async () => {
    const sharedIdentityOmod = minimalOmod({
      id: 'mod_Custom_TestShared',
      formId: '0x00TEST001',
      name: 'Test Shared Unique',
      addedKeywords: ['ObjectTypeUnique'],
      obtainable: true,
    });
    const identityCombo = {
      Combination: {
        Name: 'Default',
        'Object Mod Template Item': {
          Includes: [{ Mod: '0x00TEST001' }],
        },
      },
    };
    const makeTwoComboFixture = (formId: string, editorId: string) => ({
      ...doubleBarrel,
      header: { ...doubleBarrel.header, form_id: formId },
      editor_id: editorId,
      fields: {
        ...doubleBarrel.fields,
        'Object Template': {
          Count: 2,
          Combinations: [doubleBarrel.fields['Object Template'].Combinations[0], identityCombo],
        },
      },
    });
    const client = createInMemoryEsmSource({
      records: {
        '0xAAAA0001': makeTwoComboFixture(
          '0xAAAA0001',
          'LegacyShell_Weapon',
        ) as unknown as EsmRecord,
        '0xAAAA0002': makeTwoComboFixture('0xAAAA0002', 'GenericWeapon') as unknown as EsmRecord,
      },
      resolveEdidFallback: () => '<unresolved>',
    });
    const unobtainableWeapon = minimalWeapon({
      id: 'LegacyShell_Weapon',
      formId: '0xAAAA0001',
      name: 'Legacy Shell',
      obtainable: false,
    });
    const obtainableWeapon = minimalWeapon({
      id: 'GenericWeapon',
      formId: '0xAAAA0002',
      name: 'Generic Weapon',
    });
    const { uniques, skipped } = await extractUniques(
      client,
      [unobtainableWeapon, obtainableWeapon],
      [...omods, sharedIdentityOmod],
    );
    expect(uniques.find((u) => u.id === 'mod_Custom_TestShared')?.baseWeaponId).toBe(
      'GenericWeapon',
    );
    expect(skipped).toContainEqual(
      expect.objectContaining({
        weaponId: 'LegacyShell_Weapon',
        reason: 'duplicate identity mod mod_Custom_TestShared',
      }),
    );
  });

  it('emits COBJ-granted sibling identity mods sharing a target-keyword gate', async () => {
    const cosmicMods: GeneratedOmod[] = [
      minimalOmod({
        id: 'mod_custom_CosmicKnife',
        formId: '0x00832CB6',
        name: 'Cosmic Knife',
        targetKeywords: ['ma_CosmicKnife'],
        addedKeywords: ['ObjectTypeUnique'],
        obtainable: true,
      }),
      minimalOmod({
        id: 'mod_custom_CosmicKnife_Superheated',
        formId: '0x00837E13',
        name: 'Cosmic Knife Super-Heated',
        targetKeywords: ['ma_CosmicKnife'],
        obtainable: true,
      }),
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
    const client = createInMemoryEsmSource({
      getFallback: () => cosmicFixture as unknown as EsmRecord,
      resolveEdidFallback: () => '<unresolved>',
    });

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
    minimalOmod({
      id: 'mod_Custom_CamdenWhacker_Bleed',
      formId: '0x008EDF27',
      name: 'Camden Whacker (Bleed)',
      hasEnchantments: true,
      variantOf: 'mod_Custom_CamdenWhacker',
    }),
    minimalOmod({
      id: 'mod_Custom_CamdenWhacker_Poison',
      formId: '0x008EDF2C',
      name: 'Camden Whacker (Poison)',
      hasEnchantments: true,
      variantOf: 'mod_Custom_CamdenWhacker',
    }),
    minimalOmod({
      id: 'mod_Custom_CamdenWhacker_Fire',
      formId: '0x008EDF2B',
      name: 'Camden Whacker (Fire)',
      hasEnchantments: true,
      variantOf: 'mod_Custom_CamdenWhacker',
    }),
    minimalOmod({
      id: 'mod_Custom_CamdenWhacker_Cryo',
      formId: '0x008EDF2A',
      name: 'Camden Whacker (Cryo)',
      variantOf: 'mod_Custom_CamdenWhacker',
    }),
    minimalOmod({
      id: 'mod_Custom_CamdenWhacker_Energy',
      formId: '0x008EDF28',
      name: 'Camden Whacker (Energy)',
      variantOf: 'mod_Custom_CamdenWhacker',
    }),
    minimalOmod({
      id: 'mod_Custom_CamdenWhacker_RAD',
      formId: '0x008EDF29',
      // resolveVariantDisplayName title-cases the all-caps "RAD" suffix
      // token — see resolveVariantDisplayName's acronym test in
      // extract-omods.test.ts.
      name: 'Camden Whacker (Rad)',
      hasEnchantments: true,
      variantOf: 'mod_Custom_CamdenWhacker',
    }),
  ];

  const commieWhacker = {
    id: 'DLC04_CommieWhacker',
    formId: '0x008EDF25',
    name: 'Commie Whacker',
    templateModFormIds: camdenVariants.map((v) => v.formId),
    obtainable: true,
  } as GeneratedWeapon;

  it('resolves a variant-container OT combo to the lowest-formId default with variantIds', async () => {
    const client = createInMemoryEsmSource({
      records: {
        '0x008EDF25': {
          header: { signature: 'WEAP', form_id: '0x008EDF25' },
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
        } as unknown as EsmRecord,
      },
      resolveEdidFallback: (formId) => formId,
    });

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
});
