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
  dbm: 'damage bonus',
  critDmgBonus: 'critical damage',
  sneakBonus: 'sneak attack damage',
  weakpointBonus: 'weakpoint damage',
  powerAttackBonus: 'power attack damage',
  limbDamage: 'limb damage',
  reloadSpeed: 'reload speed',
  moveSpeedBonus: 'movement speed',
  incomingDamageMult: 'damage taken',
  stimpakHealMagMult: 'Stimpak/RadAway heal magnitude',
  stimpakHealDurationMult: 'Stimpak/RadAway heal duration',
  // ESM: Awesome Tales 5 — entry point "Mod Weapon Attack Damage (Multiply Value)"
  wholeDamage: 'total damage',
  vatsHitChance: 'VATS hit chance',
  explosionRadiusBonus: 'explosion radius',
  ammoFreeChance: 'chance to not consume ammo',
  // The % mult on regen rate (Action Boy, Rejuvenated) — flat adds into the
  // base term are `apRegenFlat` ("base AP regen") below.
  apRegen: 'AP regen',
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
  // "base" distinguishes the flat add (GnB 4, Powered — joins the race base
  // BEFORE the apRegen mult, see modifiers.ts) from Action Boy's % mult.
  apRegenFlat: 'base AP regen',
  damageResistGain: 'Damage Resist',
  energyResistGain: 'Energy Resist',
  lockpickSkill: 'Lockpick Skill',
  hackingSkill: 'Hacking Skill',
  stimpakHealMult: 'Stimpak Healing',
};

/** Friendly names for curve axes; unmapped axes fall back to the raw CurveInput name. */
const CURVE_AXIS_LABELS: Partial<Record<CurveInput, string>> = {
  killStreak: 'kill streak',
  healthFraction: 'missing health',
  lockpickSkill: 'lockpick skill',
  hackingSkill: 'hacking skill',
  stimpakHealMult: 'Stimpak healing',
};

export const WEAPON_KEYWORD_LABELS: Record<string, string> = {
  WeaponTypeBallistic: 'ballistic weapons',
  WeaponTypeEnergy: 'energy weapons',
  WeaponTypeLaser: 'laser weapons',
  WeaponTypePlasma: 'plasma weapons',
  WeaponTypeAlienBlaster: 'alien blasters',
  WeaponTypeHeavyGun: 'heavy guns',
  WeaponTypeMeleeGeneral: 'melee weapons',
  WeaponTypeMelee1H: 'one-handed melee weapons',
  WeaponTypeMelee2H: 'two-handed melee weapons',
  WeaponTypeAutomaticMelee: 'automatic melee weapons',
  WeaponTypeUnarmed: 'unarmed',
  WeaponTypeThrowingKnife: 'throwing weapons',
  WeaponTypeRanged: 'ranged weapons',
  WeaponTypeRifle: 'rifles',
  WeaponTypePistol: 'pistols',
  WeaponTypeShotgun: 'shotguns',
  WeaponTypeAutomatic: 'automatic weapons',
  WeaponTypeHandToHand: 'hand-to-hand weapons',
  WeaponTypeBow: 'bows',
  WeaponTypeCryolator: 'the Cryolator',
  WeaponTypeExplosiveHybrid: 'the Hellstorm Missile Launcher',
  WeaponTypeExplosive: 'explosive weapons',
  WeaponTypeFireDamage: 'fire-damage weapons',
  WeaponTypeLaserMusket: 'laser muskets',
  WeaponTypePlasmaGrenade: 'plasma grenades',
  WeaponTypePlasmaMine: 'plasma mines',
  ma_Knife: 'knives',
  ma_Switchblade: 'switchblades',
  ma_CombatKnife: 'combat knives',
  ma_BowieKnife: 'bowie knives',
  ma_CultistDagger: 'cultist daggers',
  HasScope: 'scoped weapons',
  HasScopeRecon: 'recon-scoped weapons',
  'POST-DLC04_WeaponTypeSmartGrenade': 'smart grenades',
  HasSilencer: 'suppressed weapons',
  HasLegendary_Weapon_Bully: 'Bully legendary weapons',
  HasLegendary_Weapon_HealAllies: 'Heal Allies legendary weapons',
  HasLegendary_Weapon_Polished: 'Polished legendary weapons',
  HasLegendary_Weapon_Pounders: "Pounder's legendary weapons",
  CustomItemName_FoundationsVengeance: "Foundation's Vengeance",
  RD01_CustomItemName_Valkyrie: 'the Valkyrie',
  // Mire Magic Moonshine's synergy gate (buff-overrides.ts) — the WEAP's
  // model-attach identity keyword, not a WeaponType.
  E08A_ma_GulperSmacker: 'the Gulper Smacker',
};

