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
 * Shorthand: "DBM" (Damage Bonus Mult) names this family of additively-
 * stacked bonus modifiers — plain DBM plus its per-mechanic flavors
 * CritDBM/SneakDBM/PowerAttackDBM/WeakptDBM below. A conditioned DBM entry
 * (Down Ranger's Far-range bonus, Deal Sealer's per-status-effect bonus) is
 * just an ordinary 'dbm' ADD gated by a condition, not a separate bucket.
 *
 * - dbm: the big additive pool (plain DBM). Its intrinsic base is the
 *   weapon's Damage Bonus Multiplier (1.0), so the "1 +" in the spec formula
 *   falls out of the fold. ADD contributes; MUL_ADD scales the weapon base
 *   first.
 * - critDmgBase / sneakBase: MUL_ADD/SET against BaseWeaponCritMult /
 *   BaseWeaponSneakAttackMult (OMODs). critDmgBonus / sneakBonus: additive
 *   bonuses stacked after (perks, ADD OMODs). totalCritMult/totalSneakMult
 *   fold these to the full weapon multiplier; CritDBM/SneakDBM is that total
 *   minus 1.0 (paper-damage.ts's critTerm/sneakTerm) — the base here is a
 *   multiplier (~2×), not an additive pool like dbm's 1.0, so it needs the
 *   -1 before joining the dbm parenthesis.
 * - critDmgBonusScale: multiplier folded over base 1.0 and applied to the
 *   folded critDmgBonus total (not the base crit mult) — The V.A.T.S.
 *   Unknown's random per-crit roll only.
 * - powerAttackBonus: PowerAttackDBM — additive inside the dbm parenthesis
 *   (Heavy Hitter's), i.e. "DBM active only while power attacking". Distinct
 *   from the race's flat PowerAttackMult (1.5×/2.0× melee,
 *   powerAttackRaceMult()), which stays a straight outer multiplier and is
 *   not a DBM at all.
 * - weakpointBonus: WeakptDBM — additive over a 1.0 base, but unlike the
 *   other DBM flavors it does not fold into the dbm parenthesis: it
 *   multiplies total damage by proxy of entering bodyPartMult/outerMult, and
 *   only activates when the body-part multiplier exceeds 1.0.
 * - wholeDamage: separate stacking whole-damage multipliers (TOFTT, Follow
 *   Through, Grounded's Charged Penalty).
 * - critFill / critConsumption: crit-meter economy (Crit Savvy, Limit Breaking).
 * - fireRateSpeed / isAutomatic / projectileCount / vatsApCost:
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
  // NOTE: no explosion-damage bucket exists — two distinct mechanisms share
  // damageTypeScope ['explosive'] scoping instead (matches fromExplosion
  // components and explosive twins):
  //   - Demolition Expert's STAT_DmgExplosive AV (FALLBACK_AVIF_ROUTES,
  //     mgef.ts) is ADDITIVE inside the general dbm parenthesis — the June
  //     2026 patch, in-game proven (docs/assumptions.md "Launcher explosion
  //     damage"). The old `explosionMult` bucket (a separate multiplier on
  //     finished explosion damage) modeled the pre-patch formula and was
  //     removed 2026-07-13.
  //   - The 'Mod Player Explosion Damage' ENTRY POINT (a different
  //     mechanism, ENTRY_POINT_BUCKETS, mgef.ts) is a standalone multiplier,
  //     USER-RESOLVED 2026-07-21, routed to `baseDamage` — NOT the same
  //     route as STAT_DmgExplosive above, and currently inert (no live
  //     consumer; see the mgef.ts comment for why).
  //   - The Explosive 2★ legendary (`explosivePayload` below) ALSO rewrites
  //     to an explosive-scoped `baseDamage` MUL_ADD, but only on a
  //     Curve-Table Explosion (effective-weapon.ts) — this is a THIRD, still
  //     distinct route (pre-DBM, user-measured 2026-07-30), not the same
  //     mechanism as the inert entry-point route above.
  /** Bash-attack damage (STAT_DmgBash — Basher's) — inert until bash attacks are modeled. */
  | 'bashDamage'
  /**
   * The Explosive 2★ legendary (LGND_ExplosivePayload, ADD 0.2). Always
   * +20% BASE damage pre-DBM (user-confirmed 2026-07-30) — WHICH base
   * depends on the weapon's explosion kind (CONTEXT.md "Curve-Table
   * Explosion" / "Projectile-Scaling Explosion"), decided in
   * effective-weapon.ts's `buildEffectiveWeapon`, not here:
   *   - Projectile-Scaling Explosion (Gauss/Tesla explosionBaseWeaponDamageMult):
   *     left untouched — folded per-component as the explosive-twin's
   *     intrinsic-base bonus in paper-damage.ts (0.15 + 0.20 = 0.35).
   *   - Curve-Table Explosion (fromExplosion components): rewritten into an
   *     explosive-scoped `baseDamage` MUL_ADD and stripped — no twin.
   *   - Chain-suppressed (Tesla + AC muzzle, chain lightning): stripped
   *     outright, contributes nothing.
   * Regime is `damageFold` for the first case only; the other two consume
   * it entirely inside `buildEffectiveWeapon` (a `bootstrap`-shaped
   * destiny) before it would ever reach paper-damage.ts.
   */
  | 'explosivePayload'
  /**
   * Accumulated `STAT_ExplosionRadius` bonus as a fraction (Grenadier rank 1
   * → 0.5, rank 2 → 1.0 — MGEF AbPerkFortifyExplosionRadius, magnitude
   * 50/100, scaled ×0.01 by the STAT_DamagePerk plumbing route, Perk Entry
   * ID 37). Represents a radius/AoE increase — inert on its own (explosion
   * radius/AoE itself is not modeled); only produces a damage effect when
   * combined with `explosionRadiusToDamage` (effective-weapon.ts
   * buildEffectiveWeapon).
   */
  | 'explosionRadiusBonus'
  /**
   * Fraction of the player's `explosionRadiusBonus` rerouted into damage
   * instead of radius (AVIF `ConvertExplosiveRadiusToDamage`, a Boolean AV —
   * mod_Custom_BunkerBuster ADDs 1.0 = 100%). Folded together with
   * `explosionRadiusBonus` in effective-weapon.ts buildEffectiveWeapon to
   * synthesize an explosive-scoped `dbm` ADD.
   */
  | 'explosionRadiusToDamage'
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
   * Probability the reload is skipped entirely, PASSIVELY on the reload
   * itself (Quick Hands, Wild West Hands — EP182 "Auto Fill Weapon Clip").
   * Folded via independent-probability union in effective-weapon.ts; consumed by
   * sustain.ts as a multiplicative reload-time cut, separate from reloadSpeed.
   */
  | 'reloadSkipChance'
  /**
   * Probability the reload is skipped via a BASH swing instead
   * (Battle-Loader's — EP199 "Instant Reload Clip On Bash", gated
   * `IsPowerAttacking` in its own extracted conditions), as opposed to
   * `reloadSkipChance`'s passive-on-reload trigger. Split into its own
   * channel (2026-07-19, Phase C — go-through-every-single-silly-
   * whistle.md) because a bash swing carries a real time cost a passive
   * skip doesn't: `sustain.ts` composes both channels (free-tier skip wins
   * first, then the bash tier either skips instantly at
   * `PlayerConditions.battleLoadersBashSec = 0` or costs that many seconds
   * in place of the real reload). Folded via the same `foldChanceUnion` as
   * `reloadSkipChance` in effective-weapon.ts; consumed by sustain.ts's
   * `reloadSec` fold.
   */
  | 'reloadSkipChanceBash'
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
   * Flat AP restored per VATS crit (Conductor's instant half: +10 — the
   * duration-5 HoT half is `apCritHot`, not folded in here). Hand-supplied in
   * `overrides/legendary-values.ts` — the Apply Combat Hit Spell entry point
   * isn't extractor-modeled. Consumed by `ap-economy.ts`.
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
   * half). REFRESH-ONLY: MGEF Legendary_Weapon_ConductorsApplyRestorePlayerAPPerkEffect
   * carries `Dispel with Keywords` + KYWD ConductorsDispelPlayerEffectKeyword
   * ("prevent Owner & Recipients from stacking AP & Health Regen effects"),
   * so a new crit dispels the prior instance and restarts the window — same
   * steady-state shape as the dotDamage convention. Steady state in
   * `ap-economy.ts`: rate × min(1, durationSec × critsPerSec).
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
   * docs/move-speed-census.md.
   */
  | 'moveSpeedBonus'
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
  /**
   * VATS hit-chance bonus (V.A.T.S. Enhanced, Awareness, Eye of the Hunter,
   * the V.A.T.S. Matrix Overlay power-armor helmet mods, Orange Mentats,
   * Hoppy Hunter IPA's penalty, Twisted Muscles' mutation penalty...) — a
   * decimal fraction (0.10 = +10%), folded ONCE per scenario input
   * (`scenarios.ts` bootstrap spot, `armorPen` precedent) into
   * `ScenarioSet.vatsHitChanceBonus`. UNUSUALLY among bootstrap-fold
   * buckets, this one is folded against base **1** (then de-based by
   * subtracting 1), not 0: half the real sources are MUL_ADD (ESM "Multiply
   * Value" entry points, extracted as `float − 1` the same way every other
   * Multiply-Value entry point is) whose `foldOps` contribution is scaled by
   * the base — base 0 would silently zero them out. See the `foldOps` call
   * site in `scenarios.ts` for the full explanation. DISPLAY-ONLY (`regime:
   * 'display'`):
   * the fold result feeds an informational UI pill (`ConditionsSection.tsx`,
   * next to the manual VATS hit-rate slider) and NOTHING else — it must
   * never be threaded into `sustainedDps`/`apLimitedDps`/any damage term.
   * The manual `vatsHitRatePct` slider stays the sole authoritative hit-rate
   * input. Aggregating already-known ESM bonus magnitudes here is distinct
   * from — and does not reopen — the standing "computing VATS hit chance
   * from distance/Perception/perks is out of scope" ruling (see
   * docs/assumptions.md "VATS hit-chance aggregate (display-only)").
   */
  | 'vatsHitChance'
  /**
   * Concentrated Fire's per-stack VATS hit-chance MULTIPLIER (EP109 "Mod
   * VATS Concentrated Fire Chance Bonus", **USER-RESOLVED 2026-07-19**):
   * unlike `vatsHitChance` above, this is NOT an additive-percent bonus — it
   * multiplies the game's own computed VATS hit chance directly. Per stack,
   * semi-auto weapons multiply by `(1 + 0.04×rank)` and automatic weapons by
   * `(1 + 0.01×rank)` — a game rework roughly a year before this reading
   * (~2025) replaced what used to be a flat additive bonus (the 4.0/1.0 ESM
   * float split reads as accuracy points pre-rework). Folded ONCE per
   * scenario input (`scenarios.ts` bootstrap spot, same "fold once"
   * precedent as `vatsHitChance`) against base **1** — but UNLIKE
   * `vatsHitChance`, the fold result is exposed AS-IS (1 = neutral), not
   * de-based by subtracting 1, since "×1.00" is the natural display shape
   * for a multiplier and every source here is `MUL_ADD` (no ADD sources
   * exist for this bucket). DISPLAY-ONLY (`regime: 'display'`): feeds
   * `ScenarioSet.vatsHitChanceMult`, rendered by `ConditionsSection.tsx`'s
   * pill next to the `vatsHitChance` one, and NOTHING else — never threaded
   * into `sustainedDps`/`apLimitedDps`/any damage term. The manual
   * `vatsHitRatePct` slider stays the sole authoritative hit-rate input. See
   * docs/assumptions.md "Concentrated Fire stacks".
   */
  | 'vatsHitChanceMult'
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
   * Lockpick Skill (`STAT_LockpickingTier`, integer points, base 0). Folded
   * in player-stats.ts derivePlayerStats exactly like maxHealth — every
   * contributing perk/armor-effect modifier ADDs into this bucket — and
   * threaded onto PlayerConditions.lockpickSkill, read by the `lockpickSkill`
   * CurveInput (Pirate Punch unique weapon mod: "+5% Damage per Lockpick
   * Skill", ESM curve PiratePunchBonus).
   */
  | 'lockpickSkill'
  /**
   * Hacking Skill (`STAT_HackingTier` 0x00356A14, integer points, base 0).
   * Folded in player-stats.ts derivePlayerStats exactly like lockpickSkill —
   * Hacker/Hacker Expert/Hacker Master (+1 each), Master Infiltrator (+3),
   * Safecracker's 3★ armor (+1/piece) — threaded onto
   * PlayerConditions.hackingSkill, read by the `hackingSkill` CurveInput.
   * No shipped weapon reads it yet; wired for drop-in.
   */
  | 'hackingSkill'
  /**
   * Stimpak Healing (`STAT_HealMultStimpak` 0x00206F31, percent-point AV,
   * base 0). Folded in player-stats.ts derivePlayerStats — First Aid perk
   * (Intelligence-keyed curve) and Medicine Bobblehead (flat +30) — and
   * threaded onto PlayerConditions.stimpakHealMult. Medical Malpractice's
   * identity perk scales dbm by this stat via the `scaledBy` mechanism (not a
   * curve input on the grant side).
   */
  | 'stimpakHealMult'
  /**
   * Stimpak/RadAway heal MAGNITUDE multiplier (perk Entry Point 29 "Mod Spell
   * Magnitude", function Multiply Value, applied to StimpakRestoreHealth MGEF
   * 0x0021DDB8). Composes multiplicatively — folded via `foldBucketProduct`
   * (resolve.ts) in player-stats.ts derivePlayerStats, NOT the additive
   * `foldBucket`/`foldOps` every other MUL_ADD bucket uses. Contributors:
   * Field Surgeon (×1.67), Doctor's 3★ armor legendary (×1.05–1.25 by worn
   * pieces). No DPS consumer yet — wired for the future Stimpak-healing
   * profile (src/lib/healing.ts) exactly like `hackingSkill`.
   */
  | 'stimpakHealMagMult'
  /**
   * Stimpak/RadAway heal DURATION multiplier — same mechanism as
   * `stimpakHealMagMult` but perk Entry Point 30 "Mod Spell Duration".
   * Contributors: Field Surgeon (×0.6 — its magnitude ×1.67 and duration ×0.6
   * are net-neutral on total HP restored; it's a pure rate buff). No DPS
   * consumer yet.
   */
  | 'stimpakHealDurationMult'
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
  | 'specialLuck'
  /**
   * Flat Damage Resist points the WEARER gains (AV DamageResist 0x000002E3,
   * Peak Value Modifier fortifies — Scaly Skin's positive side, magnitudes
   * 50/62 normal/Class-Freak-boosted). Inert until player/enemy resist
   * mitigation for the wearer's OWN defenses is modeled (today's
   * `armorPen`/`armorPenFlat` only model attacker-side DAMAGE, not a
   * defender's resist pool) — this bucket exists so the value displays
   * honestly instead of being silently dropped, same status as
   * `limbDamage`/`bashDamage` above.
   */
  | 'damageResistGain'
  /** Flat Energy Resist points the WEARER gains (AV EnergyResist 0x000002EB) — mirrors `damageResistGain`, same inert status. */
  | 'energyResistGain'
  /**
   * Multiplicative incoming-damage-taken modifier the WEARER gets (Entry Point
   * "Mod Incoming Weapon Damage", self-targeted — e.g. Emergency Protocols'
   * −50%, Heavyweight's, Lucid's, Unstoppable Monster's, Empath's). Inert: no
   * player-defense/incoming-damage model exists (mirrors `damageResistGain`'s
   * status) — exists so the value displays honestly instead of being silently
   * dropped. Distinct from the TARGET-redirected offensive half of the same
   * Entry Point (Follow Through / Taking One For The Team), which is
   * hand-authored as `wholeDamage` in `src/data/manual-uptime.ts` and never
   * reaches the extractor's generic entry-point routing.
   */
  | 'incomingDamageMult';

/**
 * Which fold mechanism consumes a Bucket, and whether that fold's result
 * actually reaches anything — the **Bucket Regime** (CONTEXT.md). The `Bucket`
 * union promises one normalized shape for every damage source, but WHICH
 * function folds a given bucket (and whether the result does anything) is
 * otherwise only discoverable by grepping resolve.ts/paper-damage.ts/
 * crit-meter.ts/ap-economy.ts/player-stats.ts/effective-weapon.ts by hand.
 * This is the one table that answers both questions and records non-default
 * fold-base/de-basing conventions; absent `deBased` means false.
 * `WEAPON_STAT_BUCKETS` (effective-weapon.ts) and `INERT_ENGINE_BUCKETS`
 * (omods.ts, the picker's "no engine effect" badge) are DERIVED from it below
 * instead of hand-maintained, so neither can silently drift from what the
 * engine actually wires. Add a row here whenever a new Bucket is added to the
 * union above — `assertBucketRegistryIsExhaustive` (modifiers.test.ts)
 * enforces it.
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
  /**
   * Folded once per scenario input (`scenarios.ts` bootstrap spot — same
   * "fold once" precedent as `bootstrap`/`mitigation`), but the result feeds
   * an informational UI display ONLY, never a formula term — distinct regime
   * name so `hasEngineEffect: true` here can never be mistaken for "reaches
   * a damage/sustain/AP term". See the `vatsHitChance` bucket doc comment.
   */
  | 'display'
  /**
   * Bethesda "Mod Spell Magnitude"/"Mod Spell Duration" perk entry points,
   * which compose multiplicatively (∏(1+value) via `foldBucketProduct` in
   * resolve.ts) rather than the additive damage-pool fold `foldOps` uses for
   * every other MUL_ADD bucket. Folded once in player-stats.ts
   * derivePlayerStats and threaded on PlayerConditions — same "folded once,
   * threaded" shape as `playerStat`, distinct regime name because the fold
   * arithmetic differs.
   */
  | 'spellMagnitude'
  /** No fold consumes this bucket at all (as opposed to a fold whose result nothing reads — see `hasEngineEffect`). */
  | 'unfolded';

export interface BucketRegimeEntry {
  regime: BucketRegime;
  /**
   * The base value this bucket folds over (`foldBucket`'s third argument).
   * 'dynamic' means the base is derived per weapon or per context at the fold
   * site and cannot be declared here -- e.g. critDmgBase's
   * `weapon.critDamageMult ?? DEFAULT_CRIT_MULT`. A number means every fold of
   * this bucket uses exactly that base, and `foldRegisteredBucket` can supply it.
   * 'unfolded' means no fold consumes this bucket (regime `unfolded` or an
   * alternate fold primitive with no `foldBucket` third argument).
   */
  foldBase: number | 'dynamic' | 'unfolded';
  /** Whether the registry-driven result excludes its intrinsic base; defaults to false. */
  deBased?: boolean;
  /**
   * True when this bucket is modeled correctly all the way through the engine
   * (folded, threaded, and — if applicable — read by a consumer), even if no
   * currently shipped game content produces a nonzero DPS change from it
   * today (`hackingSkill` is the running example). False = genuinely not yet
   * implemented (NYI): the fold either doesn't happen, or happens but a
   * known engine capability is missing — distinct from `regime: 'unfolded'`,
   * where no fold happens at all. `INERT_ENGINE_BUCKETS` = every bucket where
   * this is false OR regime is 'unfolded'.
   */
  hasEngineEffect: boolean;
  /**
   * Where this bucket is consumed, when that happens BEFORE the modifier list
   * reaches the resolver. Absent = the bucket reaches ScenarioInput.modifiers
   * normally (which includes most `regime: 'bootstrap'` buckets — bootstrap
   * means "folded once up front", NOT "stripped from the list"; the Onslaught
   * and Bullet-Storm stack bounds are folded early AND still passed through).
   *
   * - 'effectiveWeapon' — consumed inside buildEffectiveWeapon and stripped there.
   * - 'loadoutAssemble' — stripped by loadout.ts's assemble() before the engine runs.
   */
  consumedBefore?: 'effectiveWeapon' | 'loadoutAssemble';
  /**
   * Documentation only — not enforced. Names the fold site for human readers;
   * trust the code it points at over this string.
   */
  foldedBy: string;
}

/**
 * `hasEngineEffect: true` = modeled end-to-end (folded, threaded, consumer-
 * ready), even when no shipped content moves DPS from it yet (`hackingSkill`).
 * `hasEngineEffect: false` = NYI — e.g. `bashDamage`/`deflectChance`
 * (`regime: 'unfolded'`, no fold at all) or a fold with no engine capability
 * yet. The picker's "no effect yet" badge means NYI, not "happens to be 0 DPS
 * with your current build."
 */

export const BUCKET_REGISTRY: Readonly<Record<Bucket, BucketRegimeEntry>> = {
  baseDamage: {
    foldBase: 'dynamic',
    regime: 'damageFold',
    hasEngineEffect: true,
    foldedBy:
      'paper-damage.ts computePaperDamage (per-component base scaling, before the dbm parenthesis)',
  },
  dbm: {
    foldBase: 'dynamic',
    regime: 'damageFold',
    hasEngineEffect: true,
    foldedBy: 'paper-damage.ts computePaperDamage (dbm parenthesis)',
  },
  critDmgBase: {
    foldBase: 'dynamic',
    regime: 'damageFold',
    hasEngineEffect: true,
    foldedBy: 'paper-damage.ts totalCritMult',
  },
  critDmgBonus: {
    foldBase: 0,
    regime: 'damageFold',
    hasEngineEffect: true,
    foldedBy: 'paper-damage.ts totalCritMult',
  },
  critDmgBonusScale: {
    foldBase: 1,
    regime: 'damageFold',
    hasEngineEffect: true,
    foldedBy: 'paper-damage.ts totalCritMult',
  },
  sneakBase: {
    foldBase: 'dynamic',
    regime: 'damageFold',
    hasEngineEffect: true,
    foldedBy: 'paper-damage.ts totalSneakMult',
  },
  sneakBonus: {
    foldBase: 0,
    regime: 'damageFold',
    hasEngineEffect: true,
    foldedBy: 'paper-damage.ts totalSneakMult',
  },
  powerAttackBonus: {
    foldBase: 0,
    regime: 'damageFold',
    hasEngineEffect: true,
    foldedBy: 'paper-damage.ts computePaperDamage (dbm parenthesis)',
  },
  weakpointBonus: {
    foldBase: 0,
    regime: 'damageFold',
    hasEngineEffect: true,
    foldedBy: 'paper-damage.ts computePaperDamage (outer multiplier)',
  },
  wholeDamage: {
    foldBase: 1,
    regime: 'damageFold',
    hasEngineEffect: true,
    foldedBy: 'resolve.ts foldWholeDamage (outer multiplier)',
  },
  limbDamage: {
    foldBase: 'unfolded',
    regime: 'unfolded',
    hasEngineEffect: false,
    foldedBy:
      "none — limb targeting not modeled (STAT_DmgLimbs plumbing extracted, e.g. Crippling's override, but no consumer yet)",
  },
  bashDamage: {
    foldBase: 'unfolded',
    regime: 'unfolded',
    hasEngineEffect: false,
    foldedBy: 'none — bash attacks not modeled (STAT_DmgBash extracted, no consumer yet)',
  },
  explosivePayload: {
    foldBase: 'dynamic',
    regime: 'damageFold',
    hasEngineEffect: true,
    // Explosive 2★ — buildEffectiveWeapon decides its destiny per weapon (see
    // its doc-comment): left untouched for a Projectile-Scaling Explosion
    // (paper-damage.ts's own fold), rewritten into a baseDamage MUL_ADD for a
    // Curve-Table Explosion, or stripped outright when chain-suppressed. Its
    // only current source is an equipped OMOD (allOmodModifiers), never
    // loadoutModifiers — listed here defensively for symmetry with
    // explosionRadiusBonus/ToDamage, so a future loadout-sourced contribution
    // can't bypass the branch logic and leak into ScenarioInput.modifiers raw.
    consumedBefore: 'loadoutAssemble',
    foldedBy:
      'paper-damage.ts computePaperDamage (explosive-twin branch) on a Projectile-Scaling ' +
      'Explosion; effective-weapon.ts buildEffectiveWeapon (rewrite-to-baseDamage or strip) ' +
      'on a Curve-Table Explosion or chain-suppressed weapon',
  },
  explosionRadiusBonus: {
    foldBase: 0,
    regime: 'bootstrap',
    hasEngineEffect: true,
    // Bunker Buster radius→damage conversion — fully consumed inside buildEffectiveWeapon,
    // synthesized into a dbm modifier there; must not reach ScenarioInput.modifiers directly.
    consumedBefore: 'effectiveWeapon',
    foldedBy: 'effective-weapon.ts buildEffectiveWeapon (explosive-radius→damage conversion)',
  },
  explosionRadiusToDamage: {
    foldBase: 0,
    regime: 'bootstrap',
    hasEngineEffect: true,
    // Bunker Buster radius→damage conversion — fully consumed inside buildEffectiveWeapon,
    // synthesized into a dbm modifier there; must not reach ScenarioInput.modifiers directly.
    consumedBefore: 'effectiveWeapon',
    foldedBy: 'effective-weapon.ts buildEffectiveWeapon (explosive-radius→damage conversion)',
  },
  critFill: {
    foldBase: 'dynamic',
    regime: 'critEconomy',
    hasEngineEffect: true,
    foldedBy: 'crit-meter.ts computeCritMeter',
  },
  critConsumption: {
    foldBase: 100,
    regime: 'critEconomy',
    hasEngineEffect: true,
    foldedBy: 'crit-meter.ts computeCritMeter',
  },
  fireRateSpeed: {
    foldBase: 'dynamic',
    regime: 'weaponStat',
    hasEngineEffect: true,
    foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.speed rewrite)',
  },
  isAutomatic: {
    foldBase: 'dynamic',
    regime: 'weaponStat',
    hasEngineEffect: true,
    foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.isAutomatic rewrite)',
  },
  animDurationSec: {
    foldBase: 'dynamic',
    regime: 'weaponStat',
    hasEngineEffect: true,
    foldedBy: 'effective-weapon.ts buildEffectiveWeapon (weapon.animDurationSec rewrite)',
  },
  animDelaySec: {
    foldBase: 'dynamic',
    regime: 'weaponStat',
    hasEngineEffect: true,
    foldedBy:
      "effective-weapon.ts buildEffectiveWeapon (weapon.animDelaySec rewrite); feeds fire-rate.ts's semi-auto/charging-tail divisor",
  },
  projectileCount: {
    foldBase: 'dynamic',
    regime: 'weaponStat',
    hasEngineEffect: true,
    foldedBy:
      "effective-weapon.ts buildEffectiveWeapon (weapon.projectileCount rewrite); no damage term multiplies per-projectile yet, but Shotgun Champ's curve reads the folded value via the projectileCount CurveInput",
  },
  ammoCapacity: {
    foldBase: 'dynamic',
    regime: 'weaponStat',
    hasEngineEffect: true,
    foldedBy:
      'effective-weapon.ts buildEffectiveWeapon (weapon.capacity rewrite); feeds sustained DPS (sustain.ts)',
  },
  reloadSpeed: {
    foldBase: 'dynamic',
    regime: 'weaponStat',
    hasEngineEffect: true,
    foldedBy:
      'effective-weapon.ts buildEffectiveWeapon (weapon.reloadSpeed rewrite); feeds sustained DPS (sustain.ts)',
  },
  reloadSkipChance: {
    foldBase: 'dynamic',
    regime: 'sustainChance',
    hasEngineEffect: true,
    foldedBy: 'effective-weapon.ts (weapon.reloadSkipChance rewrite); feeds sustain.ts reloadSec',
  },
  reloadSkipChanceBash: {
    foldBase: 'dynamic',
    regime: 'sustainChance',
    hasEngineEffect: true,
    foldedBy:
      "effective-weapon.ts (weapon.reloadSkipChanceBash rewrite); feeds sustain.ts reloadSec — bash-triggered channel (Battle-Loader's EP199), separate from reloadSkipChance's passive-on-reload channel (Quick Hands/Wild West Hands EP182)",
  },
  ammoFreeChance: {
    foldBase: 'dynamic',
    regime: 'sustainChance',
    hasEngineEffect: true,
    foldedBy:
      'effective-weapon.ts (weapon.ammoFreeChance rewrite); feeds sustain.ts effective capacity',
  },
  vatsApCost: {
    foldBase: 'dynamic',
    regime: 'weaponStat',
    hasEngineEffect: true,
    foldedBy:
      'effective-weapon.ts buildEffectiveWeapon (weapon.apCost rewrite); feeds ap-economy.ts',
  },
  chargeFullPowerSec: {
    foldBase: 'dynamic',
    regime: 'weaponStat',
    hasEngineEffect: true,
    foldedBy:
      'effective-weapon.ts buildEffectiveWeapon (weapon.fullPowerSeconds rewrite); gates weaponCharges() and feeds resolvedChargeTimeSec (src/lib/charge.ts), consumed by fire-rate.ts',
  },
  chargeFullPowerDamageMult: {
    foldBase: 'dynamic',
    regime: 'weaponStat',
    hasEngineEffect: true,
    foldedBy:
      'effective-weapon.ts buildEffectiveWeapon (weapon.fullPowerDamageMult rewrite); feeds chargeDamageMultiplier (src/lib/charge.ts)',
  },
  weaponMinRange: {
    foldBase: 'dynamic',
    regime: 'weaponStat',
    hasEngineEffect: true,
    foldedBy:
      'effective-weapon.ts buildEffectiveWeapon (weapon.minRange rewrite); feeds lib/distance.ts rangeFalloffMult, folded into paper-damage.ts outerMult/explosiveOuterMult via scenarios.ts',
  },
  weaponMaxRange: {
    foldBase: 'dynamic',
    regime: 'weaponStat',
    hasEngineEffect: true,
    foldedBy:
      'effective-weapon.ts buildEffectiveWeapon (weapon.maxRange rewrite); feeds lib/distance.ts rangeFalloffMult, folded into paper-damage.ts outerMult/explosiveOuterMult via scenarios.ts',
  },
  weaponOutOfRangeMult: {
    foldBase: 'dynamic',
    regime: 'weaponStat',
    hasEngineEffect: true,
    foldedBy:
      'effective-weapon.ts buildEffectiveWeapon (weapon.outOfRangeDamageMult rewrite); feeds lib/distance.ts rangeFalloffMult, folded into paper-damage.ts outerMult/explosiveOuterMult via scenarios.ts',
  },
  apRegen: {
    foldBase: 0,
    regime: 'apEconomy',
    hasEngineEffect: true,
    foldedBy: 'scenarios.ts, folded into ap-economy.ts computeApEconomy',
  },
  apPerCrit: {
    foldBase: 0,
    regime: 'apEconomy',
    hasEngineEffect: true,
    foldedBy: 'scenarios.ts, folded into ap-economy.ts computeApEconomy',
  },
  apRegenFlat: {
    foldBase: 0,
    regime: 'apEconomy',
    hasEngineEffect: true,
    foldedBy: 'scenarios.ts, folded into ap-economy.ts computeApEconomy (flat AP/sec term)',
  },
  apMax: {
    foldBase: 0,
    regime: 'apEconomy',
    hasEngineEffect: true,
    foldedBy: 'scenarios.ts, folded into ap-economy.ts computeApEconomy (AP pool size)',
  },
  apCritHot: {
    foldBase: 'dynamic',
    regime: 'apEconomy',
    hasEngineEffect: true,
    foldedBy:
      'scenarios.ts (per-modifier collect — durationSec matters), ap-economy.ts computeApEconomy (refresh-only HoT term)',
  },
  onslaughtMaxStacks: {
    foldBase: 0,
    regime: 'bootstrap',
    hasEngineEffect: true,
    // No consumedBefore — folded early in scenarios.ts / effective-weapon.ts but
    // still passed through to ScenarioInput.modifiers (same for the other Onslaught
    // and Bullet-Storm bootstrap stack-bound buckets).
    foldedBy:
      'scenarios.ts / effective-weapon.ts — folded once, threaded on ResolveContext.onslaughtMaxStacks; caps the onslaught StackCounter and onslaughtStacks CurveInput',
  },
  onslaughtReverse: {
    foldBase: 0,
    regime: 'bootstrap',
    hasEngineEffect: true,
    foldedBy:
      'scenarios.ts — folded once; folded > 0 activates reverse-onslaught stack averaging (onslaught.ts) threaded on ResolveContext.onslaughtReverseStacks',
  },
  bulletStormMaxStacks: {
    foldBase: 0,
    regime: 'bootstrap',
    hasEngineEffect: true,
    foldedBy:
      'scenarios.ts / effective-weapon.ts — folded once at each site, threaded on ResolveContext.bulletStormMaxStacks; caps the bulletStorm StackCounter and bulletStormStacks CurveInput',
  },
  bulletStormMinStacks: {
    foldBase: 0,
    regime: 'bootstrap',
    hasEngineEffect: true,
    foldedBy:
      'scenarios.ts / effective-weapon.ts — folded once at each site, threaded on ResolveContext.bulletStormMinStacks; floors the bulletStorm StackCounter and bulletStormStacks CurveInput',
  },
  bulletStormRetention: {
    foldBase: 0,
    regime: 'bootstrap',
    hasEngineEffect: true,
    foldedBy:
      'scenarios.ts — folded once; consumed by bulletstorm.ts bulletStormAvgStacks (sustained-fire average model)',
  },
  bulletStormOnKill: {
    foldBase: 'unfolded',
    regime: 'unfolded',
    hasEngineEffect: false,
    foldedBy:
      "none — kills are unknowable in steady-state paper DPS (Final Word's on-kill stack grant)",
  },
  bulletStormSpinUp: {
    foldBase: 'unfolded',
    regime: 'unfolded',
    hasEngineEffect: false,
    foldedBy: "none — spin-up/ramp timing not modeled (Valkyrie's)",
  },
  deflectChance: {
    foldBase: 'unfolded',
    regime: 'unfolded',
    hasEngineEffect: false,
    foldedBy: 'none — defensive, no incoming-damage model exists (The Action Hero)',
  },
  moveSpeedBonus: {
    foldBase: 0,
    regime: 'bootstrap',
    hasEngineEffect: true,
    // Folded by buildEffectiveWeapon into ResolveContext.moveSpeedBonus so
    // Fast Fighter's reload-speed curve can see Speed Demon / fish sandwich.
    consumedBefore: 'loadoutAssemble',
    foldedBy:
      'effective-weapon.ts buildEffectiveWeapon — folded once, threaded on ResolveContext.moveSpeedBonus; feeds the moveSpeedBonus CurveInput (Fast Fighter). Threaded in the weapon-stat fold ONLY — a damage-bucket curve on this input would read 0 until scenarios.ts also threads it',
  },
  armorPen: {
    foldBase: 0,
    regime: 'mitigation',
    hasEngineEffect: true,
    foldedBy:
      'scenarios.ts bootstrap fold → armorPenTotal; consumed by mitigation.ts applyMitigation (per-component Resist fraction)',
  },
  armorPenFlat: {
    foldBase: 0,
    regime: 'mitigation',
    hasEngineEffect: true,
    foldedBy:
      'scenarios.ts bootstrap fold → flat resist-point total; consumed by mitigation.ts applyMitigation (physical-resist-only, see bucket doc comment)',
  },
  vatsHitChance: {
    foldBase: 1,
    regime: 'display',
    deBased: true,
    hasEngineEffect: true,
    foldedBy:
      "scenarios.ts bootstrap fold (base 1, de-based) → ScenarioSet.vatsHitChanceBonus, rendered by ConditionsSection.tsx's pill — NEVER consumed by sustainedDps/apLimitedDps/any formula (Phase 4 — VATS hit-chance aggregate, display-only)",
  },
  vatsHitChanceMult: {
    foldBase: 1,
    regime: 'display',
    deBased: false,
    hasEngineEffect: true,
    foldedBy:
      "scenarios.ts bootstrap fold (base 1, NOT de-based — exposed as-is, 1 = neutral) → ScenarioSet.vatsHitChanceMult, rendered by ConditionsSection.tsx's pill — NEVER consumed by sustainedDps/apLimitedDps/any formula (Concentrated Fire EP109 multiplier, USER-RESOLVED 2026-07-19, display-only)",
  },
  dotDamage: {
    regime: 'dot',
    foldBase: 'dynamic',
    hasEngineEffect: true,
    foldedBy: 'paper-damage.ts computeDotDps',
  },
  maxHealth: {
    foldBase: 'dynamic',
    regime: 'playerStat',
    hasEngineEffect: true,
    foldedBy: 'player-stats.ts derivePlayerStats (245 + 5xEND + this fold)',
  },
  lockpickSkill: {
    foldBase: 0,
    regime: 'playerStat',
    hasEngineEffect: true,
    foldedBy:
      'player-stats.ts derivePlayerStats; feeds the lockpickSkill CurveInput (Pirate Punch)',
  },
  hackingSkill: {
    foldBase: 0,
    regime: 'playerStat',
    hasEngineEffect: true,
    foldedBy:
      'player-stats.ts derivePlayerStats; no consumer yet — wired for drop-in (STAT_HackingTier peer of lockpickSkill)',
  },
  stimpakHealMult: {
    foldBase: 0,
    regime: 'playerStat',
    hasEngineEffect: true,
    foldedBy:
      'player-stats.ts derivePlayerStats; feeds Medical Malpractice via the scaledBy mechanism',
  },
  stimpakHealMagMult: {
    foldBase: 1,
    regime: 'spellMagnitude',
    hasEngineEffect: true,
    foldedBy:
      'player-stats.ts derivePlayerStats via foldBucketProduct; feeds the future Stimpak-healing profile (src/lib/healing.ts) — no DPS consumer yet',
  },
  stimpakHealDurationMult: {
    foldBase: 1,
    regime: 'spellMagnitude',
    hasEngineEffect: true,
    foldedBy:
      'player-stats.ts derivePlayerStats via foldBucketProduct; feeds the future Stimpak-healing profile (src/lib/healing.ts) — no DPS consumer yet',
  },
  specialStrength: {
    foldBase: 'dynamic',
    regime: 'playerStat',
    hasEngineEffect: true,
    foldedBy:
      "player-stats.ts derivePlayerStats; feeds paper-damage.ts strengthTerm + the strength CurveInput (Debilitator's)",
  },
  specialPerception: {
    foldBase: 'dynamic',
    regime: 'playerStat',
    hasEngineEffect: true,
    foldedBy:
      'player-stats.ts derivePlayerStats; no CurveInput/formula reads it, but the folded value is what StatSummary renders (and highlights when buffed) — same as the other six SPECIALs',
  },
  specialEndurance: {
    foldBase: 'dynamic',
    regime: 'playerStat',
    hasEngineEffect: true,
    foldedBy:
      "player-stats.ts derivePlayerStats; feeds the maxHealth formula + the endurance CurveInput (Lifegiver's)",
  },
  specialCharisma: {
    foldBase: 'dynamic',
    regime: 'playerStat',
    hasEngineEffect: true,
    foldedBy: "player-stats.ts derivePlayerStats; feeds the charisma CurveInput (Peace Maker's)",
  },
  specialIntelligence: {
    foldBase: 'dynamic',
    regime: 'playerStat',
    hasEngineEffect: true,
    foldedBy:
      "player-stats.ts derivePlayerStats; feeds the intelligence CurveInput (Science!, Pyro-Technician's, Cryologist's)",
  },
  specialAgility: {
    foldBase: 'dynamic',
    regime: 'playerStat',
    hasEngineEffect: true,
    foldedBy:
      "player-stats.ts derivePlayerStats; feeds ap-economy.ts computeApEconomy's AP pool size",
  },
  specialLuck: {
    foldBase: 'dynamic',
    regime: 'playerStat',
    hasEngineEffect: true,
    foldedBy: "player-stats.ts derivePlayerStats; feeds crit-meter.ts computeCritMeter's fill rate",
  },
  damageResistGain: {
    foldBase: 'dynamic',
    regime: 'playerStat',
    hasEngineEffect: true,
    foldedBy:
      'player-stats.ts derivePlayerStats; folded onto the manual playerDamageResist knob (Barbarian STR→DR, Iron Fist DR→unarmed)',
  },
  energyResistGain: {
    foldBase: 'unfolded',
    regime: 'unfolded',
    hasEngineEffect: false,
    foldedBy:
      'none — wearer-side resist mitigation not modeled (AV EnergyResist extracted via FALLBACK_AVIF_ROUTES, e.g. Scaly Skin, but no consumer yet)',
  },
  incomingDamageMult: {
    foldBase: 'unfolded',
    regime: 'unfolded',
    hasEngineEffect: false,
    foldedBy:
      'none — no player-defense/incoming-damage model exists (docs/assumptions.md "Mod Incoming Weapon Damage self-targeted sources")',
  },
};

