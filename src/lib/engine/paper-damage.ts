import type { GameMode, Weapon } from '@/types';
import type { DamageType, Modifier } from '@/types/modifiers';
import { chargeDamageMultiplier, weaponCharges } from '@/lib/charge';
import { getBaseDamage, interpolateCurve } from '@/lib/curve-tables';
import { foldBucket, foldWholeDamage, type ResolveContext } from './resolve';
import { lastTrace, type BucketTrace, type HitTrace } from './trace';

/**
 * The paper-damage formula (user spec, docs/assumptions.md):
 *
 *   PaperDamage = Σ_c base(c) × ( dbmFold(c) + (CritMult−1)[crit] + (SneakMult−1)[sneak, non-explosive]
 *                                 + PowerAttackBonus[powerAttack] + STR term[melee] )
 *                 × Π wholeDamage × BodyPartMult[non-explosive] × (1 + weakpointBonus)[BodyPartMult>1, non-explosive]
 *                 × PowerAttackRaceMult[powerAttack]
 *
 * dbmFold starts from the weapon's intrinsic Damage Bonus Multiplier (1.0),
 * so the spec's "1 + DBM" falls out of the bucket fold. Tenderizer and other
 * stack/conditional bonuses are ordinary dbm modifiers with conditions.
 *
 * Explosive damage (launcher EXPL payloads and Explosive-legendary twins) is
 * carved out of the sneak term and the body-part multipliers: it lands its
 * flat payload on whatever part it strikes rather than a targeted shot, and
 * it is not a stealth attack (user spec, FO76-accurate). It still scales with
 * crit, power-attack, and whole-damage multipliers.
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
  /**
   * Range-falloff multiplier (Phase 1 — Range + falloff; `rangeFalloffMult`,
   * src/lib/distance.ts), computed once in scenarios.ts from the target
   * distance and the effective weapon's min/max range + out-of-range mult.
   * Folded into BOTH `outerMult` and `explosiveOuterMult` below (no evidence
   * exists that explosive components are exempt — ASSUMPTION,
   * docs/assumptions.md "Target distance (Close / Far)"). Undefined/1.0 =
   * neutral (melee weapons, or no range data).
   */
  rangeFalloffMult?: number;
  /** Body part the hit lands on (gates bodyPart-conditioned modifiers). */
  bodyPart: 'torso' | 'weakpoint' | 'limb';
  /**
   * Player-held charge time in seconds, for weapons that charge (Gauss
   * family, bows, tesla/gamma/laser via charging-barrel OMODs — `weapon` must
   * satisfy `weaponCharges()`, src/lib/charge.ts). Undefined = "always fully
   * charge" (the default, optimal-play assumption); ignored entirely for
   * non-charging weapons.
   */
  chargeTimeSec?: number;
  /** Caller-allocated attribution sink (createHitTrace()); filled during the SAME computation. */
  trace?: HitTrace;
}

function componentBase(
  mode: GameMode,
  weapon: Weapon,
  itemLevel: number,
  chargeMult: number
): Array<{ type: DamageType; base: number; isExplosion: boolean }> {
  const clamped = Math.max(1, Math.min(itemLevel, 50));
  return (weapon.components ?? []).map(comp => {
    const level = Math.min(clamped, comp.levelCap);
    const curveBase = comp.curvePoints
      ? interpolateCurve(comp.curvePoints, level)
      : getBaseDamage(mode, comp.tier, level);
    // Materialized components (effective-weapon.ts) carry scale/flatBonus;
    // absent on ordinary weapon-declared components (1 / 0, neutral).
    // chargeMult (src/lib/charge.ts) is 1 (neutral) for non-charging weapons;
    // for charging weapons it's the linear ramp `1 + FPDM × (t / FPS)` —
    // applying it here, before the dbm parenthesis, means the explosion twin
    // (which derives its base from this component's `scaledBase` further
    // down) inherits it automatically, with no extra code.
    const base = Math.max(0, curveBase * (comp.scale ?? 1) + (comp.flatBonus ?? 0)) * chargeMult;
    return { type: comp.damageType, base, isExplosion: comp.fromExplosion ?? false };
  });
}

/**
 * Total crit multiplier: weapon base adjusted by MUL_ADD/SET OMODs, then
 * additive bonuses (perks, ADD OMODs), then a scale on just that additive
 * bonus — The V.A.T.S. Unknown's random per-crit roll (folded over base 1.0,
 * modeled at its expected value; see docs/assumptions.md). Base crit mult is
 * untouched by the scale.
 */
