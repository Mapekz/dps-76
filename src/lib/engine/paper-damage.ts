import type { GameMode, Weapon } from '@/types';
import type { DamageType, Modifier } from '@/types/modifiers';
import { getBaseDamage, interpolateCurve } from '@/lib/curve-tables';
import { foldBucket, foldWholeDamage, type ResolveContext } from './resolve';
import { lastTrace, type BucketTrace, type HitTrace } from './trace';

/**
 * The paper-damage formula (user spec, docs/assumptions.md):
 *
 *   PaperDamage = Σ_c base(c) × ( dbmFold(c) + (CritMult−1)[crit] + (SneakMult−1)[sneak]
 *                                 + PowerAttackBonus[powerAttack] + STR term[melee] )
 *                 × Π wholeDamage × BodyPartMult × (1 + weakpointBonus)[BodyPartMult>1]
 *                 × PowerAttackRaceMult[powerAttack]
 *
 * dbmFold starts from the weapon's intrinsic Damage Bonus Multiplier (1.0),
 * so the spec's "1 + DBM" falls out of the bucket fold. Tenderizer and other
 * stack/conditional bonuses are ordinary dbm modifiers with conditions.
 */

/**
 * Base power-attack multiplier from HumanRace/PowerAttackRace — multiplies the
 * entire melee hit, distinct from the additive powerAttackBonus bucket.
 * PLACEHOLDER 1.0 until the RACE-record research lands (dps-todos/power-attacks.md);
 * the additive bucket (Heavy Hitter's) is already correct.
 */
const POWER_ATTACK_RACE_MULT = 1.0;

/** STR melee scaling: STR/20 for 1h/2h melee, STR/10 for unarmed/gauntlets. */
function strengthTerm(weapon: Weapon, strength: number): number {
  if (weapon.weaponClass === 'unarmed') return strength * 0.10;
  if (weapon.weaponClass === 'melee') return strength * 0.05;
  return 0;
}

const DEFAULT_CRIT_MULT = 2.0;
const DEFAULT_SNEAK_MULT = 2.0;

export interface ComponentHit {
  damageType: DamageType;
  base: number;
  damage: number;
}

export interface HitBreakdown {
  components: ComponentHit[];
  total: number;
}

export interface PaperDamageInput {
  mode: GameMode;
  weapon: Weapon;
  itemLevel: number;
  modifiers: Modifier[];
  /** Context for condition evaluation (weapon must match `weapon`). */
  ctx: ResolveContext;
  /** 1.0 torso, >1 weakpoint, <1 strongpoint. */
  bodyPartMult: number;
  /** Body part the hit lands on (gates bodyPart-conditioned modifiers). */
  bodyPart: 'torso' | 'weakpoint' | 'limb';
  /** Caller-allocated attribution sink (createHitTrace()); filled during the SAME computation. */
  trace?: HitTrace;
}

function componentBase(mode: GameMode, weapon: Weapon, itemLevel: number): Array<{ type: DamageType; base: number }> {
  const clamped = Math.max(1, Math.min(itemLevel, 50));
  return (weapon.components ?? []).map(comp => {
    const level = Math.min(clamped, comp.levelCap);
    const base = comp.curvePoints
      ? interpolateCurve(comp.curvePoints, level)
      : getBaseDamage(mode, comp.tier, level);
    return { type: comp.damageType, base };
  });
}

/** Total crit multiplier: weapon base adjusted by MUL_ADD/SET OMODs, then additive bonuses. */
export function totalCritMult(
  modifiers: Modifier[],
  weapon: Weapon,
  ctx: ResolveContext,
  collect?: BucketTrace[]
): number {
  const adjustedBase = foldBucket(modifiers, 'critDmgBase', weapon.critDamageMult ?? DEFAULT_CRIT_MULT, ctx, collect);
  return adjustedBase + foldBucket(modifiers, 'critDmgBonus', 0, ctx, collect);
}

