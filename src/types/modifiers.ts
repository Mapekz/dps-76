import type { Weapon } from '@/types';

/**
 * Unified modifier IR — every damage-affecting source (perk entry point,
 * OMOD property, MGEF from mutations/consumables, legendary effect) is
 * normalized to this shape by the extraction pipeline (scripts/extract/)
 * or the overrides layer (src/data/overrides/).
 *
 * Values are raw game-data decimals (0.25 = +25%), NOT percentages.
 */

/** OMOD property operator semantics (ESM "Function Type"). */
export type ModOp = 'SET' | 'MUL_ADD' | 'ADD';

/**
 * Which term of the paper-damage formula the modifier feeds:
 *
 *   PaperDamage = Σ_c base(c) × (dbm(c) + tenderizer + (crit−1)[crit] + (sneak−1)[sneak] + powerAttackBonus)
 *                 × Π wholeDamage × bodyPartMult × (1 + weakpointBonus)[bodyPart>1] × powerAttackRaceMult
 *
 * - dbm: the big additive pool. Its intrinsic base is the weapon's
 *   Damage Bonus Multiplier (1.0), so the "1 +" in the spec formula falls out
 *   of the fold. ADD contributes; MUL_ADD scales the weapon base first.
 * - critDmgBase / sneakBase: MUL_ADD/SET against BaseWeaponCritMult /
 *   BaseWeaponSneakAttackMult (OMODs). critDmgBonus / sneakBonus: additive
 *   bonuses stacked after (perks, ADD OMODs).
 * - powerAttackBonus: additive inside the dbm parenthesis (Heavy Hitter's).
 * - weakpointBonus: additive over a 1.0 base; whole-damage multiplier that
 *   only activates when the body-part multiplier exceeds 1.0.
 * - wholeDamage: separate stacking whole-damage multipliers (TOFTT, Follow Through).
 * - critFill / critConsumption: crit-meter economy (Crit Savvy, Limit Breaking).
 * - fireRateSpeed / isAutomatic / projectileCount / addDamageComponent:
 *   weapon-stat rewrites from OMODs (receiver speed, Two Shot, Explosive prefix).
 */
export type Bucket =
  /**
   * Scales a component's BASE damage before the dbm parenthesis
   * (AttackDamage / DamageTypeValues MUL+ADDs on OMODs — e.g. automatic
   * receivers' −30%). Scope to components via damageTypeScope conditions.
   */
  | 'baseDamage'
  | 'dbm'
  | 'critDmgBase'
  | 'critDmgBonus'
  | 'sneakBase'
  | 'sneakBonus'
  | 'powerAttackBonus'
  | 'weakpointBonus'
  | 'wholeDamage'
  /** Multiplier on limb hits (STAT_DmgLimbs plumbing) — inert until limb targeting exists. */
  | 'limbDamage'
  /** Multiplier on explosion damage (STAT_DmgExplosive plumbing) — wired with explosive components. */
  | 'explosionMult'
  | 'critFill'
  | 'critConsumption'
  | 'fireRateSpeed'
  | 'isAutomatic'
  | 'projectileCount'
  | 'addDamageComponent';

export type WeaponClass = Weapon['weaponClass'];
export type DamageType = Weapon['components'][number]['damageType'];

export type StackCounter = 'tenderizer' | 'onslaught' | 'bulletStorm' | 'furious' | 'adrenaline';

/**
 * Gating/scaling conditions attached to a modifier. All conditions must pass
 * for the modifier to apply; `stacks`/`perAddiction` additionally scale the
 * value by a count from player state.
 */
