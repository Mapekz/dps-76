import type { Bucket, Condition, CurveInput, Modifier } from '@/types/modifiers';
import { formatPercent } from '@/lib/format';

/**
 * Short human-readable "what this actually does" line for a buff or penalty,
 * derived from its extracted `Modifier[]` — NOT from ESM description/flavor
 * text. The two can disagree (Guns and Bullets 7's card text says "without
 * scopes" but its extracted modifier carries no such condition), so deriving
 * from the data we actually compute with is the only way the displayed bonus
 * always matches the applied one.
 *
 * Serves magazines, bobbleheads, chems, alcohol, food/drink, mutations
 * (positives and Class-Freak-scaled penalties) and addiction withdrawal
 * penalties. Callers pass whichever `Modifier[]` subset they want described
 * (e.g. a mutation's positive modifiers separately from its penalty ones) —
 * this module has no opinion on where the split happens.
 */

/** Buckets whose Modifier.value is a decimal fraction (0.1 = +10%). */
const PERCENT_BUCKET_LABELS: Partial<Record<Bucket, string>> = {
  dbm: 'damage',
  critDmgBonus: 'critical damage',
  sneakBonus: 'sneak attack damage',
  weakpointBonus: 'weakpoint damage',
  powerAttackBonus: 'power attack damage',
  limbDamage: 'limb damage',
  reloadSpeed: 'reload speed',
};

/** Buckets whose Modifier.value is a flat point add, not a percentage. */
const FLAT_POINT_BUCKET_LABELS: Partial<Record<Bucket, string>> = {
  specialStrength: 'Strength',
  specialPerception: 'Perception',
  specialEndurance: 'Endurance',
  specialCharisma: 'Charisma',
  specialIntelligence: 'Intelligence',
  specialAgility: 'Agility',
  specialLuck: 'Luck',
  maxHealth: 'max HP',
  apMax: 'max AP',
  apRegenFlat: 'AP regen',
};

/** Friendly names for curve axes; unmapped axes fall back to the raw CurveInput name. */
const CURVE_AXIS_LABELS: Partial<Record<CurveInput, string>> = {
  killStreak: 'kill streak',
};

const WEAPON_KEYWORD_LABELS: Record<string, string> = {
  WeaponTypeBallistic: 'ballistic weapons',
  WeaponTypeEnergy: 'energy weapons',
  WeaponTypeLaser: 'laser weapons',
  WeaponTypePlasma: 'plasma weapons',
  WeaponTypeAlienBlaster: 'alien blasters',
  WeaponTypeHeavyGun: 'heavy guns',
  WeaponTypeMeleeGeneral: 'melee weapons',
  WeaponTypeMelee1H: 'one-handed melee weapons',
  WeaponTypeMelee2H: 'two-handed melee weapons',
  WeaponTypeUnarmed: 'unarmed',
  WeaponTypeThrowingKnife: 'throwing weapons',
};

const ENEMY_KEYWORD_LABELS: Record<string, string> = {
  ActorTypeAnimal: 'animals',
  ActorTypeGhoul: 'ghouls',
  ActorTypeFeralGhoul: 'feral ghouls',
  ActorTypeRobot: 'robots',
  ActorTypeScorched: 'the Scorched',
  ActorTypeSuperMutant: 'super mutants',
  ActorTypeSuperMutantBehemoth: 'Behemoths',
  ActorTypeMirelurk: 'Mirelurks',
  ActorTypeMirelurkHunter: 'Mirelurk Hunters',
  ActorTypeMirelurkKing: 'Mirelurk Kings',
  ActorTypeMirelurkQueen: 'Mirelurk Queens',
  ActorTypeYaoGuai: 'Yao Guai',
  ActorTypeWendigo: 'Wendigos',
  ActorTypeMothman: 'the Mothman',
  ActorTypeFlatwoodsMonster: 'the Flatwoods Monster',
  ActorTypeGraftonMonster: 'the Grafton Monster',
  ActorTypeSnallygaster: 'the Snallygaster',
  ActorTypeScorchbeast: 'Scorchbeasts',
  ActorTypeLiberator: 'Liberators',
  HumanRace: 'humans',
};

const weaponLabel = (edid: string): string => WEAPON_KEYWORD_LABELS[edid] ?? edid;
const enemyLabel = (edid: string): string => ENEMY_KEYWORD_LABELS[edid] ?? edid;

/**
 * Context a caller resolves once (from player state) and passes down so a
 * single raw `Modifier[]` describes correctly for the situation on screen:
 * - `strangeInNumbers`/`classFreakRank` pick which condition-gated variant of
 *   a mutation modifier is "the" active one, and are consumed as filters —
 *   they never render as clauses (they're resolved facts, not qualifiers).
 * - `penaltyScale`, when set, scales the described magnitude of every
 *   modifier passed in this call — callers use it to show a mutation
 *   penalty's Class-Freak-reduced value instead of the raw (rank-0) one,
 *   without needing the app-side `classFreakRank`-conditioned variants the
 *   engine expands penalties into (`applyClassFreakPenaltyScaling`).
 */
export interface BuffDescriptionCtx {
  strangeInNumbers?: boolean;
  classFreakRank?: number;
  penaltyScale?: number;
}

