import type { EnemyConditions, GameMode, PlayerConditions, Weapon } from '@/types';
import { BUCKET_REGISTRY, type Bucket, type Modifier } from '@/types/modifiers';
import { weaponCharges } from '@/lib/charge';
import { interpolateCurve } from '@/lib/curve-tables';
import chargedMeleeCurveFile from '@/data/live/curvetables/legendarymods/weapon_chargedmeleeattack.json';
import { DEFAULT_DISTANCE_UNITS, rangeFalloffMult } from '@/lib/distance';
import { getFireRate } from '@/lib/fire-rate';
import { apLimitedDps, computeApEconomy, DEFAULT_ACTION_POINT_CONSTANTS, effectiveShotsPerSecond, type ActionPointConstants } from './ap-economy';
import { computeCritMeter, DEFAULT_VATS_CRIT_CONSTANTS, type CritMeterResult, type VatsCritConstants } from './crit-meter';
import { computeDotDps, computePaperDamage, type HitBreakdown } from './paper-damage';
import { applyMitigation, type EnemyDefenses, type MitigationConstants } from './mitigation';
import { perShotOnslaughtConsume, reverseOnslaughtAvgStacks } from './onslaught';
import { BULLET_STORM_AMMO_PER_STACK, bulletStormAvgStacks } from './bulletstorm';
import { computeSustain, DEFAULT_BATTLE_LOADERS_BASH_SEC, type SustainResult } from './sustain';
import { createHitTrace, lastTrace, type ApRegenTrace, type BucketTrace, type CritMeterTrace, type HitTrace } from './trace';
import { effectiveValue, foldBucket, type ResolveContext, type ScenarioFlags } from './resolve';

/** Which body part a hit lands on — the location axis for torso-gated perks (Center Masochist). */
type BodyPartLocation = NonNullable<ResolveContext['bodyPart']>;

/**
 * The two displayed scenarios, computed from one resolved config:
 * - freeAim: no VATS, no crits (crits are VATS-only).
 * - vats: crit cadence from the crit meter blends a non-crit and a crit hit.
 *
 * Sneaking and weakpoint targeting are global player conditions
 * (`isSneaking`, `isAimingAtWeakpoint`) that apply to BOTH scenarios rather
 * than scenario variants: sneak-attack bonuses work identically in and out
 * of VATS, and VATS hits whatever body part the player targets.
 */

/** Attribution traces for one scenario (present only when collectTrace was set). */
export interface ScenarioExplain {
  nonCrit: HitTrace;
  /** The crit hit's trace (VATS only, when crits fire). */
  crit: HitTrace | null;
  critMeter?: CritMeterTrace;
  /** Passive AP regen derivation (VATS only, present when `ap` is). */
  apRegen?: ApRegenTrace | null;
}

export interface ScenarioResult {
  /** Steady-state average per hit (crit-cadence-weighted for VATS). */
  perHit: HitBreakdown;
  /** Per-hit × fire rate (mag-dump, no reload). */
  burstDps: number;
  /** Magazine/reload cycle model — sustained DPS and its inputs. */
  sustain: SustainResult;
  /**
   * Hit-rate % applied to this scenario's `sustain.sustainedDps` (free-aim ←
   * `hitRatePct`, VATS ← `vatsHitRatePct`; both default 100). Surfaced so the
   * card can show "hit chance" without re-reading player conditions.
   */
  hitRatePct: number;
  fireRate: number;
  /** Extracted fire-rate data is approximate until animation timing lands. */
  fireRateApproximate: true;
  /** Steady-state crit fraction (VATS only). */
  critRate?: number;
  /** Full crit-meter economy (VATS only) — drives the crit gauge display. */
  critMeter?: CritMeterResult;
  /**
   * Steady-state DoT add while continuously attacking (Stage A2,
   * refresh-only semantics — sum of active `dotDamage` magnitudes,
   * interpreted as dmg/sec). Separate from `perHit`/`burstDps`/`sustain`,
   * which stay unchanged; 0 when no DoT modifier is active.
   */
  dotDps: number;
  /**
   * Steady-state VATS AP economy (Stage B) — only present for ranged weapons
   * with a real per-shot VATS AP cost (`weapon.apCost > 0`; melee/VATS-melee
   * AP is out of scope, see `ap-economy.ts`). `uptime` is 1 when AP is not
   * the constraint (regen + crit restores ≥ drain) — the UI hides the line
   * in that case rather than this field being absent.
   */
  ap?: {
    uptime: number;
    apLimitedDps: number;
    secondsToEmpty?: number;
    /** AP economy breakdown for display: pool size, regen and effective cost. */
    maxAp: number;
    regenPerSec: number;
    /** Crit-restore AP/sec (instant apPerCrit + refresh-only HoTs) + the reload-window regen credit. */
    apGainPerSec: number;
    /** Passive regen credited during the reload window, cycle-averaged (already inside apGainPerSec). */
    reloadRegenPerSec: number;
    /** Effective per-shot VATS AP cost (post weapon-OMOD vatsApCost fold). */
    apCostPerShot: number;
  };
  /** Multiplier-chain attribution (only when input.collectTrace). */
  explain?: ScenarioExplain;
  /**
   * Post-mitigation figures against the selected target (Phase 2 — Enemy
   * defenses), present only when `ScenarioInput.enemyDefenses` was supplied
   * (a target race resolved to real npc stats). `perHit`/`sustainedDps` are
   * mitigated versions of this scenario's own `perHit`/`sustain.sustainedDps`
   * (for charged weapons, of the charge-cycle-blended hit that actually feeds
   * `sustain` — NOT the plain `perHit` field, which stays the un-cycled
   * display hit per the existing Charged split). `retainedPct` is
   * `mitigated / unmitigated × 100` on that same total (0-100, matching the
   * `*Pct` convention elsewhere on this type). `ttk` is enemy HP ÷
   * `sustainedDps` here (`Infinity` when `sustainedDps` is 0 — no damage
   * ever lands). DoT (`dotDps`) is NOT included — mitigation doesn't apply to
   * it in v1 (docs/assumptions.md "Resist mitigation").
   */
  effective?: {
    perHit: HitBreakdown;
    sustainedDps: number;
    retainedPct: number;
    ttk: number;
  };
}

