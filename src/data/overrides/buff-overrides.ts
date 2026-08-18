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
  // ESM CNDF Perks_Weap_IsHeavyGunCondition = HasKeyword(WeaponTypeHeavyGun) AND NOT
  // WeaponTypeExplosive AND NOT WeaponTypeFatman AND NOT WeaponTypeMissileLauncher; the
  // Fatman/MissileLauncher NOTs are redundant (every such weapon carries WeaponTypeExplosive
  // — verified against weapons.json), and the ExplosiveHybrid OR-branch re-includes the
  // Hellstorm (which is HeavyGun+Explosive). The previous single-any form over-buffed 8
  // explosive heavy guns (Missile Launcher, Fat Man, AGL, Broadsider, M79, Grand Finale,
  // Nuka-Launcher, Chaos Engine).
  BobbleHead_BigGuns_Potion: [
    {
      id: 'override:BobbleHead_BigGuns_Potion:0',
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
        { kind: 'weaponKeyword', keyword: 'WeaponTypeHeavyGun', present: true },
        { kind: 'weaponKeyword', keyword: 'WeaponTypeExplosive', present: false },
      ],
      describeAs:
        '+20% damage bonus (with non-explosive heavy guns or the Hellstorm Missile Launcher)',
    },
    {
      id: 'override:BobbleHead_BigGuns_Potion:1',
      source: {
        kind: 'consumable',
        formId: '0x004FE4E8',
        edid: 'BobbleHead_BigGuns_Potion',
        name: 'Bobblehead: Big Guns',
      },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.2,
      conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeExplosiveHybrid', present: true }],
      describeAs: '',
    },
  ],
  // Glowing ghoul twin — same gate/magnitude (GHL_GlowingBobbleHead_BigGuns_Potion 0x007A2F8F).
  GHL_GlowingBobbleHead_BigGuns_Potion: [
    {
      id: 'override:GHL_GlowingBobbleHead_BigGuns_Potion:0',
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
        { kind: 'weaponKeyword', keyword: 'WeaponTypeHeavyGun', present: true },
        { kind: 'weaponKeyword', keyword: 'WeaponTypeExplosive', present: false },
      ],
      describeAs:
        '+20% damage bonus (with non-explosive heavy guns or the Hellstorm Missile Launcher)',
    },
    {
      id: 'override:GHL_GlowingBobbleHead_BigGuns_Potion:1',
      source: {
        kind: 'consumable',
        formId: '0x007A2F8F',
        edid: 'GHL_GlowingBobbleHead_BigGuns_Potion',
        name: 'Glowing Bobblehead: Big Guns',
      },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.2,
      conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeExplosiveHybrid', present: true }],
      describeAs: '',
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
      describeAs: '+35% damage bonus (while aiming through scopes)',
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

  // Guns and Bullets 6 (Magazine_GunsAndBullets06_Potion 0x00430404): +75 DR at night.
  // DR bucket is engine-active (playerDamageResist knob) but the in-game 9pm–6am gate is
  // not modeled — unresolved condition keeps modifier inert (badge shows); user-approved
  // 2026-08-18; describeAs surfaces what it does and when.
  Magazine_GunsAndBullets06_Potion: [
    {
      id: 'override:Magazine_GunsAndBullets06_Potion',
      source: {
        kind: 'consumable',
        formId: '0x00430404',
        edid: 'Magazine_GunsAndBullets06_Potion',
        name: 'Guns and Bullets 6',
      },
      bucket: 'damageResistGain',
      op: 'ADD',
      value: 75,
      conditions: [
        {
          kind: 'unresolved',
          raw: 'OR-group[GetGlobalValue(GameHour)=21 | GetGlobalValue(GameHour)=6]',
        },
      ],
      describeAs: '+75 Damage Resist (at night)',
    },
  ],

  // Unstoppables 1 (Magazine_Unstoppables01_Potion 0x00432D25): 5% avoid-all-damage proc.
  // Proc chance from GetRandomPercent()=5; no incoming-damage model — inert (badge);
  // describeAs surfaces the real mechanic instead of misleading "0% damage taken".
  Magazine_Unstoppables01_Potion: [
    {
      id: 'override:Magazine_Unstoppables01_Potion',
      source: {
        kind: 'consumable',
        formId: '0x00432D25',
        edid: 'Magazine_Unstoppables01_Potion',
        name: 'Unstoppables 1',
      },
      bucket: 'incomingDamageMult',
      op: 'SET',
      value: 0,
      conditions: [
        { kind: 'unresolved', raw: 'EPIsCalculatingBaseDamage()=0' },
        { kind: 'unresolved', raw: 'GetRandomPercent()=5' },
      ],
      describeAs: '5% chance to avoid all damage',
    },
  ],

  // Unstoppables 2 (Magazine_Unstoppables02_Potion 0x00432D28): 20% avoid-all-damage proc
  // vs Scorched/Scorchbeasts.
  Magazine_Unstoppables02_Potion: [
    {
      id: 'override:Magazine_Unstoppables02_Potion',
      source: {
        kind: 'consumable',
        formId: '0x00432D28',
        edid: 'Magazine_Unstoppables02_Potion',
        name: 'Unstoppables 2',
      },
      bucket: 'incomingDamageMult',
      op: 'SET',
      value: 0,
      conditions: [
        { kind: 'unresolved', raw: 'EPIsCalculatingBaseDamage()=0' },
        { kind: 'unresolved', raw: 'GetRandomPercent()=20' },
        {
          kind: 'enemyTypeAny',
          keywordsOrRaces: ['ActorTypeScorched', 'ActorTypeScorchbeast'],
        },
      ],
      describeAs: '20% chance to avoid all damage (from the Scorched or Scorchbeasts)',
    },
  ],

  // Unstoppables 3 (Magazine_Unstoppables03_Potion 0x00432D2B): 30% avoid-explosion-damage
  // proc (perk EP "Mod Incoming Explosion Damage", Multiply Value — no route, so extraction
  // emits no modifier at all; this override restores the family's inert SET-0 shape).
  Magazine_Unstoppables03_Potion: [
    {
      id: 'override:Magazine_Unstoppables03_Potion',
      source: {
        kind: 'consumable',
        formId: '0x00432D2B',
        edid: 'Magazine_Unstoppables03_Potion',
        name: 'Unstoppables 3',
      },
      bucket: 'incomingDamageMult',
      op: 'SET',
      value: 0,
      conditions: [
        { kind: 'unresolved', raw: 'EPIsCalculatingBaseDamage()=0' },
        { kind: 'unresolved', raw: 'GetRandomPercent()=30' },
      ],
      describeAs: '30% chance to avoid explosion damage',
    },
  ],

  // Unstoppables 4 (Magazine_Unstoppables04_Potion 0x00432D2E): 30% avoid-all-damage proc
  // from melee/unarmed attackers.
  Magazine_Unstoppables04_Potion: [
    {
      id: 'override:Magazine_Unstoppables04_Potion',
      source: {
        kind: 'consumable',
        formId: '0x00432D2E',
        edid: 'Magazine_Unstoppables04_Potion',
        name: 'Unstoppables 4',
      },
      bucket: 'incomingDamageMult',
      op: 'SET',
      value: 0,
      conditions: [
        { kind: 'unresolved', raw: 'EPIsCalculatingBaseDamage()=0' },
        { kind: 'unresolved', raw: 'GetRandomPercent()=30' },
        {
          kind: 'enemyTypeAny',
          keywordsOrRaces: ['WeaponTypeMelee1H', 'WeaponTypeMelee2H', 'WeaponTypeUnarmed'],
        },
      ],
      describeAs: '30% chance to avoid all damage (from melee or unarmed attackers)',
    },
  ],

  // Unstoppables 5 (Magazine_Unstoppables05_Potion 0x00432D31): 30% avoid-all-damage proc
  // from laser/plasma weapons.
  Magazine_Unstoppables05_Potion: [
    {
      id: 'override:Magazine_Unstoppables05_Potion',
      source: {
        kind: 'consumable',
        formId: '0x00432D31',
        edid: 'Magazine_Unstoppables05_Potion',
        name: 'Unstoppables 5',
      },
      bucket: 'incomingDamageMult',
      op: 'SET',
      value: 0,
      conditions: [
        { kind: 'unresolved', raw: 'EPIsCalculatingBaseDamage()=0' },
        { kind: 'unresolved', raw: 'GetRandomPercent()=30' },
        {
          kind: 'enemyTypeAny',
          keywordsOrRaces: [
            'WeaponTypeLaser',
            'WeaponTypeLaserMusket',
            'WeaponTypePlasma',
            'WeaponTypePlasmaGrenade',
            'WeaponTypePlasmaMine',
          ],
        },
      ],
      describeAs: '30% chance to avoid all damage (from laser or plasma weapons)',
    },
  ],
};
