import type { Modifier } from '@/types/modifiers';

/**
 * Hand-authored modifiers for mutations/consumables whose ESM magnitudes are
 * script-computed. Keyed by buff id (SPEL/ALCH edid); when present these
 * REPLACE the extracted modifiers. Values pending golden validation
 * (docs/assumptions.md).
 */
export const buffValueOverrides: Readonly<Record<string, Modifier[]>> = {
  // Bobblehead: Big Guns (BobbleHead_BigGuns_Potion 0x004FE4E8): EP STAT_DmgHeavyGuns
  // +20% with OR-group[WeaponTypeExplosiveHybrid | Perks_Weap_IsHeavyGunCondition].
  BobbleHead_BigGuns_Potion: [
    {
      id: 'override:BobbleHead_BigGuns_Potion',
      source: {
        kind: 'consumable',
        formId: '0x004FE4E8',
        edid: 'BobbleHead_BigGuns_Potion',
        name: 'Bobblehead: Big Guns',
      },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.2,
      conditions: [
        { kind: 'weaponKeywordAny', keywords: ['WeaponTypeHeavyGun', 'WeaponTypeExplosiveHybrid'] },
      ],
    },
  ],
  // Glowing ghoul twin — same gate/magnitude (GHL_GlowingBobbleHead_BigGuns_Potion 0x007A2F8F).
  GHL_GlowingBobbleHead_BigGuns_Potion: [
    {
      id: 'override:GHL_GlowingBobbleHead_BigGuns_Potion',
      source: {
        kind: 'consumable',
        formId: '0x007A2F8F',
        edid: 'GHL_GlowingBobbleHead_BigGuns_Potion',
        name: 'Glowing Bobblehead: Big Guns',
      },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.2,
      conditions: [
        { kind: 'weaponKeywordAny', keywords: ['WeaponTypeHeavyGun', 'WeaponTypeExplosiveHybrid'] },
      ],
    },
  ],

  // U.S. Covert Operations Manual 8 (Magazine_USCovertOps08_Potion 0x00432D4E): +50% dbm
  // with OR-group[WeaponTypeUnarmed | ma_Knife | ma_Switchblade].
  Magazine_USCovertOps08_Potion: [
    {
      id: 'override:Magazine_USCovertOps08_Potion',
      source: {
        kind: 'consumable',
        formId: '0x00432D4E',
        edid: 'Magazine_USCovertOps08_Potion',
        name: 'U.S. Covert Operations Manual 8',
      },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.5,
      conditions: [
        { kind: 'weaponKeywordAny', keywords: ['WeaponTypeUnarmed', 'ma_Knife', 'ma_Switchblade'] },
      ],
    },
  ],

  // Astoundingly Awesome Tales 10 (Magazine_AwesomeTales10_Potion 0x004303A6): +35% scoped
  // damage while ADS (GetInIronSights) on HasScope/HasScopeRecon weapons.
  Magazine_AwesomeTales10_Potion: [
    {
      id: 'override:Magazine_AwesomeTales10_Potion',
      source: {
        kind: 'consumable',
        formId: '0x004303A6',
        edid: 'Magazine_AwesomeTales10_Potion',
        name: 'Astoundingly Awesome Tales 10',
      },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.35,
      conditions: [
        { kind: 'weaponKeywordAny', keywords: ['HasScope', 'HasScopeRecon'] },
        { kind: 'aimingDownSights', value: true },
      ],
    },
  ],

  // Live & Love 5 (Magazine_LiveAndLove05_Potion 0x00432CCD): +2 LCK under alcohol
  // (HasMagicEffectKeyword(AlcoholEffect); magnitude script-inferred — docs/assumptions.md).
  Magazine_LiveAndLove05_Potion: [
    {
      id: 'override:Magazine_LiveAndLove05_Potion',
      source: {
        kind: 'consumable',
        formId: '0x00432CCD',
        edid: 'Magazine_LiveAndLove05_Potion',
        name: 'Live & Love 5',
      },
      bucket: 'specialLuck',
      op: 'ADD',
      value: 2,
      conditions: [{ kind: 'underAlcoholEffect', value: true }],
    },
  ],
};