/** Total sneak-attack multiplier, same composition rule as crit. */
export function totalSneakMult(
  modifiers: Modifier[],
  weapon: Weapon,
  ctx: ResolveContext,
  collect?: BucketTrace[]
): number {
  const adjustedBase = foldBucket(modifiers, 'sneakBase', weapon.sneakAttackMult ?? DEFAULT_SNEAK_MULT, ctx, collect);
  return adjustedBase + foldBucket(modifiers, 'sneakBonus', 0, ctx, collect);
}

export function computePaperDamage(input: PaperDamageInput): HitBreakdown {
  const { mode, weapon, itemLevel, modifiers, bodyPartMult, trace } = input;
  const ctx = { ...input.ctx, bodyPart: input.bodyPart };

  // Weapon-level additive terms (identical across damage components).
  // Crit is a scenario flag (symmetric with sneaking/powerAttack).
  let critTerm = 0;
  if (ctx.scenario.isCrit) {
    const collect = trace ? ([] as BucketTrace[]) : undefined;
    critTerm = totalCritMult(modifiers, weapon, ctx, collect) - 1.0;
    if (trace && collect) trace.crit = { base: collect[0], bonus: collect[1] };
  }
  let sneakTerm = 0;
  if (ctx.scenario.isSneaking) {
    const collect = trace ? ([] as BucketTrace[]) : undefined;
    sneakTerm = totalSneakMult(modifiers, weapon, ctx, collect) - 1.0;
    if (trace && collect) trace.sneak = { base: collect[0], bonus: collect[1] };
  }
  let powerAttackTerm = 0;
  if (ctx.scenario.isPowerAttack) {
    const collect = trace ? ([] as BucketTrace[]) : undefined;
    powerAttackTerm = foldBucket(modifiers, 'powerAttackBonus', 0, ctx, collect);
    if (trace && collect) trace.powerAttack = lastTrace(collect);
  }
  const strTerm = strengthTerm(weapon, ctx.player.strength);

  // Whole-damage multipliers.
  const wholeMult = foldWholeDamage(modifiers, ctx, trace?.wholeDamage);
  let weakpointMult = 1.0;
  if (bodyPartMult > 1.0) {
    const collect = trace ? ([] as BucketTrace[]) : undefined;
    weakpointMult = 1.0 + foldBucket(modifiers, 'weakpointBonus', 0, ctx, collect);
    if (trace && collect) trace.weakpointBonus = lastTrace(collect);
  }
  const powerAttackRaceMult = ctx.scenario.isPowerAttack ? POWER_ATTACK_RACE_MULT : 1.0;
  const outerMult = wholeMult * bodyPartMult * weakpointMult * powerAttackRaceMult;

  const components: ComponentHit[] = componentBase(mode, weapon, itemLevel).map(({ type, base }) => {
    const componentCtx = { ...ctx, componentType: type };
    const collect = trace ? ([] as BucketTrace[]) : undefined;
    // Base-damage scaling (AttackDamage / DamageTypeValues OMOD properties,
    // e.g. automatic receivers' −30%) applies BEFORE the dbm parenthesis.
    const scaledBase = base * foldBucket(modifiers, 'baseDamage', 1.0, componentCtx, collect);
    // dbm folds per component so damage-type-scoped bonuses hit only matching parts.
    // Base = the weapon's intrinsic Damage Bonus Multiplier (RGW3, 1.0 baseline),
    // which is the "1 +" of the spec formula.
    const dbmFold = foldBucket(modifiers, 'dbm', weapon.damageBonusMult ?? 1.0, componentCtx, collect);
    if (trace && collect) {
      trace.components.push({ damageType: type, baseDamage: collect[0], dbm: collect[1] });
    }
    const parenthesis = dbmFold + strTerm + critTerm + sneakTerm + powerAttackTerm;
    return { damageType: type, base: scaledBase, damage: scaledBase * parenthesis * outerMult };
  });

  if (trace) {
    trace.strTerm = strTerm;
    trace.bodyPartMult = bodyPartMult;
  }

  return {
    components,
    total: components.reduce((sum, c) => sum + c.damage, 0),
  };
}
