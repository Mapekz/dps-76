import type { PlayerConditions, EnemyConditions, Weapon } from '@/types';
import type { Bucket, Condition, CurveInput, DamageType, Modifier, ModOp, StackCounter } from '@/types/modifiers';
import { interpolateCurve } from '@/lib/curve-tables';
import type { BucketTrace, TraceContribution } from './trace';

/** Per-attack flags that differ between the displayed scenarios. */
export interface ScenarioFlags {
  isVats: boolean;
  isSneaking: boolean;
  isPowerAttack: boolean;
  /** This attack is a VATS critical (gates `crit` conditions and the crit term). */
  isCrit: boolean;
}

/** Everything a condition can be evaluated against. */
export interface ResolveContext {
  weapon: Weapon;
  player: PlayerConditions;
  enemy: EnemyConditions;
  scenario: ScenarioFlags;
  /** Body part the hit lands on (for bodyPart-gated modifiers like Center Masochist). */
  bodyPart?: 'torso' | 'weakpoint' | 'limb';
  /**
   * When set, dbm modifiers carrying a damageTypeScope condition apply only
   * if this component damage type is in scope (undefined = whole-weapon fold).
   */
  componentType?: DamageType;
}

/**
 * Reads one scalar from player state for a stack counter or a curve input.
 * Single source of truth for what game state each modifier axis consumes —
 * add a row here when adding a StackCounter or CurveInput.
 */
const PLAYER_STATE_READERS: Record<StackCounter | CurveInput, (p: PlayerConditions) => number> = {
  // Stack counters (modifier value × count).
  tenderizer: p => p.tenderizerStacks ?? 0,
  onslaught: p => p.onslaughtStacks,
  bulletStorm: p => p.bulletStormStacks,
  furious: p => p.furiousStacks ?? 0,
  adrenaline: p => p.adrenalineStacks,
  // Curve inputs (X value fed into a value curve).
  healthFraction: p => p.healthPercent / 100,
  capsOnHand: p => p.capsOnHand,
  killStreak: p => p.adrenalineStacks,
  addictionCount: p => p.addictionCount,
  consecutiveHits: p => p.furiousStacks,
};

/**
 * Evaluate one condition. Returns null when the modifier does not apply,
 * otherwise a scale factor for its value (1 for plain gates, stack count for
 * counter-scaled modifiers).
 */
function evalCondition(cond: Condition, ctx: ResolveContext): number | null {
  switch (cond.kind) {
    case 'weaponClass':
      return cond.classes.includes(ctx.weapon.weaponClass) ? 1 : null;
    case 'weaponKeyword':
      return (ctx.weapon.keywords ?? []).includes(cond.keyword) === cond.present ? 1 : null;
    case 'weaponKeywordAny':
      return cond.keywords.some(k => (ctx.weapon.keywords ?? []).includes(k)) ? 1 : null;
    case 'bodyPart':
      return ctx.bodyPart === cond.part ? 1 : null;
    case 'enemyType':
      // Enemy modeling is deferred — a generic target never matches a race gate.
      return null;
    case 'damageTypeScope':
      // Whole-weapon folds skip component-scoped modifiers; per-component
      // folds require a matching component type.
      if (ctx.componentType === undefined) return null;
      return cond.types.includes(ctx.componentType) ? 1 : null;
    case 'sneaking':
      return ctx.scenario.isSneaking ? 1 : null;
    case 'powerAttack':
      return ctx.scenario.isPowerAttack ? 1 : null;
    case 'crit':
      return ctx.scenario.isCrit ? 1 : null;
    case 'healthBelowPct':
      return ctx.player.healthPercent < cond.pct ? 1 : null;
    case 'scaledByMissingHealth': {
      const missing = Math.max(0, Math.min(1, 1 - ctx.player.healthPercent / 100));
      const scale = Math.min(missing, cond.cap);
      return scale > 0 ? scale : null;
    }
    case 'scaledByCaps': {
      const scale = Math.max(0, Math.min((ctx.player.capsOnHand ?? 0) / cond.capsForMax, 1));
      return scale > 0 ? scale : null;
    }
    case 'stacks': {
      const count = Math.max(0, Math.min(PLAYER_STATE_READERS[cond.counter](ctx.player), cond.max));
      return count > 0 ? count : null;
    }
    case 'enemyFullHealth':
      return ctx.enemy.isFullHealth ? 1 : null;
    case 'strangeInNumbers':
      return ctx.player.strangeInNumbers === cond.value ? 1 : null;
    case 'perAddiction': {
      const count = Math.max(0, Math.min(ctx.player.addictionCount ?? 0, cond.max));
      return count > 0 ? count : null;
    }
    case 'inPowerArmor':
      return ctx.player.isInPowerArmor === cond.value ? 1 : null;
    case 'unresolved':
      return null;
  }
}