/** Buckets whose fold rewrites an effective-weapon field rather than feeding a damage term — derived from BUCKET_REGISTRY. */
export const WEAPON_STAT_BUCKETS: ReadonlySet<Bucket> = new Set(
  (Object.entries(BUCKET_REGISTRY) as Array<[Bucket, BucketRegimeEntry]>)
    .filter(([, entry]) => entry.regime === 'weaponStat')
    .map(([bucket]) => bucket),
);

/** Sustain expected-value chance buckets — folded in effective-weapon.ts, consumed by sustain.ts. */
export const SUSTAIN_CHANCE_BUCKETS: ReadonlySet<Bucket> = new Set(
  (Object.entries(BUCKET_REGISTRY) as Array<[Bucket, BucketRegimeEntry]>)
    .filter(([, entry]) => entry.regime === 'sustainChance')
    .map(([bucket]) => bucket),
);

/** Buckets with no engine effect today — derived from BUCKET_REGISTRY; drives the OMOD/consumable picker's 'inert' badge. */
export const INERT_ENGINE_BUCKETS: ReadonlySet<Bucket> = new Set(
  (Object.entries(BUCKET_REGISTRY) as Array<[Bucket, BucketRegimeEntry]>)
    .filter(([, entry]) => !entry.hasEngineEffect)
    .map(([bucket]) => bucket),
);

