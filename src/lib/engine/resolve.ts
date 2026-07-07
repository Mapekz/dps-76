import type { PlayerConditions, EnemyConditions, Weapon } from '@/types';
import type { Bucket, Condition, CurveInput, DamageType, Modifier } from '@/types/modifiers';
import { interpolateCurve } from '@/lib/curve-tables';

/** Per-attack flags that differ between the displayed scenarios. */
export interface ScenarioFlags {
  isVats: boolean;
  isSneaking: boolean;
  isPowerAttack: boolean;
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

function stackCount(ctx: ResolveContext, counter: string): number {
  switch (counter) {
    case 'tenderizer': return ctx.player.tenderizerStacks ?? 0;
    case 'onslaught': return ctx.player.onslaughtStacks;
    case 'bulletStorm': return ctx.player.bulletStormStacks;
    case 'furious': return ctx.player.furiousStacks ?? 0;
    case 'adrenaline': return ctx.player.adredalineStacks;
    default: return 0;
  }
}

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
      const count = Math.max(0, Math.min(stackCount(ctx, cond.counter), cond.max));
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

function curveInputValue(input: CurveInput, ctx: ResolveContext): number {
  switch (input) {
    case 'healthFraction': return ctx.player.healthPercent / 100;
    case 'capsOnHand': return ctx.player.capsOnHand;
    case 'killStreak': return ctx.player.adredalineStacks;
    case 'addictionCount': return ctx.player.addictionCount;
    case 'consecutiveHits': return ctx.player.furiousStacks;
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
  // scaled by mod.value (the route scale, e.g. 0.01 for STAT-point curves).
  const base = mod.curve ? interpolateCurve(mod.curve.points, curveInputValue(mod.curve.input, ctx)) * mod.value : mod.value;
  return base * scale;
}

/**
 * Fold all modifiers targeting one bucket over an intrinsic base value,
 * matching OMOD semantics (user-confirmed):
 *
 *   result = (last SET ?? base) + (Σ MUL_ADD) × base + Σ ADD
 *
 * - Multiple MUL_ADDs stack additively with each other.
 * - MUL_ADD always multiplies the ORIGINAL base, even when a SET replaced it:
 *   Speed base 2.0 with SET 0.8248, MUL_ADD 0.3, ADD 0.5
 *   → 0.8248 + 0.3×2.0 + 0.5 = 1.9248.
 */
export function foldBucket(modifiers: Modifier[], bucket: Bucket, base: number, ctx: ResolveContext): number {
  let setValue: number | null = null;
  let mulAddAccum = 0;
  let addAccum = 0;

  for (const mod of modifiers) {
    if (mod.bucket !== bucket) continue;
    const value = effectiveValue(mod, ctx);
    if (value === null) continue;
    switch (mod.op) {
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
 * Separate stacking whole-damage multipliers (TOFTT, Follow Through):
 * each active modifier contributes its own ×(1 + value) term.
 */
export function foldWholeDamage(modifiers: Modifier[], ctx: ResolveContext): number {
  let mult = 1;
  for (const mod of modifiers) {
    if (mod.bucket !== 'wholeDamage') continue;
    const value = effectiveValue(mod, ctx);
    if (value === null) continue;
    mult *= 1 + value;
  }
  return mult;
}
