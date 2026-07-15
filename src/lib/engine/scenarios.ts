import type { EnemyConditions, GameMode, PlayerConditions, Weapon } from '@/types';
import type { Modifier } from '@/types/modifiers';
import { getFireRate } from '@/lib/fire-rate';
import { apLimitedDps, computeApEconomy, effectiveShotsPerSecond } from './ap-economy';
import { computeCritMeter, type CritMeterResult } from './crit-meter';
import { computeDotDps, computePaperDamage, type HitBreakdown } from './paper-damage';
import { computeSustain, type SustainResult } from './sustain';
import { createHitTrace, type CritMeterTrace, type HitTrace } from './trace';
import { effectiveValue, foldBucket, type ResolveContext, type ScenarioFlags } from './resolve';

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
}

export interface ScenarioResult {
  /** Steady-state average per hit (crit-cadence-weighted for VATS). */
  perHit: HitBreakdown;
  /** Per-hit × fire rate (mag-dump, no reload). */
  burstDps: number;
  /** Magazine/reload cycle model — sustained DPS and its inputs. */
  sustain: SustainResult;
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
    /** regenPerSec + crit-restore AP/sec (instant apPerCrit + refresh-only HoTs). */
    apGainPerSec: number;
    /** Effective per-shot VATS AP cost (post weapon-OMOD vatsApCost fold). */
    apCostPerShot: number;
  };
  /** Multiplier-chain attribution (only when input.collectTrace). */
  explain?: ScenarioExplain;
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
   * True when any equipped source reads the kill-streak counter (Adrenaline,
   * Crowd Control, Sole Survivor; Lawbringer, Adrenal, Thrill-Seeker's) — the
   * UI's kill-streak slider disables without one. Unlike onslaughtMaxStacks
   * this is an existence scan, not a bucket fold: kill-streak sources are
   * curves/conditions attached to arbitrary buckets, there is no dedicated
   * bucket to fold.
   */
  hasKillStreakSources: boolean;
}

export interface ScenarioInput {
  mode: GameMode;
  weapon: Weapon;
  itemLevel: number;
  modifiers: Modifier[];
  player: PlayerConditions;
  enemy: EnemyConditions;
  /** Body-part multiplier used for weakpoint hits (user-configurable, default 2.0). */
  weakpointMult: number;
  /**
   * Steady-state crit fraction override for the VATS scenario. When omitted,
   * it is computed from the crit meter (LCK, Crit Savvy, Limit Breaking,
   * weapon crit charge bonus).
   */
  critRate?: number;
  /**
   * Collect per-source attribution traces (ScenarioResult.explain). Off by
   * default — the suggestion engine's speculative evals must never pay for it.
   */
  collectTrace?: boolean;
}

function scenarioCtx(input: ScenarioInput, flags: ScenarioFlags, onslaughtMaxStacks: number): ResolveContext {
  return {
    weapon: input.weapon,
    player: input.player,
    enemy: input.enemy,
    scenario: { ...flags, isPowerAttack: flags.isPowerAttack && isMelee(input.weapon) },
    itemLevel: input.itemLevel,
    onslaughtMaxStacks,
  };
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
 * merges OMOD addedKeywords onto weapon.keywords). Damage curve CURV
 * 0x008A3B85 (misc/curvetables/json/legendarymods/weapon_chargedmeleeattack.json):
 * charges 1/2/3 → +0.5/+1.5/+3.0 damage bonus (multiply the releasing power
 * attack by (1 + y)); max 3 charges. The detonation VFX itself deals 0
 * damage (docs/assumptions.md).
 *
 * 1-charge-per-light-attack is an INFERENCE — no rate field exists in ESM
 * data (docs/assumptions.md). Modeled cycle: 3 light (non-power-attack)
 * attacks bank charges, the 4th is a full-charge power attack (race mult +
 * powerAttackBonus bucket, C1) further multiplied by (1 + CHARGED_FULL_BONUS).
 * Applies regardless of the isPowerAttacking toggle — the cadence IS the
 * optimal play pattern for a Charged weapon (docs/assumptions.md).
 */
