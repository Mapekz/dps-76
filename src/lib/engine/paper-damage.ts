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
 * Base power-attack multiplier from RACE records' per-attack-event "Damage
 * Mult" on Power-Attack-flagged events (docs/assumptions.md "Power attacks &
 * melee cadence"):
 * HumanRace (0x00013746) = 1.5; PowerArmorRace (0x0001D31E) = 2.0 — the PA
 * race swap IS the multiplier, no separate perk/MGEF grants it. Multiplies
 * the entire melee hit, distinct from the additive `powerAttackBonus` bucket
 * (Heavy Hitter's, still additive inside the dbm parenthesis).
 */
const POWER_ATTACK_RACE_MULT_NORMAL = 1.5;
const POWER_ATTACK_RACE_MULT_POWER_ARMOR = 2.0;

/**
 * Carve-outs proven in the SAME RACE records (Damage Mult stays 1.0):
 * automatic "power tool" melee (Ripper/Shredder/Auto Axe — the
 * WeaponTypeAutomaticMelee keyword), gun bashes (no bash mechanic modeled),
 * and UNARMED attacks (unarmed power events aren't even Power-Attack-flagged
 * in the RACE data) all keep ×1.0. Ranged weapons never reach this path
 * (scenarios.ts gates `isPowerAttack` to melee/unarmed already).
 */
function powerAttackRaceMult(weapon: Weapon, isInPowerArmor: boolean): number {
  if (weapon.weaponClass !== 'melee') return 1.0; // excludes 'unarmed' and any other class
  if ((weapon.keywords ?? []).includes('WeaponTypeAutomaticMelee')) return 1.0;
  return isInPowerArmor ? POWER_ATTACK_RACE_MULT_POWER_ARMOR : POWER_ATTACK_RACE_MULT_NORMAL;
}

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

function componentBase(
  mode: GameMode,
  weapon: Weapon,
  itemLevel: number
): Array<{ type: DamageType; base: number; isExplosion: boolean }> {
  const clamped = Math.max(1, Math.min(itemLevel, 50));
  return (weapon.components ?? []).map(comp => {
    const level = Math.min(clamped, comp.levelCap);
    const base = comp.curvePoints
      ? interpolateCurve(comp.curvePoints, level)
      : getBaseDamage(mode, comp.tier, level);
    return { type: comp.damageType, base, isExplosion: comp.fromExplosion ?? false };
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
  const paRaceMult = ctx.scenario.isPowerAttack ? powerAttackRaceMult(weapon, ctx.player.isInPowerArmor) : 1.0;
  const outerMult = wholeMult * bodyPartMult * weakpointMult * paRaceMult;

  const components: ComponentHit[] = componentBase(mode, weapon, itemLevel).flatMap(({ type, base, isExplosion }) => {
    const componentCtx = { ...ctx, componentType: type, componentIsExplosion: isExplosion };
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
    // Explosion components (launcher EXPL payloads) need no extra factor:
    // explosion bonuses (Demolition Expert) are explosive-scoped dbm ADDs in
    // the parenthesis above — additive with Bloodied/Adrenal etc., per the
    // June 2026 patch (docs/assumptions.md "Launcher explosion damage").
    const hit: ComponentHit = { damageType: type, base: scaledBase, damage: scaledBase * parenthesis * outerMult };
    // An explosion never spawns an explosive twin of itself.
    if (isExplosion) return [hit];

    // Explosive payload (Explosive 2★, plan Stage A1; intrinsic base from the
    // Gauss family's EXPL "Base Weapon Damage Mult" 0.15): a condition-scaled
    // fraction of THIS component's (baseDamage-scaled) damage spawns an
    // explosive twin. The twin runs through the SAME parenthesis (strTerm/
    // critTerm/sneakTerm/powerAttackTerm are weapon-level, not re-evaluated)
    // but its OWN dbm fold — componentType 'explosive' + componentIsExplosion
    // so explosive-scoped dbm (Demolition Expert) applies only to twins.
    // Twins are summed into the totals today; per-component resist
    // attribution is future work (docs/assumptions.md).
    const payloadCollect = trace ? ([] as BucketTrace[]) : undefined;
    const payloadFraction = foldBucket(
      modifiers,
      'explosivePayload',
      weapon.explosionBaseWeaponDamageMult ?? 0,
      componentCtx,
      payloadCollect
    );
    if (payloadFraction <= 0) return [hit];

    const explosiveCtx = { ...ctx, componentType: 'explosive' as const, componentIsExplosion: true };
    const twinDbmCollect = trace ? ([] as BucketTrace[]) : undefined;
    const twinDbmFold = foldBucket(modifiers, 'dbm', weapon.damageBonusMult ?? 1.0, explosiveCtx, twinDbmCollect);
    const twinParenthesis = twinDbmFold + strTerm + critTerm + sneakTerm + powerAttackTerm;
    const twinBase = scaledBase * payloadFraction;
    const twin: ComponentHit = {
      damageType: 'explosive',
      base: twinBase,
      damage: twinBase * twinParenthesis * outerMult,
    };
    if (trace && payloadCollect && twinDbmCollect) {
      trace.components.push({ damageType: 'explosive', baseDamage: payloadCollect[0], dbm: twinDbmCollect[0] });
    }
    return [hit, twin];
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

/**
 * Steady-state DoT contribution (Stage A2, user-confirmed refresh-only
 * semantics): re-applying a bleed/burn/shock DoT resets its timer rather
 * than stacking, so while continuously attacking the sustained add is just
 * the sum of active `dotDamage` magnitudes — interpreted as damage/sec (NOT
 * ESM-proven; docs/assumptions.md). Folded per weapon-component damage type
 * so `damageTypeScope`-gated DoT mods (every extracted bleed/burn/shock OMOD)
 * only count when the weapon actually deals that type; an unscoped DoT
 * modifier on a multi-damage-type weapon would double-count across types —
 * no such data exists today.
 */
export function computeDotDps(modifiers: Modifier[], weapon: Weapon, ctx: ResolveContext): number {
  const componentTypes = new Set((weapon.components ?? []).map(c => c.damageType));
  let total = 0;
  for (const type of componentTypes) {
    total += foldBucket(modifiers, 'dotDamage', 0, { ...ctx, componentType: type });
  }
  return total;
}
