/** Body armor vs power armor vs unarmored — authoritative armor-type state. */
export type ArmorWorn = 'none' | 'body' | 'power';

/**
 * Persisted player configuration: combat toggles, stack sliders, manual knobs,
 * and budget-enforced SPECIAL **base allocation** (1–15). No fields that
 * `resolveLoadout` derives — those live on `ResolvedPlayer` only.
 */
export interface PlayerInput {
  // Combat state
  isSneaking: boolean;
  isAimingAtWeakpoint: boolean;
  armorWorn: ArmorWorn;
  isInPowerArmor: boolean;
  isSolo: boolean;
  isPowerAttacking: boolean;
  isLastShot?: boolean;
  isAimingDownSights?: boolean;
  isGhoul?: boolean;
  healthPercent: number;

  // Stack counts
  bulletStormStacks: number;
  onslaughtStacks: number;
  targetsHit?: number;
  killStreak: number;
  tenderizerStacks: number;
  concentratedFireStacks: number;
  completedChallengeIds?: string[];
  localLegendFishingChallengesCompleted?: number;

  // Steady-state inputs
  capsOnHand: number;
  foodTier?: number;
  drinkTier?: number;
  feralTier?: number;
  /**
   * Ghoul Glow meter (Rads AV), absolute 0..maxHealth. Clamped to derived
   * `maxHealth` on the `ResolvedPlayer` view — see `ResolvedPlayer.glow`.
   */
  glow?: number;
  weaponConditionPct?: number;
  hitRatePct?: number;
  vatsHitRatePct?: number;
  bodyPartHitRatePct?: number;
  followThroughPct?: number;
  takingOneForTheTeamPct?: number;
  takingOneForTheTeamDrRank?: 0 | 1 | 2 | 3 | 4;
  /**
   * Manual knob for the wielder's DamageResist AV (Berserker's curve input).
   * On `ResolvedPlayer` the same key holds the **folded** value from the
   * `damageResistGain` bucket — see `ResolvedPlayer.playerDamageResist`.
   */
  playerDamageResist?: number;
  playerRadResist?: number;
  battleLoadersBashSec?: number;

  // SPECIAL base allocation (1–15, budget-enforced in BuildState).
  // On `ResolvedPlayer` these keys hold **buff-folded effective SPECIAL**.
  strength: number;
  perception: number;
  endurance: number;
  charisma: number;
  intelligence: number;
  agility: number;
  luck: number;

  junkItemCount: number;
  teammateCount: number;
  publicTeamType?: 'none' | 'casual' | 'exploration';
  hydrated?: boolean;
}

/**
 * Gates and worn-piece counts derived in `deriveConditionsFor` before stat
 * folds. Threaded into `derivePlayerStats` and `buildEffectiveWeapon` during
 * assembly — not persisted, not the fully resolved engine view.
 */
export type PlayerConditionContext = PlayerInput & {
  strangeInNumbers: boolean;
  classFreakRank?: number;
  underAlcoholEffect?: boolean;
  equippedPerkRanks?: Record<string, number>;
  wornPieceCounts?: Record<string, number>;
};

/**
 * Engine-ready player view produced by `playerAgg` in `resolveLoadout`: effective
 * SPECIAL, folded `playerDamageResist`, and every derived stat. Consumed by
 * `ResolveContext.player` and `PLAYER_STATE_READERS`.
 */
export interface ResolvedPlayer extends PlayerConditionContext {
  addictionCount: number;
  maxHealth: number;
  lockpickSkill: number;
  hackingSkill: number;
  stimpakHealMult: number;
  stimpakHealMagMult: number;
  stimpakHealDurationMult: number;
  mutationCount: number;
  hungerThirstTier: number;
  /**
   * Folded wielder DamageResist (Berserker's curve X). On `PlayerInput` the
   * same key is the **manual knob** used as the `damageResistGain` fold base.
   */
  playerDamageResist?: number;
  /**
   * Buff-folded effective SPECIAL. On `PlayerInput` the same keys hold
   * **base allocation** (1–15, budget-enforced).
   */
  strength: number;
  perception: number;
  endurance: number;
  charisma: number;
  intelligence: number;
  agility: number;
  luck: number;
  /** Glow meter clamped to `maxHealth` in `playerAgg`. */
  glow?: number;
}

/** @deprecated Use `PlayerInput`. */
export type PlayerConditions = PlayerInput;

export function createDefaultPlayerInput(): PlayerInput {
  return {
    isSneaking: false,
    isAimingAtWeakpoint: false,
    armorWorn: 'body',
    isInPowerArmor: false,
    isSolo: true,
    isPowerAttacking: false,
    isLastShot: false,
    isAimingDownSights: false,
    isGhoul: false,
    healthPercent: 100,
    bulletStormStacks: -1,
    onslaughtStacks: -1,
    targetsHit: 1,
    killStreak: 0,
    tenderizerStacks: 0,
    concentratedFireStacks: 0,
    completedChallengeIds: [],
    localLegendFishingChallengesCompleted: 0,
    capsOnHand: 0,
    foodTier: 0,
    drinkTier: 0,
    feralTier: 0,
    glow: 0,
    battleLoadersBashSec: 0.75,
    weaponConditionPct: 100,
    hitRatePct: 100,
    vatsHitRatePct: 100,
    bodyPartHitRatePct: 100,
    followThroughPct: 0,
    takingOneForTheTeamPct: 0,
    takingOneForTheTeamDrRank: 0,
    playerDamageResist: 0,
    playerRadResist: 0,
    strength: 15,
    perception: 15,
    endurance: 15,
    charisma: 15,
    intelligence: 15,
    agility: 15,
    luck: 15,
    junkItemCount: 0,
    teammateCount: 0,
    publicTeamType: 'none',
    hydrated: true,
  };
}

/** Synthetic-test defaults matching the pre-split `createDefaultPlayerConditions`. */
export function createDefaultResolvedPlayer(): ResolvedPlayer {
  return {
    ...createDefaultPlayerInput(),
    strangeInNumbers: false,
    classFreakRank: 0,
    underAlcoholEffect: false,
    equippedPerkRanks: {},
    wornPieceCounts: {},
    addictionCount: 0,
    maxHealth: 300,
    lockpickSkill: 0,
    hackingSkill: 0,
    stimpakHealMult: 0,
    stimpakHealMagMult: 1,
    stimpakHealDurationMult: 1,
    mutationCount: 0,
    hungerThirstTier: 0,
  };
}

/** @deprecated Use `createDefaultPlayerInput`. */
export function createDefaultPlayerConditions(): PlayerInput {
  return createDefaultPlayerInput();
}

/**
 * Synthetic derived-field defaults for `toResolvedPlayer`. Built once, not per
 * call: `toResolvedPlayer` runs three times per suggestion candidate (twice in
 * `derivePlayerStats`, once in `buildEffectiveWeapon`) across ~700 candidates
 * per sweep, so rebuilding a 58-field object each time cost ~8% of the sweep.
 * Only ever spread from, never mutated — frozen so that stays true.
 */
const RESOLVED_PLAYER_DEFAULTS: Readonly<ResolvedPlayer> = Object.freeze(
  createDefaultResolvedPlayer(),
);

/** Widen pre-aggregation context to `ResolvedPlayer` using synthetic derived defaults. */
export function toResolvedPlayer(
  ctx: PlayerConditionContext,
  overrides?: Partial<ResolvedPlayer>,
): ResolvedPlayer {
  return { ...RESOLVED_PLAYER_DEFAULTS, ...ctx, ...overrides };
}