const CHARGED_KEYWORD = 'WeaponHasSecondaryCharging';
const CHARGED_MAX_CHARGES = 3; // curve X domain
const CHARGED_FULL_BONUS = 3.0; // curve Y at x=3 (points: 1→0.5, 2→1.5, 3→3.0)
const CHARGED_CYCLE_LENGTH = CHARGED_MAX_CHARGES + 1; // 3 light attacks + 1 detonation

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
  critRate: number,
  onslaughtMaxStacks: number
): HitBreakdown {
  const normal = critWeighted(
    bodyPartBlendedHit(input, { ...flags, isPowerAttack: false, isCrit: false }, bodyPartMult, onslaughtMaxStacks),
    bodyPartBlendedHit(input, { ...flags, isPowerAttack: false, isCrit: true }, bodyPartMult, onslaughtMaxStacks),
    critRate
  );
  const detonation = scaleHit(
    critWeighted(
      bodyPartBlendedHit(input, { ...flags, isPowerAttack: true, isCrit: false }, bodyPartMult, onslaughtMaxStacks),
      bodyPartBlendedHit(input, { ...flags, isPowerAttack: true, isCrit: true }, bodyPartMult, onslaughtMaxStacks),
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
  onslaughtMaxStacks: number,
  trace?: HitTrace
): HitBreakdown {
  return computePaperDamage({
    mode: input.mode,
    weapon: input.weapon,
    itemLevel: input.itemLevel,
    modifiers: input.modifiers,
    ctx: scenarioCtx(input, flags, onslaughtMaxStacks),
    bodyPartMult,
    // >1 = a weakpoint (weakpointBonus perks apply); <1 = an armored limb/part
    // (Mirelurk shell 0.15×) — neither satisfies torso-only gates (Center Masochist).
    bodyPart: bodyPartMult > 1.0 ? 'weakpoint' : bodyPartMult < 1.0 ? 'limb' : 'torso',
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
 * aimed part (bodyPartMult), the rest hit the torso (×1.0). Short-circuits to
 * a plain hit at 100% (the default) so the common path does zero extra work.
 * Only the on-target leg carries the trace — `explain` shows the landed-hit
 * chain, the same simplest-defensible split as the Charged cycle's perHit.
 */
function bodyPartBlendedHit(
  input: ScenarioInput,
  flags: ScenarioFlags,
  bodyPartMult: number,
  onslaughtMaxStacks: number,
  trace?: HitTrace
): HitBreakdown {
  const rate = (input.player.bodyPartHitRatePct ?? 100) / 100;
  if (!input.player.isAimingAtWeakpoint || rate >= 1 || bodyPartMult === 1.0) {
    return hit(input, flags, bodyPartMult, onslaughtMaxStacks, trace);
  }
  const atTarget = hit(input, flags, bodyPartMult, onslaughtMaxStacks, trace);
  const atTorso = hit(input, flags, 1.0, onslaughtMaxStacks);
  return bodyPartWeighted(atTarget, atTorso, rate);
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
  const fireRate = getFireRate(input.weapon);
  const powerAttack = input.player.isPowerAttacking;
  const sneaking = input.player.isSneaking;
  const bodyPartMult = input.player.isAimingAtWeakpoint ? input.weakpointMult : 1.0;
  const tracing = input.collectTrace === true;

  // Onslaught max stacks (folded ONCE, threaded onto every ResolveContext
  // below): onslaughtMaxStacks modifiers only gate on weapon keyword/class,
  // never on scenario flags, so a flag-agnostic bootstrap context (max 0,
  // the "ctxWithoutIt" the fold itself can't depend on) is enough to
  // evaluate them. With no Onslaught sources equipped this is 0, so every
  // `stacks:onslaught` / `onslaughtStacks`-curve modifier reads 0 below.
  const bootstrapFlags: ScenarioFlags = { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false };
  const onslaughtMaxStacks = foldBucket(input.modifiers, 'onslaughtMaxStacks', 0, scenarioCtx(input, bootstrapFlags, 0));

  // Kill-streak sources (existence scan — see ScenarioSet.hasKillStreakSources).
  const hasKillStreakSources = input.modifiers.some(
    m =>
      m.curve?.input === 'killStreak' ||
      m.conditions.some(c => c.kind === 'killStreakCount' || (c.kind === 'stacks' && c.counter === 'adrenaline'))
  );

  // Free aim: crits are VATS-only, so never crit here.
  const freeFlags: ScenarioFlags = { isVats: false, isSneaking: sneaking, isPowerAttack: powerAttack, isCrit: false };
  const freeTrace = tracing ? createHitTrace() : undefined;
  const freeHit = bodyPartBlendedHit(input, freeFlags, bodyPartMult, onslaughtMaxStacks, freeTrace);

  // VATS: crit cadence blends a non-crit and a crit hit.
  const vatsFlags: ScenarioFlags = { isVats: true, isSneaking: sneaking, isPowerAttack: powerAttack, isCrit: false };
  const critMeterTrace = tracing ? ({ fill: null, consumption: null } as CritMeterTrace) : undefined;
  const critMeter = computeCritMeter(input.modifiers, input.weapon, scenarioCtx(input, vatsFlags, onslaughtMaxStacks), critMeterTrace);
  const critRate = input.critRate ?? critMeter.critRate;
  const vatsTrace = tracing ? createHitTrace() : undefined;
  const vatsCritTrace = tracing ? createHitTrace() : undefined;
  const vatsAvg = critWeighted(
    bodyPartBlendedHit(input, vatsFlags, bodyPartMult, onslaughtMaxStacks, vatsTrace),
    bodyPartBlendedHit(input, { ...vatsFlags, isCrit: true }, bodyPartMult, onslaughtMaxStacks, vatsCritTrace),
    critRate
  );

  // Charged (Stage C2): the sustained/average DPS reflects the light-attack
  // ×3 + detonation cycle; perHit display stays the plain hit above (decided
  // simplest-defensible split, docs/assumptions.md).
  const charged = isCharged(input.weapon);
  const freeCycleTotal = charged ? chargedCycleHit(input, freeFlags, bodyPartMult, 0, onslaughtMaxStacks).total : freeHit.total;
  const vatsCycleTotal = charged
    ? chargedCycleHit(input, vatsFlags, bodyPartMult, critRate, onslaughtMaxStacks).total
    : vatsAvg.total;

  const freeSustainRaw = computeSustain(freeCycleTotal, fireRate, input.weapon);
  const vatsSustain = computeSustain(vatsCycleTotal, fireRate, input.weapon);

  // Manual-aim hit rate (Stage B): free-aim SUSTAINED dps only — never burst,
  // never per-hit, never VATS (VATS accuracy is assumed 100%; hit-chance
  // modeling is permanently out of scope, see dps-todos/ap-regen.md). Models
  // realistic misses (movement, target size); a miss still costs the shot
  // but deals no damage, so scaling the steady-state dps by the landed
  // fraction is equivalent to (and simpler than) modeling individual misses.
  const hitRateFraction = (input.player.hitRatePct ?? 100) / 100;
  const freeSustain: SustainResult = { ...freeSustainRaw, sustainedDps: freeSustainRaw.sustainedDps * hitRateFraction };

  // DoT is a separate steady-state add (refresh-only, not crit/vats-scaled by
  // any extracted data today) — evaluated with each scenario's own non-crit
  // context so a future sneaking/powerAttack-gated DoT mod still resolves correctly.
  const freeDotDps = computeDotDps(input.modifiers, input.weapon, scenarioCtx(input, freeFlags, onslaughtMaxStacks));
  const vatsDotDps = computeDotDps(input.modifiers, input.weapon, scenarioCtx(input, vatsFlags, onslaughtMaxStacks));

  // Steady-state VATS AP economy (Stage B): ranged weapons only (melee/VATS-
  // melee AP is out of scope — uptime is undefined without real melee AP
  // costs) and only when the weapon has a real per-shot VATS AP cost.
  let ap: ScenarioResult['ap'];
  if (!isMelee(input.weapon) && (input.weapon.apCost ?? 0) > 0) {
    const apCtx = scenarioCtx(input, vatsFlags, onslaughtMaxStacks);
    const apRegenBonus = foldBucket(input.modifiers, 'apRegen', 0, apCtx);
    const apRegenFlatBonus = foldBucket(input.modifiers, 'apRegenFlat', 0, apCtx);
    const apMaxBonus = foldBucket(input.modifiers, 'apMax', 0, apCtx);
    const apPerCrit = foldBucket(input.modifiers, 'apPerCrit', 0, apCtx);
    // apCritHot is collected per-modifier (not bucket-folded): each HoT keeps
    // its own duration window for the refresh-only steady-state term.
    const critHots = input.modifiers.flatMap(mod => {
      if (mod.bucket !== 'apCritHot') return [];
      const ratePerSec = effectiveValue(mod, apCtx);
      return ratePerSec !== null && ratePerSec > 0 ? [{ ratePerSec, durationSec: mod.durationSec ?? 0 }] : [];
    });
    const shotsPerSec = effectiveShotsPerSecond(vatsSustain, fireRate);
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
    });
    ap = {
      uptime: economy.uptime,
      apLimitedDps: apLimitedDps(vatsSustain.sustainedDps, economy.uptime),
      ...(economy.secondsToEmpty !== undefined && { secondsToEmpty: economy.secondsToEmpty }),
      maxAp: economy.maxAp,
      regenPerSec: economy.regenPerSec,
      apGainPerSec: economy.apGainPerSec,
      apCostPerShot: input.weapon.apCost!,
    };
  }

  return {
    onslaughtMaxStacks,
    hasKillStreakSources,
    freeAim: {
      perHit: freeHit,
      burstDps: freeSustain.burstDps,
      sustain: freeSustain,
      fireRate,
      fireRateApproximate: true,
      dotDps: freeDotDps,
      ...(tracing && { explain: { nonCrit: freeTrace!, crit: null } }),
    },
    vats: {
      perHit: vatsAvg,
      burstDps: vatsSustain.burstDps,
      sustain: vatsSustain,
      fireRate,
      fireRateApproximate: true,
      critRate,
      critMeter,
      dotDps: vatsDotDps,
      ...(ap && { ap }),
      ...(tracing && {
        explain: { nonCrit: vatsTrace!, crit: critRate > 0 ? vatsCritTrace! : null, critMeter: critMeterTrace },
      }),
    },
  };
}