export interface ScenarioSet {
  freeAim: ScenarioResult;
  vats: ScenarioResult;
  /**
   * The shared Onslaught stack cap folded from every equipped source's
   * `onslaughtMaxStacks` modifier (0 when none are equipped). Exposed here
   * so the UI's Onslaught-stacks slider (`ConditionsSection`) can read the
   * bound without re-running `resolveLoadout` — see docs/assumptions.md
   * "Onslaught".
   */
  onslaughtMaxStacks: number;
  /**
   * True when Gunslinger Master (or any `onslaughtReverse` source) is equipped
   * — the shared counter runs in reverse mode and the UI shows a read-only
   * engine-computed average instead of the manual stacks slider.
   */
  onslaughtReverse: boolean;
  /**
   * Steady-state average stack count under reverse mode (undefined when
   * `onslaughtReverse` is false).
   */
  onslaughtReverseAvgStacks?: number;
  /**
   * The shared Bullet Storm stack cap folded from every equipped source's
   * `bulletStormMaxStacks` modifier (0 when none are equipped) — same
   * precedent as `onslaughtMaxStacks`. Exposed here so the UI's Bullet Storm
   * stacks slider can read the bound without re-running `resolveLoadout`.
   * See docs/assumptions.md "Bullet Storm".
   */
  bulletStormMaxStacks: number;
  /**
   * The shared Bullet Storm stack FLOOR folded from every equipped source's
   * `bulletStormMinStacks` modifier (0 when none are equipped — Resolute
   * Veteran's +5).
   */
  bulletStormMinStacks: number;
  /**
   * Steady-state average Bullet Storm stack count under
   * `PlayerConditions.bulletStormAverageMode` (undefined when the toggle is
   * off, or no Bullet Storm sources are equipped).
   */
  bulletStormAvgStacks?: number;
  /**
   * True when any equipped source reads the kill-streak counter (Adrenaline,
   * Crowd Control, Sole Survivor; Lawbringer, Adrenal, Thrill-Seeker's) — the
   * UI's kill-streak slider disables without one. Unlike onslaughtMaxStacks
   * this is an existence scan, not a bucket fold: kill-streak sources are
   * curves/conditions attached to arbitrary buckets, there is no dedicated
   * bucket to fold.
   */
  hasKillStreakSources: boolean;
  /**
   * True when any equipped source reads the `concentratedFire` stack counter
   * (Concentrated Fire's per-VATS-shot `dbm` bonus) — the UI's Concentrated
   * Fire stacks slider disables without one. Existence scan (mirrors
   * `hasKillStreakSources`), not a bucket fold: Concentrated Fire's
   * modifier carries the `stacks` condition directly rather than a
   * dedicated bucket.
   */
  hasConcentratedFireSources: boolean;
  /**
   * True when the effective weapon carries a nonzero `reloadSkipChanceBash`
   * (Battle-Loader's — the bash-triggered reload-skip channel, Phase C, go-
   * through-every-single-silly-whistle.md) — gates the UI's bash-time
   * slider (`ConditionsSection.tsx`, `PlayerConditions.battleLoadersBashSec`).
   * Unlike `hasKillStreakSources`/`hasConcentratedFireSources` (existence
   * scans over `ScenarioInput.modifiers`), this reads the FOLDED weapon
   * field instead: `reloadSkipChanceBash` is a `sustainChance`-regime
   * bucket, consumed and stripped from the modifier list before it reaches
   * `computeScenarios` (same fold-then-drop shape as every other
   * `SUSTAIN_CHANCE_BUCKETS`/`WEAPON_STAT_BUCKETS` bucket — see
   * `effective-weapon.ts`/`loadout.ts`'s `assemble`), so a raw modifier-list
   * scan would always read false.
   */
  hasBattleLoadersSource: boolean;
  /**
   * The equipped weapon's charge parameters (Gauss family, bows, tesla/
   * gamma/laser via charging-barrel OMODs — `weaponCharges()`,
   * src/lib/charge.ts), computed ONCE from the effective `input.weapon` and
   * exposed here so the UI's charge-time slider doesn't need to re-run
   * resolveLoadout on every drag — same precedent as `onslaughtMaxStacks`.
   * Null when the effective weapon doesn't charge (hides the slider).
   */
  charging: { fullPowerSeconds: number; fullPowerDamageMult: number; minimumChargeTime: number } | null;
  /**
   * The equipped weapon's effective range fields (Phase 1 — Range +
   * falloff), computed ONCE from the effective `input.weapon` — same
   * precedent as `charging`, so the UI's distance slider can show weapon
   * range context (TargetSection.tsx) without re-running resolveLoadout.
   * Raw game units — the UI divides by PIP_BOY_UNIT_DIVISOR (src/lib/distance.ts)
   * to display Pip-Boy units. Null for melee weapons or weapons with no
   * usable range span (maxRange ≤ 0) — see `isMelee`/`rangeFalloffMult`.
   */
  range: { minRange: number; maxRange: number; outOfRangeMult: number } | null;
  /**
   * Display-only aggregate of every equipped `vatsHitChance`-bucket
   * modifier's decimal value (0.10 = +10%), folded ONCE against the VATS
   * scenario's resolve context (weapon-keyword/perk-rank/targetDistance/
   * playerIsGhoul conditions all evaluate against the real VATS flags) —
   * same "fold once" bootstrap precedent as `onslaughtMaxStacks`/`armorPen`.
   * NEVER consumed by `sustainedDps`/`apLimitedDps`/any damage term — the
   * manual `vatsHitRatePct` slider (`ConditionsSection.tsx`) stays the sole
   * authoritative VATS hit-rate input. This field's only consumer is that
   * same section's informational pill. See docs/assumptions.md "VATS
   * hit-chance aggregate (display-only)".
   */
  vatsHitChanceBonus: number;
  /**
   * Display-only Concentrated Fire hit-chance MULTIPLIER (EP109,
   * USER-RESOLVED 2026-07-19) — folded the same way as `vatsHitChanceBonus`
   * above (once, against the VATS scenario's resolve context) but exposed
   * AS-IS rather than de-based: 1 = neutral (no Concentrated Fire stacks, or
   * no source equipped), 1.80 = a ×1.80 multiplier on the game's own
   * computed VATS hit chance. NEVER consumed by `sustainedDps`/
   * `apLimitedDps`/any damage term — the manual `vatsHitRatePct` slider
   * stays the sole authoritative VATS hit-rate input. This field's only
   * consumer is `ConditionsSection.tsx`'s informational pill. See
   * docs/assumptions.md "Concentrated Fire stacks".
   */
  vatsHitChanceMult: number;
}

