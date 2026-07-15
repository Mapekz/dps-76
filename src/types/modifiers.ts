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
   * Flat AP/sec ADD on the base regen rate (AV ActionPointsRate 0x000002D8 —
   * Company Tea's FortifyActionPointRegenFood +10, Nukashine_APRegen,
   * Alcohol_APRegen...). Distinct from `apRegen` (the % AV
   * ActionPointsRateMult): consumed by `ap-economy.ts` as
   * `regenPerSec = (4.0 + Σ apRegenFlat) × (1 + Σ apRegen)` — the AV-standard
   * composition, documented as an assumption (docs/assumptions.md).
   */
  | 'apRegenFlat'
  /**
   * Flat ADD to the max AP pool (Peak Value Modifiers on AV ActionPoints
   * 0x000002D5 — FortifyActionPointsFood/Alcohol, magazine fortifies,
   * Mutation_ReduceActionPoints's Scaly Skin penalty). Instant Value-Modifier
   * restores on the same AV are out of scope by design (same rule as
   * RestoreHealthFood on the Health AV). Consumed by `ap-economy.ts`'s
   * `maxAp = 60 + 10×AGI + Σ apMax`.
   */
  | 'apMax'
  /**
   * AP-over-time granted per VATS crit (Conductor's: 20 AP/s for
   * `durationSec` 5 — SPEL Legendary_Weapon_ConductorsPlayerRestoreSpell's
   * duration-5 Value Modifier, distinct from its instant +10 `apPerCrit`
   * half). REFRESH-ONLY: a new crit restarts the window, never stacks —
   * mirrors the dotDamage convention. Steady state in `ap-economy.ts`:
   * rate × min(1, durationSec × critsPerSec).
   */
  | 'apCritHot'
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
  /**
   * SPECIAL stat bonuses (consumables, legendary +STR...), folded uniformly
   * by player-stats.ts into `special.<key>`. Every one of the seven feeds a
   * real downstream consumer: Strength → the melee term + its curve input,
   * Luck → crit-meter fill, Endurance → max HP + its curve input,
   * Intelligence/Charisma → their curve inputs, Agility → the VATS AP pool,
   * and Perception → no paper-damage term yet, but its folded value is the
   * one `StatSummary` renders and highlights when buffed — see
   * BUCKET_REGISTRY below for the exact wiring.
   */
  | 'specialStrength'
  | 'specialPerception'
  | 'specialEndurance'
  | 'specialCharisma'
  | 'specialIntelligence'
  | 'specialAgility'
  | 'specialLuck';

/**
 * Which fold mechanism consumes a Bucket, and whether that fold's result
 * actually reaches anything — the **Bucket Regime** (CONTEXT.md). The `Bucket`
 * union promises one normalized shape for every damage source, but WHICH
 * function folds a given bucket (and whether the result does anything) is
 * otherwise only discoverable by grepping resolve.ts/paper-damage.ts/
 * crit-meter.ts/ap-economy.ts/player-stats.ts/effective-weapon.ts by hand.
 * This is the one table that answers both questions; `WEAPON_STAT_BUCKETS`
 * (effective-weapon.ts) and `INERT_ENGINE_BUCKETS` (omods.ts, the picker's
 * "no engine effect" badge) are DERIVED from it below instead of hand-
 * maintained, so neither can silently drift from what the engine actually
 * wires. Add a row here whenever a new Bucket is added to the union above —
 * `assertBucketRegistryIsExhaustive` (modifiers.test.ts) enforces it.
 */
export type BucketRegime =
  /** Per-hit paper damage — paper-damage.ts `computePaperDamage`. */
  | 'damageFold'
  /** Damage-over-time — paper-damage.ts `computeDotDps`. */
  | 'dot'
  /** Rewrites an effective-weapon field, then is dropped from the modifier list — effective-weapon.ts `buildEffectiveWeapon`. */
  | 'weaponStat'
  /** VATS crit-meter fill/consumption — crit-meter.ts `computeCritMeter`. */
  | 'critEconomy'
  /** VATS AP pool/regen/drain — scenarios.ts, folded into ap-economy.ts `computeApEconomy`. */
  | 'apEconomy'
  /** Effective SPECIAL / max HP — player-stats.ts `derivePlayerStats`. */
  | 'playerStat'
  /** Folded once per scenario input and threaded on `ResolveContext.onslaughtMaxStacks` rather than re-folded per damage term. */
  | 'bootstrap'
  /** No fold consumes this bucket at all (as opposed to a fold whose result nothing reads — see `hasEngineEffect`). */
  | 'unfolded';