export type Condition =
  | { kind: 'weaponClass'; classes: WeaponClass[] }
  /**
   * Game-faithful weapon gating: the equipped weapon must (or must not) carry
   * this keyword (HasKeyword/WornHasKeyword on WeaponType* keywords).
   * OMODs can add keywords (e.g. WeaponTypeAutomatic via receivers).
   */
  | { kind: 'weaponKeyword'; keyword: string; present: boolean }
  /** OR-group: the weapon must carry at least one of these keywords (Ninja: bow OR thrown OR melee). */
  | { kind: 'weaponKeywordAny'; keywords: string[] }
  /** Restrict a dbm modifier to matching damage components (Demolition Expert → explosive only). */
  | { kind: 'damageTypeScope'; types: DamageType[] }
  /** Which body part the hit lands on (Center Masochist → torso only). */
  | { kind: 'bodyPart'; part: 'torso' | 'weakpoint' | 'limb' }
  /** Enemy race/type gating (Exterminator etc.) — inert until enemy modeling lands. */
  | { kind: 'enemyType'; keywordOrRace: string }
  | { kind: 'sneaking' }
  | { kind: 'powerAttack' }
  /** The hit is a VATS critical (symmetric with sneaking/powerAttack). */
  | { kind: 'crit' }
  | { kind: 'healthBelowPct'; pct: number }
  /** value × missing-health fraction, capped (Bloodied: up to ×0.95 of the listed max). */
  | { kind: 'scaledByMissingHealth'; cap: number }
  /** value × min(capsOnHand / capsForMax, 1) (Aristocrat's). */
  | { kind: 'scaledByCaps'; capsForMax: number }
  /** value × stackCount (clamped to max) from the matching player-state counter. */
  | { kind: 'stacks'; counter: StackCounter; max: number }
  | { kind: 'enemyFullHealth' }
  /** Mutation value tier: false = base values, true = Strange in Numbers boosted (+25%). */
  | { kind: 'strangeInNumbers'; value: boolean }
  | { kind: 'perAddiction'; max: number }
  | { kind: 'inPowerArmor'; value: boolean }
  /** Extraction escape hatch: condition semantics not yet understood. Engine skips the modifier; UI badges it. */
  | { kind: 'unresolved'; raw: string };

export type ModifierSourceKind =
  | 'perk'
  | 'legendaryPerk'
  | 'omod'
  | 'legendaryEffect'
  | 'mutation'
  | 'consumable';

export interface ModifierSource {
  kind: ModifierSourceKind;
  formId: string;
  edid: string;
  name: string;
  /** Perk rank this modifier belongs to (ranked perks emit one modifier set per rank). */
  rank?: number;
}

/**
 * Player-state axis a value curve is evaluated against (the effect-level
 * "Actor Value" on curve-bearing magic effects).
 */
export type CurveInput =
  | 'healthFraction' // current HP / max HP (Bloodied, Nerd Rage) — AV 0x00000392
  | 'capsOnHand' // Aristocrat's — AV 0x00000393
  | 'killStreak' // Adrenal Reaction — AV 0x00000399
  | 'addictionCount' // Junkie's — AV 0x001EB998
  | 'consecutiveHits'; // Furious — AV 0x006C3172

export interface ValueCurve {
  input: CurveInput;
  /** Interpolated at the input's current value; clamped at the endpoints. */
  points: Array<{ x: number; y: number }>;
}

/**
 * A modifier's magnitude, discriminated on `curve` so the value/curve contract
 * lives in the type rather than a comment:
 * - plain: `value` is the raw game-data decimal (0.25 = +25%).
 * - curve-driven (Bloodied, Nerd Rage, ...): `curveScale` multiplies the
 *   interpolated curve Y (e.g. 0.01 for STAT-point curves): effective value =
 *   interpolate(curve, input) × curveScale.
 */
export type ModifierValue =
  | { curve?: undefined; value: number }
  | { curve: ValueCurve; curveScale: number };

export type Modifier = {
  /** Stable id: formid, or `${formid}:${index}` for multi-effect sources. */
  id: string;
  source: ModifierSource;
  bucket: Bucket;
  op: ModOp;
  conditions: Condition[];
} & ModifierValue;

/** A modifier fragment without its id/source (as produced by MGEF translation). */
export type ModifierFragment = {
  bucket: Bucket;
  op: ModOp;
  conditions: Condition[];
} & ModifierValue;
