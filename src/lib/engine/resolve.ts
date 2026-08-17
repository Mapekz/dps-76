/**
 * Condition evaluation and bucket folds for the damage engine.
 *
 * The shared fold primitive `foldOps` (lines ~409-421) implements the modifier arithmetic
 * every bucket uses: result = (last SET ?? base) + (Σ MUL_ADD) × base + Σ ADD.
 */

import type { EnemyConditions, Weapon } from '@/types';
import type { ResolveContextPlayer } from '@/types/player';
import type {
  Bucket,
  Condition,
  ConstantBaseBucket,
  CurveInput,
  DamageType,
  Modifier,
  ModOp,
  StackCounter,
} from '@/types/modifiers';
import { BUCKET_REGISTRY } from '@/types/modifiers';
import { interpolateCurve } from '@/lib/curve-tables';
import { CLOSE_THRESHOLD_UNITS, DEFAULT_DISTANCE_UNITS, FAR_THRESHOLD_UNITS } from '@/lib/distance';
import { KINGFISHER_LOCAL_LEGEND_CHALLENGE_IDS } from './affordances';
import { resolveBulletStormStacks, resolveOnslaughtStacks } from './stacks';
import type { BucketTrace, TraceContribution } from './trace';

export {
  KINGFISHER_LOCAL_LEGEND_CHALLENGE_IDS,
  PIPE_WEAPON_CRAFTING_CHALLENGE_ID,
} from './affordances';

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
  player: ResolveContextPlayer;
  enemy: EnemyConditions;
  scenario: ScenarioFlags;
  /** Weapon item level for itemLevel-input curves (scenarios always set it; defaults to the level-50 clamp). */
  itemLevel?: number;
  /** Body part the hit lands on (for bodyPart-gated modifiers like Center Masochist). */
  bodyPart?: 'torso' | 'weakpoint' | 'limb';
  /**
   * When set, dbm modifiers carrying a damageTypeScope condition apply only
   * if this component damage type is in scope (undefined = whole-weapon fold).
   */
  componentType?: DamageType;
  /**
   * The component being folded is explosion damage (an extracted
   * `fromExplosion` launcher-payload component, or an Explosive-legendary
   * twin). 'explosive'-scoped damageTypeScope conditions match these
   * regardless of the component's elemental type (Cremator's fire ball,
   * Gamma Gun's radiation burst are still explosions).
   */
  componentIsExplosion?: boolean;
  /**
   * Every enemy-type identifier the selected target matches: its RACE edid
   * (GetIsRace gates — Assassin's "HumanRace") plus the race's ActorType*
   * keywords (HasKeyword gates — Zealot's "ActorTypeScorched"). Derived from
   * `enemy.targetRace` in resolveLoadout via bodyparts data (the engine stays
   * data-adapter-free). Unset/empty = no target selected → enemy-type-gated
   * modifiers are inactive.
   */
  enemyTypeIds?: readonly string[];
  /**
   * The shared Onslaught stack cap, folded ONCE per scenario input from every
   * equipped source's `onslaughtMaxStacks` modifier (`scenarios.ts`) and
   * threaded onto every ResolveContext built after that fold. Defaults to 0
   * (no Onslaught sources equipped → the `onslaught` reader and the
   * `onslaughtStacks` curve input both clamp to 0, so every consumer is
   * inactive). See docs/assumptions.md "Onslaught".
   */
  onslaughtMaxStacks?: number;
  /**
   * Engine-computed average Onslaught stack count under reverse mode
   * (Gunslinger Master). When set, `effectiveOnslaughtStacks` returns this
   * value (clamped to `onslaughtMaxStacks`) and ignores the player's slider.
   * See `onslaught.ts` and docs/assumptions.md "Onslaught".
   */
  onslaughtReverseStacks?: number;
  /**
   * Engine-computed average Onslaught stack count under forward mode (Sustained Stacks).
   * When the player's slider is -1 (auto), this value is used (clamped to `onslaughtMaxStacks`).
   * A manual pin (stored !== -1) wins over this average — unlike `onslaughtReverseStacks`,
   * which always wins. Undefined = no sim value available (e.g., zero fire rate bootstrap).
   */
  onslaughtForwardStacks?: number;
  /**
   * The shared Bullet Storm stack cap, folded ONCE per scenario input from
   * every equipped source's `bulletStormMaxStacks` modifier (`scenarios.ts`)
   * — and separately bootstrap-folded by `buildEffectiveWeapon` so
   * weapon-stat curves (Bullet Storm's own reload-speed curve) see it too.
   * Defaults to 0 (no Bullet Storm sources equipped → the `bulletStorm`
   * reader and the `bulletStormStacks` curve input both clamp to 0). See
   * docs/assumptions.md "Bullet Storm".
   */
  bulletStormMaxStacks?: number;
  /**
   * The shared Bullet Storm stack FLOOR, folded at the same two sites as
   * `bulletStormMaxStacks` (Resolute Veteran's +5). Defaults to 0.
   */
  bulletStormMinStacks?: number;
  /**
   * Engine-computed sustained-fire average Bullet Storm stack count, always
   * computed per scenario. Applied only when the player's slider is -1 (auto),
   * clamped to `[bulletStormMinStacks, bulletStormMaxStacks]`; a manual pin
   * wins over this average. See `bulletstorm.ts` and docs/assumptions.md
   * "Bullet Storm".
   */
  bulletStormAvgStacks?: number;
  /**
   * The player's folded bonus-movement-speed fraction (Σ `moveSpeedBonus`
   * bucket — Speed Demon +0.20/+0.25), bootstrap-folded and threaded by
   * buildEffectiveWeapon exactly like onslaughtMaxStacks. Read by the
   * `moveSpeedBonus` CurveInput (Fast Fighter's reload-speed conversion).
   * Defaults to 0 (no move-speed sources equipped → the curve clamps to 0).
   */
  moveSpeedBonus?: number;
  /**
   * ESM-extracted `fDistanceForCloseDamage` GMST (the "Close" perk-gate
   * threshold — Guerrilla, Down Ranger's near-range half), threaded from
   * `ScenarioInput.engineConstants` via `scenarios.ts`'s `scenarioCtx`.
   * Undefined = `distance.ts`'s `CLOSE_THRESHOLD_UNITS` (tests and any
   * caller without a mode) — same "threaded in, not looked up here" rule as
   * `onslaughtMaxStacks` above. The "Far" gate has no GMST and stays a plain
   * constant (`FAR_THRESHOLD_UNITS`) — see `distance.ts`.
   */
  closeThresholdUnits?: number;
}

