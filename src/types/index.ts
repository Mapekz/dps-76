// Game mode types
export type GameMode = 'live' | 'pts';

// Perk types
export interface Perk {
  id: string;
  name: string;
  maxRank: number;
  category: 'strength' | 'perception' | 'endurance' | 'charisma' | 'intelligence' | 'agility' | 'luck';
  statModifiers: Record<string, number[]>; // stat -> value per rank (index 0 = rank 1)
}

export interface PerkLoadout {
  perkId: string;
  rank: number;
}

export interface ParsedPerk {
  key: string;
  name: string;
  rank: number;
}

// Weapon types
export interface WeaponMod {
  id: string;
  name: string;
  slot: 'receiver' | 'barrel' | 'grip' | 'magazine' | 'sights' | 'muzzle';
  statModifiers: Record<string, number>;
}

export interface Weapon {
  id: string;
  name: string;
  baseDamage: number;
  fireRate: number;
  accuracy: number;
  range: number;
  damageType: 'ballistic' | 'energy' | 'radiation' | 'poison' | 'cryo' | 'fire';
  weaponClass: 'rifle' | 'pistol' | 'shotgun' | 'heavy' | 'melee' | 'unarmed' | 'bow' | 'thrown';
}

export interface WeaponConfig {
  weaponId: string;
  mods: {
    receiver: string | null;
    barrel: string | null;
    grip: string | null;
    magazine: string | null;
    sights: string | null;
    muzzle: string | null;
  };
  legendaryEffects: string[];
}

// Armor types
export interface ArmorPiece {
  id: string;
  name: string;
  slot: 'head' | 'chest' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
  damageResist: number;
  energyResist: number;
  radiationResist: number;
}

export interface ArmorMod {
  id: string;
  name: string;
  modSlot: 1 | 2 | 3 | 4;
  statModifiers: Record<string, number>;
}

export interface ArmorSlotConfig {
  armorId: string | null;
  mods: [string | null, string | null, string | null, string | null];
  legendaryEffects: string[];
}

export interface ArmorConfig {
  head: ArmorSlotConfig;
  chest: ArmorSlotConfig;
  leftArm: ArmorSlotConfig;
  rightArm: ArmorSlotConfig;
  leftLeg: ArmorSlotConfig;
  rightLeg: ArmorSlotConfig;
}

// Enemy types
export interface Enemy {
  id: string;
  name: string;
  level: number;
  health: number;
  damageResist: number;
  energyResist: number;
  baseDamage: number;
  damageType: 'ballistic' | 'energy' | 'radiation' | 'poison' | 'melee';
}

export interface EnemyMutation {
  id: string;
  name: string;
  statModifiers: Record<string, number>;
}

export interface EnemyConfig {
  enemyId: string;
  legendaryRank: 0 | 1 | 2 | 3;
  mutation: string | null;
  weaponId: string | null;
  powerArmorId: string | null;
}

// Player config
export interface PlayerConfig {
  perks: PerkLoadout[];
  legendaryPerks: PerkLoadout[];
  weapon: WeaponConfig | null;
  armor: ArmorConfig;
  mutations: string[];
  consumables: string[];
}

// Damage stats
export interface DamageStats {
  dps: number;
  torsoHitDamage: number;
  weakpointDamage: number;
  vatsCritDamage: number;
}

// Default values factory
export function createDefaultArmorConfig(): ArmorConfig {
  const defaultSlot: ArmorSlotConfig = {
    armorId: null,
    mods: [null, null, null, null],
    legendaryEffects: [],
  };

  return {
    head: { ...defaultSlot },
    chest: { ...defaultSlot },
    leftArm: { ...defaultSlot },
    rightArm: { ...defaultSlot },
    leftLeg: { ...defaultSlot },
    rightLeg: { ...defaultSlot },
  };
}

export function createDefaultPlayerConfig(): PlayerConfig {
  return {
    perks: [],
    legendaryPerks: [],
    weapon: null,
    armor: createDefaultArmorConfig(),
    mutations: [],
    consumables: [],
  };
}

export function createDefaultEnemyConfig(): EnemyConfig {
  return {
    enemyId: 'super_mutant',
    legendaryRank: 0,
    mutation: null,
    weaponId: null,
    powerArmorId: null,
  };
}

export function createDefaultDamageStats(): DamageStats {
  return {
    dps: 0,
    torsoHitDamage: 0,
    weakpointDamage: 0,
    vatsCritDamage: 0,
  };
}