/** Buckets stripped before the modifier list reaches the resolver — derived from BUCKET_REGISTRY. */
export const CONSUMED_BEFORE_BUCKETS: ReadonlySet<Bucket> = new Set(
  (Object.entries(BUCKET_REGISTRY) as Array<[Bucket, BucketRegimeEntry]>)
    .filter(([, entry]) => entry.consumedBefore !== undefined)
    .map(([bucket]) => bucket),
);

/** Subset of CONSUMED_BEFORE_BUCKETS stripped inside buildEffectiveWeapon's modifier filter. */
export const EFFECTIVE_WEAPON_CONSUMED_BUCKETS: ReadonlySet<Bucket> = new Set(
  (Object.entries(BUCKET_REGISTRY) as Array<[Bucket, BucketRegimeEntry]>)
    .filter(([, entry]) => entry.consumedBefore === 'effectiveWeapon')
    .map(([bucket]) => bucket),
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
  return !(INERT_ENGINE_BUCKETS.has(m.bucket) || m.conditions.some((c) => c.kind === 'unresolved'));
}

/** True iff at least one modifier in the list moves a number today (empty list → false). */
export function hasAnyEngineEffect(modifiers: readonly Modifier[]): boolean {
  return modifiers.some(modifierHasEngineEffect);
}

