import { describe, it, expect } from 'bun:test';
import type { GeneratedOmod, GeneratedWeapon } from '../../../src/types/generated';
import type { EsmClient, EsmRecord } from '../esm-client';
import { extractUniques } from '../extract-uniques';
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

describe('extractUniques', () => {
  it('emits identity, preset mods, and positional legendaries from named combinations', async () => {
    const { uniques } = await extractUniques(stubClient, weapons, omods);
    const salt = uniques.find((u) => u.id === 'mod_Custom_SaltOfTheEarth');
    expect(salt).toMatchObject({
      name: 'Salt of the Earth',
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
});