export const ENEMY_KEYWORD_LABELS: Record<string, string> = {
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
  ActorTypeCryptid: 'cryptids',
  ActorTypeBug: 'bugs',
  ActorTypeRadScorpion: 'radscorpions',
  ActorTypeMolerat: 'mole rats',
  ActorTypeMoleMiner: 'mole miners',
  HumanRace: 'humans',
  ActorTypeNPC: 'NPCs',
  ActorTypeGlowing: 'glowing enemies',
  ActorTypeFeralGhoulGlowingOne: 'glowing ones',
  ActorTypeSynth: 'synths',
  ActorTypeScorchbeastQueen: 'scorchbeast queens',
  ActorTypeAngler: 'anglers',
  DLC03_ActorTypeAngler: 'anglers',
  DLC03_ActorTypeFogCrawler: 'fog crawlers',
  DLC03_ActorTypeHermitCrab: 'hermit crabs',
  ActorTypeBloodbug: 'bloodbugs',
  ActorTypeHoneyBeast: 'honey beasts',
  ActorTypeViciousDogPack: 'vicious dogs',
  ActorTypeRadStag: 'radstags',
  ActorTypeToad: 'radtoads',
  ActorTypeStingwing: 'stingwings',
  ActorTypeHuman: 'humans',
  MothmanRace: 'the Mothman',
  WendigoRace: 'Wendigos',
  FlatwoodsMonsterRace: 'the Flatwoods Monster',
  GraftonMonsterRace: 'the Grafton Monster',
  SnallyGasterRace: 'the Snallygaster',
  // Drifter/Epic Absorbtion perks (also collapsed in COLLAPSED_KEYWORD_SETS)
  AmmoTypeBallistic: 'ballistic damage',
  DamageTypeEnergy: 'energy damage',
  AmmoTypeEnergy: 'energy damage',
  DamageTypeFire: 'fire damage',
  IsAmmoType_FlamerFuel: 'fire damage',
};

export const isWeaponFlavoredKeyword = (edid: string): boolean =>
  edid in WEAPON_KEYWORD_LABELS || edid.includes('WeaponType');

const collapseKey = (keywords: readonly string[]): string => [...keywords].sort().join('|');

