import type { EnemyConditions, PlayerInput } from '@/types';
import { createDefaultEnemyConditions, createDefaultPlayerInput } from '@/types';
import type { ResolvedPlayer } from '@/types/player';
import { createDefaultResolvedPlayer } from '@/types/player';

/**
 * One row per player/enemy field, driving three consumers from a single
 * source: `origin: 'derived'` fields are excluded from the persisted share
 * URL (`src/lib/persist/codec.ts`'s `DERIVED_PLAYER_CONDITION_KEYS`, sourced
 * from `PLAYER_KNOB_REGISTRY` below); `activeBadge`/`badgeRead` feed
 * ConditionsSection/AttackStateGroup/TargetPanel's "N active" badge diff via
 * `knobActiveBadgeObjects`; `clamp`/`clampRef` document (not enforce — see
 * each field's comment) where a field's runtime bound lives. Adding a new
 * player/enemy field means adding a row here, not just wiring the UI control.
 *
 * Each row's `wire` ordinal is the stable integer the bit-packed share codec
 * writes per field. Ordinals are append-only (new rows take the next unused
 * integer); a removed row's ordinal is retired and never reused — old links
 * may still carry it.
 */

/** BuildColumn accordion id, ResultsPane scenario chips, or non-UI storage. */
export type KnobSection =
  | 'conditions'
  | 'attack-state'
  | 'target'
  | 'team'
  | 'special-loadout'
  | 'armor'
  | 'scenario-chips'
  | 'none';

export type KnobOrigin = 'input' | 'derived';

export interface KnobBadgeContext {
  /** Display clamp for ghoul Glow badge diff (engine clamps in resolveLoadout). */
  maxHealth: number;
}

interface KnobRowBase<K extends string, V> {
  key: K;
  /**
   * Stable wire ordinal for the bit-packed share codec. Append-only: new rows
   * take the next unused integer. Retired ordinals (removed rows) are never
   * reused — old share links may still carry them.
   */
  wire: number;
  owner: 'player' | 'enemy';
  /** `derived` = recomputed in resolveLoadout; omitted from share URLs. */
  origin: KnobOrigin;
  section: KnobSection;
  default: V;
  label: string;
  /** Included in ConditionsSection, AttackStateGroup, or TargetPanel "N active" badge diff. */
  activeBadge?: 'conditions' | 'target' | 'attack-state';
  /** When badge diff needs a coalesce or display clamp unlike stored value. */
  badgeRead?: (player: PlayerInput, ctx?: KnobBadgeContext) => unknown;
  /**
   * Static clamp or a symbolic ref — numeric clamps are descriptive; runtime
   * clamps live in `src/lib/build-rules.ts` / the reducer (see `clampRef`).
   */
  clamp?: { min: number; max: number };
  /** Documents where runtime clamping lives without importing `@/data`. */
  clampRef?: string;
}

export type PlayerKnobRow = {
  [K in keyof ResolvedPlayer]: KnobRowBase<K, ResolvedPlayer[K]>;
}[keyof ResolvedPlayer];

export type EnemyKnobRow = {
  [K in keyof EnemyConditions]: KnobRowBase<K, EnemyConditions[K]>;
}[keyof EnemyConditions];

const PLAYER_INPUT_DEFAULTS = createDefaultPlayerInput();
const PLAYER_DEFAULTS = createDefaultResolvedPlayer();
const ENEMY_DEFAULTS = createDefaultEnemyConditions();