export type WeaponClass = Weapon['weaponClass'];
export type DamageType = Weapon['components'][number]['damageType'];

export type StackCounter =
  | 'tenderizer'
  | 'onslaught'
  | 'bulletStorm'
  | 'adrenaline'
  | 'concentratedFire';

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
  /** `value: true` requires a power attack; `value: false` requires NOT power attacking. */
  | { kind: 'powerAttack'; value: boolean }
  /** The hit is a VATS critical (symmetric with sneaking/powerAttack). */
  | { kind: 'crit' }
  /**
   * The attack is fired in VATS (symmetric with sneaking/powerAttack/crit) —
   * `value: true` is active for both the VATS and VATS+Sneak scenarios,
   * inactive for Manual Aim (`ctx.scenario.isVats`); `value: false` requires
   * NOT firing in VATS. Concentrated Fire's per-stack damage bonus only
   * applies in VATS (docs/assumptions.md "Concentrated Fire stacks").
   */
  | { kind: 'vatsOnly'; value: boolean }
  /** No armor piece worn at all (Barbarian's unarmored ×2 — symmetric with sneaking/powerAttack/crit/vatsOnly). */
  | { kind: 'unarmored'; value: boolean }
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
  /**
   * Lifetime lore/achievement challenge completed (HasCompletedChallenge on a
   * CHAL formid). Evaluated against `PlayerConditions.completedChallengeIds`
   * (The Pipe) or `localLegendFishingChallengesCompleted` (Kingfisher's six
   * Local Legend fishing challenges — docs/assumptions.md).
   */
  | { kind: 'lifetimeChallengeCompleted'; challengeId: string }
  /** Active alcohol consumable selected (HasMagicEffectKeyword(AlcoholEffect)) — derived in resolveLoadout. */
  | { kind: 'underAlcoholEffect'; value: boolean }
  /** Target carries ≥1 active effect with this keyword (Pyromaniac's: DamageTypeFire; Viper's: DamageTypePoison). */
  | { kind: 'enemyHasActiveEffect'; keyword: string }
  /** Enemies in the engaged group == count, or ≥ count for the top tier (Encircler's — GetGroupTargetCount). */
  | { kind: 'enemyGroupCount'; count: number; orMore?: boolean }
  /**
   * Number of currently-worn armor pieces carrying `keyword` == count, or ≥
   * count with orMore (Battle-Loader's 1/2/3/4/≥5-piece tiers —
   * WornApparelHasKeywordCount). Evaluated against
   * `PlayerConditions.wornPieceCounts`, which `resolveLoadout` derives from
   * the Armor checklist — see resolve.ts's `wornPieceCount` case and
   * docs/assumptions.md "Armor".
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
   * `PlayerConditions.killStreak`.
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
   * input when armor modeling lands (docs/assumptions.md "Armor (Phase 3 engine + UI, 2026-07-18)").
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
  /**
   * Player Rad Resistance (the RadResistExposure AV, 0x000002EA) at or above
   * `min` — Daisy Cutter's rebuilt effect (unique Fat Man, 20260724 patch):
   * 8 discrete gates at 1000/2000/…/8000, each unlocking its own +20% dbm
   * step, for a hard +160% cap at ≥8000 (nothing beyond). Additive — pools
   * with other damage bonuses rather than multiplying them. No armor model
   * derives Rad Resistance from equipped gear (same gap as `playerDamageResist`
   * / Berserker's), so the AV is a manual knob,
   * `PlayerConditions.playerRadResist`, default 0.
   */
  | { kind: 'radResistAtLeast'; min: number }
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
   * The player's (buff-folded) Perception stat — AV 0x000002C3. The
   * Awareness perk's VATS-accuracy-vs-PER curve reads it (mirrors
   * strength/endurance/charisma/intelligence above; points (1,5)→(15,18)→
   * (30,30)→(60,45)→(100,50), scale 0.01). Feeds only the `vatsHitChance`
   * bucket today (Phase 4 — VATS hit-chance aggregate, display-only).
   */
  | 'perception'
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
  | 'weaponCondition'
  | 'lockpickSkill' // STAT_LockpickingTier 0x0032CB37 — Pirate Punch's "+5% Damage per Lockpick Skill" curve
  | 'hackingSkill' // STAT_HackingTier 0x00356A14 — wired for drop-in (peer of lockpickSkill; no curve consumer yet)
  | 'stimpakHealMult' // STAT_HealMultStimpak 0x00206F31 — Medical Malpractice's dbm scale (via scaledBy, not a curve)
  | 'stimpakHealMagMult' // stimpakHealMagMult bucket product-fold — for a future Stimpak-healing-scaled unique (scaledBy)
  | 'stimpakHealDurationMult'; // stimpakHealDurationMult bucket product-fold — same, duration axis

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
  /**
   * "Add Actor Value Mult" entry points: the resolved value is multiplied by
   * a live player stat rather than being constant — effective = value × stat.
   * Composes with `curve` (curve result × stat), though nothing uses both today.
   * Medical Malpractice: dbm ADD 0.01 scaledBy 'stimpakHealMult'.
   */
  scaledBy?: CurveInput;
} & ModifierValue;

/** A modifier fragment without its id/source (as produced by MGEF translation). */
export type ModifierFragment = {
  bucket: Bucket;
  op: ModOp;
  conditions: Condition[];
  durationSec?: number;
  /**
   * "Add Actor Value Mult" entry points: the resolved value is multiplied by
   * a live player stat rather than being constant — effective = value × stat.
   * Composes with `curve` (curve result × stat), though nothing uses both today.
   * Medical Malpractice: dbm ADD 0.01 scaledBy 'stimpakHealMult'.
   */
  scaledBy?: CurveInput;
} & ModifierValue;