export interface ScenarioInput {
  mode: GameMode;
  weapon: Weapon;
  itemLevel: number;
  modifiers: Modifier[];
  player: PlayerConditions;
  enemy: EnemyConditions;
  /**
   * Enemy-type identifiers of the selected target (race edid + ActorType*
   * keywords) — derived from `enemy.targetRace` in resolveLoadout; drives
   * `enemyType`/`enemyTypeAny` gates (Assassin's, Zealot's, Prime receivers).
   */
  enemyTypeIds?: readonly string[];
  /** Body-part multiplier used for weakpoint hits (user-configurable, default 2.0). */
  weakpointMult: number;
  /**
   * Whether the picked enemy body part is BPTD-Torso (the location axis
   * torso-gated perks like Center Masochist key off), independent of
   * `weakpointMult`'s magnitude — an armored torso can be <1.0, a
   * torso-weakpoint (Deathclaw Belly) can be >1.0. `undefined` when no BPTD
   * part was picked (custom multiplier input): the engine falls back to the
   * legacy mult-derived category (mult 1.0 → torso).
   */
  targetIsTorso?: boolean;
  /**
   * Steady-state crit fraction override for the VATS scenario. When omitted,
   * it is computed from the crit meter (LCK, Crit Savvy, Limit Breaking,
   * weapon crit charge bonus).
   */
  critRate?: number;
  /**
   * Player-selected charge hold time in seconds, for weapons that charge
   * (`weaponCharges()`, src/lib/charge.ts). Undefined = "always fully
   * charge" (the default, optimal-play assumption). Identical across Free
   * Aim and VATS — the same manual charge applies to both scenarios, since
   * nothing auto-charges in-game.
   */
  chargeTimeSec?: number;
  /**
   * Collect per-source attribution traces (ScenarioResult.explain). Off by
   * default — the suggestion engine's speculative evals must never pay for it.
   */
  collectTrace?: boolean;
  /**
   * The selected target's HP + per-damage-type resists (Phase 2 — Enemy
   * defenses, `src/lib/enemy-defenses.ts` — resolved in `resolveLoadout` from
   * `enemy.conditions.targetRace`/`targetLevel`). Undefined = no target
   * selected (or one with no npc data) — `ScenarioResult.effective` stays
   * absent in that case. `armorPen`/`armorPenFlat` bucket modifiers are
   * folded and consumed by `mitigation.ts` regardless of whether this is
   * set (the bootstrap fold below always runs); only the presence of a
   * usable target gates whether mitigation is actually APPLIED.
   */
  enemyDefenses?: EnemyDefenses;
  /**
   * ESM-extracted GMST scalars for the mitigation formula (`@/data`
   * `getMitigationConstants`, resolved in `resolveLoadout`) — engine files
   * stay data-adapter-free (`loadout.ts`'s "one sanctioned bridge"
   * doc-comment), so this is threaded in rather than looked up here.
   * Undefined = `mitigation.ts`'s `DEFAULT_MITIGATION_CONSTANTS` (tests and
   * any caller without a mode).
   */
  mitigationConstants?: MitigationConstants;
  /**
   * ESM-extracted scalars for the crit-meter/AP-economy/Bullet-Storm
   * formulas (`@/data`'s `getVatsCritConstants`/`getActionPointConstants`/
   * `getBulletStormConstants`, resolved in `resolveLoadout`) — same
   * "threaded in, not looked up here" rule as `mitigationConstants` above.
   * Each field is undefined-safe: a missing sub-object falls back to that
   * consumer's own `DEFAULT_*` constant (tests and any caller without a mode).
   */
  engineConstants?: {
    vatsCrit?: VatsCritConstants;
    actionPoints?: ActionPointConstants;
    bulletStorm?: { ammoPerStack: number };
    distance?: { closeThresholdUnits: number };
  };
}

/** Onslaught cap + optional reverse-mode average, threaded on every ResolveContext. */
interface OnslaughtThread {
  maxStacks: number;
  reverseAvg?: number;
}

/** Bullet Storm cap/floor + optional sustained-fire average, threaded on every ResolveContext. */
interface BulletStormThread {
  maxStacks: number;
  minStacks: number;
  avg?: number;
}

function scenarioCtx(
  input: ScenarioInput,
  flags: ScenarioFlags,
  onslaught: OnslaughtThread,
  bulletStorm: BulletStormThread
): ResolveContext {
  return {
    weapon: input.weapon,
    player: input.player,
    enemy: input.enemy,
    scenario: { ...flags, isPowerAttack: flags.isPowerAttack && isMelee(input.weapon) },
    itemLevel: input.itemLevel,
    enemyTypeIds: input.enemyTypeIds,
    onslaughtMaxStacks: onslaught.maxStacks,
    ...(onslaught.reverseAvg !== undefined && { onslaughtReverseStacks: onslaught.reverseAvg }),
    bulletStormMaxStacks: bulletStorm.maxStacks,
    bulletStormMinStacks: bulletStorm.minStacks,
    ...(bulletStorm.avg !== undefined && { bulletStormAvgStacks: bulletStorm.avg }),
    ...(input.engineConstants?.distance && { closeThresholdUnits: input.engineConstants.distance.closeThresholdUnits }),
  };
}

/** Fold using the bucket's registry-owned base and output convention. */
function foldRegisteredBucket(
  modifiers: Modifier[],
  bucket: Bucket,
  ctx: ResolveContext,
  collect?: BucketTrace[]
): number {
  const { foldBase = 0, deBased = false } = BUCKET_REGISTRY[bucket];
  const result = foldBucket(modifiers, bucket, foldBase, ctx, collect);
  return deBased ? result - foldBase : result;
}

function isMelee(weapon: Weapon): boolean {
  return weapon.weaponClass === 'melee' || weapon.weaponClass === 'unarmed';
}

