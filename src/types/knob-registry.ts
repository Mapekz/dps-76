import type { EnemyConditions, PlayerInput } from '@/types';
import { createDefaultEnemyConditions, createDefaultPlayerInput } from '@/types';
import type { ResolvedPlayer } from '@/types/player';
import { createDefaultResolvedPlayer } from '@/types/player';

/** BuildColumn accordion id, ResultsPane scenario chips, or non-UI storage. */
export type KnobSection =
  | 'conditions'
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
  owner: 'player' | 'enemy';
  /** `derived` = recomputed in resolveLoadout; omitted from share URLs. */
  origin: KnobOrigin;
  section: KnobSection;
  default: V;
  label: string;
  /** Included in ConditionsSection or TargetSection "N active" badge diff. */
  activeBadge?: 'conditions' | 'target';
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

export const PLAYER_KNOB_REGISTRY: Readonly<Record<keyof ResolvedPlayer, PlayerKnobRow>> = {
  isSneaking: {
    key: 'isSneaking',
    owner: 'player',
    origin: 'input',
    section: 'scenario-chips',
    default: PLAYER_DEFAULTS.isSneaking,
    label: 'Sneaking',
  },
  isAimingAtWeakpoint: {
    key: 'isAimingAtWeakpoint',
    owner: 'player',
    origin: 'input',
    section: 'scenario-chips',
    default: PLAYER_DEFAULTS.isAimingAtWeakpoint,
    label: 'Aiming at weakpoint',
    activeBadge: 'target',
  },
  armorWorn: {
    key: 'armorWorn',
    owner: 'player',
    origin: 'input',
    section: 'armor',
    default: PLAYER_DEFAULTS.armorWorn,
    label: 'Armor worn',
  },
  isInPowerArmor: {
    key: 'isInPowerArmor',
    owner: 'player',
    origin: 'input',
    section: 'armor',
    default: PLAYER_DEFAULTS.isInPowerArmor,
    label: 'In power armor',
  },
  isSolo: {
    key: 'isSolo',
    owner: 'player',
    origin: 'input',
    section: 'none',
    default: PLAYER_DEFAULTS.isSolo,
    label: 'Solo',
  },
  isPowerAttacking: {
    key: 'isPowerAttacking',
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.isPowerAttacking,
    label: 'Power attacking',
    activeBadge: 'conditions',
  },
  isLastShot: {
    key: 'isLastShot',
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.isLastShot ?? false,
    label: 'Last shot in magazine',
    activeBadge: 'conditions',
  },
  isAimingDownSights: {
    key: 'isAimingDownSights',
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.isAimingDownSights ?? false,
    label: 'Aiming down sights',
    activeBadge: 'conditions',
  },
  isGhoul: {
    key: 'isGhoul',
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_DEFAULTS.isGhoul ?? false,
    label: 'Ghoul character',
  },
  healthPercent: {
    key: 'healthPercent',
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
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.completedChallengeIds ?? [],
    label: 'Completed challenges',
    activeBadge: 'conditions',
  },
  localLegendFishingChallengesCompleted: {
    key: 'localLegendFishingChallengesCompleted',
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
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.addictionCount,
    label: 'Addiction count',
  },
  capsOnHand: {
    key: 'capsOnHand',
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
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.maxHealth ?? 300,
    label: 'Max HP',
  },
  lockpickSkill: {
    key: 'lockpickSkill',
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.lockpickSkill ?? 0,
    label: 'Lockpick skill',
  },
  hackingSkill: {
    key: 'hackingSkill',
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.hackingSkill ?? 0,
    label: 'Hacking skill',
  },
  stimpakHealMult: {
    key: 'stimpakHealMult',
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.stimpakHealMult ?? 0,
    label: 'Stimpak healing',
  },
  stimpakHealMagMult: {
    key: 'stimpakHealMagMult',
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.stimpakHealMagMult ?? 1,
    label: 'Stimpak heal magnitude',
  },
  stimpakHealDurationMult: {
    key: 'stimpakHealDurationMult',
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.stimpakHealDurationMult ?? 1,
    label: 'Stimpak heal duration',
  },
  mutationCount: {
    key: 'mutationCount',
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: 0,
    label: 'Mutation count',
  },
  hungerThirstTier: {
    key: 'hungerThirstTier',
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.hungerThirstTier ?? 0,
    label: 'Hunger & thirst tier',
  },
  foodTier: {
    key: 'foodTier',
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
    owner: 'player',
    origin: 'input',
    section: 'none',
    default: PLAYER_DEFAULTS.underAlcoholEffect ?? false,
    label: 'Under alcohol effect',
  },
  strangeInNumbers: {
    key: 'strangeInNumbers',
    owner: 'player',
    origin: 'derived',
    section: 'none',
    default: PLAYER_DEFAULTS.strangeInNumbers,
    label: 'Strange in Numbers',
  },
  classFreakRank: {
    key: 'classFreakRank',
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
    owner: 'player',
    origin: 'input',
    section: 'none',
    default: PLAYER_DEFAULTS.equippedPerkRanks ?? {},
    label: 'Equipped perk ranks',
    clampRef: 'perk-modifiers:getEquippedPerkFamilyRanks overwrites at runtime',
  },
  weaponConditionPct: {
    key: 'weaponConditionPct',
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
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.playerDamageResist ?? 0,
    label: 'Damage Resist',
    activeBadge: 'conditions',
  },
  playerRadResist: {
    key: 'playerRadResist',
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.playerRadResist ?? 0,
    label: 'Rad Resistance',
    activeBadge: 'conditions',
  },
  wornPieceCounts: {
    key: 'wornPieceCounts',
    owner: 'player',
    origin: 'input',
    section: 'none',
    default: {},
    label: 'Worn armor piece counts',
    clampRef: 'armor-modifiers:getArmorEffectWornPieceCounts overwrites at runtime',
  },
  battleLoadersBashSec: {
    key: 'battleLoadersBashSec',
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
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_DEFAULTS.strength,
    label: 'Strength',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  perception: {
    key: 'perception',
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_DEFAULTS.perception,
    label: 'Perception',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  endurance: {
    key: 'endurance',
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_DEFAULTS.endurance,
    label: 'Endurance',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  charisma: {
    key: 'charisma',
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_DEFAULTS.charisma,
    label: 'Charisma',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  intelligence: {
    key: 'intelligence',
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_DEFAULTS.intelligence,
    label: 'Intelligence',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  agility: {
    key: 'agility',
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_DEFAULTS.agility,
    label: 'Agility',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  luck: {
    key: 'luck',
    owner: 'player',
    origin: 'input',
    section: 'special-loadout',
    default: PLAYER_DEFAULTS.luck,
    label: 'Luck',
    clamp: { min: 1, max: 15 },
    clampRef: 'build-rules:clampSpecialStat + SPECIAL_ALLOCATION_POOL',
  },
  junkItemCount: {
    key: 'junkItemCount',
    owner: 'player',
    origin: 'input',
    section: 'none',
    default: PLAYER_DEFAULTS.junkItemCount,
    label: 'Junk item count',
  },
  teammateCount: {
    key: 'teammateCount',
    owner: 'player',
    origin: 'input',
    section: 'team',
    default: PLAYER_DEFAULTS.teammateCount,
    label: 'Teammate count',
    clamp: { min: 0, max: 3 },
  },
  publicTeamType: {
    key: 'publicTeamType',
    owner: 'player',
    origin: 'input',
    section: 'team',
    default: PLAYER_DEFAULTS.publicTeamType ?? 'none',
    label: 'Public team type',
  },
  hydrated: {
    key: 'hydrated',
    owner: 'player',
    origin: 'input',
    section: 'conditions',
    default: PLAYER_DEFAULTS.hydrated ?? true,
    label: 'Fully hydrated',
    activeBadge: 'conditions',
  },
};

export const ENEMY_KNOB_REGISTRY: Readonly<Record<keyof EnemyConditions, EnemyKnobRow>> = {
  isCrippled: {
    key: 'isCrippled',
    owner: 'enemy',
    origin: 'input',
    section: 'none',
    default: ENEMY_DEFAULTS.isCrippled,
    label: 'Crippled',
  },
  crippledLimbCount: {
    key: 'crippledLimbCount',
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
    owner: 'enemy',
    origin: 'input',
    section: 'none',
    default: ENEMY_DEFAULTS.statusEffectCount,
    label: 'Status effect count',
  },
  isGlowing: {
    key: 'isGlowing',
    owner: 'enemy',
    origin: 'input',
    section: 'none',
    default: ENEMY_DEFAULTS.isGlowing,
    label: 'Glowing enemy',
  },
  isInsect: {
    key: 'isInsect',
    owner: 'enemy',
    origin: 'input',
    section: 'none',
    default: ENEMY_DEFAULTS.isInsect,
    label: 'Insect enemy',
  },
  healthPercent: {
    key: 'healthPercent',
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
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.isBurning ?? false,
    label: 'Burning',
    activeBadge: 'target',
  },
  isPoisoned: {
    key: 'isPoisoned',
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.isPoisoned ?? false,
    label: 'Poisoned',
    activeBadge: 'target',
  },
  isBleeding: {
    key: 'isBleeding',
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.isBleeding ?? false,
    label: 'Bleeding',
    activeBadge: 'target',
  },
  isFrozen: {
    key: 'isFrozen',
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.isFrozen ?? false,
    label: 'Frozen',
    activeBadge: 'target',
  },
  targetDistance: {
    key: 'targetDistance',
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.targetDistance,
    label: 'Target distance',
    activeBadge: 'target',
  },
  targetRace: {
    key: 'targetRace',
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.targetRace,
    label: 'Target race',
    activeBadge: 'target',
  },
  targetBodyPart: {
    key: 'targetBodyPart',
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.targetBodyPart,
    label: 'Target body part',
  },
  targetLevel: {
    key: 'targetLevel',
    owner: 'enemy',
    origin: 'input',
    section: 'target',
    default: ENEMY_DEFAULTS.targetLevel,
    label: 'Target level',
    clampRef: 'enemy-defenses:resolveTargetLevelBounds (race-dependent)',
  },
  epicRank: {
    key: 'epicRank',
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
  badge: 'conditions' | 'target',
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
