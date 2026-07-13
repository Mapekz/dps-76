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
 * - fireRateSpeed / isAutomatic / projectileCount / vatsApCost / addDamageComponent:
 *   weapon-stat rewrites from OMODs (receiver speed, Two Shot, Explosive
 *   prefix, V.A.T.S. Optimized's AP-cost cut).
 * - apRegen / apPerCrit: VATS AP steady-state economy (Stage B,
 *   `ap-economy.ts`) — not part of the paper-damage fold itself.
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
  // NOTE: no explosion-damage bucket exists — the June 2026 patch made
  // explosion bonuses (Demolition Expert's STAT_DmgExplosive, the
  // 'Mod Player Explosion Damage' entry point) ADDITIVE inside the general
  // dbm parenthesis, scoped via damageTypeScope ['explosive'] (matches
  // fromExplosion components and explosive twins). The old `explosionMult`
  // bucket (a separate multiplier on finished explosion damage) modeled the
  // pre-patch formula and was removed 2026-07-13.
  /** Bash-attack damage (STAT_DmgBash — Basher's) — inert until bash attacks are modeled. */
  | 'bashDamage'
  /** Fraction of a component's damage that spawns an explosive twin (LGND_ExplosivePayload — Explosive), folded per-component in paper-damage.ts. */
  | 'explosivePayload'
  | 'critFill'
  | 'critConsumption'
  | 'fireRateSpeed'
  | 'isAutomatic'
  /**
   * Rewrite of the weapon's automatic-fire animation-cycle length in seconds
   * (the divisor `getFireRate` uses for automatic weapons; default 0.11 when
   * unset). Hand-authored only — no ESM property encodes this; Havok
   * animation timing isn't parseable. Confirmed real per-weapon/per-OMOD
   * exceptions (2026-07-13, in-game Pip-Boy Fire Rate readings): Gatling Gun
   * (weapon-level, `overrides/corrections.ts`) and Gatling Laser Charging
   * Barrels (OMOD-level, `overrides/corrections.ts` omodModifierAdditions).
   */
  | 'animDurationSec'
  | 'projectileCount'
  /** Magazine capacity rewrite from OMODs (drum/extended magazines) — feeds sustained DPS. */
  | 'ammoCapacity'
  /** Reload speed multiplier rewrite from OMODs (quick-eject magazines) — feeds sustained DPS. */
  | 'reloadSpeed'
  /**
   * Rewrite on the weapon's per-shot VATS AP cost (WEAP "Action Point Cost").
   * V.A.T.S. Optimized MUL_ADD −0.35 (OMOD property AttackActionPointCost).
   * Folded over the weapon base the same way as ammoCapacity/reloadSpeed
   * (`effective-weapon.ts`); consumed by `ap-economy.ts` (Stage B).
   */
  | 'vatsApCost'
  /**
   * Additive % on the base AP regen rate (perks — Action Boy/Girl's
   * ActorValue ActionPointsRateMult). Decimals: 0.45 = +45%. Consumed by
   * `ap-economy.ts`'s `regenPerSec = 4.0 × (1 + Σ apRegen)`.
   */
  | 'apRegen'
  /**
   * Flat AP restored per VATS crit (Conductor's: 110 = 10 instant + 100 over
   * 5s, hand-supplied in `overrides/legendary-values.ts` — the entry point is
   * script-driven and not extractor-modeled). Consumed by `ap-economy.ts`.
   */
  | 'apPerCrit'
  /**
   * Flat ADD contributions to the shared Onslaught stack cap (Perk Entry
   * Point 190 "Mod Max Consecutive Hits Allowed" — Guerrilla/Gunslinger
   * Expert+Master, Furious, Pounder's, Splinter's). Base 0 (no AVIF exists
   * for the raw counter — inferred, docs/assumptions.md "Onslaught").
   * Folded ONCE per scenario input (`scenarios.ts`) and carried on
   * `ResolveContext.onslaughtMaxStacks`, which both the `onslaught` stack
   * counter and the `onslaughtStacks` curve input clamp against.
   */
  | 'onslaughtMaxStacks'
  | 'addDamageComponent'
  /** Armor penetration (Anti-Armor's ActorValues property) — extracted but inert until enemy DR lands. */
  | 'armorPen'
  /** Damage-over-time from Damage-archetype MGEFs (bleed/burn/shock mods) — refresh-only steady-state dmg/sec, summed into `ScenarioResult.dotDps`. */
  | 'dotDamage'
  /**
   * Flat max-HP bonuses (MGEF Peak Value Modifiers on AV HealthBonus
   * 0x007B74E4 — Lifegiver, Overeater-side effects...). Folded in
   * `resolveLoadout` over the base-HP formula 245 + 5×END
   * (docs/assumptions.md "Max HP") to derive `PlayerConditions.maxHealth`.
   */
  | 'maxHealth'
  /** SPECIAL stat bonuses (consumables, legendary +STR...). Strength/Luck feed the engine; the rest are stored for perk-SPECIAL scaling. */
  | 'specialStrength'
  | 'specialPerception'
  | 'specialEndurance'
  | 'specialCharisma'
  | 'specialIntelligence'
  | 'specialAgility'
  | 'specialLuck';

export type WeaponClass = Weapon['weaponClass'];
export type DamageType = Weapon['components'][number]['damageType'];

export type StackCounter = 'tenderizer' | 'onslaught' | 'bulletStorm' | 'adrenaline';

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
  /** OR-group of enemy race/type gates (Ghoul Slayer's: FeralGhoul OR Ghoul) — inert until enemy modeling lands. */
  | { kind: 'enemyTypeAny'; keywordsOrRaces: string[] }
  | { kind: 'sneaking' }
  | { kind: 'powerAttack' }
  /** The hit is a VATS critical (symmetric with sneaking/powerAttack). */
  | { kind: 'crit' }
  | { kind: 'healthBelowPct'; pct: number }
  /** ENEMY health at or below pct (Executioner's: ≤40, threshold from GLOB LGND_ExecuteHealthThreshold). */
  | { kind: 'enemyHealthBelowPct'; pct: number }
  /** ENEMY health at or above pct (Instigating: ≥60 — the ESM's post-rework gate). */
  | { kind: 'enemyHealthAbovePct'; pct: number }
  /** value × enemy crippled-limb count, clamped (Bully's — STAT_DmgPerCrippled). */
  | { kind: 'perCrippledLimb'; max: number }
  /** The fired round is the magazine's last (Last Shot — GetLoadedAmmoCount()=0 + IsNextClipLastShot). */
  | { kind: 'lastRound' }
  /** Target carries ≥1 active effect with this keyword (Pyromaniac's: DamageTypeFire; Viper's: DamageTypePoison). */
  | { kind: 'enemyHasActiveEffect'; keyword: string }
  /** Enemies in the engaged group == count, or ≥ count for the top tier (Encircler's — GetGroupTargetCount). */
  | { kind: 'enemyGroupCount'; count: number; orMore?: boolean }
  /** Player teammate count == count (Fencer's — GetPlayerTeammateCount; teammates assumed in range). */
  | { kind: 'teammateCount'; count: number }
  /**
   * Kill-streak count == count, exact-match tier (Thrill-Seeker's 10 discrete
   * GetValue(killStreak) Equal To N rows — 0.03×N magnitude per tier, distinct
   * from the `stacks`/curve-scaled kill-streak sources). Evaluated against
   * `PlayerConditions.adrenalineStacks` (the app's kill-streak counter).
   */
  | { kind: 'killStreakCount'; count: number }
  /** value × missing-health fraction, capped (Bloodied: up to ×0.95 of the listed max). */
  | { kind: 'scaledByMissingHealth'; cap: number }
  /** value × min(capsOnHand / capsForMax, 1) (Aristocrat's). */
  | { kind: 'scaledByCaps'; capsForMax: number }
  /** value × stackCount (clamped to max) from the matching player-state counter. */
  | { kind: 'stacks'; counter: StackCounter; max: number }
  /** Mutation value tier: false = base values, true = Strange in Numbers boosted (+25%). */
  | { kind: 'strangeInNumbers'; value: boolean }
  | { kind: 'perAddiction'; max: number }
  | { kind: 'inPowerArmor'; value: boolean }
  /** Character-type gate (GetIsPlayerGhoul): Gourmand's is human-only, Glowing Criticals ghoul-only. */
  | { kind: 'playerIsGhoul'; value: boolean }
  /**
   * Target range bucket (Guerrilla: close, Down Ranger / Sniper's: far). The
   * close/far gate is native engine code — no distance condition rows exist
   * anywhere in ESM data; the only threshold on record is GMST
   * fDistanceForCloseDamage = 850 units (≈12m, approximate). The far
   * threshold isn't in data at all. See docs/assumptions.md.
   */
  | { kind: 'targetDistance'; range: 'close' | 'far' }
  /**
   * Ghoul Glow meter (the Rads AV, 0x000002E1) at or above `min` — absolute
   * value, 0..maxHealth (max Glow = max HP). Gates like Glowing Criticals'
   * ≥180 and Glow-spend checks (≥5/≥50 via GHL_*GlowUse GLOBs).
   */
  | { kind: 'glowAtLeast'; min: number }
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
  | 'healthCurrent' // ABSOLUTE current HP (Juggernaut's: x 0→1000) — AV 0x000002D4
  | 'enemyDamageResist' // enemy DR (DamageUnarmored) — AV 0x000002E3; reads 0 until enemy defenses land
  | 'itemLevel' // weapon item level — level-scaled OMOD properties (heated melee mods' AttackDamage curves)
  | 'mutationCount' // owned mutations (Mutant's) — AV MutationCount 0x006C2DBA; derived from the selected mutation list
  | 'hungerThirstTier' // food/drink fullness tier (Gourmand's) — AV HungerThirstTier 0x006D37DC
  | 'feralTier' // ghoul feral meter tier (Lucid, Feral's) — AV GHL_FeralTier 0x007A767A
  /**
   * The shared Onslaught stack counter (Whacker Smacker reads it directly as
   * a curve input; Guerrilla/Gunslinger Expert+Master's per-stack SPELs feed
   * the same AV) — raw engine AV 0x00000395, no AVIF record (hardcoded
   * slot). Reader clamps `min(effective player stacks, ctx.onslaughtMaxStacks)`
   * — see `resolve.ts` and docs/assumptions.md "Onslaught".
   */
  | 'onslaughtStacks'
  /**
   * The player's (buff-folded) Endurance stat — AV 0x000002C4. Lifegiver's
   * max-HP curve reads it (curve x = END points, y = flat HP).
   */
  | 'endurance'
  /**
   * The player's (buff-folded) Intelligence stat — AV 0x000002C6.
   * Science!/Pyro-Technician's/Cryologist's damage-vs-INT curves read it.
   */
  | 'intelligence'
  /**
   * Equipped weapon condition as a fraction (Polished): 1.0 = 100% (full
   * condition), 2.0 = 200% (over-repaired max). No AVIF exists for this axis —
   * the effect-level curve input is the engine function
   * GetEquippedWeaponHealthPercent, proven by the cut DEL_Legendary_Weapon_
   * PolishedPerk predecessor record (docs/assumptions.md).
   */
  | 'weaponCondition';

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
  /** Effect duration in seconds (DoT ticks, timed buffs) — carried for the future DoT model, unused by the engine. */
  durationSec?: number;
} & ModifierValue;

/** A modifier fragment without its id/source (as produced by MGEF translation). */
export type ModifierFragment = {
  bucket: Bucket;
  op: ModOp;
  conditions: Condition[];
  durationSec?: number;
} & ModifierValue;