export const COLLAPSED_KEYWORD_SETS: Record<string, string> = {
  // Grounded mutation, Charged penalty perk (alien blasters all carry the Energy keyword)
  [collapseKey(['WeaponTypeEnergy', 'WeaponTypeAlienBlaster'])]: 'energy weapons',
  // Tesla Science 2 magazine
  [collapseKey(['WeaponTypePlasma', 'WeaponTypePlasmaGrenade', 'WeaponTypePlasmaMine'])]:
    'plasma weapons incl. grenades and mines',
  // Unstoppables 5 (NOT "energy weapons" — would overclaim gauss/gamma/cryo/flamer)
  [collapseKey([
    'WeaponTypeLaser',
    'WeaponTypeLaserMusket',
    'WeaponTypePlasma',
    'WeaponTypePlasmaGrenade',
    'WeaponTypePlasmaMine',
  ])]: 'laser or plasma weapons',
  // Drifter Absorbtion Energy perk
  [collapseKey(['DamageTypeEnergy', 'AmmoTypeEnergy', 'WeaponTypeEnergy'])]: 'energy damage',
  // Epic/Drifter Absorbtion Ballistic perks
  [collapseKey(['AmmoTypeBallistic', 'WeaponTypeBallistic'])]: 'ballistic damage',
  // Drifter Absorbtion Fire perk
  [collapseKey(['DamageTypeFire', 'IsAmmoType_FlamerFuel', 'WeaponTypeFireDamage'])]: 'fire damage',
  // Fierce, Jagged Reflection perks
  [collapseKey([
    'WeaponTypeHandToHand',
    'WeaponTypeMelee1H',
    'WeaponTypeMelee2H',
    'WeaponTypeMeleeGeneral',
    'WeaponTypeUnarmed',
  ])]: 'melee or unarmed weapons',
  // Epic/Drifter Absorbtion Melee perks
  [collapseKey([
    'WeaponTypeUnarmed',
    'WeaponTypeMelee1H',
    'WeaponTypeMelee2H',
    'WeaponTypeMeleeGeneral',
    'WeaponTypeAutomaticMelee',
  ])]: 'melee or unarmed weapons',
  // Incisor, Rooted, Unstoppable, Wasteland Survival 1
  [collapseKey(['WeaponTypeMelee1H', 'WeaponTypeMelee2H', 'WeaponTypeUnarmed'])]:
    'melee or unarmed weapons',
  // "Ignore armor with melee weapons" perk
  [collapseKey([
    'WeaponTypeHandToHand',
    'WeaponTypeMelee2H',
    'WeaponTypeMelee1H',
    'WeaponTypeUnarmed',
  ])]: 'melee or unarmed weapons',
  // Twisted Muscles mutation
  [collapseKey(['WeaponTypeMelee1H', 'WeaponTypeMelee2H', 'WeaponTypeAutomaticMelee'])]:
    'melee weapons',
  // Enforcer, Ground Pounder, Modern Renegade (orders differ in data — hence sorted keys)
  [collapseKey(['WeaponTypeRifle', 'WeaponTypePistol', 'WeaponTypeShotgun'])]:
    'rifles, pistols, or shotguns',
  // Bow Before Me
  [collapseKey(['WeaponTypeBow', 'WeaponTypeThrowingKnife'])]: 'bows or thrown weapons',
  // brew consumable
  [collapseKey(['WeaponTypeLaser', 'WeaponTypePlasma'])]: 'laser or plasma weapons',
  // Ninja
  [collapseKey([
    'WeaponTypeMelee1H',
    'WeaponTypeMelee2H',
    'WeaponTypeUnarmed',
    'WeaponTypeThrowingKnife',
    'WeaponTypeBow',
  ])]: 'melee, unarmed, bows, or thrown weapons',
  // Fury, Grognak 1, Fencer's, …
  [collapseKey(['WeaponTypeUnarmed', 'WeaponTypeMeleeGeneral'])]: 'melee or unarmed weapons',
  // U.S. Covert Operations Manual 8 override
  [collapseKey(['WeaponTypeUnarmed', 'ma_Knife', 'ma_Switchblade'])]: 'unarmed weapons or knives',
  // Astoundingly Awesome Tales 10 override
  [collapseKey(['HasScope', 'HasScopeRecon'])]: 'scoped weapons',
  // Awesome Tales 1 — every mirelurk-variant race carries ActorTypeMirelurk
  [collapseKey([
    'ActorTypeMirelurkQueen',
    'ActorTypeMirelurkKing',
    'ActorTypeMirelurkHunter',
    'ActorTypeMirelurk',
  ])]: 'Mirelurks',
  // Awesome Tales 2 — Behemoths carry ActorTypeSuperMutant
  [collapseKey(['ActorTypeSuperMutantBehemoth', 'ActorTypeSuperMutant'])]: 'super mutants',
};

const weaponLabel = (edid: string): string => WEAPON_KEYWORD_LABELS[edid] ?? edid;
const enemyLabel = (edid: string): string => ENEMY_KEYWORD_LABELS[edid] ?? edid;