// retired wire ordinals: 6 (isLastShot — replaced by resolve.ts's magazine-cycle
// `lastRound` average; never reuse the ordinal), 57 (hydrated — removed
// 2026-08-17; AP regen now derives from drinkTier alone, see
// player-baseline.ts). Old share links carrying retired bits just drop them.
export const PLAYER_KNOB_REGISTRY: Readonly<Record<keyof ResolvedPlayer, PlayerKnobRow>> = {
  isSneaking: {
    key: 'isSneaking',
    wire: 0,
    owner: 'player',
    origin: 'input',
    section: 'attack-state',
    default: PLAYER_DEFAULTS.isSneaking,
    label: 'Sneaking',
    activeBadge: 'attack-state',
  },
  isAimingAtWeakpoint: {
    key: 'isAimingAtWeakpoint',
    wire: 1,
    owner: 'player',
    origin: 'input',
    section: 'scenario-chips',
    default: PLAYER_DEFAULTS.isAimingAtWeakpoint,
    label: 'Aiming at weakpoint',
    activeBadge: 'target',
  },
  armorWorn: {
    key: 'armorWorn',
    wire: 2,
    owner: 'player',
    origin: 'input',
    section: 'armor',
    default: PLAYER_DEFAULTS.armorWorn,
    label: 'Armor worn',
  },
  isInPowerArmor: {
    key: 'isInPowerArmor',
    wire: 3,
    owner: 'player',
    origin: 'input',
    section: 'armor',
    default: PLAYER_DEFAULTS.isInPowerArmor,
    label: 'In power armor',
  },
  isSolo: {
    key: 'isSolo',
    wire: 4,
    owner: 'player',
    origin: 'input',
    section: 'none',
    default: PLAYER_DEFAULTS.isSolo,
    label: 'Solo',
  },
  isPowerAttacking: {
    key: 'isPowerAttacking',
    wire: 5,
    owner: 'player',
    origin: 'input',
    section: 'attack-state',
    default: PLAYER_DEFAULTS.isPowerAttacking,
    label: 'Power attacking',
    activeBadge: 'attack-state',
  },
  isAimingDownSights: {
    key: 'isAimingDownSights',
    wire: 7,
    owner: 'player',
    origin: 'input',
    section: 'attack-state',
    default: PLAYER_DEFAULTS.isAimingDownSights ?? false,
    label: 'Aiming down sights',
    activeBadge: 'attack-state',
  },
  isGhoul: {
    key: 'isGhoul',
    wire: 8,
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_DEFAULTS.isGhoul ?? false,
    label: 'Ghoul character',
  },
  healthPercent: {
    key: 'healthPercent',
    wire: 9,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.healthPercent,
    label: 'Health',
    activeBadge: 'conditions',
    clampRef: 'build-rules:snapPlayerHealthPercent',
  },
  bulletStormStacks: {
    key: 'bulletStormStacks',
    wire: 10,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.bulletStormStacks,
    label: 'Bullet Storm stacks',
    clamp: { min: -1, max: 0 },
    clampRef: 'resolve.ts:effectiveBulletStormStacks (dynamic max from engine)',
  },
  onslaughtStacks: {
    key: 'onslaughtStacks',
    wire: 11,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.onslaughtStacks,
    label: 'Onslaught stacks',
    clamp: { min: -1, max: 0 },
    clampRef: 'resolve.ts:effectiveOnslaughtStacks (dynamic max from engine)',
  },
  targetsHit: {
    key: 'targetsHit',
    wire: 12,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.targetsHit ?? 1,
    label: 'Targets hit per attack',
    activeBadge: 'conditions',
    clamp: { min: 1, max: 10 },
  },
  killStreak: {
    key: 'killStreak',
    wire: 13,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.killStreak,
    label: 'Kill streak',
    activeBadge: 'conditions',
    clamp: { min: 0, max: 10 },
  },
  tenderizerStacks: {
    key: 'tenderizerStacks',
    wire: 14,
    owner: 'player',
    origin: 'input',
    section: 'target',
    default: PLAYER_DEFAULTS.tenderizerStacks,
    label: 'Tenderizer stacks',
    activeBadge: 'target',
    clamp: { min: 0, max: 1000 },
    clampRef: 'data/target-debuffs:TENDERIZER_MAX_STACKS',
  },
  concentratedFireStacks: {
    key: 'concentratedFireStacks',
    wire: 15,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.concentratedFireStacks,
    label: 'Concentrated Fire stacks',
    activeBadge: 'conditions',
    clamp: { min: 0, max: 20 },
  },
  completedChallengeIds: {
    key: 'completedChallengeIds',
    wire: 16,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.completedChallengeIds ?? [],
    label: 'Completed challenges',
    activeBadge: 'conditions',
  },
  localLegendFishingChallengesCompleted: {
    key: 'localLegendFishingChallengesCompleted',
    wire: 17,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.localLegendFishingChallengesCompleted ?? 0,
    label: 'Local Legend fishing challenges',
    activeBadge: 'conditions',
    clamp: { min: 0, max: 6 },
  },
  addictionCount: {
    key: 'addictionCount',
    wire: 18,
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.addictionCount,
    label: 'Addiction count',
  },
  capsOnHand: {
    key: 'capsOnHand',
    wire: 19,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.capsOnHand,
    label: 'Caps on hand',
    activeBadge: 'conditions',
    clamp: { min: 0, max: 40000 },
  },
  maxHealth: {
    key: 'maxHealth',
    wire: 20,
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.maxHealth ?? 300,
    label: 'Max HP',
  },
  lockpickSkill: {
    key: 'lockpickSkill',
    wire: 21,
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.lockpickSkill ?? 0,
    label: 'Lockpick skill',
  },
  hackingSkill: {
    key: 'hackingSkill',
    wire: 22,
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.hackingSkill ?? 0,
    label: 'Hacking skill',
  },
  stimpakHealMult: {
    key: 'stimpakHealMult',
    wire: 23,
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.stimpakHealMult ?? 0,
    label: 'Stimpak healing',
  },
  stimpakHealMagMult: {
    key: 'stimpakHealMagMult',
    wire: 24,
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.stimpakHealMagMult ?? 1,
    label: 'Stimpak heal magnitude',
  },
  stimpakHealDurationMult: {
    key: 'stimpakHealDurationMult',
    wire: 25,
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.stimpakHealDurationMult ?? 1,
    label: 'Stimpak heal duration',
  },
  mutationCount: {
    key: 'mutationCount',
    wire: 26,
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: 0,
    label: 'Mutation count',
  },
  hungerThirstTier: {
    key: 'hungerThirstTier',
    wire: 27,
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.hungerThirstTier ?? 0,
    label: 'Hunger & thirst tier',
  },
  foodTier: {
    key: 'foodTier',
    wire: 28,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.foodTier ?? 0,
    label: 'Food meter',
    activeBadge: 'conditions',
    clamp: { min: 0, max: 4 },
  },
  drinkTier: {
    key: 'drinkTier',
    wire: 29,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.drinkTier ?? 0,
    label: 'Drink meter',
    activeBadge: 'conditions',
    clamp: { min: 0, max: 4 },
  },
  feralTier: {
    key: 'feralTier',
    wire: 30,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.feralTier ?? 0,
    label: 'Feral meter',
    activeBadge: 'conditions',
    clamp: { min: 0, max: 8 },
  },
  glow: {
    key: 'glow',
    wire: 31,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.glow ?? 0,
    label: 'Glow meter',
    activeBadge: 'conditions',
    badgeRead: (p, ctx) => Math.min(p.glow ?? 0, ctx?.maxHealth ?? PLAYER_DEFAULTS.maxHealth),
    clampRef: 'resolveLoadout:min(glow, maxHealth)',
  },
  underAlcoholEffect: {
    key: 'underAlcoholEffect',
    wire: 32,
    owner: 'player',
    origin: 'input',
    section: 'none',
    default: PLAYER_DEFAULTS.underAlcoholEffect ?? false,
    label: 'Under alcohol effect',
  },
  strangeInNumbers: {
    key: 'strangeInNumbers',
    wire: 33,
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.strangeInNumbers,
    label: 'Strange in Numbers',
  },
  classFreakRank: {
    key: 'classFreakRank',
    wire: 34,
    owner: 'player',
    origin: 'input',
    section: 'none',
    default: PLAYER_DEFAULTS.classFreakRank ?? 0,
    label: 'Class Freak rank',
    clamp: { min: 0, max: 3 },
    clampRef: 'player-stats:deriveClassFreakRank overwrites at runtime',
  },
  equippedPerkRanks: {
    key: 'equippedPerkRanks',
    wire: 35,
    owner: 'player',
    origin: 'input',
    section: 'none',
    default: PLAYER_DEFAULTS.equippedPerkRanks ?? {},
    label: 'Equipped perk ranks',
    clampRef: 'perk-modifiers:getEquippedPerkFamilyRanks overwrites at runtime',
  },
  weaponConditionPct: {
    key: 'weaponConditionPct',
    wire: 36,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.weaponConditionPct ?? 100,
    label: 'Weapon condition',
    activeBadge: 'conditions',
    clamp: { min: 0, max: 200 },
  },
  hitRatePct: {
    key: 'hitRatePct',
    wire: 37,
    owner: 'player',
    origin: 'input',
    section: 'target',
    default: PLAYER_DEFAULTS.hitRatePct ?? 100,
    label: 'Free Aim hit rate',
    activeBadge: 'target',
    clamp: { min: 10, max: 100 },
  },
  vatsHitRatePct: {
    key: 'vatsHitRatePct',
    wire: 38,
    owner: 'player',
    origin: 'input',
    section: 'target',
    default: PLAYER_DEFAULTS.vatsHitRatePct ?? 100,
    label: 'VATS hit rate',
    activeBadge: 'target',
    clamp: { min: 10, max: 100 },
  },
  bodyPartHitRatePct: {
    key: 'bodyPartHitRatePct',
    wire: 39,
    owner: 'player',
    origin: 'input',
    section: 'target',
    default: PLAYER_DEFAULTS.bodyPartHitRatePct ?? 100,
    label: 'Body part hit rate',
    activeBadge: 'target',
    clamp: { min: 10, max: 100 },
  },
  followThroughPct: {
    key: 'followThroughPct',
    wire: 40,
    owner: 'player',
    origin: 'input',
    section: 'target',
    default: PLAYER_DEFAULTS.followThroughPct ?? 0,
    label: 'Follow Through damage',
    activeBadge: 'target',
    clamp: { min: 0, max: 40 },
    clampRef: 'build-rules:syncTargetDebuffConditions',
  },
  takingOneForTheTeamPct: {
    key: 'takingOneForTheTeamPct',
    wire: 41,
    owner: 'player',
    origin: 'input',
    section: 'target',
    default: PLAYER_DEFAULTS.takingOneForTheTeamPct ?? 0,
    label: 'Taking One for the Team damage',
    clamp: { min: 0, max: 40 },
    clampRef: 'build-rules:takingOneForTheTeamFields',
  },
  takingOneForTheTeamDrRank: {
    key: 'takingOneForTheTeamDrRank',
    wire: 42,
    owner: 'player',
    origin: 'input',
    section: 'target',
    default: PLAYER_DEFAULTS.takingOneForTheTeamDrRank ?? 0,
    label: 'Taking One for the Team DR debuff',
    activeBadge: 'target',
    clamp: { min: 0, max: 4 },
    clampRef: 'build-rules:takingOneForTheTeamFields',
  },
  playerDamageResist: {
    key: 'playerDamageResist',
    wire: 43,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.playerDamageResist ?? 0,
    label: 'Damage Resist',
    activeBadge: 'conditions',
  },
  playerRadResist: {
    key: 'playerRadResist',
    wire: 44,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.playerRadResist ?? 0,
    label: 'Rad Resistance',
    activeBadge: 'conditions',
  },
  wornPieceCounts: {
    key: 'wornPieceCounts',
    wire: 45,
    owner: 'player',
    origin: 'input',
    section: 'none',
    default: {},
    label: 'Worn armor piece counts',
    clampRef: 'armor-modifiers:getArmorEffectWornPieceCounts overwrites at runtime',
  },
  battleLoadersBashSec: {
    key: 'battleLoadersBashSec',
    wire: 46,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.battleLoadersBashSec ?? 0.75,
    label: 'Battle-Loader bash time',
    activeBadge: 'conditions',
    clamp: { min: 0, max: 5 },
  },
  strength: {
    key: 'strength',
    wire: 47,
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_INPUT_DEFAULTS.strength,
    label: 'Strength',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  perception: {
    key: 'perception',
    wire: 48,
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_INPUT_DEFAULTS.perception,
    label: 'Perception',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  endurance: {
    key: 'endurance',
    wire: 49,
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_INPUT_DEFAULTS.endurance,
    label: 'Endurance',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  charisma: {
    key: 'charisma',
    wire: 50,
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_INPUT_DEFAULTS.charisma,
    label: 'Charisma',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  intelligence: {
    key: 'intelligence',
    wire: 51,
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_INPUT_DEFAULTS.intelligence,
    label: 'Intelligence',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  agility: {
    key: 'agility',
    wire: 52,
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_INPUT_DEFAULTS.agility,
    label: 'Agility',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  luck: {
    key: 'luck',
    wire: 53,
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_INPUT_DEFAULTS.luck,
    label: 'Luck',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  junkItemCount: {
    key: 'junkItemCount',
    wire: 54,
    owner: 'player',
    origin: 'input',
    section: 'none',
    default: PLAYER_DEFAULTS.junkItemCount,
    label: 'Junk item count',
  },
  teammateCount: {
    key: 'teammateCount',
    wire: 55,
    owner: 'player',
    origin: 'input',
    section: 'team',
    default: PLAYER_DEFAULTS.teammateCount,
    label: 'Teammate count',
    clamp: { min: 0, max: 3 },
  },
  publicTeamType: {
    key: 'publicTeamType',
    wire: 56,
    owner: 'player',
    origin: 'input',
    section: 'team',
    default: PLAYER_DEFAULTS.publicTeamType ?? 'none',
    label: 'Public team type',
  },
  // wire 57 is retired (see the comment above this registry) — do not reuse.
  procCripplesPerMin: {
    key: 'procCripplesPerMin',
    wire: 58,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.procCripplesPerMin ?? 0,
    label: 'Cripples per minute',
    activeBadge: 'conditions',
    clamp: { min: 0, max: 60 },
  },
  onBashBuffUptime: {
    key: 'onBashBuffUptime',
    wire: 59,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.onBashBuffUptime ?? 0,
    label: 'Bash-buff uptime',
    activeBadge: 'conditions',
    clamp: { min: 0, max: 100 },
  },
  wellTuned: {
    key: 'wellTuned',
    wire: 60,
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.wellTuned ?? false,
    label: 'Well Tuned',
    activeBadge: 'conditions',
  },
};

// retired wire ordinals: (none yet)
export const ENEMY_KNOB_REGISTRY: Readonly<Record<keyof EnemyConditions, EnemyKnobRow>> = {
  isCrippled: {
    key: 'isCrippled',
    wire: 0,
    owner: 'enemy',
    origin: 'input',
    section: 'none',
    default: ENEMY_DEFAULTS.isCrippled,
    label: 'Crippled',
  },
  crippledLimbCount: {
    key: 'crippledLimbCount',
    wire: 1,
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.crippledLimbCount,
    label: 'Crippled limbs',
    activeBadge: 'target',
    clampRef: 'build-rules:clampCrippledLimbCount (race-dependent max)',
  },
  statusEffectCount: {
    key: 'statusEffectCount',
    wire: 2,
    owner: 'enemy',
    origin: 'input',
    section: 'none',
    default: ENEMY_DEFAULTS.statusEffectCount,
    label: 'Status effect count',
  },
  isGlowing: {
    key: 'isGlowing',
    wire: 3,
    owner: 'enemy',
    origin: 'input',
    section: 'none',
    default: ENEMY_DEFAULTS.isGlowing,
    label: 'Glowing enemy',
  },
  isInsect: {
    key: 'isInsect',
    wire: 4,
    owner: 'enemy',
    origin: 'input',
    section: 'none',
    default: ENEMY_DEFAULTS.isInsect,
    label: 'Insect enemy',
  },
  healthPercent: {
    key: 'healthPercent',
    wire: 5,
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.healthPercent ?? 100,
    label: 'Enemy health',
    activeBadge: 'target',
    clampRef: 'build-rules:snapEnemyHealthPercent',
  },
  groupTargetCount: {
    key: 'groupTargetCount',
    wire: 6,
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.groupTargetCount ?? 1,
    label: 'Enemies in group',
    activeBadge: 'target',
    clamp: { min: 1, max: 5 },
  },
  isBurning: {
    key: 'isBurning',
    wire: 7,
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.isBurning ?? false,
    label: 'Burning',
    activeBadge: 'target',
  },
  isPoisoned: {
    key: 'isPoisoned',
    wire: 8,
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.isPoisoned ?? false,
    label: 'Poisoned',
    activeBadge: 'target',
  },
  isBleeding: {
    key: 'isBleeding',
    wire: 9,
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.isBleeding ?? false,
    label: 'Bleeding',
    activeBadge: 'target',
  },
  isFrozen: {
    key: 'isFrozen',
    wire: 10,
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.isFrozen ?? false,
    label: 'Frozen',
    activeBadge: 'target',
  },
  targetDistance: {
    key: 'targetDistance',
    wire: 11,
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.targetDistance,
    label: 'Target distance',
    activeBadge: 'target',
  },
  targetRace: {
    key: 'targetRace',
    wire: 12,
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.targetRace,
    label: 'Target race',
    activeBadge: 'target',
  },
  targetBodyPart: {
    key: 'targetBodyPart',
    wire: 13,
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.targetBodyPart,
    label: 'Target body part',
  },
  targetLevel: {
    key: 'targetLevel',
    wire: 14,
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.targetLevel,
    label: 'Target level',
    clampRef: 'enemy-defenses:resolveTargetLevelBounds (race-dependent)',
  },
  epicRank: {
    key: 'epicRank',
    wire: 15,
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.epicRank ?? 0,
    label: 'Epic rank',
    clamp: { min: 0, max: 3 },
  },
};

const PLAYER_KNOB_KEYS = Object.keys(PLAYER_KNOB_REGISTRY) as Array<keyof ResolvedPlayer>;
const ENEMY_KNOB_KEYS = Object.keys(ENEMY_KNOB_REGISTRY) as Array<keyof EnemyConditions>;

/** Player-condition keys resolveLoadout recomputes — never written to share URLs. */
export const DERIVED_PLAYER_CONDITION_KEYS = new Set<keyof ResolvedPlayer>(
  PLAYER_KNOB_KEYS.filter((key) => PLAYER_KNOB_REGISTRY[key]!.origin === 'derived'),
);

/** Build value/defaults objects for a section "N active" badge via `buildDeltaCount`. */
export function knobActiveBadgeObjects(
  badge: 'conditions' | 'target' | 'attack-state',
  player: PlayerInput,
  enemy: EnemyConditions,
  ctx?: KnobBadgeContext,
): { value: Record<string, unknown>; defaults: Record<string, unknown> } {
  const playerDefaults = PLAYER_INPUT_DEFAULTS;
  const enemyDefaults = createDefaultEnemyConditions();
  const value: Record<string, unknown> = {};
  const defaults: Record<string, unknown> = {};

  for (const key of PLAYER_KNOB_KEYS) {
    const row = PLAYER_KNOB_REGISTRY[key]!;
    if (row.activeBadge !== badge) continue;
    if (row.origin === 'input') {
      value[key] = row.badgeRead ? row.badgeRead(player, ctx) : player[key as keyof PlayerInput];
      defaults[key] = playerDefaults[key as keyof PlayerInput];
    }
  }
  for (const key of ENEMY_KNOB_KEYS) {
    const row = ENEMY_KNOB_REGISTRY[key]!;
    if (row.activeBadge !== badge) continue;
    value[key] = enemy[key];
    defaults[key] = enemyDefaults[key];
  }

  return { value, defaults };
}
