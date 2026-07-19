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
 * - critDmgBonusScale: multiplier folded over base 1.0 and applied to the
 *   folded critDmgBonus total (not the base crit mult) — The V.A.T.S.
 *   Unknown's random per-crit roll only.
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
  | 'critDmgBonusScale'
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
  /**
   * Rewrite of the weapon's semi-auto attack-delay window in seconds (the
   * divisor `getFireRate` uses for non-automatic weapons; default 0.5 when
   * unset — `weapon.animDelaySec`, sourced from WEAP "Attack Delay Seconds").
   * Unlike `animDurationSec`, this IS ESM-provable: OMOD `Data.Properties[]`
   * `AttackDelaySec` (MUL_ADD, verified 2026-07-15 on Salt of the Earth —
   * mod_Custom_SaltOfTheEarth's July-10-patch delay-penalty retune, +100%→+50%
   * of base, i.e. raw value 1.0→0.5).
   */
  | 'animDelaySec'
  | 'projectileCount'
  /** Magazine capacity rewrite from OMODs (drum/extended magazines) — feeds sustained DPS. */
  | 'ammoCapacity'
  /** Reload speed multiplier rewrite from OMODs (quick-eject magazines) — feeds sustained DPS. */
  | 'reloadSpeed'
  /**
   * Probability the reload is skipped entirely (Quick Hands, Wild West Hands).
   * Folded via independent-probability union in effective-weapon.ts; consumed by
   * sustain.ts as a multiplicative reload-time cut, separate from reloadSpeed.
   */
  | 'reloadSkipChance'
  /**
   * Probability a shot does not net-consume ammo (Tesla Science 5, Fortunate
   * magazine mods). Folded via independent-probability union in
   * effective-weapon.ts; consumed by sustain.ts as effective-capacity stretch.
   */
  | 'ammoFreeChance'
  /**
   * Rewrite on the weapon's per-shot VATS AP cost (WEAP "Action Point Cost").
   * V.A.T.S. Optimized MUL_ADD −0.35 (OMOD property AttackActionPointCost).
   * Folded over the weapon base the same way as ammoCapacity/reloadSpeed
   * (`effective-weapon.ts`); consumed by `ap-economy.ts` (Stage B).
   */
  | 'vatsApCost'
  /**
   * Rewrite/grant of the weapon's charge-time window (OMOD `FullPowerSeconds`
   * SET — tesla/gamma/laser charging barrels turn ON charging that the base
   * WEAP doesn't have; Gauss-family barrels retune an existing one). Folded
   * over `weapon.fullPowerSeconds` the same way as ammoCapacity/reloadSpeed
   * (`effective-weapon.ts`); gates `weaponCharges()` and feeds
   * `resolvedChargeTimeSec` (src/lib/charge.ts), consumed by fire-rate.ts.
   */
  | 'chargeFullPowerSec'
  /**
   * Rewrite/grant of the weapon's full-charge damage bonus (OMOD
   * `FullPowerDamageMult` SET — a bonus ADDED over 1.0×, not a replacement;
   * see `fullPowerDamageMult` on Weapon). Folded over
   * `weapon.fullPowerDamageMult` the same way as ammoCapacity/reloadSpeed
   * (`effective-weapon.ts`); consumed by `chargeDamageMultiplier`
   * (src/lib/charge.ts).
   */
  | 'chargeFullPowerDamageMult'
  /**
   * Rewrite of the weapon's minimum engagement range in raw game units (WEAP
   * Data "Min Range" — Hunting Rifle 2612). Sourced from 435 OMODs in the
   * 20260710 dump (verified live 2026-07-18): mostly barrels
   * (`_PARENT_mod_WEAPON_Barrel_Long_Range` 0x0027ABFA: MUL_ADD 0.5 on both
   * MinRange/MaxRange), but also muzzles/receivers with small +/- tweaks;
   * scopes carry none. Folded over `weapon.minRange` in `effective-weapon.ts`
   * `buildEffectiveWeapon` (same pattern as `ammoCapacity`/`reloadSpeed`);
   * feeds `rangeFalloffMult` (`src/lib/distance.ts`), folded into
   * `outerMult`/`explosiveOuterMult` in `paper-damage.ts`.
   */
  | 'weaponMinRange'
  /**
   * Rewrite of the weapon's maximum effective range in raw game units (WEAP
   * Data "Max Range" — Hunting Rifle 5225). Same OMOD sources as
   * `weaponMinRange`; same fold/consumer.
   */
  | 'weaponMaxRange'
  /**
   * Rewrite of the damage multiplier applied beyond `weaponMaxRange` (WEAP
   * Data "Damage - OutOfRangeMult" — Hunting Rifle 0.5). Rare on OMODs: only
   * one in the 20260710 dump (`mod_PlasmaGun_barrel_Flamer_Abraxo`, SET 0.7),
   * verified live 2026-07-18. Same fold/consumer as `weaponMinRange`.
   */
  | 'weaponOutOfRangeMult'
  /**
   * Additive % multiplier on the base AP regen rate (Action Boy/Girl/Ghoul's
   * ActorValue ActionPointsRateMult, hydration, Lone Wanderer). Decimals:
   * 0.45 = +45%. All active sources stack additively into ONE multiplier on
   * the race-base rate — `ap-economy.ts`'s
   * `regenPerSec = maxAp × (raceBase + Σ apRegenFlat)/100 × (1 + Σ apRegen)`.
   */
  | 'apRegen'
  /**
   * Flat AP restored per VATS crit (Conductor's: 110 = 10 instant + 100 over
   * 5s, hand-supplied in `overrides/legendary-values.ts` — the entry point is
   * script-driven and not extractor-modeled). Consumed by `ap-economy.ts`.
   */
  | 'apPerCrit'
  /**
   * ADD onto the race base of AV ActionPointsRate 0x000002D8 (Company Tea's
   * FortifyActionPointRegenFood +10, Nukashine_APRegen, Alcohol_APRegen...).
   * UNITS: AV points = percent of Max AP regenerated per second, stacking
   * additively with the race `Properties` base (HumanRace 6.0,
   * PowerArmorRace 3.0) BEFORE the `apRegen` multiplier applies — see
   * `ap-economy.ts` and docs/assumptions.md "VATS AP economy".
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
  /**
   * Reverse-onslaught marker (Gunslinger Master: regen stacks over time,
   * consume per hit-event instead of build-on-hit). Folded once in
   * `scenarios.ts`; `folded > 0` activates reverse mode for the shared
   * counter (engine hardcode — not in ESM, docs/assumptions.md "Onslaught").
   */
  | 'onslaughtReverse'
  /**
   * Flat ADD contributions to the shared Bullet Storm stack cap (Bullet
   * Storm perk +10, Bringing Out the Big Guns +10, Foundation's Vengeance +5
   * at ≤25% HP). Base 0 (no AVIF exists for the raw counter — inferred,
   * docs/assumptions.md "Bullet Storm"). Folded ONCE per scenario input
   * (`scenarios.ts`) AND once in the weapon-stat bootstrap fold
   * (`effective-weapon.ts`, so Bullet Storm's own reload-speed curve sees the
   * cap) and carried on `ResolveContext.bulletStormMaxStacks`, which both the
   * `bulletStorm` stack counter and the `bulletStormStacks` curve input
   * clamp against.
   */
  | 'bulletStormMaxStacks'
  /**
   * Flat ADD contributions to the shared Bullet Storm stack FLOOR (Resolute
   * Veteran +5). Base 0. Folded at the same two sites as
   * `bulletStormMaxStacks` and carried on `ResolveContext.bulletStormMinStacks`
   * — `effectiveBulletStormStacks` clamps to `[min, max]`
   * (docs/assumptions.md "Bullet Storm").
   */
  | 'bulletStormMinStacks'
  /**
   * Fraction of Bullet Storm stacks kept on reload (default 0 — stacks are
   * fully lost; Lock and Load r1 sets 0.5). Folded ONCE per scenario input
   * (`scenarios.ts`) and consumed only by the sustained-fire average model
   * (`bulletstorm.ts` `bulletStormAvgStacks`) — the manual stacks slider
   * ignores it (docs/assumptions.md "Bullet Storm").
   */
  | 'bulletStormRetention'
  /**
   * Final Word's +1 Bullet Storm stack on kill (on-kill entry point) —
   * inert: kills are unknowable in steady-state paper DPS.
   */
  | 'bulletStormOnKill'
  /**
   * Valkyrie's per-Bullet-Storm-stack spin-up ramp — inert: spin-up/rampup
   * timing isn't modeled.
   */
  | 'bulletStormSpinUp'
  /**
   * Chance to deflect/reflect an incoming attack (The Action Hero) — inert:
   * defensive, no incoming-damage model exists. Deliberately generic (not
   * Bullet-Storm-scoped) — future deflect/reflect sources land here too.
   */
  | 'deflectChance'
  /**
   * Additive bonus-movement-speed fraction (AV SpeedMult 0x000002DA, points
   * ×0.01 — Speed Demon's Mutation_FortifyMoveSpeed 20/25). Not a movement
   * model: the fold exists solely to feed the `moveSpeedBonus` CurveInput
   * (Fast Fighter's "50% of bonus movement speed as reload speed",
   * overrides/perk-overrides.ts). Folded once per buildEffectiveWeapon and
   * threaded on `ResolveContext.moveSpeedBonus` — the onslaughtMaxStacks
   * bootstrap pattern. Sources beyond Speed Demon are tracked in
   * dps-todos/move-speed-sources.md.
   */
  | 'moveSpeedBonus'
  | 'addDamageComponent'
  /**
   * Armor penetration (Anti-Armor's ActorValues property) — a fraction
   * (0.50 = 50% penetration) folded ONCE per scenario input (`scenarios.ts`
   * bootstrap spot, `onslaughtMaxStacks` precedent) into a single
   * `armorPenTotal`, consumed by `src/lib/engine/mitigation.ts`'s
   * `applyMitigation`: `Resist = max(0, base − flatDebuff) × (1 −
   * clamp01(armorPenTotal))`. All 76 extracted `armorPen` modifiers
   * (Incisor/Stabilized/Tank Killer/Anti-Armor legendary families) are
   * unconditioned flat ADDs. See docs/assumptions.md "Resist mitigation".
   */
  | 'armorPen'
  /**
   * Flat enemy-DR debuff in resist points (NOT a fraction — distinct units
   * from `armorPen`), folded once per scenario input the same way. Today's
   * only source is Taking One for the Team's hidden companion perk
   * (`LGN_TakingOneForTheTeam_DamageIncrease_Perk`, magnitudes 6/10/15/50 at
   * ranks 1-4 — `src/data/target-debuffs.ts`), which the ESM shows debuffing
   * DamageResist only (no EnergyResist component) — `mitigation.ts` applies
   * this total ONLY when a component's resolved resist type is `'physical'`,
   * a consumer-side convention rather than a per-modifier damageTypeScope
   * condition (the bootstrap fold context has no `componentType`, so a
   * `damageTypeScope` condition would just always fail there — see
   * `mitigation.ts` header comment). See docs/assumptions.md "Resist
   * mitigation".
   */
  | 'armorPenFlat'
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
  /** Sustain expected-value chance levers — effective-weapon.ts `foldChanceUnion`, then sustain.ts. */
  | 'sustainChance'
  /** VATS crit-meter fill/consumption — crit-meter.ts `computeCritMeter`. */
  | 'critEconomy'
  /** VATS AP pool/regen/drain — scenarios.ts, folded into ap-economy.ts `computeApEconomy`. */
  | 'apEconomy'
  /** Effective SPECIAL / max HP — player-stats.ts `derivePlayerStats`. */
  | 'playerStat'
  /** Folded once per scenario input and threaded on `ResolveContext.onslaughtMaxStacks` rather than re-folded per damage term. */
  | 'bootstrap'
  /**
   * Folded once per scenario input (`scenarios.ts` bootstrap spot — same
   * "fold once" precedent as `bootstrap`) but consumed by
   * `src/lib/engine/mitigation.ts` directly against the scenario's finished
   * `HitBreakdown` (Option A — see mitigation.ts header), not threaded on
   * `ResolveContext`. Distinct regime name because its consumer sits outside
   * the condition-resolution pipeline entirely.
   */
  | 'mitigation'
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
  critDmgBonusScale: { regime: 'damageFold', hasEngineEffect: true, foldedBy: 'paper-damage.ts totalCritMult' },
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
  animDelaySec: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.animDelaySec rewrite); feeds fire-rate.ts\'s semi-auto/charging-tail divisor' },
  projectileCount: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.projectileCount rewrite); no damage term multiplies per-projectile yet, but Shotgun Champ\'s curve reads the folded value via the projectileCount CurveInput' },
  ammoCapacity: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.capacity rewrite); feeds sustained DPS (sustain.ts)' },
  reloadSpeed: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.reloadSpeed rewrite); feeds sustained DPS (sustain.ts)' },
  reloadSkipChance: { regime: 'sustainChance', hasEngineEffect: true, foldedBy: 'effective-weapon.ts (weapon.reloadSkipChance rewrite); feeds sustain.ts reloadSec' },
  ammoFreeChance: { regime: 'sustainChance', hasEngineEffect: true, foldedBy: 'effective-weapon.ts (weapon.ammoFreeChance rewrite); feeds sustain.ts effective capacity' },
  vatsApCost: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.apCost rewrite); feeds ap-economy.ts' },
  chargeFullPowerSec: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.fullPowerSeconds rewrite); gates weaponCharges() and feeds resolvedChargeTimeSec (src/lib/charge.ts), consumed by fire-rate.ts' },
  chargeFullPowerDamageMult: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.fullPowerDamageMult rewrite); feeds chargeDamageMultiplier (src/lib/charge.ts)' },
  weaponMinRange: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.minRange rewrite); feeds lib/distance.ts rangeFalloffMult, folded into paper-damage.ts outerMult/explosiveOuterMult via scenarios.ts' },
  weaponMaxRange: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.maxRange rewrite); feeds lib/distance.ts rangeFalloffMult, folded into paper-damage.ts outerMult/explosiveOuterMult via scenarios.ts' },
  weaponOutOfRangeMult: { regime: 'weaponStat', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.outOfRangeDamageMult rewrite); feeds lib/distance.ts rangeFalloffMult, folded into paper-damage.ts outerMult/explosiveOuterMult via scenarios.ts' },
  apRegen: { regime: 'apEconomy', hasEngineEffect: true, foldedBy: 'scenarios.ts, folded into ap-economy.ts computeApEconomy' },
  apPerCrit: { regime: 'apEconomy', hasEngineEffect: true, foldedBy: 'scenarios.ts, folded into ap-economy.ts computeApEconomy' },
  apRegenFlat: { regime: 'apEconomy', hasEngineEffect: true, foldedBy: 'scenarios.ts, folded into ap-economy.ts computeApEconomy (flat AP/sec term)' },
  apMax: { regime: 'apEconomy', hasEngineEffect: true, foldedBy: 'scenarios.ts, folded into ap-economy.ts computeApEconomy (AP pool size)' },
  apCritHot: { regime: 'apEconomy', hasEngineEffect: true, foldedBy: 'scenarios.ts (per-modifier collect — durationSec matters), ap-economy.ts computeApEconomy (refresh-only HoT term)' },
  onslaughtMaxStacks: { regime: 'bootstrap', hasEngineEffect: true, foldedBy: 'scenarios.ts / effective-weapon.ts — folded once, threaded on ResolveContext.onslaughtMaxStacks; caps the onslaught StackCounter and onslaughtStacks CurveInput' },
  onslaughtReverse: { regime: 'bootstrap', hasEngineEffect: true, foldedBy: 'scenarios.ts — folded once; folded > 0 activates reverse-onslaught stack averaging (onslaught.ts) threaded on ResolveContext.onslaughtReverseStacks' },
  bulletStormMaxStacks: { regime: 'bootstrap', hasEngineEffect: true, foldedBy: 'scenarios.ts / effective-weapon.ts — folded once at each site, threaded on ResolveContext.bulletStormMaxStacks; caps the bulletStorm StackCounter and bulletStormStacks CurveInput' },
  bulletStormMinStacks: { regime: 'bootstrap', hasEngineEffect: true, foldedBy: 'scenarios.ts / effective-weapon.ts — folded once at each site, threaded on ResolveContext.bulletStormMinStacks; floors the bulletStorm StackCounter and bulletStormStacks CurveInput' },
  bulletStormRetention: { regime: 'bootstrap', hasEngineEffect: true, foldedBy: 'scenarios.ts — folded once; consumed by bulletstorm.ts bulletStormAvgStacks (sustained-fire average model) when PlayerConditions.bulletStormAverageMode is on' },
  bulletStormOnKill: { regime: 'unfolded', hasEngineEffect: false, foldedBy: 'none — kills are unknowable in steady-state paper DPS (Final Word\'s on-kill stack grant)' },
  bulletStormSpinUp: { regime: 'unfolded', hasEngineEffect: false, foldedBy: 'none — spin-up/ramp timing not modeled (Valkyrie\'s)' },
  deflectChance: { regime: 'unfolded', hasEngineEffect: false, foldedBy: 'none — defensive, no incoming-damage model exists (The Action Hero)' },
  moveSpeedBonus: { regime: 'bootstrap', hasEngineEffect: true, foldedBy: 'effective-weapon.ts buildEffectiveWeapon — folded once, threaded on ResolveContext.moveSpeedBonus; feeds the moveSpeedBonus CurveInput (Fast Fighter). Threaded in the weapon-stat fold ONLY — a damage-bucket curve on this input would read 0 until scenarios.ts also threads it' },
  addDamageComponent: { regime: 'unfolded', hasEngineEffect: false, foldedBy: 'none — no reader anywhere in the codebase; likely superseded by explosivePayload/materializeDamageTypeComponents' },
  armorPen: { regime: 'mitigation', hasEngineEffect: true, foldedBy: 'scenarios.ts bootstrap fold → armorPenTotal; consumed by mitigation.ts applyMitigation (per-component Resist fraction)' },
  armorPenFlat: { regime: 'mitigation', hasEngineEffect: true, foldedBy: 'scenarios.ts bootstrap fold → flat resist-point total; consumed by mitigation.ts applyMitigation (physical-resist-only, see bucket doc comment)' },
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