/** The 7 SPECIAL flat-point buckets, canonical S-P-E-C-I-A-L order — see `groupSpecialModifiers`. */
const SPECIAL_BUCKETS: readonly Bucket[] = [
  'specialStrength',
  'specialPerception',
  'specialEndurance',
  'specialCharisma',
  'specialIntelligence',
  'specialAgility',
  'specialLuck',
];

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

/** Qualifier clause for one modifier's conditions. */
function describeConditions(conditions: readonly Condition[], bucket: Bucket): string {
  const clauses: string[] = [];
  const weaponPrep = bucket === 'incomingDamageMult' ? 'from' : 'with';

  for (const c of conditions) {
    switch (c.kind) {
      case 'weaponKeyword':
        clauses.push(
          c.present ? `${weaponPrep} ${weaponLabel(c.keyword)}` : `non-${weaponLabel(c.keyword)}`,
        );
        break;
      case 'weaponKeywordAny': {
        const collapsed = COLLAPSED_KEYWORD_SETS[collapseKey(c.keywords)];
        if (collapsed) {
          clauses.push(`${weaponPrep} ${collapsed}`);
        } else {
          const labels = c.keywords.map(weaponLabel).sort();
          clauses.push(`${weaponPrep} ${labels.join(' or ')}`);
        }
        break;
      }
      case 'damageTypeScope':
        clauses.push(`${c.types.join('/')} damage only`);
        break;
      case 'enemyType':
        // Twisted Muscles' limbDamage modifiers carry WeaponType* keywords in
        // an enemyType condition (an extraction miscategorization — these
        // name the WIELDED weapon, not the target) — render as a weapon "with
        // X" clause instead of an enemy "vs X" one when that's what it is.
        clauses.push(
          isWeaponFlavoredKeyword(c.keywordOrRace)
            ? `${weaponPrep} ${weaponLabel(c.keywordOrRace)}`
            : `vs ${enemyLabel(c.keywordOrRace)}`,
        );
        break;
      case 'enemyTypeAny': {
        const collapsed = COLLAPSED_KEYWORD_SETS[collapseKey(c.keywordsOrRaces)];
        if (collapsed) {
          const prep =
            bucket === 'incomingDamageMult'
              ? 'from'
              : c.keywordsOrRaces.every(isWeaponFlavoredKeyword)
                ? 'with'
                : 'vs';
          clauses.push(`${prep} ${collapsed}`);
        } else if (c.keywordsOrRaces.every(isWeaponFlavoredKeyword)) {
          const labels = c.keywordsOrRaces.map(weaponLabel).sort();
          clauses.push(`${weaponPrep} ${labels.join(' or ')}`);
        } else {
          const labels = c.keywordsOrRaces.map(enemyLabel).sort();
          clauses.push(`vs ${labels.join(' or ')}`);
        }
        break;
      }
      case 'teammateCount':
        if (c.count === 0) clauses.push('while solo');
        else if (c.orMore) clauses.push(`with ${c.count}+ teammates`);
        else clauses.push(`with ${c.count} teammate${c.count === 1 ? '' : 's'}`);
        break;
      case 'unresolved':
        break;
      case 'aimingDownSights':
        clauses.push(c.value ? 'while aiming' : 'while not aiming');
        break;
      case 'underAlcoholEffect':
        clauses.push(c.value ? 'under alcohol' : 'while sober');
        break;
      case 'healthBelowPct':
        clauses.push(`below ${c.pct}% health`);
        break;
      case 'inPowerArmor':
        clauses.push(c.value ? 'in power armor' : 'outside power armor');
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
  return clauses.join(', ');
}

/** "+5–100%" — lo keeps its sign but drops the '%' (only the range's tail carries it), hi drops the redundant '+'. */
function formatPercentRange(lo: number, hi: number): string {
  const loStr = formatPercent(lo).replace(/%$/, '');
  const hiStr = formatPercent(hi).replace(/^\+/, '');
  return `${loStr}–${hiStr}`;
}

/** "+1–3" — flat-point analogue of formatPercentRange (Unyielding's stepped SPECIAL curves, Lining's apMax curves). */
function formatFlatRange(lo: number, hi: number): string {
  const fmt = (v: number) => `${v > 0 ? '+' : ''}${v}`;
  return lo === hi ? fmt(lo) : `${fmt(lo)}–${fmt(hi)}`;
}

/**
 * `healthFraction` is CURRENT HP / max HP (resolve.ts), not missing HP — but
 * a multi-point curve on it (today, only Unyielding) is a STAIRCASE, not a
 * smooth ramp: the bonus holds flat, then jumps at specific HP thresholds. A
 * bare lo–hi range hides that shape; this reads it back out as "+N at ≤X%
 * HP" breakpoints instead. Dedupes consecutive same-value points (Unyielding's
 * flat (0,3)-(0.2,3) plateau collapses to one "+3 at ≤20% HP" line) and drops
 * the terminal zero-bonus point(s) — "no bonus above the last threshold" is
 * implied by the list simply stopping, same as `curve-endpoint-clamping`'s
 * outside-domain convention.
 */
function describeHealthFractionStaircase(
  points: readonly { x: number; y: number }[],
  curveScale: number,
  scale: number,
): string {
  const steps: Array<{ x: number; y: number }> = [];
  for (const p of points) {
    const y = p.y * curveScale * scale;
    const last = steps[steps.length - 1];
    if (last && last.y === y)
      last.x = p.x; // extend the plateau's upper x bound
    else steps.push({ x: p.x, y });
  }
  return steps
    .filter((s) => s.y !== 0)
    .sort((a, b) => b.x - a.x)
    .map((s) => `${formatFlatRange(s.y, s.y)} at ≤${Math.round(s.x * 100)}% HP`)
    .join(', ');
}

/**
 * dotDamage is a special case: the flat value is damage/second, `durationSec`
 * carries the tick window, and the modifier's own `damageTypeScope` condition
 * names the DoT's element — consumed into the label rather than rendered as
 * a separate "X damage only" clause.
 */
function describeDotDamage(m: Modifier, scale: number): string | null {
  if (m.curve) return null; // not produced for dotDamage today
  const scopeIndex = m.conditions.findIndex((c) => c.kind === 'damageTypeScope');
  const scope =
    scopeIndex >= 0
      ? (m.conditions[scopeIndex] as Extract<Condition, { kind: 'damageTypeScope' }>)
      : null;
  const remaining =
    scopeIndex >= 0 ? m.conditions.filter((_, i) => i !== scopeIndex) : m.conditions;

  const value = m.value * scale;
  const elementLabel = scope ? `${scope.types.join('/')} ` : '';
  let base = `${value > 0 ? '+' : ''}${value}/s ${elementLabel}damage`;

  const extraClauses: string[] = [];
  if (m.durationSec !== undefined) extraClauses.push(`${m.durationSec}s`);
  const clause = describeConditions(remaining, m.bucket);
  if (clause) extraClauses.push(clause);
  if (extraClauses.length > 0) base += ` (${extraClauses.join(', ')})`;
  return base;
}

/**
 * `labelOverride` swaps in a combined label ("all SPECIAL except Endurance")
 * for a `groupSpecialModifiers` group — it replaces whichever ONE of
 * percent/flat this bucket actually uses (SPECIAL buckets are always flat),
 * so the percent-vs-flat magnitude formatting stays correct either way.
 */
function describeModifier(m: Modifier, scale: number, labelOverride?: string): string | null {
  if (m.bucket === 'dotDamage') return describeDotDamage(m, scale);

  let percentLabel = PERCENT_BUCKET_LABELS[m.bucket];
  let flatLabel = FLAT_POINT_BUCKET_LABELS[m.bucket];
  if (labelOverride) {
    if (percentLabel) percentLabel = labelOverride;
    else if (flatLabel) flatLabel = labelOverride;
  }
  const extraClauses: string[] = [];
  let magnitude: string;

  if (m.curve) {
    if (!percentLabel && !flatLabel) return null; // unmodeled bucket — omit rather than show something unverified
    const label = percentLabel ?? flatLabel!;
    if (m.curve.input === 'healthFraction' && m.curve.points.length > 2) {
      // A staircase, not a smooth ramp (see describeHealthFractionStaircase) —
      // the breakpoints ARE the magnitude; the label moves to the trailing
      // qualifier clause instead of "scales with X".
      magnitude = describeHealthFractionStaircase(m.curve.points, m.curveScale, scale);
      extraClauses.push(label);
    } else {
      const ys = m.curve.points.map((p) => p.y * m.curveScale * scale);
      const lo = Math.min(...ys);
      const hi = Math.max(...ys);
      magnitude = percentLabel
        ? `${formatPercentRange(lo, hi)} ${percentLabel}`
        : `${formatFlatRange(lo, hi)} ${flatLabel}`;
      const axisLabel = CURVE_AXIS_LABELS[m.curve.input] ?? m.curve.input;
      extraClauses.push(`scales with ${axisLabel}`);
    }
  } else if (m.scaledBy) {
    if (!percentLabel && !flatLabel) return null;
    const axisLabel = CURVE_AXIS_LABELS[m.scaledBy] ?? m.scaledBy;
    if (percentLabel) {
      magnitude = `${formatPercent(m.value * scale)} ${percentLabel} per point of ${axisLabel}`;
    } else {
      const v = m.value * scale;
      magnitude = `${v > 0 ? '+' : ''}${v} ${flatLabel} per point of ${axisLabel}`;
    }
  } else if (percentLabel) {
    magnitude = `${formatPercent(m.value * scale)} ${percentLabel}`;
  } else if (flatLabel) {
    const v = m.value * scale;
    magnitude = `${v > 0 ? '+' : ''}${v} ${flatLabel}`;
  } else {
    return null; // unmodeled bucket — omit rather than show something unverified
  }

  const clause = describeConditions(m.conditions, m.bucket);
  if (clause) extraClauses.push(clause);
  let base = magnitude;
  if (extraClauses.length > 0) base += ` (${extraClauses.join(', ')})`;
  return base;
}

/** Signature two modifiers must share to be treated as "the same bonus, different SPECIAL" — everything except the bucket itself. */
function specialGroupSignature(m: Modifier): string {
  return JSON.stringify({
    op: m.op,
    value: m.curve ? undefined : m.value,
    curve: m.curve,
    curveScale: m.curve ? m.curveScale : undefined,
    conditions: m.conditions,
  });
}

/**
 * Collapses N identical per-SPECIAL modifiers (same value/curve/conditions,
 * differing only by which stat) into one combined clause — without this,
 * Unyielding's 6 SPECIAL curves and Herd Mentality's 14 (7 stats × 2
 * teammate states) each read as a wall of near-duplicate clauses. Only
 * collapses a FULL group — all 7 SPECIAL, or all 7 minus exactly one (e.g.
 * Unyielding's Endurance exclusion) — a partial/coincidental subset is left
 * as individual clauses rather than risk a misleading "all SPECIAL" label.
 */
/**
 * Sum same-bucket duplicate lines the way the engine's fold does (Σ ADD /
 * Σ MUL_ADD): Super Chem MK II carries two separate +25 Damage Resist MGEFs
 * and must read "+50 Damage Resist", not two "+25" lines. Only plain-value
 * ADD/MUL_ADD modifiers merge, and only when bucket, op, duration,
 * conditions, and scaling all match; SET and curve-driven modifiers pass
 * through untouched.
 */
function mergeSameBucketModifiers(modifiers: readonly Modifier[]): Modifier[] {
  const out: Modifier[] = [];
  const indexBySignature = new Map<string, number>();
  for (const m of modifiers) {
    const value =
      'curve' in m && m.curve !== undefined ? undefined : 'value' in m ? m.value : undefined;
    if (typeof value !== 'number' || m.op === 'SET') {
      out.push(m);
      continue;
    }
    const sig = [
      m.bucket,
      m.op,
      m.durationSec ?? '',
      JSON.stringify(m.conditions),
      JSON.stringify(m.scaledBy ?? null),
    ].join('|');
    const at = indexBySignature.get(sig);
    if (at === undefined) {
      indexBySignature.set(sig, out.length);
      out.push(m);
    } else {
      // Only value-carrying modifiers ever receive a signature, so the
      // previous entry at this index is the same shape.
      const prev = out[at] as Modifier & { value: number };
      out[at] = { ...prev, value: prev.value + value } as Modifier;
    }
  }
  return out;
}

function groupSpecialModifiers(modifiers: readonly Modifier[]): {
  groups: Array<{ label: string; representative: Modifier }>;
  rest: Modifier[];
} {
  const bySignature = new Map<string, Modifier[]>();
  const rest: Modifier[] = [];
  for (const m of modifiers) {
    if (!SPECIAL_BUCKETS.includes(m.bucket)) {
      rest.push(m);
      continue;
    }
    const sig = specialGroupSignature(m);
    const list = bySignature.get(sig);
    if (list) list.push(m);
    else bySignature.set(sig, [m]);
  }

  const groups: Array<{ label: string; representative: Modifier }> = [];
  for (const list of bySignature.values()) {
    const buckets = new Set(list.map((m) => m.bucket));
    if (buckets.size === SPECIAL_BUCKETS.length) {
      groups.push({ label: 'all SPECIAL', representative: list[0] });
    } else if (buckets.size === SPECIAL_BUCKETS.length - 1) {
      const missing = SPECIAL_BUCKETS.find((b) => !buckets.has(b));
      const missingLabel = missing ? FLAT_POINT_BUCKET_LABELS[missing] : undefined;
      groups.push({
        label: missingLabel ? `all SPECIAL except ${missingLabel}` : 'all SPECIAL',
        representative: list[0],
      });
    } else {
      rest.push(...list);
    }
  }
  return { groups, rest };
}

/** True when every strangeInNumbers/classFreakRank gate on `m` matches ctx (the resolved-fact filter). */
function passesResolvedGates(
  m: Modifier,
  strangeInNumbers: boolean,
  classFreakRank: number,
): boolean {
  for (const c of m.conditions) {
    if (c.kind === 'strangeInNumbers' && c.value !== strangeInNumbers) return false;
    if (c.kind === 'classFreakRank' && (classFreakRank < c.min || classFreakRank > c.max))
      return false;
  }
  return true;
}

/** Short "+10% damage (with ballistic weapons)" summary, or null if nothing describable. */
export function describeBuffModifiers(
  buff: { modifiers: readonly Modifier[] },
  ctx: BuffDescriptionCtx = {},
): string | null {
  const strangeInNumbers = ctx.strangeInNumbers ?? false;
  const classFreakRank = ctx.classFreakRank ?? 0;
  const scale = ctx.penaltyScale ?? 1;

  const relevant = buff.modifiers.filter((m) =>
    passesResolvedGates(m, strangeInNumbers, classFreakRank),
  );

  const describeAsParts: string[] = [];
  const forSynthesis: Modifier[] = [];
  for (const m of relevant) {
    if (m.describeAs !== undefined) {
      if (m.describeAs !== '') describeAsParts.push(m.describeAs);
    } else {
      forSynthesis.push(m);
    }
  }

  const { groups, rest } = groupSpecialModifiers(mergeSameBucketModifiers(forSynthesis));
  const parts = [
    ...describeAsParts,
    ...groups.map((g) => describeModifier(g.representative, scale, g.label)),
    ...rest.map((m) => describeModifier(m, scale)),
  ].filter((s): s is string => s !== null);
  return parts.length > 0 ? parts.join('; ') : null;
}