/**
 * Charged (4★ melee) cadence model (Stage C2, user-decided: folded into the
 * average automatically, like the crit meter, rather than a manual toggle).
 *
 * ESM chain: OMOD mod_Legendary_Weapon4_Melee_Charged (0x00885C6A) has NO
 * enchantment — its whole payload is 4 ADDed keywords, the mechanic trigger
 * being WeaponHasSecondaryCharging (KYWD 0x0089A83D); engine-native via
 * Default Objects (no extractor change needed — effective-weapon.ts already
 * merges OMOD addedKeywords onto weapon.keywords). Damage curve
 * ESM-EXTRACTED (user-identified 2026-07-21): DFOB
 * `WeaponSecondaryChargeUpDamageBonusCurve_DO` (0x0089A83C) → CURV
 * `CT_Legendary_Weapon_ChargedUpWeapon` (0x008A3B85,
 * `extract-curvetables.ts`'s `CURVE_TABLE_SINGLETONS` →
 * `legendarymods/weapon_chargedmeleeattack.json`): charges 1/2/3 →
 * +0.5/+1.5/+3.0 damage bonus (multiply the releasing power attack by
 * `(1 + y)`); max charges = the curve's own X domain (3 today), read off the
 * curve rather than hardcoded so a future ESM revision (more charge tiers,
 * a re-tuned bonus) is picked up on re-extraction. The detonation VFX itself
 * deals 0 damage (docs/assumptions.md).
 *
 * 1-charge-per-light-attack is an INFERENCE — no rate field exists in ESM
 * data (docs/assumptions.md). Modeled cycle: `CHARGED_MAX_CHARGES` light
 * (non-power-attack) attacks bank charges, the next is a full-charge power
 * attack (race mult + powerAttackBonus bucket, C1) further multiplied by
 * `(1 + CHARGED_FULL_BONUS)`. Applies regardless of the isPowerAttacking
 * toggle — the cadence IS the optimal play pattern for a Charged weapon
 * (docs/assumptions.md).
 */
const CHARGED_KEYWORD = 'WeaponHasSecondaryCharging';
const CHARGED_MELEE_CURVE = chargedMeleeCurveFile.curve;
/** The curve's own X domain ceiling — the game's max chargeable stack count (3 in the 20260717 dump). */
const CHARGED_MAX_CHARGES = CHARGED_MELEE_CURVE[CHARGED_MELEE_CURVE.length - 1].x;
/** Curve Y at `CHARGED_MAX_CHARGES` — the full-charge damage bonus (3.0 in the 20260717 dump). */
const CHARGED_FULL_BONUS = interpolateCurve(CHARGED_MELEE_CURVE, CHARGED_MAX_CHARGES);
const CHARGED_CYCLE_LENGTH = CHARGED_MAX_CHARGES + 1; // CHARGED_MAX_CHARGES light attacks + 1 detonation

function isCharged(weapon: Weapon): boolean {
  return (weapon.keywords ?? []).includes(CHARGED_KEYWORD);
}

function scaleHit(b: HitBreakdown, mult: number): HitBreakdown {
  return {
    components: b.components.map(c => ({ ...c, damage: c.damage * mult })),
    total: b.total * mult,
  };
}

/**
 * The charged cycle's average hit: 3 normal (non-power-attack) hits + 1
 * detonation hit (full power-attack treatment × (1 + CHARGED_FULL_BONUS)),
 * each crit-weighted by the scenario's own steady-state crit rate (0 for
 * free aim, the VATS crit meter's rate for VATS) so the cycle composes with
 * crits the same way the scenario's ordinary perHit does.
 */
function chargedCycleHit(
  input: ScenarioInput,
  flags: ScenarioFlags,
  bodyPartMult: number,
  bodyPart: BodyPartLocation,
  critRate: number,
  onslaught: OnslaughtThread,
  bulletStorm: BulletStormThread,
  rangeMult: number
): HitBreakdown {
  const normal = critWeighted(
    bodyPartBlendedHit(input, { ...flags, isPowerAttack: false, isCrit: false }, bodyPartMult, bodyPart, onslaught, bulletStorm, rangeMult),
    bodyPartBlendedHit(input, { ...flags, isPowerAttack: false, isCrit: true }, bodyPartMult, bodyPart, onslaught, bulletStorm, rangeMult),
    critRate
  );
  const detonation = scaleHit(
    critWeighted(
      bodyPartBlendedHit(input, { ...flags, isPowerAttack: true, isCrit: false }, bodyPartMult, bodyPart, onslaught, bulletStorm, rangeMult),
      bodyPartBlendedHit(input, { ...flags, isPowerAttack: true, isCrit: true }, bodyPartMult, bodyPart, onslaught, bulletStorm, rangeMult),
      critRate
    ),
    1 + CHARGED_FULL_BONUS
  );
  return {
    components: normal.components.map((c, i) => ({
      ...c,
      damage: (c.damage * CHARGED_MAX_CHARGES + detonation.components[i].damage) / CHARGED_CYCLE_LENGTH,
    })),
    total: (normal.total * CHARGED_MAX_CHARGES + detonation.total) / CHARGED_CYCLE_LENGTH,
  };
}

function hit(
  input: ScenarioInput,
  flags: ScenarioFlags,
  bodyPartMult: number,
  bodyPart: BodyPartLocation,
  onslaught: OnslaughtThread,
  bulletStorm: BulletStormThread,
  rangeMult: number,
  trace?: HitTrace
): HitBreakdown {
  return computePaperDamage({
    mode: input.mode,
    weapon: input.weapon,
    itemLevel: input.itemLevel,
    modifiers: input.modifiers,
    ctx: scenarioCtx(input, flags, onslaught, bulletStorm),
    bodyPartMult,
    // Location axis, independent of the mult above: >1 doesn't imply
    // weakpoint and 1.0 doesn't imply torso (an armored torso can be <1.0, a
    // torso-weakpoint like a Deathclaw's Belly can be >1.0) — see the
    // `targetBodyPart` derivation in computeScenarios.
    bodyPart,
    chargeTimeSec: input.chargeTimeSec,
    rangeFalloffMult: rangeMult,
    trace,
  });
}

