import type { EnemyConditions, GameMode, PlayerConditions, Weapon } from '@/types';
import type { Modifier } from '@/types/modifiers';
import { getFireRate } from '@/lib/fire-rate';
import { computeCritMeter } from './crit-meter';
import { computePaperDamage, type HitBreakdown } from './paper-damage';
import type { ResolveContext, ScenarioFlags } from './resolve';

/**
 * The three displayed scenarios, all computed from one resolved config:
 * - manualAim: no VATS, no sneak; body-part 1.0 plus a weakpoint variant
 *   (manual headshots are possible but not guaranteed).
 * - vats: weakpoint-locked (VATS targets weakpoints through cover at full
 *   fire rate), crit cadence from the crit meter.
 * - vatsSneak: same, sneaking — every hit carries the sneak-attack bonus.
 */

export interface ScenarioResult {
  /** Steady-state average per hit (crit-cadence-weighted for VATS scenarios). */
  perHit: HitBreakdown;
  sustainedDps: number;
  fireRate: number;
  /** Extracted fire-rate data is approximate until animation timing lands. */
  fireRateApproximate: true;
  /** Crit-meter steady state (VATS scenarios only). */
  critRate?: number;
}

export interface ScenarioSet {
  manualAim: ScenarioResult & { weakpointPerHit: HitBreakdown; weakpointDps: number };
  vats: ScenarioResult;
  vatsSneak: ScenarioResult;
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
   * Steady-state crit fraction override for VATS scenarios. When omitted,
   * it is computed from the crit meter (LCK, Crit Savvy, Limit Breaking,
   * weapon crit charge bonus).
   */
  critRate?: number;
}

function scenarioCtx(input: ScenarioInput, flags: ScenarioFlags): ResolveContext {
  return {
    weapon: input.weapon,
    player: input.player,
    enemy: input.enemy,
    scenario: { ...flags, isPowerAttack: flags.isPowerAttack && isMelee(input.weapon) },
  };
}

function isMelee(weapon: Weapon): boolean {
  return weapon.weaponClass === 'melee' || weapon.weaponClass === 'unarmed';
}

function hit(input: ScenarioInput, flags: ScenarioFlags, bodyPartMult: number, isCrit: boolean): HitBreakdown {
  return computePaperDamage({
    mode: input.mode,
    weapon: input.weapon,
    itemLevel: input.itemLevel,
    modifiers: input.modifiers,
    ctx: scenarioCtx(input, flags),
    bodyPartMult,
    bodyPart: bodyPartMult > 1.0 ? 'weakpoint' : 'torso',
    isCrit,
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

  // Manual aim: crits are VATS-only, so never crit here.
  const manualFlags: ScenarioFlags = { isVats: false, isSneaking: false, isPowerAttack: powerAttack };
  const manualNormal = hit(input, manualFlags, 1.0, false);
  const manualWeak = hit(input, manualFlags, input.weakpointMult, false);

  // VATS: weakpoint-locked, crit cadence applies.
  const vatsFlags: ScenarioFlags = { isVats: true, isSneaking: false, isPowerAttack: powerAttack };
  const critRate =
    input.critRate ?? computeCritMeter(input.modifiers, input.weapon, scenarioCtx(input, vatsFlags)).critRate;
  const vatsAvg = critWeighted(
    hit(input, vatsFlags, input.weakpointMult, false),
    hit(input, vatsFlags, input.weakpointMult, true),
    critRate
  );

  const sneakFlags: ScenarioFlags = { isVats: true, isSneaking: true, isPowerAttack: powerAttack };
  const sneakAvg = critWeighted(
    hit(input, sneakFlags, input.weakpointMult, false),
    hit(input, sneakFlags, input.weakpointMult, true),
    critRate
  );

  return {
    manualAim: {
      perHit: manualNormal,
      sustainedDps: manualNormal.total * fireRate,
      weakpointPerHit: manualWeak,
      weakpointDps: manualWeak.total * fireRate,
      fireRate,
      fireRateApproximate: true,
    },
    vats: {
      perHit: vatsAvg,
      sustainedDps: vatsAvg.total * fireRate,
      fireRate,
      fireRateApproximate: true,
      critRate,
    },
    vatsSneak: {
      perHit: sneakAvg,
      sustainedDps: sneakAvg.total * fireRate,
      fireRate,
      fireRateApproximate: true,
      critRate,
    },
  };
}