/**
 * Effective Onslaught stack count: reverse-mode average wins; auto (`-1`) uses
 * the forward sustained average; a manual pin wins over forward average; all
 * paths clamp to the equipped max. Shared by the `onslaught` StackCounter
 * reader and the `onslaughtStacks` CurveInput reader.
 */
function effectiveOnslaughtStacks(p: ResolveContextPlayer, ctx: ResolveContext): number {
  return resolveOnslaughtStacks(p.onslaughtStacks, ctx.onslaughtMaxStacks ?? 0, {
    reverseAvg: ctx.onslaughtReverseStacks,
    forwardAvg: ctx.onslaughtForwardStacks,
  });
}

/**
 * Effective Bullet Storm stack count: auto (`-1`) uses the sustained average;
 * a manual pin wins over it; all paths clamp to `[min, max]` (min > max
 * degrades to max). Shared by the `bulletStorm` StackCounter reader and the
 * `bulletStormStacks` CurveInput reader.
 */
function effectiveBulletStormStacks(p: ResolveContextPlayer, ctx: ResolveContext): number {
  return resolveBulletStormStacks(
    p.bulletStormStacks,
    ctx.bulletStormMinStacks ?? 0,
    ctx.bulletStormMaxStacks ?? 0,
    ctx.bulletStormAvgStacks,
  );
}

/**
 * Reads one scalar from resolve state for a stack counter or a curve input.
 * Single source of truth for what game state each modifier axis consumes —
 * add a row here when adding a StackCounter or CurveInput.
 */
const PLAYER_STATE_READERS: Record<
  StackCounter | CurveInput,
  (p: ResolveContextPlayer, ctx: ResolveContext) => number