/** Sustain expected-value chance buckets — folded in effective-weapon.ts, consumed by sustain.ts. */
export const SUSTAIN_CHANCE_BUCKETS: ReadonlySet<Bucket> = new Set(
  (Object.entries(BUCKET_REGISTRY) as Array<[Bucket, BucketRegimeEntry]>)
    .filter(([, entry]) => entry.regime === 'sustainChance')
    .map(([bucket]) => bucket)
);

/** Buckets with no engine effect today — derived from BUCKET_REGISTRY; drives the OMOD/consumable picker's 'inert' badge. */
export const INERT_ENGINE_BUCKETS: ReadonlySet<Bucket> = new Set(
  (Object.entries(BUCKET_REGISTRY) as Array<[Bucket, BucketRegimeEntry]>)
    .filter(([, entry]) => !entry.hasEngineEffect)
    .map(([bucket]) => bucket)
);

/**
 * The single "does this modifier move a number today" predicate — shared by
 * every picker's 'no effect yet' badge (OMODs, perks, consumables). A
 * modifier is inert when its bucket is in `INERT_ENGINE_BUCKETS`, OR
 * extraction left a condition it couldn't translate (`unresolved`). Kept
 * here, next to the bucket registry it reads, so no caller can drift from
 * what the engine actually folds.
 *
 * The `curve?.input === 'enemyDamageResist'` carve-out (Phase 2 — Enemy
 * defenses, removed 2026-07-18) is GONE: that curve input was renamed
 * `playerDamageResist` (Berserker's reads the WIELDER's own DR, not the
 * enemy's — see the `CurveInput` doc comment) and is wired to a real manual
 * knob (`PlayerConditions.playerDamageResist`), so it's engine-effective like
 * any other curve input now. `armorPen` also left `INERT_ENGINE_BUCKETS` this
 * phase (mitigation.ts). Distinct from the enemyType/enemyTypeAny CONDITION
 * kinds, which have always resolved against the Target picker's selected
 * race and were never inert.
 */