export function totalCritMult(
  modifiers: Modifier[],
  weapon: Weapon,
  ctx: ResolveContext,
  collect?: BucketTrace[]
): number {
  const adjustedBase = foldBucket(modifiers, 'critDmgBase', weapon.critDamageMult ?? DEFAULT_CRIT_MULT, ctx, collect);
  const bonus = foldBucket(modifiers, 'critDmgBonus', 0, ctx, collect);
  const bonusScale = foldBucket(modifiers, 'critDmgBonusScale', 1, ctx, collect);
  return adjustedBase + bonus * bonusScale;
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

  // Charging weapons (Gauss family, bows, tesla/gamma/laser via
  // charging-barrel OMODs): 1 (neutral) for weapons that don't charge, else
  // the linear ramp `1 + FPDM × (t / FPS)` — see src/lib/charge.ts. Applies
  // to every per-hit damage component (including the explosive twin, which
  // inherits it via `scaledBase` below) but NEVER to `computeDotDps`'s
  // steady-state DoT add (user decision — DoT ticks are unaffected by how
  // charged the triggering shot was; pending in-game measurement).
  const chargeMult = chargeDamageMultiplier(weapon, input.chargeTimeSec);
  if (trace && weaponCharges(weapon)) {
    trace.charge = {
      chargeTimeSec: input.chargeTimeSec ?? weapon.fullPowerSeconds ?? 0,
      fullPowerSeconds: weapon.fullPowerSeconds ?? 0,
      fullPowerDamageMult: weapon.fullPowerDamageMult ?? 0,
      mult: chargeMult,
    };
  }

  // Weapon-level additive terms (identical across damage components).
  // Crit is a scenario flag (symmetric with sneaking/powerAttack).
  let critTerm = 0;
  if (ctx.scenario.isCrit) {
    const collect = trace ? ([] as BucketTrace[]) : undefined;
    critTerm = totalCritMult(modifiers, weapon, ctx, collect) - 1.0;
    if (trace && collect) trace.crit = { base: collect[0], bonus: collect[1], bonusScale: collect[2] };
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
  // Range falloff (Phase 1 — Range + falloff): a flat multiplier on the
  // whole hit, same "outer" tier as wholeDamage/bodyPartMult/paRaceMult —
  // see the field doc comment on PaperDamageInput.rangeFalloffMult.
  const rangeMult = input.rangeFalloffMult ?? 1.0;
  const outerMult = wholeMult * bodyPartMult * weakpointMult * paRaceMult * rangeMult;
  // Explosive damage (launcher payloads AND Explosive-legendary twins) lands
  // its flat payload on whatever part it strikes: it is unaffected by
  // body-part multipliers (weakpoint AND strongpoint) and gains no sneak
  // bonus, while still scaling with whole-damage, crit, power-attack, AND
  // range falloff (no evidence explosive components are exempt from range
  // falloff — ASSUMPTION, docs/assumptions.md).
  const explosiveOuterMult = wholeMult * paRaceMult * rangeMult;

  const components: ComponentHit[] = componentBase(mode, weapon, itemLevel, chargeMult).flatMap(({ type, base, isExplosion }) => {
    const componentCtx = { ...ctx, componentType: type, componentIsExplosion: isExplosion };
    const collect = trace ? ([] as BucketTrace[]) : undefined;
    // Base-damage scaling (AttackDamage / DamageTypeValues OMOD properties,
    // e.g. automatic receivers' −30%) applies BEFORE the dbm parenthesis.
    // foldBucket already implements MUL_ADD × ORIGINAL base + flat ADD (SET
    // replaces outright); clamp so a component driven negative contributes 0
    // rather than flipping the parenthesis sign (user-confirmed zero clamp).
    const scaledBase = Math.max(0, foldBucket(modifiers, 'baseDamage', base, componentCtx, collect));
    // dbm folds per component so damage-type-scoped bonuses hit only matching parts.
    // Base = the weapon's intrinsic Damage Bonus Multiplier (RGW3, 1.0 baseline),
    // which is the "1 +" of the spec formula.
    const dbmFold = foldBucket(modifiers, 'dbm', weapon.damageBonusMult ?? 1.0, componentCtx, collect);
    if (trace && collect) {
      trace.components.push({ damageType: type, baseDamage: collect[0], dbm: collect[1], isExplosion });
    }
    // Explosion components (launcher EXPL payloads) need no extra dbm factor:
    // explosion bonuses (Demolition Expert) are explosive-scoped dbm ADDs in
    // the parenthesis below — additive with Bloodied/Adrenal etc., per the
    // June 2026 patch (docs/assumptions.md "Launcher explosion damage"). They
    // DO, however, drop sneakTerm and use explosiveOuterMult (no bodyPartMult/
    // weakpointMult): explosive damage lands on whatever part it strikes and
    // is not a stealth attack (user spec).
    const parenthesis = dbmFold + strTerm + critTerm + (isExplosion ? 0 : sneakTerm) + powerAttackTerm;
    const hit: ComponentHit = {
      damageType: type,
      base: scaledBase,
      damage: scaledBase * parenthesis * (isExplosion ? explosiveOuterMult : outerMult),
    };
    // An explosion never spawns an explosive twin of itself.
    if (isExplosion) return [hit];

    // Explosive payload (Explosive 2★, plan Stage A1; intrinsic base from the
    // Gauss family's EXPL "Base Weapon Damage Mult" 0.15): a condition-scaled
    // fraction of THIS component's (baseDamage-scaled) damage spawns an
    // explosive twin. The twin runs through the SAME critTerm/powerAttackTerm
    // (weapon-level, not re-evaluated) but drops sneakTerm and uses
    // explosiveOuterMult (no bodyPartMult/weakpointMult) — it is explosive
    // damage, same carve-out as launcher payloads above — and has its OWN dbm
    // fold. The twin INHERITS the parent component's damage type (Tesla Gauss
    // 15% tick = phys + energy at the parent's split; user-confirmed
    // 2026-07-13) rather than a hardcoded 'explosive' — it keeps
    // componentIsExplosion true so explosive-scoped dbm (Demolition Expert)
    // still matches via resolve.ts's dual-match damageTypeScope check, while
    // damage-type-scoped bonuses (Science!) also reach it.
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

    const explosiveCtx = { ...ctx, componentType: type, componentIsExplosion: true };
    const twinDbmCollect = trace ? ([] as BucketTrace[]) : undefined;
    const twinDbmFold = foldBucket(modifiers, 'dbm', weapon.damageBonusMult ?? 1.0, explosiveCtx, twinDbmCollect);
    const twinParenthesis = twinDbmFold + strTerm + critTerm + powerAttackTerm; // no sneakTerm — explosive
    const twinBase = scaledBase * payloadFraction;
    const twin: ComponentHit = {
      damageType: type,
      base: twinBase,
      damage: twinBase * twinParenthesis * explosiveOuterMult,
    };
    if (trace && payloadCollect && twinDbmCollect) {
      trace.components.push({ damageType: type, baseDamage: payloadCollect[0], dbm: twinDbmCollect[0], isExplosion: true });
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
 *
 * Weapon-intrinsic DoT & OMOD replacement (docs/assumptions.md): a modifier
 * sourced `kind: 'weapon'` (the WEAP's own on-hit Enchantment chase —
 * Cremator's built-in fire DoT) is folded FIRST, on its own, to derive the
 * intrinsic per-damage-type base every OTHER (OMOD/perk) `dotDamage`
 * modifier then folds ON TOP of — exactly the base-vs-modifier split
 * `weapon.speed`/`weapon.reloadSpeed` already use for OMOD stat rewrites,
 * applied here because `dotDamage` has no such intrinsic weapon field of its
 * own. This lets an OMOD ADD an additional DoT layer (HarpoonGun's own bleed
 * + the Barbed Harpoon magazine's extra bleed: both stack, as in-game) while
 * ALSO letting an OMOD that REMs the base weapon's ench replace it outright:
 * `overrides/legendary-values.ts` flips such an OMOD's extracted dotDamage op
 * from ADD to SET, which — being folded in the SAME `rest` pass, not against
 * the intrinsic fold's 0 base — replaces only the intrinsic contribution
 * (Cremator's Slow-Burner), leaving any unrelated same-type `rest` modifier
 * on a DIFFERENT weapon or component type untouched (each is its own
 * `foldBucket` call, scoped by `componentType`).
 */
export function computeDotDps(modifiers: Modifier[], weapon: Weapon, ctx: ResolveContext): number {
  const componentTypes = new Set((weapon.components ?? []).map(c => c.damageType));
  const intrinsic = modifiers.filter(m => m.source.kind === 'weapon');
  const rest = modifiers.filter(m => m.source.kind !== 'weapon');
  let total = 0;
  for (const type of componentTypes) {
    const typeCtx = { ...ctx, componentType: type };
    const intrinsicBase = foldBucket(intrinsic, 'dotDamage', 0, typeCtx);
    total += foldBucket(rest, 'dotDamage', intrinsicBase, typeCtx);
  }
  return total;
}