> = {
  // Stack counters (modifier value × count).
  tenderizer: (p) => p.tenderizerStacks ?? 0,
  onslaught: (p, ctx) => effectiveOnslaughtStacks(p, ctx),
  bulletStorm: (p, ctx) => effectiveBulletStormStacks(p, ctx),
  adrenaline: (p) => p.killStreak,
  // Concentrated Fire's per-VATS-shot stack counter — manual slider standing
  // in for the game's hidden native counter (docs/assumptions.md
  // "Concentrated Fire stacks").
  concentratedFire: (p) => p.concentratedFireStacks ?? 0,
  // Curve inputs (X value fed into a value curve).
  healthFraction: (p) => p.healthPercent / 100,
  capsOnHand: (p) => p.capsOnHand,
  killStreak: (p) => p.killStreak,
  addictionCount: (p) => p.addictionCount ?? 0,
  onslaughtStacks: (p, ctx) => effectiveOnslaughtStacks(p, ctx),
  // Juggernaut's curve X is ABSOLUTE current HP. maxHealth is derived in
  // resolveLoadout (245 + 5×END + maxHealth bucket — docs/assumptions.md
  // "Max HP"); the 300 fallback only serves synthetic engine tests.
  healthCurrent: (p) => (p.healthPercent / 100) * (p.maxHealth ?? 300),
  // The WIELDER's own DR (Berserker's — see the CurveInput doc comment for
  // the 2026-07-18 rename/correction from the misleading `enemyDamageResist`
  // name). Manual knob, default 0 (naked).
  playerDamageResist: (p) => p.playerDamageResist ?? 0,
  itemLevel: (_, ctx) => ctx.itemLevel ?? 50,
  mutationCount: (p) => p.mutationCount ?? 0,
  // Lifegiver's max-HP curve X — the buff-folded END stat (resolveLoadout).
  endurance: (p) => p.endurance,
  // Science!/Pyro-Technician's/Cryologist's damage-vs-INT curve X — the
  // buff-folded INT stat (mirrors the endurance reader above).
  intelligence: (p) => p.intelligence,
  // The Debilitator's limb-damage-vs-STR curve X.
  strength: (p) => p.strength,
  // The Peace Maker's explosive-damage-vs-CHA curve X.
  charisma: (p) => p.charisma,
  // Awareness perk's VATS-accuracy-vs-PER curve X (Phase 4 — VATS
  // hit-chance aggregate, display-only) — mirrors the strength/endurance/
  // charisma readers above.
  perception: (p) => p.perception,
  // Bullet Storm / Heavy Gunner's ammo-spent stack curve X (shared field with
  // the `bulletStorm` StackCounter reader above — both clamp through
  // effectiveBulletStormStacks).
  bulletStormStacks: (p, ctx) => effectiveBulletStormStacks(p, ctx),
  // Shotgun Champ's damage-vs-crippled curve X — the effective (OMOD-folded)
  // weapon's projectile count.
  projectileCount: (_, ctx) => ctx.weapon.projectileCount ?? 1,
  hungerThirstTier: (p) => p.hungerThirstTier ?? 0,
  feralTier: (p) => p.feralTier ?? 0,
  // Fast Fighter's curve X — the bootstrap-folded bonus-move-speed fraction
  // (ResolveContext.moveSpeedBonus, threaded by buildEffectiveWeapon).
  moveSpeedBonus: (_, ctx) => ctx.moveSpeedBonus ?? 0,
  // Polished's curve X = GetEquippedWeaponHealthPercent (0.0-2.0 fraction; no AVIF).
  weaponCondition: (p) => (p.weaponConditionPct ?? 100) / 100,
  // Pirate Punch's curve X — folded lockpickSkill bucket (Picklock ranks,
  // Master Infiltrator, Safecracker's 3★ armor).
  lockpickSkill: (p) => p.lockpickSkill ?? 0,
  hackingSkill: (p) => p.hackingSkill ?? 0,
  stimpakHealMult: (p) => p.stimpakHealMult ?? 0,
  // stimpakHealMagMult/DurationMult bucket product-folds (player-stats.ts) —
  // wired for a future Stimpak-healing-scaled unique via `scaledBy`, no
  // consumer yet.
  stimpakHealMagMult: (p) => p.stimpakHealMagMult ?? 1,
  stimpakHealDurationMult: (p) => p.stimpakHealDurationMult ?? 1,
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
      return cond.keywords.some((k) => (ctx.weapon.keywords ?? []).includes(k)) ? 1 : null;
    case 'weaponAnimTypeMax':
      // GetWeaponAnimType() ≤ max (Martial Artist's melee gate). Unknown anim
      // type (synthetic test weapons) fails closed like any unmatched gate.
      return ctx.weapon.animType !== undefined && ctx.weapon.animType <= cond.max ? 1 : null;
    case 'bodyPart':
      return ctx.bodyPart === cond.part ? 1 : null;
    case 'enemyType':
      // Matched against the selected target's race edid + ActorType* keywords
      // (ctx.enemyTypeIds). No target selected → inactive, like other enemy gates.
      return (ctx.enemyTypeIds ?? []).includes(cond.keywordOrRace) ? 1 : null;
    case 'enemyTypeAny':
      return cond.keywordsOrRaces.some((id) => (ctx.enemyTypeIds ?? []).includes(id)) ? 1 : null;
    case 'damageTypeScope':
      // Whole-weapon folds skip component-scoped modifiers; per-component
      // folds require a matching component type. 'explosive' scope also
      // matches elemental components that ARE explosions (fromExplosion
      // launcher payloads / legendary twins — ctx.componentIsExplosion).
      if (ctx.componentType === undefined) return null;
      if (cond.types.includes(ctx.componentType)) return 1;
      return ctx.componentIsExplosion && cond.types.includes('explosive') ? 1 : null;
    case 'sneaking':
      return ctx.scenario.isSneaking ? 1 : null;
    case 'powerAttack':
      return ctx.scenario.isPowerAttack === cond.value ? 1 : null;
    case 'crit':
      return ctx.scenario.isCrit ? 1 : null;
    case 'vatsOnly':
      // Active for both the VATS and VATS+Sneak scenarios when value:true
      // (sneaking is a global flag layered on top of isVats, not a separate
      // scenario flag); inactive for Manual Aim.
      return ctx.scenario.isVats === cond.value ? 1 : null;
    case 'unarmored':
      return (ctx.player.armorWorn === 'none') === cond.value ? 1 : null;
    case 'healthBelowPct': {
      // PLAYER health below pct. Operator is data-driven from the ESM
      // (`inclusive` — absent ⇒ ≤, matching Foundation's Vengeance's
      // GetHealthPercentage() ≤ 0.25, the only current source).
      const h = ctx.player.healthPercent;
      return ((cond.inclusive ?? true) ? h <= cond.pct : h < cond.pct) ? 1 : null;
    }
    case 'enemyHealthBelowPct': {
      // Unset enemy health = full (Executioner's inactive by default).
      const h = ctx.enemy.healthPercent ?? 100;
      return ((cond.inclusive ?? true) ? h <= cond.pct : h < cond.pct) ? 1 : null;
    }
    case 'enemyHealthAbovePct': {
      // Unset enemy health = full (Instigating active by default).
      const h = ctx.enemy.healthPercent ?? 100;
      return ((cond.inclusive ?? true) ? h >= cond.pct : h > cond.pct) ? 1 : null;
    }
    case 'perCrippledLimb': {
      const count = Math.max(0, Math.min(ctx.enemy.crippledLimbCount ?? 0, cond.max));
      return count > 0 ? count : null;
    }
    case 'lastRound':
      return ctx.player.isLastShot ? 1 : null;
    case 'enemyHasActiveEffect': {
      const active =
        cond.keyword === 'DamageTypeFire'
          ? ctx.enemy.isBurning
          : cond.keyword === 'DamageTypePoison'
            ? ctx.enemy.isPoisoned
            : cond.keyword === 'DamageTypeBleed'
              ? ctx.enemy.isBleeding
              : cond.keyword === 'DamageTypeCryo'
                ? ctx.enemy.isFrozen
                : false; // keywords beyond fire/poison/bleed/cryo have no UI input yet — inactive
      return active ? 1 : null;
    }
    case 'enemyGroupCount': {
      // Unset = 1: the target itself is a group of one (Encircler's base tier).
      const n = ctx.enemy.groupTargetCount ?? 1;
      return (cond.orMore ? n >= cond.count : n === cond.count) ? 1 : null;
    }
    case 'teammateCount': {
      const n = ctx.player.teammateCount ?? 0;
      return (cond.orMore ? n >= cond.count : n === cond.count) ? 1 : null;
    }
    case 'killStreakCount':
      return ctx.player.killStreak === cond.count ? 1 : null;
    case 'scaledByMissingHealth': {
      const missing = Math.max(0, Math.min(1, 1 - ctx.player.healthPercent / 100));
      const scale = Math.min(missing, cond.cap);
      return scale > 0 ? scale : null;
    }
    case 'scaledByCaps': {
      const scale = Math.max(0, Math.min((ctx.player.capsOnHand ?? 0) / cond.capsForMax, 1));
      return scale > 0 ? scale : null;
    }
    case 'scaledByWeaponApCost': {
      // Number Cruncher: value × the effective (post weapon-OMOD fold) per-shot
      // VATS AP cost. Weapons without an AP cost simply gain nothing.
      const apCost = ctx.weapon.apCost ?? 0;
      return apCost > 0 ? apCost : null;
    }
    case 'stacks': {
      const count = Math.max(
        0,
        Math.min(PLAYER_STATE_READERS[cond.counter](ctx.player, ctx), cond.max),
      );
      return count > 0 ? count : null;
    }
    case 'strangeInNumbers':
      return ctx.player.strangeInNumbers === cond.value ? 1 : null;
    case 'classFreakRank': {
      // Rank 0–3 derived from the perk loadout (deriveClassFreakRank).
      const rank = ctx.player.classFreakRank ?? 0;
      return rank >= cond.min && rank <= cond.max ? 1 : null;
    }
    case 'perkFamilyRank': {
      // Cross-family HasPerk gate (Lock and Load → Bullet Storm's reload
      // speed): owning rank N satisfies gates on every rank ≤ N, from the
      // derived family→rank map (getEquippedPerkFamilyRanks).
      const owns = (ctx.player.equippedPerkRanks?.[cond.family] ?? 0) >= cond.minRank;
      return owns === cond.present ? 1 : null;
    }
    case 'inPowerArmor':
      return ctx.player.isInPowerArmor === cond.value ? 1 : null;
    case 'playerIsGhoul':
      return (ctx.player.isGhoul ?? false) === cond.value ? 1 : null;
    case 'aimingDownSights':
      return (ctx.player.isAimingDownSights ?? false) === cond.value ? 1 : null;
    case 'lifetimeChallengeCompleted': {
      const kingfisherIndex = KINGFISHER_LOCAL_LEGEND_CHALLENGE_IDS.indexOf(
        cond.challengeId as (typeof KINGFISHER_LOCAL_LEGEND_CHALLENGE_IDS)[number],
      );
      if (kingfisherIndex >= 0) {
        const count = ctx.player.localLegendFishingChallengesCompleted ?? 0;
        return kingfisherIndex < count ? 1 : null;
      }
      return (ctx.player.completedChallengeIds ?? []).includes(cond.challengeId) ? 1 : null;
    }
    case 'underAlcoholEffect':
      return (ctx.player.underAlcoholEffect ?? false) === cond.value ? 1 : null;
    case 'drinkTierExact':
      return (ctx.player.drinkTier ?? 0) === cond.tier ? 1 : null;
    case 'foodTierExact':
      return (ctx.player.foodTier ?? 0) === cond.tier ? 1 : null;
    case 'targetDistance': {
      // Continuous distance (raw game units) vs the Close/Far perk-gate
      // thresholds (src/lib/distance.ts) — unset = DEFAULT_DISTANCE_UNITS,
      // strictly between the two gates, so neither fires (the old 'none'
      // default's behavior). Boundary-inclusive both ways.
      const d = ctx.enemy.targetDistance ?? DEFAULT_DISTANCE_UNITS;
      const closeThreshold = ctx.closeThresholdUnits ?? CLOSE_THRESHOLD_UNITS;
      const active = cond.range === 'close' ? d <= closeThreshold : d >= FAR_THRESHOLD_UNITS;
      return active ? 1 : null;
    }
    case 'wornPieceCount': {
      // Phase 3 armor pipeline (engine half, 2026-07-18): count of equipped
      // armor pieces carrying `cond.keyword`, derived from the Armor
      // checklist selections (resolveLoadout → getArmorEffectWornPieceCounts,
      // src/data/armor-modifiers.ts) — never set by the UI directly. Battle-
      // Loader's/Limit-Breaking Armor's tiers are exact-match (count ===
      // cond.count) except the top tier, which is `orMore` (≥5).
      const actual = ctx.player.wornPieceCounts?.[cond.keyword] ?? 0;
      return (cond.orMore ? actual >= cond.count : actual === cond.count) ? 1 : null;
    }
    case 'glowAtLeast':
      // Ghoul Glow meter (Rads AV) at or above the threshold — a plain gate,
      // not a stack scale (Glowing Criticals ≥180, Glow-spend ≥5/≥50).
      return (ctx.player.glow ?? 0) >= cond.min ? 1 : null;
    case 'radResistAtLeast':
      // Player Rad Resistance (RadResistExposure AV) at or above the
      // threshold — a plain gate, not a stack scale (Daisy Cutter's 8
      // discrete +20% steps at 1000/2000/…/8000; the eight ADD modifiers sum
      // through the normal dbm fold, giving the +160% cap at 8000 for free).
      return (ctx.player.playerRadResist ?? 0) >= cond.min ? 1 : null;
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
    ? interpolateCurve(mod.curve.points, PLAYER_STATE_READERS[mod.curve.input](ctx.player, ctx)) *
      mod.curveScale
    : mod.value;
  const scaled = mod.scaledBy ? base * PLAYER_STATE_READERS[mod.scaledBy](ctx.player, ctx) : base;
  return scaled * scale;
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
 * values for every ordinary bucket fold, including effective-weapon rewrites.
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
 * Whether `foldBucket` cross-checks its `base` argument against the bucket's
 * declared `BUCKET_REGISTRY.foldBase`. On in every non-production build, which
 * deliberately INCLUDES the test runner: `import.meta.env` is a Vite construct
 * and is undefined under `bun test`, so gating on `import.meta.env.DEV` alone
 * would leave the check inert exactly where the whole 68-row census is supposed
 * to be proven. Vite statically replaces both expressions at build time, so the
 * branch folds away for production.
 */
const CHECK_FOLD_BASE: boolean = (() => {
  const env = import.meta.env as unknown as Record<string, unknown> | undefined;
  if (typeof env?.DEV === 'boolean') return env.DEV; // Vite dev/prod
  return env?.NODE_ENV !== 'production'; // bun test (env is process.env there)
})();

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
  collect?: BucketTrace[],
): number {
  if (CHECK_FOLD_BASE) {
    const declared = BUCKET_REGISTRY[bucket].foldBase;
    if (typeof declared === 'number' && base !== declared) {
      throw new Error(
        `foldBucket('${bucket}'): passed base ${base} does not match BUCKET_REGISTRY foldBase ${declared}`,
      );
    }
  }

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
    const sets = entries.filter((e) => e.op === 'SET');
    collect.push({
      bucket,
      base,
      result,
      set: sets.length > 0 ? contribution(sets[sets.length - 1]) : null,
      overriddenSets: sets.slice(0, -1).map(contribution),
      mulAdd: entries.filter((e) => e.op === 'MUL_ADD').map(contribution),
      add: entries.filter((e) => e.op === 'ADD').map(contribution),
    });
  }

  return result;
}