export function modifierHasEngineEffect(m: Modifier): boolean {
  return !(INERT_ENGINE_BUCKETS.has(m.bucket) || m.conditions.some(c => c.kind === 'unresolved'));
}

/** True iff at least one modifier in the list moves a number today (empty list → false). */
export function hasAnyEngineEffect(modifiers: readonly Modifier[]): boolean {
  return modifiers.some(modifierHasEngineEffect);
}

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
  /** Enemy race/type gating (Exterminator etc.) — resolves against the Target picker's selected race (`ctx.enemyTypeIds`). */
  | { kind: 'enemyType'; keywordOrRace: string }
  /** OR-group of enemy race/type gates (Ghoul Slayer's: FeralGhoul OR Ghoul) — resolves against `ctx.enemyTypeIds`. */
  | { kind: 'enemyTypeAny'; keywordsOrRaces: string[] }
  | { kind: 'sneaking' }
  | { kind: 'powerAttack' }
  /** The hit is a VATS critical (symmetric with sneaking/powerAttack). */
  | { kind: 'crit' }
  /** PLAYER health below pct. Absent/true ⇒ ≤ (Foundation's Vengeance: GetHealthPercentage ≤ 0.25); false ⇒ strict <. */
  | { kind: 'healthBelowPct'; pct: number; inclusive?: boolean }
  /** ENEMY health below pct (Executioner's: ≤40, threshold from GLOB LGND_ExecuteHealthThreshold). Absent/true ⇒ ≤; false ⇒ strict <. */
  | { kind: 'enemyHealthBelowPct'; pct: number; inclusive?: boolean }
  /** ENEMY health above pct (Instigating: ≥60 — the ESM's post-rework gate). Absent/true ⇒ ≥; false ⇒ strict >. */
  | { kind: 'enemyHealthAbovePct'; pct: number; inclusive?: boolean }
  /** value × enemy crippled-limb count, clamped (Bully's — STAT_DmgPerCrippled). */
  | { kind: 'perCrippledLimb'; max: number }
  /** The fired round is the magazine's last (Last Shot — GetLoadedAmmoCount()=0 + IsNextClipLastShot). */
  | { kind: 'lastRound' }
  /** Player is aiming down sights (GetInIronSights) — override-produced gate for scoped-damage magazines. */
  | { kind: 'aimingDownSights'; value: boolean }
  /** Active alcohol consumable selected (HasMagicEffectKeyword(AlcoholEffect)) — derived in resolveLoadout. */
  | { kind: 'underAlcoholEffect'; value: boolean }
  /** Target carries ≥1 active effect with this keyword (Pyromaniac's: DamageTypeFire; Viper's: DamageTypePoison). */
  | { kind: 'enemyHasActiveEffect'; keyword: string }
  /** Enemies in the engaged group == count, or ≥ count for the top tier (Encircler's — GetGroupTargetCount). */
  | { kind: 'enemyGroupCount'; count: number; orMore?: boolean }
  /**
   * Number of currently-worn armor pieces carrying `keyword` == count, or ≥
   * count with orMore (Battle-Loader's 1/2/3/4/≥5-piece tiers —
   * WornApparelHasKeywordCount). Phase 3 armor pipeline (extraction half,
   * go-through-every-single-silly-whistle.md): INERT until the engine half
   * wires `PlayerConditions.wornPieceCounts` — see resolve.ts's stub case.
   */
  | { kind: 'wornPieceCount'; keyword: string; count: number; orMore?: boolean }
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
  /**
   * The player owns (present:true) or lacks (present:false) rank ≥ minRank of
   * a DIFFERENT perk family than the one carrying this modifier — the
   * cross-family HasPerk gate (Bullet Storm's hidden reload-speed curves
   * gated on HasPerk(LockAndLoad01); Mechanic's Best Friend's dbm on
   * MakeshiftWarrior0N). Resolved at EXTRACTION time
   * (ConditionTranslationContext.crossFamilyRank,
   * scripts/extract/normalize/conditions.ts) into the family editor-id +
   * rank; evaluated at RUNTIME against PlayerConditions.equippedPerkRanks
   * (derived from the selected perk loadout in src/lib/loadout.ts) —
   * contrast the SELF/paired-family rank gates, which the extractor resolves
   * by simulation and never emits as runtime conditions. Owning rank N
   * satisfies gates on every rank ≤ N (mirrors the extractor's
   * rankIndex < ownedRanks rule).
   */
  | { kind: 'perkFamilyRank'; family: string; minRank: number; present: boolean }
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
  /**
   * The WIELDER's OWN DamageResist AV (0x000002E3) — NOT the enemy's,
   * despite the AV's shared name with `RESIST_AVS` in extract-npcs.ts
   * (that mapping is for NPC_ records; this one is the SPEL's self-buff
   * curve). Renamed from `enemyDamageResist` 2026-07-18 (Phase 2 — Enemy
   * defenses): the only consumer, Berserker's
   * (`mod_Legendary_Weapon1_DamageUnarmored`, curve points
   * (0,50)→(20,30)→(40,17)→(60,5), scale 0.01), is FO76's real "deals more
   * damage the LESS armored you are" effect — USER-CONFIRMED 2026-07-18. No
   * armor-mitigation model exists yet to derive this from equipped armor
   * (Phase 3 is slim and won't add one either), so it's a manual knob
   * (`PlayerConditions.playerDamageResist`, default 0 — "naked", the curve's
   * max-bonus end, which was this input's ALWAYS-0 hardcoded behavior before
   * this rename; see `resolve.ts` PLAYER_STATE_READERS and
   * docs/assumptions.md "Berserker's (Damage Unarmored)").
   */
  | 'playerDamageResist'
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
   * The player's folded bonus-movement-speed fraction (Σ `moveSpeedBonus`
   * bucket, threaded on `ResolveContext.moveSpeedBonus` by
   * buildEffectiveWeapon) — no AVIF-driven curve reads this in the ESM; it
   * exists for the hand-authored Fast Fighter override (perk-overrides.ts),
   * whose "50% of bonus movement speed as reload speed" has no ESM effects
   * at all (2026-07-15 esm chase: PERK 0x0031AEF2 carries nothing).
   * Clamped-at-0 by its curve endpoints: a net move-speed PENALTY never
   * slows reload.
   */
  | 'moveSpeedBonus'
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
