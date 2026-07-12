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
  isAimingAtWeakpoint: boolean; // weakpoint (head) targeting; applies to both scenarios
  isInPowerArmor: boolean;
  isSolo: boolean;
  isPowerAttacking: boolean; // melee power attacks (toggle; applies across scenarios)
  isLastShot?: boolean; // firing the magazine's last round (Last Shot legendary; default false)
  isGhoul?: boolean; // playing a ghoul character (gates Gourmand's off, feral-meter effects on; default false)
  healthPercent: number; // 0-100 for perks like Nerd Rage, Serendipity

  // Stack counts
  bulletStormStacks: number; // 0-20 (10 base, 20 with Bringing the Big Guns)
  onslaughtStacks: number; // 0-10
  adrenalineStacks: number; // 0-10 (always max per user preference)
  tenderizerStacks: number; // 0-1000, 0.1 dbm per stack (manual team-scenario input)
  furiousStacks: number; // Furious legendary ramp (steady-state assumption)

  // Other steady-state inputs for conditional sources
  addictionCount: number; // for Junkie's legendary
  capsOnHand: number; // for Aristocrat's legendary
  maxHealth?: number; // absolute max HP for Juggernaut's health curve (default 300, docs/assumptions.md)
  mutationCount?: number; // for Mutant's curve — derived from the selected mutations in resolveLoadout
  hungerThirstTier?: number; // food/drink fullness tier for Gourmand's curve (default 0)
  feralTier?: number; // ghoul feral meter tier for Lucid/Feral's curves (default 0)
  limitBreakingPieces: number; // 0-5 armor pieces with Limit Breaking (−10% crit cost each)
  strangeInNumbers: boolean; // team with Strange in Numbers → mutation values ×1.25
  weaponConditionPct?: number; // 0-200: equipped weapon condition, 100 = full, 200 = over-repaired max (Polished; default 100)
  /**
   * Manual-aim (free-aim) hit rate %, 10-100, default 100. Models realistic
   * misses (movement, target size — dps-todos/ap-and-accuracy.md) by scaling
   * free-aim SUSTAINED dps only (not per-hit, not burst, not VATS — VATS
   * accuracy is assumed 100%, hit-chance modeling explicitly out of scope).
   */
  hitRatePct?: number;

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
  healthPercent?: number; // 0-100: Executioner's ≤40% / Instigating ≥60% gates (default 100 = full)
  groupTargetCount?: number; // enemies in the engaged group incl. the target (Encircler's; default 1)
  isBurning?: boolean; // active fire effect on the target (Pyromaniac's; default false)
  isPoisoned?: boolean; // active poison effect on the target (Viper's; default false)
  /** Target range bucket for Close/Far damage perks (Guerrilla, Down Ranger, Sniper's; default 'none'). */
  targetDistance?: 'close' | 'none' | 'far';
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
  /**
   * 'explosive' never appears on an extracted weapon component — it is the
   * engine-synthesized twin damage type (Explosive 2★ `explosivePayload`,
   * paper-damage.ts), reusing this union because `DamageType`
   * (types/modifiers.ts) is aliased from it.
   */
  damageType: 'ballistic' | 'energy' | 'radiation' | 'poison' | 'cryo' | 'fire' | 'explosive';
  /** Universal damage curve tier (e.g. 24 for The Fixer). -1 when only inline points exist. */
  tier: number;
  /** Item level cap for this component — damage is clamped to this level. */
  levelCap: number;
  /**
   * Inline damage-by-level points from ESM extraction (authoritative when
   * present; the tier-file lookup is the fallback for hand-authored data).
   */
  curvePoints?: Array<{ x: number; y: number }>;
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

  // ── Magazine / reload (sustained DPS) ────────────────────────────────────
  /** Magazine capacity in rounds (0/undefined = no magazine: melee, some uniques). */
  capacity?: number;
  /** Ammo consumed per shot (Gauss Minigun 2, most weapons 1). */
  ammoPerShot?: number;
  /** Reload speed multiplier (Data.Reload Speed; higher = faster). */
  reloadSpeed?: number;
  /** Base reload animation length in seconds (RGW3 Animation Reload Seconds). */
  animationReloadSec?: number;
  /**
   * Per-shot VATS AP cost (WEAP Data."Action Point Cost"). Fixer 16, Minigun
   * 8, Super Sledge 52. Rewritten by the `vatsApCost` OMOD bucket (V.A.T.S.
   * Optimized) in `effective-weapon.ts`; consumed by `ap-economy.ts` (Stage B).
   */
  apCost?: number;

  // ── ESM-extracted metadata (present on generated weapons) ────────────────
  /** Source ESM FormID (e.g. "0x0046D2A1"). */
  formId?: string;
  /** Resolved keyword editor_ids (WeaponTypeRifle, WeaponTypeAutomatic, ...). */
  keywords?: string[];
  /** Attach point slot formids — an OMOD fits when its attach point is listed here. */
  attachParentSlots?: string[];
  /** OMOD formids from the weapon's default Object Template — the stock/default parts (picker display rule). */
  templateModFormIds?: string[];
  /** Base weapon crit damage multiplier (VATS crit; typically 2.0). */
  critDamageMult?: number;
  /** Crit meter fill multiplier per hit (typically 1.0). */
  critChargeBonus?: number;
  /** Base sneak attack multiplier (typically 2.0–2.75). */
  sneakAttackMult?: number;
  /** Projectiles per shot (shotguns > 1). */
  projectileCount?: number;
  /** Intrinsic Damage Bonus Multiplier (RGW3; baseline 1.0) — the "1 +" of the dbm fold. */
  damageBonusMult?: number;

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
  /** Equipped OMOD id per attach-point slot edid (e.g. { ap_gun_Receiver: 'mod_...' }). */
  mods: Record<string, string | null>;
  /** Equipped legendary-effect OMOD ids (ap_Legendary1–4). */
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

// Default values factory
export function createDefaultPlayerConditions(): PlayerConditions {
  return {
    isSneaking: false,
    isAimingAtWeakpoint: false,
    isInPowerArmor: false,
    isSolo: true,
    isPowerAttacking: false,
    isLastShot: false,
    isGhoul: false,
    healthPercent: 100,
    bulletStormStacks: 10, // Assume max stacks by default
    onslaughtStacks: 10, // Assume max stacks by default
    adrenalineStacks: 10, // Always max per user preference
    tenderizerStacks: 0, // Solo default — no other players hitting the target
    furiousStacks: 0,
    addictionCount: 0,
    capsOnHand: 0,
    maxHealth: 300, // typical non-bloodied build (Juggernaut's curve input)
    hungerThirstTier: 0, // Gourmand's curve input (0–8; both meters empty)
    feralTier: 0, // Lucid/Feral's curve input (0–8; human default)
    limitBreakingPieces: 0,
    strangeInNumbers: false,
    weaponConditionPct: 100, // full condition (Polished curve input; 200 = over-repaired max)
    hitRatePct: 100, // manual-aim hit rate (100 = every shot lands; VATS is unaffected)
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
    healthPercent: 100,
    groupTargetCount: 1,
    isBurning: false,
    isPoisoned: false,
    targetDistance: 'none',
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

