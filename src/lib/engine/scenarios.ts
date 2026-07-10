import type { EnemyConditions, GameMode, PlayerConditions, Weapon } from '@/types';
import type { Modifier } from '@/types/modifiers';
import { getFireRate } from '@/lib/fire-rate';
import { computeCritMeter, type CritMeterResult } from './crit-meter';
import { computePaperDamage, type HitBreakdown } from './paper-damage';
import { computeSustain, type SustainResult } from './sustain';
import { createHitTrace, type CritMeterTrace, type HitTrace } from './trace';
import type { ResolveContext, ScenarioFlags } from './resolve';

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
  /** Multiplier-chain attribution (only when input.collectTrace). */
  explain?: ScenarioExplain;
}

export interface ScenarioSet {
  freeAim: ScenarioResult;
  vats: ScenarioResult;
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

function scenarioCtx(input: ScenarioInput, flags: ScenarioFlags): ResolveContext {
  return {
    weapon: input.weapon,
    player: input.player,
    enemy: input.enemy,
    scenario: { ...flags, isPowerAttack: flags.isPowerAttack && isMelee(input.weapon) },
    itemLevel: input.itemLevel,
  };
}

function isMelee(weapon: Weapon): boolean {
  return weapon.weaponClass === 'melee' || weapon.weaponClass === 'unarmed';
}

function hit(input: ScenarioInput, flags: ScenarioFlags, bodyPartMult: number, trace?: HitTrace): HitBreakdown {
  return computePaperDamage({
    mode: input.mode,
    weapon: input.weapon,
    itemLevel: input.itemLevel,
    modifiers: input.modifiers,
    ctx: scenarioCtx(input, flags),
    bodyPartMult,
    bodyPart: bodyPartMult > 1.0 ? 'weakpoint' : 'torso',
    trace,
  });
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

  // Free aim: crits are VATS-only, so never crit here.
  const freeFlags: ScenarioFlags = { isVats: false, isSneaking: sneaking, isPowerAttack: powerAttack, isCrit: false };
  const freeTrace = tracing ? createHitTrace() : undefined;
  const freeHit = hit(input, freeFlags, bodyPartMult, freeTrace);

  // VATS: crit cadence blends a non-crit and a crit hit.
  const vatsFlags: ScenarioFlags = { isVats: true, isSneaking: sneaking, isPowerAttack: powerAttack, isCrit: false };
  const critMeterTrace = tracing ? ({ fill: null, consumption: null } as CritMeterTrace) : undefined;
  const critMeter = computeCritMeter(input.modifiers, input.weapon, scenarioCtx(input, vatsFlags), critMeterTrace);
  const critRate = input.critRate ?? critMeter.critRate;
  const vatsTrace = tracing ? createHitTrace() : undefined;
  const vatsCritTrace = tracing ? createHitTrace() : undefined;
  const vatsAvg = critWeighted(
    hit(input, vatsFlags, bodyPartMult, vatsTrace),
    hit(input, { ...vatsFlags, isCrit: true }, bodyPartMult, vatsCritTrace),
    critRate
  );

  const freeSustain = computeSustain(freeHit.total, fireRate, input.weapon);
  const vatsSustain = computeSustain(vatsAvg.total, fireRate, input.weapon);

  return {
    freeAim: {
      perHit: freeHit,
      burstDps: freeSustain.burstDps,
      sustain: freeSustain,
      fireRate,
      fireRateApproximate: true,
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
      ...(tracing && {
        explain: { nonCrit: vatsTrace!, crit: critRate > 0 ? vatsCritTrace! : null, critMeter: critMeterTrace },
      }),
    },
  };
}