/** Qualifier clause for one modifier's conditions, plus whether any of them are currently inert. */
function describeConditions(conditions: readonly Condition[]): { clause: string; inactive: boolean } {
  const clauses: string[] = [];
  let inactive = false;
  for (const c of conditions) {
    switch (c.kind) {
      case 'weaponKeyword':
        clauses.push(c.present ? `with ${weaponLabel(c.keyword)}` : `non-${weaponLabel(c.keyword)}`);
        break;
      case 'weaponKeywordAny':
        clauses.push(`with ${c.keywords.map(weaponLabel).join(' or ')}`);
        break;
      case 'damageTypeScope':
        clauses.push(`${c.types.join('/')} damage only`);
        break;
      case 'enemyType':
        clauses.push(`vs ${enemyLabel(c.keywordOrRace)}`);
        break;
      case 'enemyTypeAny':
        clauses.push(`vs ${c.keywordsOrRaces.map(enemyLabel).join(' or ')}`);
        break;
      case 'teammateCount':
        if (c.count === 0) clauses.push('while solo');
        else if (c.orMore) clauses.push(`with ${c.count}+ teammates`);
        else clauses.push(`with ${c.count} teammate${c.count === 1 ? '' : 's'}`);
        break;
      case 'unresolved':
        inactive = true;
        break;
      default:
        // Other condition kinds aren't produced by the buff sources this
        // module describes today (see docs/assumptions.md). strangeInNumbers
        // and classFreakRank are deliberately excluded here too — they're
        // resolved by describeBuffModifiers' ctx filter before we get here
        // and must never render as clauses.
        break;
    }
  }
  return { clause: clauses.join(', '), inactive };
}

/** "+5–100%" — lo keeps its sign but drops the '%' (only the range's tail carries it), hi drops the redundant '+'. */
function formatPercentRange(lo: number, hi: number): string {
  const loStr = formatPercent(lo).replace(/%$/, '');
  const hiStr = formatPercent(hi).replace(/^\+/, '');
  return `${loStr}–${hiStr}`;
}

/**
 * dotDamage is a special case: the flat value is damage/second, `durationSec`
 * carries the tick window, and the modifier's own `damageTypeScope` condition
 * names the DoT's element — consumed into the label rather than rendered as
 * a separate "X damage only" clause.
 */
function describeDotDamage(m: Modifier, scale: number): string | null {
  if (m.curve) return null; // not produced for dotDamage today
  const scopeIndex = m.conditions.findIndex(c => c.kind === 'damageTypeScope');
  const scope = scopeIndex >= 0 ? (m.conditions[scopeIndex] as Extract<Condition, { kind: 'damageTypeScope' }>) : null;
  const remaining = scopeIndex >= 0 ? m.conditions.filter((_, i) => i !== scopeIndex) : m.conditions;

  const value = m.value * scale;
  const elementLabel = scope ? `${scope.types.join('/')} ` : '';
  let base = `${value > 0 ? '+' : ''}${value}/s ${elementLabel}damage`;

  const extraClauses: string[] = [];
  if (m.durationSec !== undefined) extraClauses.push(`${m.durationSec}s`);
  const { clause, inactive } = describeConditions(remaining);
  if (clause) extraClauses.push(clause);
  if (extraClauses.length > 0) base += ` (${extraClauses.join(', ')})`;
  if (inactive) base += ' — not modeled yet, no effect';
  return base;
}

function describeModifier(m: Modifier, scale: number): string | null {
  if (m.bucket === 'dotDamage') return describeDotDamage(m, scale);

  const percentLabel = PERCENT_BUCKET_LABELS[m.bucket];
  const flatLabel = FLAT_POINT_BUCKET_LABELS[m.bucket];
  const extraClauses: string[] = [];
  let magnitude: string;

  if (m.curve) {
    if (!percentLabel) return null; // only percent buckets describe as a curve range
    const ys = m.curve.points.map(p => p.y * m.curveScale * scale);
    const lo = Math.min(...ys);
    const hi = Math.max(...ys);
    magnitude = `${formatPercentRange(lo, hi)} ${percentLabel}`;
    const axisLabel = CURVE_AXIS_LABELS[m.curve.input] ?? m.curve.input;
    extraClauses.push(`scales with ${axisLabel}`);
  } else if (percentLabel) {
    magnitude = `${formatPercent(m.value * scale)} ${percentLabel}`;
  } else if (flatLabel) {
    const v = m.value * scale;
    magnitude = `${v > 0 ? '+' : ''}${v} ${flatLabel}`;
  } else {
    return null; // unmodeled bucket — omit rather than show something unverified
  }

  const { clause, inactive } = describeConditions(m.conditions);
  if (clause) extraClauses.push(clause);
  let base = magnitude;
  if (extraClauses.length > 0) base += ` (${extraClauses.join(', ')})`;
  if (inactive) base += ' — not modeled yet, no effect';
  return base;
}

/** True when every strangeInNumbers/classFreakRank gate on `m` matches ctx (the resolved-fact filter). */
function passesResolvedGates(m: Modifier, strangeInNumbers: boolean, classFreakRank: number): boolean {
  for (const c of m.conditions) {
    if (c.kind === 'strangeInNumbers' && c.value !== strangeInNumbers) return false;
    if (c.kind === 'classFreakRank' && (classFreakRank < c.min || classFreakRank > c.max)) return false;
  }
  return true;
}

/** Short "+10% damage (with ballistic weapons)" summary, or null if nothing describable. */
export function describeBuffModifiers(
  buff: { modifiers: readonly Modifier[] },
  ctx: BuffDescriptionCtx = {}
): string | null {
  const strangeInNumbers = ctx.strangeInNumbers ?? false;
  const classFreakRank = ctx.classFreakRank ?? 0;
  const scale = ctx.penaltyScale ?? 1;

  const relevant = buff.modifiers.filter(m => passesResolvedGates(m, strangeInNumbers, classFreakRank));
  const parts = relevant.map(m => describeModifier(m, scale)).filter((s): s is string => s !== null);
  return parts.length > 0 ? parts.join('; ') : null;
}
