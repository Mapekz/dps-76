import type { StatModification } from '@/data/stats';
import type { Special } from '@/data/special';

// Re-export for convenience
export type { Special } from '@/data/special';
export type { PerkId } from '@/data/perk-ids';
export type { Stat, StatModification } from '@/data/stats';

// Player conditions for conditional perks and calculations
export interface PlayerConditions {
  // Combat state
  isSneaking: boolean;
  isInPowerArmor: boolean;
  isSolo: boolean;
  healthPercent: number; // 0-100 for perks like Nerd Rage, Serendipity

  // Stack counts
  bulletStormStacks: number; // 0-20 (10 base, 20 with Bringing the Big Guns)
  onslaughtStacks: number; // 0-10
  adredalineStacks: number; // 0-10 (always max per user preference)

  // SPECIAL stats
  strength: number; // 1-15 (can exceed with legendary perks)
  perception: number;
  endurance: number;
  charisma: number;
  intelligence: number;
  agility: number;
  luck: number;

  // Other
  junkItemCount: number; // for Junk Shield perk
  teammateCount: number; // for Bodyguards perk
}

// Enemy conditions for conditional damage calculations
export interface EnemyConditions {
  isCrippled: boolean; // at least one limb crippled
  crippledLimbCount: number; // 0-6 limbs
  statusEffectCount: number; // number of debuffs/impairments
  isGlowing: boolean; // glowing enemy variant
  isInsect: boolean; // insect creature type
}

// Game mode types
export type GameMode = 'live' | 'pts';

// Perk definition
export interface Perk {
  name: string;
  special: Special;
  maxRank: number;
  statsModified: StatModification[];
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

/**
 * One damage component of a weapon (a weapon can have multiple, e.g. phys + energy).
 * Base damage = Σ getBaseDamage(mode, comp.tier, min(itemLevel, comp.levelCap))
 * The split is preserved for future enemy ER/DR and damage-type perk routing.
 */
export interface WeaponComponent {
  damageType: 'ballistic' | 'energy' | 'radiation' | 'poison' | 'cryo' | 'fire';
  /** Universal damage curve tier (e.g. 24 for The Fixer). */
  tier: number;
  /** Item level cap for this component — damage is clamped to this level. */
  levelCap: number;
}

export interface Weapon {
  id: string;
  name: string;
  /** Damage components; base damage = Σ getBaseDamage per component. */
  components: WeaponComponent[];
  /** Primary damage type used for perk routing (e.g. energy bonus perks). */
  damageType: 'ballistic' | 'energy' | 'radiation' | 'poison' | 'cryo' | 'fire';
  weaponClass: 'rifle' | 'pistol' | 'shotgun' | 'heavy' | 'melee' | 'unarmed' | 'bow' | 'thrown';

  // ── Fire-rate parameters ─────────────────────────────────────────────────
  /** Weapon speed multiplier; almost always 1.0. */
  speed?: number;
  /** True for automatic weapons (uses animDurationSec). */
  isAutomatic: boolean;
  /**
   * True for ballistic / purely physical weapons — applies the 0.8248× speed
   * multiplier.  False for energy weapons (Gat Plasma, Plasma Gun, etc.).
   */
  isPhysical: boolean;
  /** Semi-auto: seconds between shots (animDelay). */
  animDelaySec?: number;
  /** Auto: fire animation cycle length in seconds (default ≈ 0.11). */
  animDurationSec?: number;

  // ── Legacy / scaffolding ─────────────────────────────────────────────────
  /** Flat base damage override (used by enemy weapon scaffolding). Derived
   *  weapons set this to 0; prefer `components` for player weapons. */
  baseDamage?: number;
  /** Accuracy (for future aim model). */
  accuracy?: number;
  /** Range (for future falloff model). */
  range?: number;
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
  conditions: EnemyConditions;
}

// Player config
export interface PlayerConfig {
  perks: PerkLoadout[];
  legendaryPerks: PerkLoadout[];
  weapon: WeaponConfig | null;
  armor: ArmorConfig;
  mutations: string[];
  consumables: string[];
  conditions: PlayerConditions;
  /** Global item level for base-damage curve lookup (1–50, default 50). */
  itemLevel: number;
  /** Configurable weakpoint damage multiplier (default 2.0). */
  weakpointMult: number;
}

// Damage stats (player outgoing)
export interface DamageStats {
  /** Damage per hit against a normal (non-weakpoint) target, after perks and buffs. */
  normalPerHit: number;
  /** DPS against a normal (non-weakpoint) target (normalPerHit × fireRate). */
  normalDps: number;
  /** Damage per hit against a weakpoint, after perks + weakpointMult. */
  weakpointPerHit: number;
  /** DPS against a weakpoint (weakpointPerHit × fireRate). */
  weakpointDps: number;
  /** Derived fire rate in shots/sec (for display). */
  fireRate: number;
}

// Default values factory
export function createDefaultPlayerConditions(): PlayerConditions {
  return {
    isSneaking: false,
    isInPowerArmor: false,
    isSolo: true,
    healthPercent: 100,
    bulletStormStacks: 10, // Assume max stacks by default
    onslaughtStacks: 10, // Assume max stacks by default
    adredalineStacks: 10, // Always max per user preference
    strength: 15,
    perception: 15,
    endurance: 15,
    charisma: 15,
    intelligence: 15,
    agility: 15,
    luck: 15,
    junkItemCount: 0,
    teammateCount: 0,
  };
}

export function createDefaultEnemyConditions(): EnemyConditions {
  return {
    isCrippled: false,
    crippledLimbCount: 0,
    statusEffectCount: 0,
    isGlowing: false,
    isInsect: false,
  };
}

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
    conditions: createDefaultPlayerConditions(),
    itemLevel: 50,
    weakpointMult: 2.0,
  };
}

export function createDefaultEnemyConfig(): EnemyConfig {
  return {
    enemyId: 'super_mutant',
    legendaryRank: 0,
    mutation: null,
    weaponId: null,
    powerArmorId: null,
    conditions: createDefaultEnemyConditions(),
  };
}

export function createDefaultDamageStats(): DamageStats {
  return {
    normalPerHit: 0,
    normalDps: 0,
    weakpointPerHit: 0,
    weakpointDps: 0,
    fireRate: 0,
  };
}