/** The effective (condition-scaled) value of a modifier, or null if inactive. */
export function effectiveValue(mod: Modifier, ctx: ResolveContext): number | null {
  let scale = 1;
  for (const cond of mod.conditions) {
    const s = evalCondition(cond, ctx);
    if (s === null) return null;
    scale *= s;
  }
  // Curve-driven values (Bloodied, Nerd Rage, ...): Y at the current input,
  // scaled by mod.curveScale (the route scale, e.g. 0.01 for STAT-point curves).
  const base = mod.curve
    ? interpolateCurve(mod.curve.points, PLAYER_STATE_READERS[mod.curve.input](ctx.player)) * mod.curveScale
    : mod.value;
  return base * scale;
}

/**
 * Fold arithmetic shared by every bucket (user-confirmed OMOD semantics):
 *
 *   result = (last SET ?? base) + (Σ MUL_ADD) × base + Σ ADD
 *
 * - Multiple MUL_ADDs stack additively with each other.
 * - MUL_ADD always multiplies the ORIGINAL base, even when a SET replaced it:
 *   Speed base 2.0 with SET 0.8248, MUL_ADD 0.3, ADD 0.5
 *   → 0.8248 + 0.3×2.0 + 0.5 = 1.9248.
 *
 * This is the one home for the rule; `foldBucket` feeds it condition-evaluated
 * values, `effective-weapon.foldWeaponStat` feeds it raw values.
 */
export function foldOps(entries: Array<{ op: ModOp; value: number }>, base: number): number {
  let setValue: number | null = null;
  let mulAddAccum = 0;
  let addAccum = 0;

  for (const { op, value } of entries) {
    switch (op) {
      case 'SET':
        setValue = value;
        break;
      case 'MUL_ADD':
        mulAddAccum += value;
        break;
      case 'ADD':
        addAccum += value;
        break;
    }
  }

  return (setValue ?? base) + mulAddAccum * base + addAccum;
}

/**
 * Fold all active modifiers targeting one bucket over an intrinsic base value.
 * When `collect` is provided, a BucketTrace of every contribution (tagged with
 * its ModifierSource) is pushed onto it; the no-trace path does no extra work.
 */
export function foldBucket(
  modifiers: Modifier[],
  bucket: Bucket,
  base: number,
  ctx: ResolveContext,
  collect?: BucketTrace[]
): number {
  const entries: Array<{ op: ModOp; value: number; mod?: Modifier }> = [];
  for (const mod of modifiers) {
    if (mod.bucket !== bucket) continue;
    const value = effectiveValue(mod, ctx);
    if (value === null) continue;
    entries.push(collect ? { op: mod.op, value, mod } : { op: mod.op, value });
  }
  const result = foldOps(entries, base);

  if (collect) {
    const contribution = (e: { op: ModOp; value: number; mod?: Modifier }): TraceContribution => ({
      source: e.mod!.source,
      op: e.op,
      value: e.value,
    });
    const sets = entries.filter(e => e.op === 'SET');
    collect.push({
      bucket,
      base,
      result,
      set: sets.length > 0 ? contribution(sets[sets.length - 1]) : null,
      overriddenSets: sets.slice(0, -1).map(contribution),
      mulAdd: entries.filter(e => e.op === 'MUL_ADD').map(contribution),
      add: entries.filter(e => e.op === 'ADD').map(contribution),
    });
  }

  return result;
}

/**
 * Separate stacking whole-damage multipliers (TOFTT, Follow Through):
 * each active modifier contributes its own ×(1 + value) term.
 */
export function foldWholeDamage(
  modifiers: Modifier[],
  ctx: ResolveContext,
  collect?: TraceContribution[]
): number {
  let mult = 1;
  for (const mod of modifiers) {
    if (mod.bucket !== 'wholeDamage') continue;
    const value = effectiveValue(mod, ctx);
    if (value === null) continue;
    mult *= 1 + value;
    collect?.push({ source: mod.source, op: mod.op, value });
  }
  return mult;
}