/** Weight an on-target hit against the torso hit that lands instead when the aimed part is missed. */
function bodyPartWeighted(atTarget: HitBreakdown, atTorso: HitBreakdown, rate: number): HitBreakdown {
  const w = Math.max(0, Math.min(rate, 1));
  return {
    components: atTarget.components.map((c, i) => ({
      ...c,
      damage: c.damage * w + atTorso.components[i].damage * (1 - w),
    })),
    total: atTarget.total * w + atTorso.total * (1 - w),
  };
}

/**
 * A hit while aiming at a body part: bodyPartHitRatePct of shots land on the
 * aimed part (bodyPartMult/bodyPart), the rest hit the torso (×1.0, 'torso').
 * Short-circuits to a plain hit when the two legs are identical — at 100%
 * hit rate, or when the aimed part's mult AND location both already match
 * the torso fallback — so the common path does zero extra work. Only the
 * on-target leg carries the trace — `explain` shows the landed-hit chain,
 * the same simplest-defensible split as the Charged cycle's perHit.
 */
function bodyPartBlendedHit(
  input: ScenarioInput,
  flags: ScenarioFlags,
  bodyPartMult: number,
  bodyPart: BodyPartLocation,
  onslaught: OnslaughtThread,
  bulletStorm: BulletStormThread,
  rangeMult: number,
  trace?: HitTrace
): HitBreakdown {
  const rate = (input.player.bodyPartHitRatePct ?? 100) / 100;
  if (rate >= 1 || (bodyPartMult === 1.0 && bodyPart === 'torso')) {
    return hit(input, flags, bodyPartMult, bodyPart, onslaught, bulletStorm, rangeMult, trace);
  }
  const atTarget = hit(input, flags, bodyPartMult, bodyPart, onslaught, bulletStorm, rangeMult, trace);
  const atTorso = hit(input, flags, 1.0, 'torso', onslaught, bulletStorm, rangeMult);
  return bodyPartWeighted(atTarget, atTorso, rate);
}

/**
 * Post-mitigation `ScenarioResult.effective` (Phase 2 — Enemy defenses),
 * undefined when no target is selected. `cycleHit` is whichever HitBreakdown
 * actually feeds `sustainedDps` (the charged-cycle blend for charged
 * weapons, the plain scenario hit otherwise — see the `freeCycleHit`/
 * `vatsCycleHit` comment in `computeScenarios`). `retainedFraction` is
 * derived from the SAME total mitigation scales `sustainedDps` by, so
 * `effective.sustainedDps / sustainedDps === effective.perHit.total /
 * cycleHit.total` always holds.
 */
function effectiveAgainstEnemy(
  cycleHit: HitBreakdown,
  sustainedDps: number,
  defenses: EnemyDefenses | undefined,
  armorPenTotal: number,
  armorPenFlatTotal: number,
  mitigationConstants: MitigationConstants | undefined
): ScenarioResult['effective'] {
  if (!defenses) return undefined;
  const mitigated = applyMitigation(cycleHit, defenses, armorPenTotal, armorPenFlatTotal, mitigationConstants);
  const retainedFraction = cycleHit.total > 0 ? mitigated.total / cycleHit.total : 1;
  const mitigatedSustainedDps = sustainedDps * retainedFraction;
  return {
    perHit: mitigated,
    sustainedDps: mitigatedSustainedDps,
    retainedPct: retainedFraction * 100,
    ttk: mitigatedSustainedDps > 0 ? defenses.hp / mitigatedSustainedDps : Infinity,
  };
}

/** Weight two hit breakdowns (non-crit vs crit) by the steady-state crit rate. */
function critWeighted(nonCrit: HitBreakdown, crit: HitBreakdown, critRate: number): HitBreakdown {
  if (critRate <= 0) return nonCrit;
  const w = Math.min(critRate, 1);
  return {
    components: nonCrit.components.map((c, i) => ({
      ...c,
      damage: c.damage * (1 - w) + crit.components[i].damage * w,
    })),
    total: nonCrit.total * (1 - w) + crit.total * w,
  };
}

