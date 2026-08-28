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
  /**
   * Manual knob for `onCripple` proc cadence (Fracturer's — issue #42,
   * PROC_DAMAGE_PLAN.md) — how many limb-crippling hits land per minute.
   * No crippling-frequency model exists (ADR-0009 precedent, same as
   * `followThroughPct`), so this is exogenous, default 0 (an honest zero,
   * not a hidden average — `computeProcDps`/ScenarioResult.procDps).
   */
  procCripplesPerMin?: number;
  /**
   * Manual knob for a bash-triggered timed buff's sustained uptime (Love
   * Tap — issue #80/#42 follow-up, user-directed 2026-08-20), 0–100 percent.
   * Same ADR-0009 exogenous-knob precedent as `procCripplesPerMin`: no
   * bash-frequency model exists, so the player states the uptime they
   * intend to sustain directly rather than a bashes-per-minute count. The
   * engine derives bashesPerMinute = 60 × (uptime/100) / buffDurationSec and
   * reuses `battleLoadersBashSec` as the time-cost-per-bash factor —
   * `resolve.ts`'s `bashUptimeDowntimeFraction`. Default 0 (an honest zero,
   * not a hidden average, same as `procCripplesPerMin`).
   */
  onBashBuffUptime?: number;
  /**
   * Whether the 3600s Well Tuned furniture buff is active (playing an
   * instrument — SPEL SURV_WellTunedSpell 0x0050CD15). Gates Tone Death's
   * +20% melee (`E08B_mod_Custom_ToneDeath`). Default false: exogenous timed
   * buff, ADR-0009 honest zero, not intrinsically always-on for any race.
   * See docs/assumptions.md "Tone Death Well Tuned melee buff".
   */
  wellTuned?: boolean;
  /**
   * Wearing the Eye of Ra headwear (MoMEyeOfRaItemKeyword). Gates Voice of
   * Set's upgraded robot shock proc. Default false: exogenous armor loadout,
   * ADR-0009 honest zero (ADR-0024).
   */
  eyeOfRaWorn?: boolean;
  /**
   * Standing still (IsMoving()=0). Default false (moving) — keeps
   * standing-still-gated modifiers inactive until toggled on (ADR-0022).
   */
  standingStill?: boolean;
  /**
   * VATS multi-target chain position (Gun Fu). 1 = first target (no Gun Fu
   * bonus); 2/3/4 = 2nd/3rd/4th+ targets. Default 1 — keeps pre-selector
   * numbers unchanged (ADR-0022).
   */
  vatsTargetIndex?: 1 | 2 | 3 | 4;

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

/**
 * The nine fields `ResolvedPlayer` adds beyond `PlayerConditionContext` —
 * real folded values from `playerAgg`, but not yet known on the bootstrap
 * SPECIAL-fold paths (`derivePlayerStats`'s early context,
 * `buildEffectiveWeapon`'s pre-OMOD context). Named once here so
 * `ResolveContextPlayer` and any future derived field stay in the same place
 * — see `PLAYER_STATE_READERS` in `resolve.ts`, whose reader for each of
 * these keys must supply a fallback (`?? <default>`) matching the value
 * below, since a bootstrap `ResolveContext` genuinely lacks them.
 */
export type DerivedPlayerFields = Pick<
  ResolvedPlayer,
  | 'addictionCount'
  | 'maxHealth'
  | 'lockpickSkill'
  | 'hackingSkill'
  | 'stimpakHealMult'
  | 'stimpakHealMagMult'
  | 'stimpakHealDurationMult'
  | 'mutationCount'
  | 'hungerThirstTier'
>;

/**
 * `ResolveContext.player`'s type: a `PlayerConditionContext` plus the derived
 * fields *when they're known*. Bootstrap folds (SPECIAL, onslaught/Bullet
 * Storm caps, move-speed bonus) build this from a bare
 * `PlayerConditionContext` — no widening to a full `ResolvedPlayer` needed,
 * since `PLAYER_STATE_READERS` falls back for every field here. The real
 * `ResolvedPlayer` (from `playerAgg`) is always a valid value too, since it's
 * a structural supertype.
 */
export type ResolveContextPlayer = PlayerConditionContext & Partial<DerivedPlayerFields>;

/**
 * Default `PlayerInput` — the app's fresh-build baseline (SPECIAL 1/1/1/1/1/1/1,
 * like a level-1 game start) and the delta baseline `src/lib/persist/codec.ts`
 * diffs against when encoding a share URL. Do not swap in synthetic-test
 * values here (see `createDefaultResolvedPlayer` below for those): a value
 * the app default doesn't share with the codec's decode seed
 * (`createDefaultBuildState()`) is a value that silently reverts to the
 * decode seed for any user who happens to pick it — see the SPECIAL=15
 * regression in `src/lib/persist/__tests__/codec.test.ts`.
 */
export function createDefaultPlayerInput(): PlayerInput {
  return {
    isSneaking: false,
    isAimingAtWeakpoint: false,
    armorWorn: 'body',
    isInPowerArmor: false,
    isSolo: true,
    isPowerAttacking: false,
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
    procCripplesPerMin: 0,
    onBashBuffUptime: 0,
    wellTuned: false,
    eyeOfRaWorn: false,
    standingStill: false,
    vatsTargetIndex: 1,
    strength: 1,
    perception: 1,
    endurance: 1,
    charisma: 1,
    intelligence: 1,
    agility: 1,
    luck: 1,
    junkItemCount: 0,
    teammateCount: 0,
    publicTeamType: 'none',
  };
}

/**
 * Synthetic-test defaults, not the app's real baseline.
 * Deliberately maxes SPECIAL to 15/15/15/15/15/15/15 — a maxed-out synthetic
 * test rig, not a value that's ever the app's actual default (that's
 * `createDefaultPlayerInput()`'s 1/1/1/1/1/1/1). Used by
 * `makeResolvedPlayer()` (`src/lib/engine/__tests__/resolved-player-fixture.ts`)
 * and other hand-built engine test fixtures — never wire it into `BuildState`,
 * the reducer, or the codec.
 */
export function createDefaultResolvedPlayer(): ResolvedPlayer {
  return {
    ...createDefaultPlayerInput(),
    strength: 15,
    perception: 15,
    endurance: 15,
    charisma: 15,
    intelligence: 15,
    agility: 15,
    luck: 15,
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