export interface BucketRegimeEntry {
  regime: BucketRegime;
  /**
   * False when the fold happens but its result reaches nothing further
   * (specialPerception: folded into `special.perception`, never read again)
   * — distinct from `regime: 'unfolded'`, where no fold happens at all.
   * `INERT_ENGINE_BUCKETS` = every bucket where this is false OR regime is
   * 'unfolded'.
   */
  hasEngineEffect: boolean;
  /** Where this bucket is folded (function/module), or why it has no effect. */
  foldedBy: string;
}

/**
 * `hasEngineEffect: false` above means the fold happens but nothing downstream
 * reads its result at all — e.g. `armorPen` extracts a real value but no
 * enemy-DR model consumes it yet. Contrast the `specialX` buckets: every one
 * of them, including Perception, feeds `DerivedPlayerStats.special` and is
 * rendered by `StatSummary`, so all seven are `hasEngineEffect: true` even
 * though Perception has no paper-damage consumer.
 */

export const BUCKET_REGISTRY: Readonly<Record<Bucket, BucketRegimeEntry>> = {
  baseDamage: { regime: 'damageFold', hasEngineEffect: true, foldedBy: 'paper-damage.ts computePaperDamage (per-component base scaling, before the dbm parenthesis)' },
  dbm: { regime: 'damageFold', hasEngineEffect: true, foldedBy: 'paper-damage.ts computePaperDamage (dbm parenthesis)' },
  critDmgBase: { regime: 'damageFold', hasEngineEffect: true, foldedBy: 'paper-damage.ts totalCritMult' },
  critDmgBonus: { regime: 'damageFold', hasEngineEffect: true, foldedBy: 'paper-damage.ts totalCritMult' },
  sneakBase: { regime: 'damageFold', hasEngineEffect: true, foldedBy: 'paper-damage.ts totalSneakMult' },
  sneakBonus: { regime: 'damageFold', hasEngineEffect: true, foldedBy: 'paper-damage.ts totalSneakMult' },
  powerAttackBonus: { regime: 'damageFold', hasEngineEffect: true, foldedBy: 'paper-damage.ts computePaperDamage (dbm parenthesis)' },
  weakpointBonus: { regime: 'damageFold', hasEngineEffect: true, foldedBy: 'paper-damage.ts computePaperDamage (outer multiplier)' },
  wholeDamage: { regime: 'damageFold', hasEngineEffect: true, foldedBy: 'resolve.ts foldWholeDamage (outer multiplier)' },
  limbDamage: { regime: 'unfolded', hasEngineEffect: false, foldedBy: 'none — limb targeting not modeled (STAT_DmgLimbs plumbing extracted, e.g. Crippling\'s override, but no consumer yet)' },
  bashDamage: { regime: 'unfolded', hasEngineEffect: false, foldedBy: 'none — bash attacks not modeled (STAT_DmgBash extracted, no consumer yet)' },
  explosivePayload: { regime: 'damageFold', hasEngineEffect: true, foldedBy: 'paper-damage.ts computePaperDamage (explosive-twin branch)' },
  critFill: { regime: 'critEconomy', hasEngineEffect: true, foldedBy: 'crit-meter.ts computeCritMeter' },
  critConsumption: { regime: 'critEconomy', hasEngineEffect: true, foldedBy: 'crit-meter.ts computeCritMeter' },
  fireRateSpeed: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.speed rewrite)' },
  isAutomatic: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.isAutomatic rewrite)' },
  animDurationSec: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.animDurationSec rewrite)' },
  projectileCount: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.projectileCount rewrite); no damage term multiplies per-projectile yet, but Shotgun Champ\'s curve reads the folded value via the projectileCount CurveInput' },
  ammoCapacity: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.capacity rewrite); feeds sustained DPS (sustain.ts)' },
  reloadSpeed: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.reloadSpeed rewrite); feeds sustained DPS (sustain.ts)' },
  vatsApCost: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.apCost rewrite); feeds ap-economy.ts' },
  apRegen: { regime: 'apEconomy', hasEngineEffect: true, foldedBy: 'scenarios.ts, folded into ap-economy.ts computeApEconomy' },
  apPerCrit: { regime: 'apEconomy', hasEngineEffect: true, foldedBy: 'scenarios.ts, folded into ap-economy.ts computeApEconomy' },
  apRegenFlat: { regime: 'apEconomy', hasEngineEffect: true, foldedBy: 'scenarios.ts, folded into ap-economy.ts computeApEconomy (flat AP/sec term)' },
  apMax: { regime: 'apEconomy', hasEngineEffect: true, foldedBy: 'scenarios.ts, folded into ap-economy.ts computeApEconomy (AP pool size)' },
  apCritHot: { regime: 'apEconomy', hasEngineEffect: true, foldedBy: 'scenarios.ts (per-modifier collect — durationSec matters), ap-economy.ts computeApEconomy (refresh-only HoT term)' },
  onslaughtMaxStacks: { regime: 'bootstrap', hasEngineEffect: true, foldedBy: 'scenarios.ts / effective-weapon.ts — folded once, threaded on ResolveContext.onslaughtMaxStacks; caps the onslaught StackCounter and onslaughtStacks CurveInput' },
  addDamageComponent: { regime: 'unfolded', hasEngineEffect: false, foldedBy: 'none — no reader anywhere in the codebase; likely superseded by explosivePayload/materializeDamageTypeComponents' },
  armorPen: { regime: 'unfolded', hasEngineEffect: false, foldedBy: 'none — extracted but inert until enemy DR lands' },
  dotDamage: { regime: 'dot', hasEngineEffect: true, foldedBy: 'paper-damage.ts computeDotDps' },
  maxHealth: { regime: 'playerStat', hasEngineEffect: true, foldedBy: 'player-stats.ts derivePlayerStats (245 + 5xEND + this fold)' },
  specialStrength: { regime: 'playerStat', hasEngineEffect: true, foldedBy: 'player-stats.ts derivePlayerStats; feeds paper-damage.ts strengthTerm + the strength CurveInput (Debilitator\'s)' },
  specialPerception: { regime: 'playerStat', hasEngineEffect: true, foldedBy: 'player-stats.ts derivePlayerStats; no CurveInput/formula reads it, but the folded value is what StatSummary renders (and highlights when buffed) — same as the other six SPECIALs' },
  specialEndurance: { regime: 'playerStat', hasEngineEffect: true, foldedBy: 'player-stats.ts derivePlayerStats; feeds the maxHealth formula + the endurance CurveInput (Lifegiver\'s)' },
  specialCharisma: { regime: 'playerStat', hasEngineEffect: true, foldedBy: 'player-stats.ts derivePlayerStats; feeds the charisma CurveInput (Peace Maker\'s)' },
  specialIntelligence: { regime: 'playerStat', hasEngineEffect: true, foldedBy: 'player-stats.ts derivePlayerStats; feeds the intelligence CurveInput (Science!, Pyro-Technician\'s, Cryologist\'s)' },
  specialAgility: { regime: 'playerStat', hasEngineEffect: true, foldedBy: 'player-stats.ts derivePlayerStats; feeds ap-economy.ts computeApEconomy\'s AP pool size' },
  specialLuck: { regime: 'playerStat', hasEngineEffect: true, foldedBy: 'player-stats.ts derivePlayerStats; feeds crit-meter.ts computeCritMeter\'s fill rate' },
};