export function computeScenarios(input: ScenarioInput): ScenarioSet {
  const fireRate = getFireRate(input.weapon, input.chargeTimeSec);
  const powerAttack = input.player.isPowerAttacking;
  const sneaking = input.player.isSneaking;
  const bodyPartMult = input.player.isAimingAtWeakpoint ? input.weakpointMult : 1.0;
  // Location axis for torso-gated perks (Center Masochist), independent of
  // the mult above — an armored torso can be <1.0, a torso-weakpoint
  // (Deathclaw Belly) can be >1.0. Order matters: not-aiming is a default
  // torso hit regardless of any picked part; only override torso-ness when
  // real BPTD location data is available (`targetIsTorso` defined) — a
  // custom multiplier with no picked part keeps the legacy mult-derived
  // category (mult 1.0 → torso).
  const targetBodyPart: BodyPartLocation = !input.player.isAimingAtWeakpoint
    ? 'torso'
    : input.targetIsTorso === true
      ? 'torso'
      : input.targetIsTorso === false
        ? bodyPartMult > 1.0
          ? 'weakpoint'
          : 'limb'
        : bodyPartMult > 1.0
          ? 'weakpoint'
          : bodyPartMult < 1.0
            ? 'limb'
            : 'torso';
  const tracing = input.collectTrace === true;

  // Range falloff (Phase 1 — Range + falloff): computed ONCE — neither the
  // target distance nor the effective weapon's range fields vary by scenario
  // flags — and threaded through every hit() call below alongside
  // bodyPartMult (same "computed once per input" precedent as
  // onslaughtMaxStacks further down). Melee weapons are exempt: their
  // outOfRangeDamageMult values are sentinel-ish (Shishkebab 0.0, Machete
  // −1.0) and must never reach rangeFalloffMult — see its own guard doc.
  const rangeMult = isMelee(input.weapon)
    ? 1.0
    : rangeFalloffMult(
        input.enemy.targetDistance ?? DEFAULT_DISTANCE_UNITS,
        input.weapon.minRange ?? 0,
        input.weapon.maxRange ?? 0,
        input.weapon.outOfRangeDamageMult ?? 1.0
      );
  // Effective weapon range, exposed for the UI's distance-slider context
  // (TargetSection.tsx) — same precedent as `charging` below. Null when
  // there's no usable range span to show (melee, or maxRange <= 0).
  const range =
    !isMelee(input.weapon) && (input.weapon.maxRange ?? 0) > 0
      ? {
          minRange: input.weapon.minRange ?? 0,
          maxRange: input.weapon.maxRange ?? 0,
          outOfRangeMult: input.weapon.outOfRangeDamageMult ?? 1.0,
        }
      : null;

  // Onslaught max stacks (folded ONCE, threaded onto every ResolveContext
  // below): onslaughtMaxStacks modifiers only gate on weapon keyword/class,
  // never on scenario flags, so a flag-agnostic bootstrap context (max 0,
  // the "ctxWithoutIt" the fold itself can't depend on) is enough to
  // evaluate them. With no Onslaught sources equipped this is 0, so every
  // `stacks:onslaught` / `onslaughtStacks`-curve modifier reads 0 below.
  const bootstrapFlags: ScenarioFlags = { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false };
  const bootstrapCtx = scenarioCtx(input, bootstrapFlags, { maxStacks: 0 }, { maxStacks: 0, minStacks: 0 });
  const onslaughtMaxStacks = foldRegisteredBucket(input.modifiers, 'onslaughtMaxStacks', bootstrapCtx);
  const onslaughtReverse = foldRegisteredBucket(input.modifiers, 'onslaughtReverse', bootstrapCtx) > 0;

  // Battle-Loader's bash time (Phase C — go-through-every-single-silly-
  // whistle.md): folded ONCE here, threaded into every reload-timing call
  // below (reverseOnslaughtAvgStacks, bulletStormAvgStacks, both
  // computeSustain calls) — same "fold once, thread everywhere" precedent as
  // onslaughtMaxStacks/rangeMult above.
  const bashAnimationSec = input.player.battleLoadersBashSec ?? DEFAULT_BATTLE_LOADERS_BASH_SEC;

  let onslaughtReverseAvg: number | undefined;
  if (onslaughtReverse && onslaughtMaxStacks > 0) {
    const consume = perShotOnslaughtConsume(
      input.weapon,
      input.modifiers,
      bootstrapCtx,
      input.player.targetsHit ?? 1
    );
    onslaughtReverseAvg = reverseOnslaughtAvgStacks({
      max: onslaughtMaxStacks,
      perShotConsume: consume,
      fireRate,
      weapon: input.weapon,
      bashAnimationSec,
    });
  }

  const onslaught: OnslaughtThread = {
    maxStacks: onslaughtMaxStacks,
    ...(onslaughtReverseAvg !== undefined && { reverseAvg: onslaughtReverseAvg }),
  };

  // Bullet Storm max/min/retention (folded ONCE, threaded onto every
  // ResolveContext below) — same bootstrap precedent as Onslaught above:
  // cap/floor/retention modifiers only gate on weapon keyword/class, never on
  // scenario flags, so the flag-agnostic bootstrap context is enough.
  const bulletStormMaxStacks = foldRegisteredBucket(input.modifiers, 'bulletStormMaxStacks', bootstrapCtx);
  const bulletStormMinStacks = foldRegisteredBucket(input.modifiers, 'bulletStormMinStacks', bootstrapCtx);
  const bulletStormRetention = foldRegisteredBucket(input.modifiers, 'bulletStormRetention', bootstrapCtx);

  let bulletStormAvg: number | undefined;
  if (input.player.bulletStormAverageMode && bulletStormMaxStacks > 0) {
    bulletStormAvg = bulletStormAvgStacks({
      max: bulletStormMaxStacks,
      min: bulletStormMinStacks,
      retention: bulletStormRetention,
      weapon: input.weapon,
      fireRate,
      bashAnimationSec,
      ammoPerStack: input.engineConstants?.bulletStorm?.ammoPerStack ?? BULLET_STORM_AMMO_PER_STACK,
    });
  }

  const bulletStorm: BulletStormThread = {
    maxStacks: bulletStormMaxStacks,
    minStacks: bulletStormMinStacks,
    ...(bulletStormAvg !== undefined && { avg: bulletStormAvg }),
  };

  // Enemy-defense mitigation inputs (Phase 2 — Enemy defenses), folded ONCE
  // per scenario input — same bootstrap precedent as Onslaught/Bullet Storm
  // above: both extracted `armorPen`/`armorPenFlat` sources only gate on
  // weapon keyword/class (never scenario flags), so the flag-agnostic
  // bootstrap context is enough. Consumed by `applyMitigation` below
  // regardless of whether a target is selected — with no target,
  // `effectiveAgainstEnemy` just never runs, so the fold result goes unread,
  // exactly like any other bootstrap fold with nothing equipped.
  const armorPenTotal = foldRegisteredBucket(input.modifiers, 'armorPen', bootstrapCtx);
  const armorPenFlatTotal = foldRegisteredBucket(input.modifiers, 'armorPenFlat', bootstrapCtx);

  // Kill-streak sources (existence scan — see ScenarioSet.hasKillStreakSources).
  const hasKillStreakSources = input.modifiers.some(
    m =>
      m.curve?.input === 'killStreak' ||
      m.conditions.some(c => c.kind === 'killStreakCount' || (c.kind === 'stacks' && c.counter === 'adrenaline'))
  );

  // Concentrated Fire sources (existence scan — see ScenarioSet.hasConcentratedFireSources).
  const hasConcentratedFireSources = input.modifiers.some(m =>
    m.conditions.some(c => c.kind === 'stacks' && c.counter === 'concentratedFire')
  );

  // Battle-Loader's bash source (see ScenarioSet.hasBattleLoadersSource doc
  // comment for why this reads the folded weapon field instead of an
  // input.modifiers scan — reloadSkipChanceBash is stripped from the
  // modifier list before it reaches this function).
  const hasBattleLoadersSource = (input.weapon.reloadSkipChanceBash ?? 0) > 0;

  // Free aim: crits are VATS-only, so never crit here.
  const freeFlags: ScenarioFlags = { isVats: false, isSneaking: sneaking, isPowerAttack: powerAttack, isCrit: false };
  const freeTrace = tracing ? createHitTrace() : undefined;
  const freeHit = bodyPartBlendedHit(input, freeFlags, bodyPartMult, targetBodyPart, onslaught, bulletStorm, rangeMult, freeTrace);

  // VATS: crit cadence blends a non-crit and a crit hit. `vatsCtx` is the
  // one full (onslaught/bulletStorm-threaded) VATS-flavored resolve context
  // for this input — reused below by the crit meter, the AP economy fold,
  // the VATS DoT fold, and the vatsHitChance aggregate, so weapon-keyword/
  // perk-rank/targetDistance/playerIsGhoul conditions on every VATS-scoped
  // fold evaluate against the same real VATS state instead of each call
  // rebuilding an equivalent context.
  const vatsFlags: ScenarioFlags = { isVats: true, isSneaking: sneaking, isPowerAttack: powerAttack, isCrit: false };
  const vatsCtx = scenarioCtx(input, vatsFlags, onslaught, bulletStorm);
  const critMeterTrace = tracing ? ({ fill: null, consumption: null } as CritMeterTrace) : undefined;
  const critMeter = computeCritMeter(
    input.modifiers,
    input.weapon,
    vatsCtx,
    critMeterTrace,
    input.engineConstants?.vatsCrit ?? DEFAULT_VATS_CRIT_CONSTANTS
  );
  const critRate = input.critRate ?? critMeter.critRate;
  // VATS hit-chance aggregate (Phase 4 — display-only): folded ONCE against
  // the VATS resolve context (same "fold once" bootstrap precedent as
  // armorPen/onslaughtMaxStacks), NEVER consumed by any damage/sustain/AP
  // term below — see the `vatsHitChance` bucket doc comment
  // (src/types/modifiers.ts) and docs/assumptions.md "VATS hit-chance
  // aggregate (display-only)". Surfaced on `ScenarioSet.vatsHitChanceBonus`
  // purely for the ConditionsSection.tsx pill.
  //
  // Its unusual base-1/de-based convention is registry-owned; see the bucket
  // doc comment for why mixed ADD/MUL_ADD sources require it.
  const vatsHitChanceBonus = foldRegisteredBucket(input.modifiers, 'vatsHitChance', vatsCtx);
  // Concentrated Fire's hit-chance MULTIPLIER (EP109, USER-RESOLVED
  // 2026-07-19) — same "fold once against the VATS context" bootstrap
  // precedent as vatsHitChanceBonus immediately above, and the same base-1
  // reasoning, but NOT de-based: the exposed value IS the multiplier itself
  // (1 = neutral). Both conventions are registry-owned. See the
  // `vatsHitChanceMult` bucket doc comment
  // (src/types/modifiers.ts) and docs/assumptions.md "Concentrated Fire
  // stacks". Surfaced on `ScenarioSet.vatsHitChanceMult`, never consumed by
  // any damage/sustain/AP term below.
  const vatsHitChanceMult = foldRegisteredBucket(input.modifiers, 'vatsHitChanceMult', vatsCtx);
  const vatsTrace = tracing ? createHitTrace() : undefined;
  const vatsCritTrace = tracing ? createHitTrace() : undefined;
  const vatsAvg = critWeighted(
    bodyPartBlendedHit(input, vatsFlags, bodyPartMult, targetBodyPart, onslaught, bulletStorm, rangeMult, vatsTrace),
    bodyPartBlendedHit(input, { ...vatsFlags, isCrit: true }, bodyPartMult, targetBodyPart, onslaught, bulletStorm, rangeMult, vatsCritTrace),
    critRate
  );

  // Charged (Stage C2): the sustained/average DPS reflects the light-attack
  // ×3 + detonation cycle; perHit display stays the plain hit above (decided
  // simplest-defensible split, docs/assumptions.md). The full cycle
  // HitBreakdown (not just its total) is kept for mitigation below —
  // `effective` needs real per-component damage types to mitigate against,
  // and for a charged weapon that's the CYCLE's breakdown, not the plain
  // `freeHit`/`vatsAvg` one (whose total sustain no longer reflects).
  const charged = isCharged(input.weapon);
  const freeCycleHit = charged
    ? chargedCycleHit(input, freeFlags, bodyPartMult, targetBodyPart, 0, onslaught, bulletStorm, rangeMult)
    : freeHit;
  const vatsCycleHit = charged
    ? chargedCycleHit(input, vatsFlags, bodyPartMult, targetBodyPart, critRate, onslaught, bulletStorm, rangeMult)
    : vatsAvg;
  const freeCycleTotal = freeCycleHit.total;
  const vatsCycleTotal = vatsCycleHit.total;

  const freeSustainRaw = computeSustain(freeCycleTotal, fireRate, input.weapon, bashAnimationSec);
  const vatsSustainRaw = computeSustain(vatsCycleTotal, fireRate, input.weapon, bashAnimationSec);

  // Manual hit rate (Stage B/C): scales each scenario's SUSTAINED dps only —
  // never burst, never per-hit (those stay the every-shot-hits ceiling).
  // Models realistic misses (movement, target size, VATS target lock); a
  // miss still costs the shot but deals no damage, so scaling the
  // steady-state dps by the landed fraction is equivalent to (and simpler
  // than) modeling individual misses. Free aim and VATS have independent
  // manual knobs — see docs/assumptions.md "Manual-aim hit rate".
  const hitRateFraction = (input.player.hitRatePct ?? 100) / 100;
  const freeSustain: SustainResult = { ...freeSustainRaw, sustainedDps: freeSustainRaw.sustainedDps * hitRateFraction };
  const vatsHitRateFraction = (input.player.vatsHitRatePct ?? 100) / 100;
  const vatsSustain: SustainResult = { ...vatsSustainRaw, sustainedDps: vatsSustainRaw.sustainedDps * vatsHitRateFraction };

  // DoT is a separate steady-state add (refresh-only, not crit/vats-scaled by
  // any extracted data today) — evaluated with each scenario's own non-crit
  // context so a future sneaking/powerAttack-gated DoT mod still resolves correctly.
  const freeDotDps = computeDotDps(input.modifiers, input.weapon, scenarioCtx(input, freeFlags, onslaught, bulletStorm));
  const vatsDotDps = computeDotDps(input.modifiers, input.weapon, vatsCtx);

  // Steady-state VATS AP economy (Stage B): ranged weapons only (melee/VATS-
  // melee AP is out of scope — uptime is undefined without real melee AP
  // costs) and only when the weapon has a real per-shot VATS AP cost.
  let ap: ScenarioResult['ap'];
  let apRegenTrace: ApRegenTrace | undefined;
  if (!isMelee(input.weapon) && (input.weapon.apCost ?? 0) > 0) {
    const apCtx = vatsCtx;
    const percentCollect = tracing ? ([] as BucketTrace[]) : undefined;
    const apRegenBonus = foldRegisteredBucket(input.modifiers, 'apRegen', apCtx, percentCollect);
    const flatCollect = tracing ? ([] as BucketTrace[]) : undefined;
    const apRegenFlatBonus = foldRegisteredBucket(input.modifiers, 'apRegenFlat', apCtx, flatCollect);
    const maxApCollect = tracing ? ([] as BucketTrace[]) : undefined;
    const apMaxBonus = foldRegisteredBucket(input.modifiers, 'apMax', apCtx, maxApCollect);
    const apPerCrit = foldRegisteredBucket(input.modifiers, 'apPerCrit', apCtx);
    // apCritHot is collected per-modifier (not bucket-folded): each HoT keeps
    // its own duration window for the refresh-only steady-state term.
    const critHots = input.modifiers.flatMap(mod => {
      if (mod.bucket !== 'apCritHot') return [];
      const ratePerSec = effectiveValue(mod, apCtx);
      return ratePerSec !== null && ratePerSec > 0 ? [{ ratePerSec, durationSec: mod.durationSec ?? 0 }] : [];
    });
    const shotsPerSec = effectiveShotsPerSecond(vatsSustain, fireRate);
    const apConstants = input.engineConstants?.actionPoints ?? DEFAULT_ACTION_POINT_CONSTANTS;
    const economy = computeApEconomy({
      apCost: input.weapon.apCost!,
      shotsPerSec,
      agility: input.player.agility,
      apRegenBonus,
      apRegenFlatBonus,
      apMaxBonus,
      isInPowerArmor: input.player.isInPowerArmor,
      apPerCrit,
      critHots,
      shotsPerCrit: critMeter.shotsPerCrit,
      // Passive regen ticks during the reload window (same cycle shotsPerSec
      // averages over) — the reload-regen credit's inputs.
      reloadSec: vatsSustain.reloadSec,
      magDumpSec: vatsSustain.magDumpSec,
      constants: apConstants,
    });
    if (tracing) {
      apRegenTrace = {
        agility: input.player.agility,
        isInPowerArmor: input.player.isInPowerArmor ?? false,
        poolBase: apConstants.poolBase,
        poolPerAgility: apConstants.poolPerAgility,
        raceBasePct: input.player.isInPowerArmor ? apConstants.regenRatePctPowerArmor : apConstants.regenRatePct,
        flat: lastTrace(flatCollect!),
        percent: lastTrace(percentCollect!),
        maxAp: lastTrace(maxApCollect!),
        reloadSec: vatsSustain.reloadSec,
        magDumpSec: vatsSustain.magDumpSec,
        regenDelaySec: apConstants.regenDelaySec,
        reloadRegenPerSec: economy.reloadRegenPerSec,
      };
    }
    ap = {
      uptime: economy.uptime,
      apLimitedDps: apLimitedDps(vatsSustain.sustainedDps, economy.uptime),
      ...(economy.secondsToEmpty !== undefined && { secondsToEmpty: economy.secondsToEmpty }),
      maxAp: economy.maxAp,
      regenPerSec: economy.regenPerSec,
      apGainPerSec: economy.apGainPerSec,
      reloadRegenPerSec: economy.reloadRegenPerSec,
      apCostPerShot: input.weapon.apCost!,
    };
  }

  const charging = weaponCharges(input.weapon)
    ? {
        fullPowerSeconds: input.weapon.fullPowerSeconds ?? 0,
        fullPowerDamageMult: input.weapon.fullPowerDamageMult ?? 0,
        minimumChargeTime: input.weapon.minimumChargeTime ?? 0,
      }
    : null;

  // Post-mitigation vs-target figures (Phase 2 — Enemy defenses): absent
  // when no target is selected. Uses the SAME cycle hit that produced
  // freeSustain/vatsSustain (freeCycleHit/vatsCycleHit — the charged-cycle
  // blend for charged weapons) so the mitigated sustainedDps stays
  // consistent with the mitigated perHit's retained fraction.
  const freeEffective = effectiveAgainstEnemy(
    freeCycleHit,
    freeSustain.sustainedDps,
    input.enemyDefenses,
    armorPenTotal,
    armorPenFlatTotal,
    input.mitigationConstants
  );
  const vatsEffective = effectiveAgainstEnemy(
    vatsCycleHit,
    vatsSustain.sustainedDps,
    input.enemyDefenses,
    armorPenTotal,
    armorPenFlatTotal,
    input.mitigationConstants
  );

  return {
    onslaughtMaxStacks,
    onslaughtReverse,
    ...(onslaughtReverseAvg !== undefined && { onslaughtReverseAvgStacks: onslaughtReverseAvg }),
    bulletStormMaxStacks,
    bulletStormMinStacks,
    ...(bulletStormAvg !== undefined && { bulletStormAvgStacks: bulletStormAvg }),
    hasKillStreakSources,
    hasConcentratedFireSources,
    hasBattleLoadersSource,
    charging,
    range,
    vatsHitChanceBonus,
    vatsHitChanceMult,
    freeAim: {
      perHit: freeHit,
      burstDps: freeSustain.burstDps,
      sustain: freeSustain,
      hitRatePct: input.player.hitRatePct ?? 100,
      fireRate,
      fireRateApproximate: true,
      dotDps: freeDotDps,
      ...(freeEffective && { effective: freeEffective }),
      ...(tracing && { explain: { nonCrit: freeTrace!, crit: null } }),
    },
    vats: {
      perHit: vatsAvg,
      burstDps: vatsSustain.burstDps,
      sustain: vatsSustain,
      hitRatePct: input.player.vatsHitRatePct ?? 100,
      fireRate,
      fireRateApproximate: true,
      critRate,
      critMeter,
      dotDps: vatsDotDps,
      ...(ap && { ap }),
      ...(vatsEffective && { effective: vatsEffective }),
      ...(tracing && {
        explain: {
          nonCrit: vatsTrace!,
          crit: critRate > 0 ? vatsCritTrace! : null,
          critMeter: critMeterTrace,
          apRegen: apRegenTrace ?? null,
        },
      }),
    },
  };
}