/** Fold using the bucket's registry-owned base and output convention. */
export function foldRegisteredBucket(
  modifiers: Modifier[],
  bucket: ConstantBaseBucket,
  ctx: ResolveContext,
  collect?: BucketTrace[],
): number {
  const { foldBase, deBased = false } = BUCKET_REGISTRY[bucket];
  if (typeof foldBase !== 'number') {
    throw new Error(
      `foldRegisteredBucket('${bucket}'): foldBase is ${String(foldBase)}; only constant-base buckets are valid`,
    );
  }
  const result = foldBucket(modifiers, bucket, foldBase, ctx, collect);
  return deBased ? result - foldBase : result;
}

/**
 * Product-fold all active MUL_ADD modifiers on one bucket: ∏(1 + value).
 * Same shape as `foldWholeDamage` (TOFTT/Follow Through) generalized to any
 * bucket — used by player-stats.ts for `stimpakHealMagMult`/
 * `stimpakHealDurationMult`, whose Bethesda "Mod Spell Magnitude"/"Mod Spell
 * Duration" perk entry points compose multiplicatively, unlike the additive
 * `foldOps`/`foldBucket` every other MUL_ADD bucket uses. ADD/SET entries
 * are not expected on these buckets (every current source is a "Multiply
 * Value" perk entry point → MUL_ADD) and are silently ignored, same as
 * `foldWholeDamage` ignoring anything but `wholeDamage`'s own shape.
 */
export function foldBucketProduct(
  modifiers: Modifier[],
  bucket: Bucket,
  ctx: ResolveContext,
  collect?: TraceContribution[],
): number {
  let mult = 1;
  for (const mod of modifiers) {
    if (mod.bucket !== bucket || mod.op !== 'MUL_ADD') continue;
    const value = effectiveValue(mod, ctx);
    if (value === null) continue;
    mult *= 1 + value;
    collect?.push({ source: mod.source, op: mod.op, value });
  }
  return mult;
}

/**
 * Separate stacking whole-damage multipliers (TOFTT, Follow Through):
 * each active modifier contributes its own ×(1 + value) term.
 */
export function foldWholeDamage(
  modifiers: Modifier[],
  ctx: ResolveContext,
  collect?: TraceContribution[],
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