/** Buckets whose fold rewrites an effective-weapon field rather than feeding a damage term — derived from BUCKET_REGISTRY. */
export const WEAPON_STAT_BUCKETS: ReadonlySet<Bucket> = new Set(
  (Object.entries(BUCKET_REGISTRY) as Array<[Bucket, BucketRegimeEntry]>)
    .filter(([, entry]) => entry.regime === 'weaponStat')
    .map(([bucket]) => bucket)
);

/** Buckets with no engine effect today — derived from BUCKET_REGISTRY; drives the OMOD/consumable picker's 'inert' badge. */
export const INERT_ENGINE_BUCKETS: ReadonlySet<Bucket> = new Set(
  (Object.entries(BUCKET_REGISTRY) as Array<[Bucket, BucketRegimeEntry]>)
    .filter(([, entry]) => !entry.hasEngineEffect)
    .map(([bucket]) => bucket)
);

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
  /**
   * WEAP anim-type enum (Data."Weapon Type", GetWeaponAnimType()) at or below
   * `max`. Martial Artist's melee gate is ≤6: melee/unarmed anim types are
   * 0/1/5/6 while every true ranged weapon is 9 (Gun) and thrown 10 (Grenade)
   * — verified by a 2026-07-14 sweep of all 282 roster weapons. Notably
   * excludes gun-animated melee (Paddle Ball, War Shrike), which a keyword
   * gate would wrongly include.
   */
  | { kind: 'weaponAnimTypeMax'; max: number }
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
  /**
   * Player teammate count == count, or ≥ count with orMore (Fencer's exact
   * tiers — GetPlayerTeammateCount; teammates assumed in range. Herd
   * Mentality's IsMemberOfAPlayerTeam gate translates to count 0 (solo) /
   * count 1 + orMore (in a team) — "in a team" is approximated as ≥1
   * teammate, consistent with Strange in Numbers' derivation;
   * docs/assumptions.md "Mutation penalties & Class Freak").
   */
  | { kind: 'teammateCount'; count: number; orMore?: boolean }
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
  /**
   * value × the equipped weapon's EFFECTIVE per-shot VATS AP cost (Number
   * Cruncher's "2% damage per AP cost" — hidden AV STAT_DmgAP 0x00801C9F,
   * consumed engine-side via Default Object APDamageBonus_DO, no plumbing
   * perk). Reads `ctx.weapon.apCost`, i.e. the base WEAP cost after the
   * weapon-OMOD `vatsApCost` fold — user-confirmed it improves free aim too,
   * so no VATS gate. Armor-side AP-cost reductions (Scanner's 4★) use an
   * entry point that does NOT feed this scaling and must stay out of this
   * input when armor modeling lands (dps-todos/armor-mods-outgoing.md).
   */
  | { kind: 'scaledByWeaponApCost' }
  /** value × stackCount (clamped to max) from the matching player-state counter. */
  | { kind: 'stacks'; counter: StackCounter; max: number }
  /** Mutation value tier: false = base values, true = Strange in Numbers boosted (+25%). */
  | { kind: 'strangeInNumbers'; value: boolean }
  /**
   * Class Freak rank (0–3, derived from the equipped perk loadout) within
   * [min, max] inclusive. Two ESM shapes both land here: mutation-penalty
   * tier variants emitted app-side by `applyClassFreakPenaltyScaling`
   * (min == max — exact tier), and HasPerk(ClassFreak0N) rows on granted
   * penalty perks (Grounded's Mod Weapon Attack Damage tiers): =1 → rank ≥ N
   * ({min: N, max: 3}), =0 → rank < N ({min: 0, max: N−1}); rows AND
   * together into exact tiers.
   */
  | { kind: 'classFreakRank'; min: number; max: number }
  | { kind: 'perAddiction'; max: number }
  | { kind: 'inPowerArmor'; value: boolean }
  /** Character-type gate (GetIsPlayerGhoul): Gourmand's is human-only, Glowing Criticals ghoul-only. */
  | { kind: 'playerIsGhoul'; value: boolean }
  /**
   * Player is fully hydrated (SURV_Thirst below the WellHydrated threshold
   * 720 — SURV_Thirst_Ability's top tier). Gates the hand-authored hydration
   * AP-regen baseline (+35%) and Rejuvenated's boosts (player-baseline.ts /
   * perk-overrides.ts). Default ON (optimal play); lower hydration tiers
   * (25/15/15%) are not modeled — the toggle is all-or-nothing
   * (docs/assumptions.md "Hydration AP regen").
   */
  | { kind: 'hydrated'; value: boolean }
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
  | 'consumable'
  /** Withdrawal penalties from a selected-and-unsuppressed addiction (addictions.json). */
  | 'addiction'
  /**
   * The weapon's own intrinsic modifier (WEAP.Enchantment chase — Cremator's
   * built-in fire DoT, bladed melee weapons' innate bleed, ...), as opposed to
   * an OMOD/perk/buff a player equips. `computeDotDps` (paper-damage.ts) folds
   * these first to derive the intrinsic per-damage-type dotDamage base that
   * OMOD-sourced dotDamage modifiers stack onto (or, via a SET override,
   * replace) — see docs/assumptions.md "Weapon-intrinsic DoT & OMOD
   * replacement".
   */
  | 'weapon';

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
   * The player's (buff-folded) Strength stat — AV 0x000002C2. The
   * Debilitator's limb-damage-vs-STR curve reads it (mirrors endurance/intelligence).
   */
  | 'strength'
  /**
   * The player's (buff-folded) Charisma stat — AV 0x000002C5. The
   * Peace Maker's explosive-damage-vs-CHA curve reads it.
   */
  | 'charisma'
  /**
   * The shared Bullet Storm / Heavy Gunner stack counter (ammo-spent stacks,
   * max 10) — AV 0x0000039B, no AVIF record (hardcoded slot, mirrors
   * onslaughtStacks). Distinct CurveInput from the `bulletStorm` StackCounter
   * (same underlying `PlayerConditions.bulletStormStacks` field, different
   * type space) because ValueCurve.input is typed as CurveInput, not
   * StackCounter.
   */
  | 'bulletStormStacks'
  /**
   * Number of projectiles the equipped (effective, OMOD-folded) weapon fires
   * per shot — AV 0x00000398, no AVIF record. Shotgun Champ's damage-vs-
   * crippled curve reads it (+10%/projectile, gated by `perCrippledLimb` with
   * `max: 1` as a boolean "target has a crippled limb" check, not a
   * per-limb-count scale like Tormentor's).
   */
  | 'projectileCount'
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
