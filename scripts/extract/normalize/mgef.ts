import type {
  Bucket,
  Condition,
  CurveInput,
  DamageType,
  Modifier,
  ModifierFragment,
  ModifierSource,
  ValueCurve,
} from '../../../src/types/modifiers';
import type { EsmRecord, EsmSource } from '../esm-client';
import type {
  GeneratedAura,
  GeneratedProc,
  GeneratedProcComponent,
} from '../../../src/types/generated';
import {
  flattenConditionRows,
  flattenPerkConditionRows,
  translateConditions,
  type ConditionTranslationContext,
  type RawCondition,
} from './conditions';
import { decodeInstantDamageComponent, decodeProcComponentsFromExpl } from './proc';
import { decodeAuraFromCloakMgef } from './aura';

/**
 * Shared MGEF → Modifier translation, driven by the hidden engine "plumbing"
 * perks (STAT_DamagePerk & co.) that define how each STAT_* actor value feeds
 * the damage formula. Used by perk, legendary, mutation, and consumable
 * extraction.
 */

/** Entry-point name → formula bucket (plumbing perks + direct perk entry points). */
export const ENTRY_POINT_BUCKETS: Record<string, Bucket> = {
  'Mod Weapon DMG Bonus Mult': 'dbm',
  'Mod My Critical Hit Damage Mult': 'critDmgBonus',
  'Mod Sneak Attack Mult': 'sneakBonus',
  'Mod Weak Body Part Damage Mult': 'weakpointBonus',
  'Mod Outgoing Limb Damage': 'limbDamage',
  // USER-RESOLVED 2026-07-21: this Entry Point (function "Multiply 1 +
  // Actor Value Mult" on STAT_DamagePerk, against STAT_DmgExplosive_Formula/
  // STAT_DmgGrenade_Formula) is a standalone multiplier, NOT a dbm-pool
  // contributor — sibling of 'Mod Weapon Attack Damage' below, scoped to
  // explosive damage instead of the whole weapon. Routed to `baseDamage`
  // (NOT `wholeDamage`): it needs `damageTypeScope: ['explosive']` (below,
  // ENTRY_POINT_EXTRA_CONDITIONS) to stay off a mixed weapon's non-explosive
  // components, and `wholeDamage` folds once for the whole hit before
  // `componentType`/`componentIsExplosion` exist on the resolve context
  // (paper-damage.ts computePaperDamage) — a damageTypeScope condition on a
  // wholeDamage modifier can never match there. `baseDamage` folds
  // per-component and is the only standalone-multiplier bucket that scoping
  // works in.
  // Currently INERT: no live consumer flows through this route today — the
  // AV-scaled "Multiply 1 + Actor Value Mult" shape isn't handled by the
  // entry-point-value extraction path (pre-existing gap, separate issue;
  // shows up as a "skipped" note on STAT_DamagePerk in perks.json). This is
  // a forward-looking correctness fix, not an observable data change.
  // Distinct from, and does NOT change, Demolition Expert's STAT_DmgExplosive
  // AV route (FALLBACK_AVIF_ROUTES below) — that one is a different
  // mechanism, deliberately additive-dbm per the June 2026 patch
  // (user-reported 2026-07-13, in-game proven: Bloodied 0.9 + Adrenal 0.5 +
  // Demo Expert 0.6 → ×3.0, not (1+0.9+0.5)×(1+0.6)=×3.84), untouched here.
  'Mod Player Explosion Damage': 'baseDamage',
  // Grenadier (STAT_DamagePerk Effects[30], Perk Entry ID 37, Function
  // "Multiply 1 + Actor Value Mult", Float 0.01, AV STAT_ExplosionRadius
  // 0x00066997, no perk conditions): STAT_ExplosionRadius accumulates the
  // radius/AoE bonus (Grenadier r1 +50, r2 +100 via MGEF
  // AbPerkFortifyExplosionRadius) as a raw percentage-point AV; this entry
  // point's own ×0.01 scale converts it to the fraction
  // `explosionRadiusBonus` carries. Inert alone (explosion radius/AoE isn't
  // modeled) — only produces damage when mod_Custom_BunkerBuster's
  // ConvertExplosiveRadiusToDamage flag is also set (extract-omods.ts
  // ACTOR_VALUE_BUCKETS; folded together in effective-weapon.ts
  // buildEffectiveWeapon).
  'Mod Player Explosion Scale': 'explosionRadiusBonus',
  'Mod Power Attack Damage': 'powerAttackBonus',
  // Percent-of-meter semantics (Critical Savvy SETs 85/70/55); see crit-meter.ts.
  'Mod VATS Critical Cost': 'critConsumption',
  'Mod VATS Critical Charge': 'critFill',
  // Onslaught (2026-07-12): EP190 "Mod Max Consecutive Hits Allowed" (Add
  // Value) ADDs a flat contribution to the shared stack cap — identical
  // entry point across every contributor (Guerrilla/Gunslinger Expert+Master
  // PERK-direct; Furious/Pounder's/Splinter's via the granted-perk chase).
  'Mod Max Consecutive Hits Allowed': 'onslaughtMaxStacks',
  // EP189 "Mod Damage on Consecutive Hits" (Furious/Pounder's/Splinter's,
  // function "Add Actor Value Mult"): per-stack dbm. The plain bucket lookup
  // here only supplies the target bucket — `translateGrantedPerk` special-
  // cases this entry point's function to append the `stacks:onslaught`
  // condition (the value alone would otherwise apply unconditionally).
  'Mod Damage on Consecutive Hits': 'dbm',
  // Bullet Storm / Lock and Load r1 (2026-07-16, verified via `esm get`):
  // PERK LockAndLoad01 0x00320168 carries this entry point directly (EP210,
  // Function "Add Value", Float 0.5, no perk conditions) — no plumbing perk
  // carries it, so buildAvifRoutes never sees it; wired here like every other
  // direct-PERK entry point (docs/assumptions.md "Bullet Storm").
  'Mod Ammo Spender Max Reload Stack Mult': 'bulletStormRetention',
  // Grounded's Charged Penalty (Mutation_ReduceEnergyDamage_Perk): Multiply
  // Value 0.5/0.63/0.75/0.88 by Class Freak tier, scoped WeaponTypeEnergy OR
  // WeaponTypeAlienBlaster. USER-RESOLVED 2026-07-21: this is a standalone
  // multiplier, NOT a dbm-pool contributor — it's a genuinely different
  // Entry Point from 'Mod Weapon DMG Bonus Mult' (the real dbm source, fn
  // "Add Actor Value Mult" on STAT_DamagePerk), with a different Function
  // Type ("Multiply Value", a bare scalar). Routed to `wholeDamage`
  // (mathematically equivalent to `baseDamage` here since the gate is
  // weapon-level, not per-component — see docs/assumptions.md "Mutation
  // penalties & Class Freak"), matching its true sibling entry point 'Mod
  // Incoming Weapon Damage' (Follow Through / Taking One For The Team,
  // already confirmed `wholeDamage`-shaped — src/data/manual-uptime.ts).
  // Ripple: also activates LegendaryCommonWeaponPerk and
  // P62_..._RuinersPerk, both of which stay inert behind `unresolved` gates
  // (verified 2026-07-14).
  'Mod Weapon Attack Damage': 'wholeDamage',
  // Battle-Loader's (armor legendary, Phase 3 armor pipeline): granted PERK
  // Legendary_Armor_BattleLoadersPerk carries 5 of these effects, each
  // "Set Value 1.0" — a boolean trigger placeholder, NOT the real chance (see
  // the narrow special case in translateGrantedPerk below, which overrides
  // this generic mapping for that exact shape). Kept here too as a fallback
  // for a hypothetical un-gated future use of the entry point.
  'Instant Reload Clip On Bash': 'reloadSkipChance',
  // Quick Hands / Wild West Hands (EP182 "Auto Fill Weapon Clip") — the real
  // per-rank chance lives in each effect's GetRandomPercent gate (Set Value
  // 1.0 is a boolean placeholder), same shape as EP199 below. Listed here
  // only as a fallback for a hypothetical un-gated future use; the dedicated
  // GetRandomPercent branch in translateGrantedPerk handles the live perks.
  'Auto Fill Weapon Clip': 'reloadSkipChance',
  // VATS hit-chance aggregate (Phase 4, display-only — see the
  // `vatsHitChance` bucket doc comment, src/types/modifiers.ts). Multiply
  // Value entries verified via `esm get` 2026-07-18: FortifyVATSAccuracyChemPerk
  // 0x001CC775 (Float 1.1 — the 7 "V.A.T.S. Matrix Overlay" power-armor
  // helmet mods, granted via AttachedPerk); HoppyHunter_ScopeStability
  // 0x0045412A (Float 0.8 — Hoppy Hunter IPA's VATS-accuracy PENALTY, via
  // "Perk to Apply"); Mutation_ReduceAccuracy_Perk 0x003C4035 (Float
  // 0.7/0.77/0.85/0.93 by Class Freak tier — Twisted Muscles' penalty, via
  // "Perk to Apply"). The generic Multiply-Value branch in
  // `translateGrantedPerk` below (`MUL_ADD (float − 1)`) handles all three
  // with no special-casing.
  'Mod VATS Hit Chance': 'vatsHitChance',
  // Mod Incoming Weapon Damage (EP36) — every occurrence in the current ESM
  // dump is self-targeted (PA_EmergencyProtocols, Legendary_Armor_Heavyweight,
  // BOUNTY_Legendary_Armor_LucidPerk, UnstoppableMonster_Perk,
  // Mutation_EmpathPenalty_Perk — verified via _meta.json unresolved-note scan,
  // 2026-08-03). The offensive, TARGET-redirected half of this same Entry
  // Point (Follow Through / Taking One For The Team) is hand-authored
  // separately as `wholeDamage` in src/data/manual-uptime.ts and never reaches
  // this generic routing — no self-vs-target split is needed here today; if a
  // target-redirected occurrence of this exact Entry Point ever appears in a
  // future ESM dump, route it to `baseDamage` instead (component-scoping,
  // same reasoning as 'Mod Player Explosion Damage' above), not here.
  'Mod Incoming Weapon Damage': 'incomingDamageMult',
  // Cultist Piercer / Ticket to Revenge: "Mod Target Damage Resistance" with
  // Multiply Value (DR × float) or Multiply 1 + Actor Value Mult (Onslaught-
  // scaled DR). Routed to `armorPen` (fraction, not `armorPenFlat` resist
  // points) — see src/types/modifiers.ts + mitigation.ts.
  'Mod Target Damage Resistance': 'armorPen',
  // Concentrated Fire (issue #48, ESM-verified 2026-08-19 — replaces the old
  // hand-authored `extraPerkModifiers.ConcentratedFire` override): EP135 on
  // STAT_DamagePerk (0x0023A0EB), Function "Add Actor Value Mult", Float
  // 0.01, AV param ConcentratedFireRank (0x00900A59) — dbm ADD 0.01 × the AV
  // (the owned rank number, 1/2/3, set by PERK ConcentratedFire01's granted
  // Ability SPEL AbPerkConcentratedFire 0x00900A5D via 3 HasPerk-gated
  // magnitude branches on the family's own sibling ranks — rides the same
  // rank-simulation rails as Commando, no new logic needed). See
  // ENTRY_POINT_EXTRA_CONDITIONS below for the vatsOnly/stacks gating this
  // needs (buildAvifRoutes carries no plumbing-perk conditions for it).
  'Mod VATS Concentrated Fire Damage Mult': 'dbm',
  // Ammo Health (issue #46, 2026-08-19 — verified via `esm get`/`esm chase`):
  // EP125, granted via the Script-MGEF → "Perk to Apply" chain chased from
  // the 10mm/Gatling Gun magazine mods (mod_10mm_Magazine_Ammo,
  // mod_GatlingGun_Magazine_ExtraLarge → Include
  // _PARENT_mod_WEAPON_GENERIC_AmmoCapacity_Tier1/2 0x0052440F/0x00524410 →
  // ENCH enchMod_Weapon_AmmoCapacity_PlasmaCoreHealth_Tier1/2
  // 0x0091B688/0x007B23C8 → MGEF Mod_AmmoCapacity_PlasmaCoreHealth_Tier1/2
  // → hidden PERK, Function "Add Value", Float 0.5). This multiplies the max
  // condition Health of the equipped battery/core ammo item — each shot
  // still costs exactly 1 Health, so more max Health means more shots fired
  // before the core is expended, i.e. a magazine-capacity increase for
  // core-based weapons, matching the ENCH's own display Name ("Ammo
  // Capacity"). Three independent direct-PERK sources corroborate the
  // mechanic and its weapon scope: Power User (PowerUser01-03
  // 0x0027A873/74/75, card text "Fusion Cores now last 30/60/100% longer" —
  // itself a shots-before-empty framing, Float 0.3/0.6/1.0), the Repair
  // Bobblehead (Bobblehead_RepairPerk), and Tesla Science Magazine #4 — all
  // three gate this SAME entry point on `WornHasKeyword(ma_GatlingLaser |
  // ma_Ultracite_GatlingLaser)` and grant it ALONGSIDE a sibling MGEF that
  // reduces "PA Battery Damage Rate" (a separate Power-Armor
  // fusion-core-drain mechanic, not this one). Routed to the dedicated
  // `ammoHealthMult` bucket (NOT `ammoCapacity` — see that bucket's doc
  // comment in src/types/modifiers.ts for why folding it in would silently
  // inflate magazine capacity for every standard-ammo weapon sharing the
  // "GENERIC" magazine-mod template, on top of the ALREADY-correct direct
  // `AmmoCapacity` OMOD-property fold present on the exact same records).
  // Stored-inert: folding the Gatling Laser/Ultracite Gatling Laser-gated
  // instances into effective shots-per-core needs a core-weapon gate this
  // engine doesn't have yet (docs/assumptions.md "Ammo Health (battery/core
  // Health)").
  'Mod Ammo Health Mult': 'ammoHealthMult',
  // Concentrated Fire's hit-chance half — EP109 on the same plumbing perk,
  // same Function/AV param, two branches keyed on
  // HasKeyword(WeaponTypeAutomatic): ==0 (non-auto) Float 4.0, ==1 (auto)
  // Float 1.0. USER-RESOLVED 2026-07-19 (see the removed override's doc
  // comment, git history): these Floats are pre-2025-rework "accuracy
  // points", not fractions — ENTRY_POINT_SCALE_MULTIPLIER below applies the
  // ×0.01 conversion to a pure per-rank multiplier (0.04/0.01 per rank) so
  // this bucket stays a MUL_ADD-shaped fraction like every other
  // `vatsHitChanceMult` source-to-be. The two HasKeyword branches translate
  // to the `weaponKeyword: WeaponTypeAutomatic` present:false/true split
  // automatically via buildAvifRoutes' rawConditions → translateConditions.
  'Mod VATS Concentrated Fire Chance Bonus': 'vatsHitChanceMult',
};

/**
 * Per-entry-point scale correction applied on top of the plumbing perk's raw
 * `Float`, for entry points whose ESM Float isn't already the final
 * multiplier `buildAvifRoutes`/`push` expect (`effectiveMagnitude × scale`).
 * Every other AvifRoute-routed entry point's Float IS the final per-AV-point
 * multiplier already (e.g. EP135 above, Float 0.01) — this map exists solely
 * for Concentrated Fire's EP109, whose Float is authored in "accuracy
 * points" (see the ENTRY_POINT_BUCKETS comment above), not a fraction.
 */
export const ENTRY_POINT_SCALE_MULTIPLIER: Record<string, number> = {
  'Mod VATS Concentrated Fire Chance Bonus': 0.01,
};

/**
 * Per-entry-point op override for AvifRoute-routed entry points whose target
 * bucket isn't the generic ADD-pool shape `push()` defaults every route to.
 * `vatsHitChanceMult` (Concentrated Fire's hit-chance half) is a genuine
 * multiplier (bootstrap base 1, see the Bucket doc-comment in
 * src/types/modifiers.ts) — modeled as `MUL_ADD`, matching the removed
 * hand-authored override, even though it folds to the same number as `ADD`
 * would at base 1 (foldOps' `(Σ MUL_ADD) × base` term with base=1 degenerates
 * to plain summation) — the equivalence gate for issue #48 compares op
 * literally, not just the folded result.
 */
export const ENTRY_POINT_OP_OVERRIDE: Record<string, Modifier['op']> = {
  'Mod VATS Concentrated Fire Chance Bonus': 'MUL_ADD',
};

/**
 * Narrow keyword set that TRIGGERS stimpak-heal routing — deliberately
 * excludes ChemEffect/ChemTypeHealing/PerkMedic (too broad: also used by
 * Carnivore's/Herbivore's unrelated "Safe Meat/Veggies" disease-reduction
 * perks and other content). Every real stimpak-heal source (Field Surgeon,
 * Doctor's 3★, Healing Factor's penalty) carries at least one of these three
 * in its OR-group alongside whatever broader keywords it also has.
 */
const STIMPAK_HEAL_TRIGGER_KEYWORD_EDIDS = new Set([
  'ChemTypeStimpack',
  'ChemTypeRadaway',
  'ChemDispelRadX',
]);

/**
 * Perks excluded from stimpak-heal routing despite satisfying the trigger:
 * - 0x006446B8 XPD_Fuel_CodeBlue_StimpakBuffPerk — Expeditions fuel buff, not
 *   repeatable endgame content (project owner, 2026-08-06).
 * - 0x008DC2CB WorldPets_Healing_SpeedHealing — pet-only (`playable: False`);
 *   carries ChemTypeStimpack directly, so the keyword gate alone can't
 *   exclude it.
 */
const STIMPAK_HEAL_EXCLUDED_PERK_FORM_IDS = new Set(['0x006446B8', '0x008DC2CB']);

function isChemKeywordRow(row: RawCondition): boolean {
  return row.Function === 'EPAlchemyEffectHasKeyword' || row.Function === 'EPMagic_SpellHasKeyword';
}

/**
 * Routes EP29 "Mod Spell Magnitude" / EP30 "Mod Spell Duration" to
 * `stimpakHealMagMult`/`stimpakHealDurationMult` ONLY when every matching
 * keyword-gate row in this effect runs on Subject (excludes Field Surgeon's
 * heal-OTHERS effects, `Run On: Potential Players`) and at least one row
 * names a stimpak-heal trigger keyword. Every other EP29/EP30 use (Class
 * Freak's generic mutation-penalty scaling, Carnivore/Herbivore food scaling,
 * WorldPets, Code Blue) returns null and falls through to the existing
 * unknown-entry-point/skipped path completely unchanged.
 *
 * Returns the target bucket plus `conditionRows` with the matched
 * keyword-gate rows REMOVED — they're now baked into the bucket choice.
 * Leaving them in would double-gate the modifier AND land as an
 * `{kind:'unresolved'}` condition (EPAlchemyEffectHasKeyword/
 * EPMagic_SpellHasKeyword have no other translateConditions case), which
 * would make the modifier permanently inert via `modifierHasEngineEffect`.
 * Any OTHER condition rows on the effect (Doctor's wornPieceCount tab,
 * Healing Factor's classFreakRank tab) are left untouched and still flow
 * through the caller's normal `translateConditions` call.
 */
export function resolveStimpakHealEntryPoint(
  epName: string,
  perkFormId: string,
  conditionRows: RawCondition[],
  edidByFormId: Map<string, string>,
): { bucket: Bucket; conditionRows: RawCondition[] } | null {
  if (epName !== 'Mod Spell Magnitude' && epName !== 'Mod Spell Duration') return null;
  if (STIMPAK_HEAL_EXCLUDED_PERK_FORM_IDS.has(perkFormId)) return null;

  const chemRows = conditionRows.filter(isChemKeywordRow);
  const triggered = chemRows.some((row) =>
    STIMPAK_HEAL_TRIGGER_KEYWORD_EDIDS.has(edidByFormId.get(row['Parameter 1'] ?? '') ?? ''),
  );
  if (!triggered) return null;
  if (chemRows.some((row) => (row['Run On'] ?? 'Subject') !== 'Subject')) return null;

  const bucket: Bucket =
    epName === 'Mod Spell Magnitude' ? 'stimpakHealMagMult' : 'stimpakHealDurationMult';
  // Consume EVERY chem-keyword row in this effect, not just the ones that
  // triggered — Healing Factor's penalty OR-group carries ChemTypeHealing/
  // ChemEffect/PerkMedic alongside ChemTypeStimpack; leaving those un-consumed
  // would land them as `{kind:'unresolved'}` (no other translateConditions
  // case handles these two Functions), permanently killing the modifier.
  return { bucket, conditionRows: conditionRows.filter((row) => !isChemKeywordRow(row)) };
}

/**
 * Baked conditions appended to every modifier an entry point produces —
 * for entry points whose scope isn't expressible by the bucket alone.
 * Consumed by three sites: extract-perks.ts's direct PERK path,
 * `translateGrantedPerk` below, and (issue #48) `buildAvifRoutes`, which
 * copies a matching entry onto each `AvifRoute.extraConditions` it builds
 * from a plumbing perk's entry points — the AV-set-by-Ability path's own
 * condition rows never carry this, since it isn't ESM-derived scoping (e.g.
 * Concentrated Fire's manual `stacks` counter).
 */
export const ENTRY_POINT_EXTRA_CONDITIONS: Record<string, Condition[]> = {
  // Explosion-scoped baseDamage (see the ENTRY_POINT_BUCKETS note): applies
  // to `fromExplosion` components and explosive twins only —
  // `damageTypeScope ['explosive']` matches both via
  // `ResolveContext.componentIsExplosion` (resolve.ts).
  'Mod Player Explosion Damage': [{ kind: 'damageTypeScope', types: ['explosive'] }],
  // Concentrated Fire damage half (issue #48): the game's own stack counter
  // (player-driven consecutive-VATS-shots) has no ESM record — `vatsOnly` +
  // `stacks(counter:'concentratedFire', max:20)` is the modeled stand-in
  // (docs/assumptions.md "Concentrated Fire stacks"; max 20 = GMST
  // iVATSConcentratedFireBonus). Threaded through `buildAvifRoutes`'
  // `extraConditions` (below) since no plumbing-perk condition row carries
  // this — it's a manual player-input gate, not ESM-derived.
  'Mod VATS Concentrated Fire Damage Mult': [
    { kind: 'vatsOnly', value: true },
    { kind: 'stacks', counter: 'concentratedFire', max: 20 },
  ],
  // Hit-chance half — deliberately NOT `vatsOnly` (matches every other
  // `vatsHitChance`/`vatsHitChanceMult` source: the pill is a global display,
  // not a per-scenario term), but still gated by the same manual stacks slider.
  'Mod VATS Concentrated Fire Chance Bonus': [
    { kind: 'stacks', counter: 'concentratedFire', max: 20 },
  ],
};

/** Gun Fu target-index EPs — Set Value magnitudes from GunFu01–03 (20260821 dump). */
const GUN_FU_TARGET_EP: Record<string, number> = {
  'Mod VATS Gun-Fu 2nd Target Dmg Mult': 2,
  'Mod VATS Gun-Fu 3rd Target Dmg Mult': 3,
  'Mod VATS Gun-Fu 4th+ Target Dmg Mult': 4,
};

/**
 * Fallback AVIF routes for stats consumed outside the plumbing perks (DFOBs
 * etc.). `archetypes`, when present, restricts the route to those MGEF
 * archetypes — the Health route must catch Peak Value Modifiers (Adrenal
 * Reaction's permanent max-HP cut) but never Value Modifiers (every cooked
 * food's instant RestoreHealthFood heal sits on the same AV).
 */
export const FALLBACK_AVIF_ROUTES: Record<
  string,
  { bucket: Bucket; scale: number; conditions?: Condition[]; archetypes?: string[] }
> = {
  STAT_SneakAttackBonus: { bucket: 'sneakBonus', scale: 0.01 },
  STAT_DmgPowerAttack: { bucket: 'powerAttackBonus', scale: 0.01 },
  // Lockpick Skill (Picklock/Picklock Expert/Picklock Master perks ADD 1 each,
  // Master Infiltrator legendary ADD 3, Safecracker's 3★ armor ADD 1/piece —
  // esm refs 0x0032CB37, 2026-08-04). Scale 1, NOT 0.01: this AV is integer
  // skill points (max realistic 11), not a percent. Feeds Pirate Punch's
  // unique-mod curve via the `lockpickSkill` CurveInput (CURVE_INPUT_AVS below).
  STAT_LockpickingTier: { bucket: 'lockpickSkill', scale: 1 },
  // Hacking Skill (Hacker/Hacker Expert/Hacker Master perks ADD 1 each,
  // Master Infiltrator legendary ADD 3, Safecracker's 3★ armor ADD 1/piece —
  // same OMODs that grant lockpickSkill, esm refs 0x00356A14). No weapon
  // reads this as a curve input yet — wired for drop-in, matching
  // lockpickSkill's shape exactly (STAT_HackingTier is its direct peer).
  STAT_HackingTier: { bucket: 'hackingSkill', scale: 1 },
  // Stimpak Healing (STAT_HealMultStimpak, percent-point AV, base 0):
  // granted by First Aid perk (Intelligence-keyed curve) and the Medicine
  // Bobblehead (flat +30). Scale 1: the AV's magnitudes ARE percent points
  // (bobblehead 30, FirstAidBonus curve Y range 10-100) despite the AVIF's
  // "Percentage (Scale By 100 In UI)" flag suggesting a stored fraction —
  // the x0.01 conversion happens at the CONSUMER (Medical Malpractice's own
  // perk Float is 0.01) via the scaledBy mechanism, not here.
  STAT_HealMultStimpak: { bucket: 'stimpakHealMult', scale: 1 },
  // Peak Value Modifier on ArmorPenetration AV (Anti-Armor, Blade of Bastet's
  // AbFortifyArmorPenetration curve, ...). Percentage flag on AVIF → scale 0.01.
  ArmorPenetration: { bucket: 'armorPen', scale: 0.01, archetypes: ['Peak Value Modifier'] },
  // Read directly by DamageVsNonWeakpoint_DO in the damage formula.
  STAT_DmgVsTorso: {
    bucket: 'dbm',
    scale: 0.01,
    conditions: [{ kind: 'bodyPart', part: 'torso' }],
  },
  // Legendary-effect AVs carried as OMOD ActorValues properties (2026-07-10
  // review). Consumers: weakpoint/limb read by the damage formula directly;
  // bash/explosive-payload buckets are stored-inert until their mechanics land.
  STAT_DmgVsWeakSpot: { bucket: 'weakpointBonus', scale: 0.01 }, // Pin-Pointer's
  STAT_DmgLimbs: { bucket: 'limbDamage', scale: 0.01 }, // Crippling
  STAT_DmgBash: { bucket: 'bashDamage', scale: 0.01 }, // Basher's
  LGND_ExplosivePayload: { bucket: 'explosivePayload', scale: 0.01 }, // Explosive
  // Demolition Expert (AbPerkDemolitionExpert, magnitudes 20/40/60 with
  // HasPerk rank gates). Was an unmapped-AVIF gap: the perk extracted with
  // zero modifiers until the 2026-07-13 launcher work. June 2026 patch
  // (user-reported): explosion bonuses fold ADDITIVELY into the general dbm
  // parenthesis (with Bloodied, Adrenal...), scoped to explosion
  // components/twins — no longer a separate multiplier on the finished
  // explosion damage.
  STAT_DmgExplosive: {
    bucket: 'dbm',
    scale: 0.01,
    conditions: [{ kind: 'damageTypeScope', types: ['explosive'] }],
  },
  // Thrown-grenade damage (GHL_BombScientist's AbPerkFortifyDmgGrenades, magnitudes
  // 20/35/50 with HasPerk rank + glow-spend gates). Distinct from STAT_DmgExplosive
  // above: Bomb Scientist's EP tab-1 conditions gate on WeaponTypeThrown AND
  // WeaponTypeGrenade AND NOT WeaponTypeThrowingKnife (verified esm get
  // GHL_BombScientist01 2026-08-28) — launcher explosions and throwing knives
  // are out of scope for this AV. Additive dbm, same June 2026 patch semantics
  // as Demolition Expert (docs/assumptions.md "Grenade damage (STAT_DmgGrenade)").
  STAT_DmgGrenade: {
    bucket: 'dbm',
    scale: 0.01,
    conditions: [
      { kind: 'weaponKeyword', keyword: 'WeaponTypeThrown', present: true },
      { kind: 'weaponKeyword', keyword: 'WeaponTypeGrenade', present: true },
      { kind: 'weaponKeyword', keyword: 'WeaponTypeThrowingKnife', present: false },
    ],
  },
  // Bully's: +X% per crippled enemy limb (6 limbs max — docs/assumptions.md).
  STAT_DmgPerCrippled: {
    bucket: 'dbm',
    scale: 0.01,
    conditions: [{ kind: 'perCrippledLimb', max: 6 }],
  },
  // Shotgun Champ: +10%/projectile fired (curve, AV 0x00000398 — see
  // CURVE_INPUT_AVS 'projectileCount'), gated boolean-style on the target
  // having a crippled limb (`perCrippledLimb` with max: 1 clamps the scale
  // factor to 0 or 1, unlike Bully's count-scaled max: 6 above).
  STAT_DmgVsCrippled: {
    bucket: 'dbm',
    scale: 0.01,
    conditions: [{ kind: 'perCrippledLimb', max: 1 }],
  },
  // Enemy-status 4★ effects, reworked by the 2026-07-10 patch from ENCH
  // properties to these new plumbing AVs (Pyromaniac's / Viper's / Icemen's /
  // Severing, each ADD 50 = +50%). Conditions mirror the pre-patch ENCH
  // translation — resolve.ts maps the keyword to isBurning/isPoisoned/
  // isFrozen/isBleeding. Icemen's is a REAL rework: it was +20% cryo-scoped
  // baseDamage, now +50% vs Freezing targets.
  STAT_DmgVsBurning: {
    bucket: 'dbm',
    scale: 0.01,
    conditions: [{ kind: 'enemyHasActiveEffect', keyword: 'DamageTypeFire' }],
  },
  STAT_DmgVsPoisoned: {
    bucket: 'dbm',
    scale: 0.01,
    conditions: [{ kind: 'enemyHasActiveEffect', keyword: 'DamageTypePoison' }],
  },
  STAT_DmgVsFreezing: {
    bucket: 'dbm',
    scale: 0.01,
    conditions: [{ kind: 'enemyHasActiveEffect', keyword: 'DamageTypeCryo' }],
  },
  STAT_DmgVsBleeding: {
    bucket: 'dbm',
    scale: 0.01,
    conditions: [{ kind: 'enemyHasActiveEffect', keyword: 'DamageTypeBleed' }],
  },
  // The new 2★ elemental effects (Pyro-Technician's / Cryologist's /
  // Poisoner's, 2026-07-10 patch): ADD 0.2 on these AVs. User-confirmed
  // semantics (2026-07-12): additive into the general dbm parenthesis but
  // scoped to the matching damage type only (a laser + gamma emitter gains
  // Pyro-Technician's on the fire portion and fire DoT, not the energy
  // portion) — same per-component damageTypeScope fold as Demolition Expert.
  // Values are already decimal fractions → scale 1.
  STAT_DmgMultEnergy: {
    bucket: 'dbm',
    scale: 1,
    conditions: [{ kind: 'damageTypeScope', types: ['energy'] }],
  },
  STAT_DmgMultFire: {
    bucket: 'dbm',
    scale: 1,
    conditions: [{ kind: 'damageTypeScope', types: ['fire'] }],
  },
  STAT_DmgMultCryo: {
    bucket: 'dbm',
    scale: 1,
    conditions: [{ kind: 'damageTypeScope', types: ['cryo'] }],
  },
  STAT_DmgMultPoison: {
    bucket: 'dbm',
    scale: 1,
    conditions: [{ kind: 'damageTypeScope', types: ['poison'] }],
  },
  // Target-distance perks (2026-07-11 review): abPerkFortifyDmgClose /
  // abPerkFortifyDmgFar are Peak Value Modifier MGEFs on these AVIFs with NO
  // distance condition rows in data — the close/far range gate is native
  // engine code (GMST fDistanceForCloseDamage = 850 units, docs/assumptions.md).
  // Bake the gate as a targetDistance condition instead. Consumers: Guerrilla
  // family (close), Down Ranger / Sniper's (far). Guerrilla Master's
  // Onslaught-stack curve routes separately and stays unresolved (Onslaught plan).
  STAT_DmgVsClose: {
    bucket: 'dbm',
    scale: 0.01,
    conditions: [{ kind: 'targetDistance', range: 'close' }],
  },
  STAT_DmgVsFar: {
    bucket: 'dbm',
    scale: 0.01,
    conditions: [{ kind: 'targetDistance', range: 'far' }],
  },
  // AP-regen perks (Action Boy/Girl): a plain Peak Value Modifier on
  // ActorValues AV ActionPointsRateMult (0x00000359, Default Value 100.0 —
  // reads as a percent multiplier), magnitude 15/30/45 per rank (verified
  // against the 20260702 dump: PERK ActionBoy0{1,2,3} → Ability SPEL
  // AbPerkActionBoyGirl 0x0004D871). Scale 0.01 turns the AV points into the
  // apRegen fraction (magnitude 15 → +0.15 = +15%). The shared ability's
  // per-rank gating cross-references the paired ActionGirl family's own rank
  // records (HasPerk on formids outside this family's `familyFormIds`) — this
  // route shipped inert in Stage B (those rows came back `unresolved`); FIXED
  // in Stage C4 via `ConditionTranslationContext.pairedFamilyFormIds`
  // (conditions.ts) wired from `extract-perks.ts`'s GENDER_TWIN_PAIRS map —
  // each rank now emits one unconditional apRegen modifier (docs/assumptions.md).
  ActionPointsRateMult: { bucket: 'apRegen', scale: 0.01 },
  // ADDs onto the race base of AV ActionPointsRate (0x000002D8 — RACE
  // `Properties` rows: HumanRace 6.0, PowerArmorRace 3.0; the value reads as
  // percent-of-max-AP regenerated per second, user-confirmed 2026-07-15):
  // Company Tea's FortifyActionPointRegenFood (+10 for 3600s, GLOB
  // SURV_Food_Effect_APRegen_Mag_4_VeryHigh), Nukashine_APRegen,
  // Alcohol_APRegen, the Live & Love #4 / Guns and Bullets #4 magazine
  // effects (2026-07-15 AV sweep). Composition with the % route above:
  // maxAp × (raceBase + Σflat)/100 × (1 + Σ%) — docs/assumptions.md "VATS AP
  // economy". No archetype restriction: a rate has no instant-restore
  // semantics, both Peak and plain Value Modifiers on it are buffs while
  // active.
  ActionPointsRate: { bucket: 'apRegenFlat', scale: 1 },
  // Max-AP fortifies (AV ActionPoints 0x000002D5): FortifyActionPointsFood/
  // Alcohol (mirelurk steaks, wine, hard lemonade), Awesome Tales #7 /
  // Live & Love #7 magazines, Mutation_ReduceActionPoints (Scaly Skin's
  // penalty, Detrimental-negated). Peak-only, exactly like the Health route
  // below: instant Value-Modifier restores (RestoreActionPoints/
  // RestoreActionPointsFood, Brain Bombs, candy) are one-shot events, out of
  // scope by design (user decision 2026-07-15, same rule as instant heals) —
  // they fall through to the silent OUT_OF_SCOPE_INSTANT_RESTORE_AVS skip
  // instead of polluting the unresolved report.
  ActionPoints: { bucket: 'apMax', scale: 1, archetypes: ['Peak Value Modifier'] },
  // Number Cruncher (PERK CommandoMaster01 0x0004A0C5 → Ability SPEL
  // AbPerkCommandoMaster → MGEF abPerkFortifyDmgAP, Peak VM magnitude 2 on
  // hidden AV STAT_DmgAP 0x00801C9F "Damage per AP Cost"): +2% damage per
  // point of the weapon's AP cost. No plumbing perk — the AV's only other
  // referencer is DFOB APDamageBonus_DO, i.e. the scaling is engine-native.
  // scale 0.01 turns the magnitude into a per-AP-point dbm fraction; the
  // scaledByWeaponApCost condition multiplies by the EFFECTIVE (post
  // weapon-OMOD vatsApCost fold) cost. User-confirmed: applies in free aim
  // too (no VATS gate), and armor-side AP-cost entry points (Scanner's 4★)
  // must NOT feed it (docs/assumptions.md "Armor effects (engine + UI)").
  STAT_DmgAP: { bucket: 'dbm', scale: 0.01, conditions: [{ kind: 'scaledByWeaponApCost' }] },
  // VATS hit-chance aggregate (Phase 4, display-only — vatsHitChance bucket
  // doc comment). AVIF STAT_VATSAccuracy 0x006C2035 — no plumbing perk maps
  // it in PLUMBING_PERKS (its only PERK-side consumer, STAT_BeneficialPerk
  // 0x0018ADAD, uses "Multiply 1 + Actor Value Mult" and isn't a
  // damage-formula plumbing perk); the AV's real consumers are Peak Value
  // Modifiers reached via ordinary MGEF/OMOD chains. Verified 2026-07-18:
  // V.A.T.S. Enhanced (OMOD mod_Legendary_Weapon2_Guns_VATSAccuracy
  // 0x00524153, `ActorValues ADD` flat 50.0 → +0.50); Awareness perk (PERK
  // Awareness01 0x000D2287, curve vs Perception — see CURVE_INPUT_AVS
  // 0x000002C3 below); Orange Mentats (ALCH 0x000518C5, Peak VM flat +10 for
  // 300s). Scale 0.01 turns the AV's percentage-points magnitude into the
  // bucket's decimal-fraction convention.
  STAT_VATSAccuracy: { bucket: 'vatsHitChance', scale: 0.01 },
  // Thrill-Seeker's (Stage C3, RA_mod_Legendary_Weapon4_ThrillSeeker
  // 0x00863AA2): killstreak-scaled reload + melee-attack speed, both plain
  // Peak Value Modifiers gated by GetValue(killStreak) Equal To N tiers
  // (translated to `killStreakCount` conditions in conditions.ts — see the
  // GetValue case). Magnitudes are already the decimal fraction (0.03×N,
  // e.g. rank 5 → 0.15), so scale 1 — NOT the ×0.01 used for STAT-point AVs
  // above. Both AVs default to 1.0 (100%) and these effects ADD onto that
  // baseline, matching the SAME semantics as the OMOD `Speed`/`ReloadSpeed`
  // properties already routed to these buckets (weapon.speed/reloadSpeed are
  // themselves 1.0-baseline multipliers) — so op ADD from the ENCH path
  // (mgef.ts's `push()` always emits op: 'ADD' for the non-curve case) is
  // correct as-is, no adjustment needed (effective-weapon.ts's
  // `foldWeaponStat` is condition-aware, Stage C3, so the exact-count tiers
  // gate correctly instead of summing unconditionally).
  weaponSpeedMult: { bucket: 'fireRateSpeed', scale: 1 }, // AbPerkFortifyMeleeSpeedEffect
  WeapReloadSpeedMult: { bucket: 'reloadSpeed', scale: 1 }, // AbPerkFortifyReloadSpeedMult
  // Bonus movement speed (AV SpeedMult 0x000002DA): Speed Demon's
  // Mutation_FortifyMoveSpeed carries magnitudes 20/25 (normal/super tier,
  // 2026-07-15 esm chase) — POINTS, unlike WeapReloadSpeedMult's decimal
  // fractions on the same SPEL, hence scale 0.01. Feeds ONLY the
  // moveSpeedBonus curve input (Fast Fighter's reload conversion,
  // overrides/perk-overrides.ts) — no movement model exists. Route applies to
  // every translate() caller: other SpeedMult sources (chems, food) landing
  // here after a regeneration is expected and correct (they should feed Fast
  // Fighter too); disposition new sources in
  // docs/move-speed-census.md and the allowlist in
  // src/data/__tests__/move-speed-census.test.ts (CI fails on drift).
  SpeedMult: { bucket: 'moveSpeedBonus', scale: 0.01 },
  // Bullet Storm's stack cap (2026-07-16, verified via `esm get`): AVIF
  // AmmoSpenderMaxStacks 0x0083C3CB, Default 0 / Min 0, no percentage flag —
  // raw stack-count points, scale 1. Fed by MGEF abAmmoSpenderFortifyStacks
  // 0x0083C3D1 (Peak Value Modifier) inside SPEL AbPerkHeavyGunner
  // 0x0031BE58: unconditional +10, +10 more with HasPerk(HeavyGunnerMaster01
  // 0x0004A0D6), +5 more with WornHasKeyword(CustomItemName_
  // FoundationsVengeance) AND GetHealthPercentage ≤0.25 — the FV tier
  // resolves via the UNIQUE_SELF_GATE_KEYWORDS allowlist (conditions.ts)
  // instead of falling through to unresolved (docs/assumptions.md "Bullet Storm").
  AmmoSpenderMaxStacks: { bucket: 'bulletStormMaxStacks', scale: 1 },
  // Deflect Chance (2026-07-16, verified via `esm get`): AVIF
  // STAT_DeflectChance 0x007ACE76, "Percentage (Scale By 100 In UI)" flag →
  // scale 0.01. Old Guard's OMOD (mod_Custom_OldGuard 0x008EC5A9) carries a
  // clean flat `ActorValues ADD STAT_DeflectChance 10.0` — routes here via
  // extract-omods.ts's shared FALLBACK_AVIF_ROUTES fallback (no
  // ACTOR_VALUE_BUCKETS entry needed). Heavy Gunner's OWN deflect-chance
  // effect (AbPerkFortifyDeflectChance inside AbPerkHeavyGunner, gated
  // WornHasKeyword(dn_TheActionHero)) carries magnitude 0 with no curve
  // table — data-broken, stays a "needs override" note regardless of this
  // route (docs/assumptions.md "Bullet Storm" — deflectChance is a stored-
  // inert bucket, no engine consumption yet either way).
  STAT_DeflectChance: { bucket: 'deflectChance', scale: 0.01 },
  // Bullet Storm's Valkyrie spin-up ramp (2026-07-16, verified via `esm
  // get`): AVIF WeaponChargeUpSpeedMult 0x0000039C ("Spin Up Speed"),
  // Default Value 1.0 — a 1.0-baseline multiplier like weaponSpeedMult/
  // WeapReloadSpeedMult above, scale 1 (curve Y values are already decimal
  // fractions). MGEF AbPerkFortifyActorWeaponChargeUpSpeedMult
  // 0x00852F5C (Value Modifier, inside AbPerkHeavyGunner) carries curve
  // "Bonus_Valkyrie" (x=bulletStormStacks 0→30, y 0→0.6) gated
  // WornHasKeyword(RD01_CustomItemName_Valkyrie) — resolves via the
  // UNIQUE_SELF_GATE_KEYWORDS allowlist (conditions.ts). Stored-inert:
  // no engine consumer yet (docs/assumptions.md "Bullet Storm").
  WeaponChargeUpSpeedMult: { bucket: 'bulletStormSpinUp', scale: 1 },
  // SPECIAL stat bonuses (Buffout +2 STR, Mentats +2 INT, legendary +SPECIAL
  // stars...). Flat points, scale 1. Strength/Luck fold into player state in
  // resolveLoadout; the rest are stored for perk-SPECIAL scaling. NOTE: these
  // routes apply to every translate() caller (perks included) — review the
  // perk diff after regeneration.
  // Max-HP bonuses (Lifegiver's AbPerkFortifyHealth — Peak Value Modifier on
  // AV HealthBonus 0x007B74E4 "Health"/HP, END-keyed curve; also Nocturnal
  // Fortitude etc.). Flat HP points, scale 1. Folded over the base-HP formula
  // in resolveLoadout (docs/assumptions.md "Max HP (derived)").
  HealthBonus: { bucket: 'maxHealth', scale: 1 },
  // Max-HP PENALTIES sit on the raw Health AV (0x000002D4) instead —
  // Mutation_ReduceMaxHealth (Adrenal Reaction, Peak Value Modifier +
  // Detrimental). Peak-only: instant heals (RestoreHealthFood & co.) are
  // Value Modifiers on the same AV and must stay unrouted (they're not
  // longer-term buffs — user scope rule, 2026-07-14).
  Health: { bucket: 'maxHealth', scale: 1, archetypes: ['Peak Value Modifier'] },
  // Scaly Skin's positive side (2026-07-21, verified via `esm get`): MGEF
  // Mutation_FortifyDamageResist 0x004DF1D2 / Mutation_FortifyEnergyResist
  // 0x004DF1D4, both Archetype "Peak Value Modifier" on AVIF DamageResist
  // 0x000002E3 / EnergyResist 0x000002EB — flat resist POINTS (no percentage
  // flag on either AVIF), scale 1. Mutation_ScalySkin (SPEL 0x004DF1CF)
  // carries magnitude 50 (normal) and 62 (Class-Freak-boosted "super"
  // version, gated by Mutation_Check_UseSuperVersion — same strangeInNumbers
  // duality as Mutation_FortifyMoveSpeed above) for each. Archetype-restricted
  // like Health/ActionPoints above: both AVs are reused by thousands of other
  // records, including at least one instant Value-Modifier effect on the
  // same AV (DamageDamageResistEffect 0x0018C35D, a hostile on-hit DR
  // reduction) that must NOT be swept in as an ongoing fortify. Engine-inert
  // buckets (`damageResistGain`/`energyResistGain`, src/types/modifiers.ts) —
  // no wearer-side resist-mitigation math exists yet; see
  // docs/assumptions.md.
  DamageResist: { bucket: 'damageResistGain', scale: 1, archetypes: ['Peak Value Modifier'] },
  EnergyResist: { bucket: 'energyResistGain', scale: 1, archetypes: ['Peak Value Modifier'] },
  Strength: { bucket: 'specialStrength', scale: 1 },
  Perception: { bucket: 'specialPerception', scale: 1 },
  Endurance: { bucket: 'specialEndurance', scale: 1 },
  Charisma: { bucket: 'specialCharisma', scale: 1 },
  Intelligence: { bucket: 'specialIntelligence', scale: 1 },
  Agility: { bucket: 'specialAgility', scale: 1 },
  Luck: { bucket: 'specialLuck', scale: 1 },
  // Four Leaf Clover (AbPerkFortifyVATSCritFillOnMiss 0x007ACE70, SPEL
  // AbPerkFourLeafClover 0x007ACE71): LCK-scaled crit-meter fill on VATS
  // miss — curve FourLeafCloverBonus on AV Luck (0x000002C8). Engine miss-
  // weighting is a follow-up (docs/assumptions.md "Four Leaf Clover").
  STAT_VATSCritFillOnMiss: { bucket: 'critFill', scale: 1, archetypes: ['Peak Value Modifier'] },
  // PA Hydraulic Bracers (EnchPowerArmor_UnarmedDamage 0x001D6CCA → MGEF
  // PowerArmor_FortifyUnarmedDamage 0x001D6CCB, AV UnarmedDamage 0x000002DF),
  // bobblehead/Nukashine FortifyUnarmedDamage family — flat physical unarmed
  // points on top of the WEAP base (not STAT_Dmg* plumbing).
  UnarmedDamage: {
    bucket: 'baseDamage',
    scale: 1,
    conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeUnarmed', present: true }],
  },
  // Tesla Bracers parent template (_PARENT_mod_PowerArmor_GENERIC_ShockDMG
  // 0x003D4E5E ActorValues ADD UnarmedEnergyDamage 45.0) — flat energy
  // unarmed points; the on-hit shock proc is a separate Damage-archetype path.
  UnarmedEnergyDamage: {
    bucket: 'baseDamage',
    scale: 1,
    conditions: [
      { kind: 'weaponKeyword', keyword: 'WeaponTypeUnarmed', present: true },
      { kind: 'damageTypeScope', types: ['energy'] },
    ],
  },
};

export interface AvifRoute {
  bucket: Bucket;
  scale: number;
  rawConditions: RawCondition[];
  /**
   * Baked conditions from `ENTRY_POINT_EXTRA_CONDITIONS`, copied in at
   * `buildAvifRoutes` time (issue #48) — the route-path counterpart of the
   * `translateGrantedPerk`/extract-perks.ts direct-entry-point sites, which
   * apply the same map inline. Appended (not merged into `rawConditions`,
   * which only holds real ESM Perk Condition rows) at the route's
   * consumption site in `translate()`.
   */
  extraConditions?: Condition[];
  /**
   * `ENTRY_POINT_OP_OVERRIDE` match, copied in at `buildAvifRoutes` time —
   * defaults to `'ADD'` (the generic AVIF-route shape) when absent.
   */
  op?: Modifier['op'];
}

/**
 * AVs whose instant (Value Modifier) restores are out of scope by design —
 * skipped silently in `translate()` instead of surfacing as "no route" notes,
 * so the unresolved report only shows real gaps. The Peak-Value-Modifier
 * fortifies on the same AVs DO route (Health → maxHealth, ActionPoints →
 * apMax above).
 */
const OUT_OF_SCOPE_INSTANT_RESTORE_AVS = new Set(['Health', 'ActionPoints']);

/**
 * Arming flags with no damage meaning of their own — routing them would be a
 * no-op, and the "needs mapping" note buried real gaps across 7 records
 * (Adrenal weapon/armor, Barbarian, Lawbringer, Thrill-Seeker's, Sole
 * Survivor, Mind Over Matter, Adrenal Reaction). EnableKillStreak (AVIF
 * 0x0080B56A) only ENABLES the shared kill-streak counter (AV 0x00000399);
 * every source's actual bonus rides a separate effect that routes normally.
 */
const NO_OP_FLAG_AVIFS = new Set(['EnableKillStreak']);

/** MGEF archetypes whose stats live on a granted PERK (chase perkToApply). */
const PERK_GRANT_ARCHETYPES = new Set(['Script', 'Unknown 36', 'Absorb']);

const PLUMBING_PERKS = ['STAT_DamagePerk', 'STAT_CritDamagePerk', 'STAT_DamageVsPerk'];

export function collectConditionFormIds(rows: RawCondition[], into: Set<string>): void {
  for (const row of rows) {
    const p = row['Parameter 1'];
    if (typeof p === 'string' && p.startsWith('0x')) into.add(p);
  }
}

/**
 * Pre-fetch the CNDF condition-form records referenced by
 * `IsTrueForConditionForm` rows so sync translation can inline-expand them
 * (translateConditions' `tryExpandConditionForm`): formid → the form's own
 * flattened rows, with every nested Parameter-1 edid resolved into the shared
 * map. Mutation_Check_UseNormalVersion/UseSuperVersion are skipped — they
 * have a dedicated strangeInNumbers translation. Fetch failures simply leave
 * the row unexpanded (it stays `unresolved`, the pre-existing behavior).
 */
export async function resolveConditionForms(
  client: EsmSource,
  rows: RawCondition[],
  edidByFormId: Map<string, string>,
  into: Map<string, RawCondition[]> = new Map(),
): Promise<Map<string, RawCondition[]>> {
  for (const row of rows) {
    if (row.Function !== 'IsTrueForConditionForm') continue;
    const p = row['Parameter 1'];
    if (typeof p !== 'string' || !p.startsWith('0x') || into.has(p)) continue;
    if (!edidByFormId.has(p)) edidByFormId.set(p, await client.resolveEdid(p));
    const edid = edidByFormId.get(p);
    if (edid === 'Mutation_Check_UseNormalVersion' || edid === 'Mutation_Check_UseSuperVersion')
      continue;
    try {
      const record = await client.get(p);
      const nested = flattenConditionRows(record.fields['Conditions']);
      for (const n of nested) {
        const np = n['Parameter 1'];
        if (typeof np === 'string' && np.startsWith('0x') && !edidByFormId.has(np)) {
          edidByFormId.set(np, await client.resolveEdid(np));
        }
      }
      if (nested.length > 0) into.set(p, nested);
    } catch {
      /* stays unresolved in translation */
    }
  }
  return into;
}

/**
 * Harvest GLOB formids referenced as a condition row's `Comparison Value`
 * (e.g. GHL_MadScientist's `GetValue(Rads) >= 0x007F68B6`), mirroring how
 * `collectConditionFormIds` walks the same rows for `Parameter 1`. Resolved
 * async via the client into a `globalValues` map before sync translation.
 */
export function collectConditionGlobalIds(rows: RawCondition[], into: Set<string>): void {
  for (const row of rows) {
    const cmp = row['Comparison Value'];
    if (typeof cmp === 'string' && cmp.startsWith('0x')) into.add(cmp);
  }
}

export async function buildAvifRoutes(
  client: EsmSource,
  formIdPool: Set<string>,
): Promise<Map<string, AvifRoute[]>> {
  const routes = new Map<string, AvifRoute[]>();
  for (const edid of PLUMBING_PERKS) {
    const record = await client.get(edid);
    const effects = record.fields['Effects'];
    if (!Array.isArray(effects)) continue;
    for (const item of effects as Array<Record<string, unknown>>) {
      const e = item['Effect'] as Record<string, unknown>;
      const ep = (e['Entry Point'] ?? {}) as Record<string, unknown>;
      const name =
        ((ep['Entry Point'] as Record<string, unknown> | undefined)?.['name'] as string) ?? '';
      const bucket = ENTRY_POINT_BUCKETS[name];
      const actorValue = e['Function Parameter 3 (Actor Value)'] as string | undefined;
      if (!bucket || !actorValue) continue;

      const rawConditions = flattenPerkConditionRows(e['Perk Conditions']);
      collectConditionFormIds(rawConditions, formIdPool);
      const rawScale = typeof e['Float'] === 'number' ? (e['Float'] as number) : 0.01;
      const list = routes.get(actorValue) ?? [];
      list.push({
        bucket,
        scale: rawScale * (ENTRY_POINT_SCALE_MULTIPLIER[name] ?? 1),
        rawConditions,
        ...(ENTRY_POINT_EXTRA_CONDITIONS[name] && {
          extraConditions: ENTRY_POINT_EXTRA_CONDITIONS[name],
        }),
        ...(ENTRY_POINT_OP_OVERRIDE[name] && { op: ENTRY_POINT_OP_OVERRIDE[name] }),
      });
      routes.set(actorValue, list);
    }
  }
  return routes;
}

/**
 * Curve input axes: the effect-level "Actor Value" on curve-bearing effects
 * names the player stat the curve X is read from. These low engine AVs have
 * no ESM records, so they're mapped by formid constant.
 */
export const CURVE_INPUT_AVS: Record<string, CurveInput> = {
  // All seven SPECIALs are wired (USER-DIRECTED 2026-08-20) so any
  // SPECIAL-keyed curve — SPEL effect Actor Value or perk EP Function
  // Parameter 4 (Lone Wanderer's CHA) — is drop-in, whether or not a
  // consumer exists in live data yet.
  '0x000002C2': 'strength', // Strength — The Debilitator's limb-damage-vs-STR curve
  '0x000002C3': 'perception', // Perception — Awareness perk's VATS-accuracy-vs-PER curve (Phase 4, display-only)
  '0x000002C4': 'endurance', // Endurance — Lifegiver's END-keyed max-HP curve (docs/assumptions.md "Max HP (derived)")
  '0x000002C5': 'charisma', // Charisma — Peace Maker's explosive-damage curve, Lone Wanderer's EP damage reduction
  '0x000002C6': 'intelligence', // Intelligence — Science!/Pyro-Technician's/Cryologist's damage-vs-INT curves
  '0x000002C7': 'agility', // Agility — no consumer yet, wired for drop-in
  '0x000002C8': 'luck', // Luck — no consumer yet, wired for drop-in
  '0x00000392': 'healthFraction', // current HP / max HP (Bloodied, Nerd Rage)
  '0x00000393': 'capsOnHand', // Aristocrat's
  '0x00000399': 'killStreak', // Adrenal Reaction
  '0x001EB998': 'addictionCount', // Junkie's
  '0x0032CB37': 'lockpickSkill', // STAT_LockpickingTier — Pirate Punch's "+5% Damage per Lockpick Skill" curve (PiratePunchBonus: (0,0),(1,5),(20,100))
  '0x00356A14': 'hackingSkill', // STAT_HackingTier — no curve consumer yet; wired for drop-in (peer of lockpickSkill)
  '0x00206F31': 'stimpakHealMult', // STAT_HealMultStimpak — Medical Malpractice's dbm scale (via scaledBy, not a curve)
  '0x000002D4': 'healthCurrent', // Health (absolute) — Juggernaut's (x 0→1000, y 0→100)
  // DamageResist — Berserker's ("DamageUnarmored"): the WIELDER's own DR, not
  // the enemy's (renamed from `enemyDamageResist` 2026-07-18, user-confirmed —
  // see the CurveInput doc comment in src/types/modifiers.ts).
  '0x000002E3': 'playerDamageResist',
  '0x006C2DBA': 'mutationCount', // MutationCount — Mutant's
  '0x006D37DC': 'hungerThirstTier', // HungerThirstTier — Gourmand's
  '0x007A767A': 'feralTier', // GHL_FeralTier — Lucid / ghoul effects
  // Onslaught (2026-07-12): the shared engine counter, no AVIF record
  // (hardcoded slot). Whacker Smacker reads it directly as a curve input
  // (+5%/stack power-attack damage); Guerrilla/Gunslinger Expert+Master's
  // per-stack Ability SPELs curve off the same AV.
  '0x00000395': 'onslaughtStacks',
  // Bullet Storm / Heavy Gunner's ammo-spent stack counter, no AVIF record
  // (hardcoded slot, same pattern as Onslaught above). Feeds abPerkFortifyDmgAll
  // (+3/6/9%/stack, ×10 max) plus the family's reload-speed/bashing/charge-up curves.
  '0x0000039B': 'bulletStormStacks',
  // Shotgun Champ: projectiles fired per shot, no AVIF record (hardcoded
  // slot). Feeds abPerkFortifyDmgCrippled via the STAT_DmgVsCrippled route
  // (FALLBACK_AVIF_ROUTES above).
  '0x00000398': 'projectileCount',
  // Equipped-weapon condition fraction (0.0–2.0), no AVIF record (hardcoded
  // slot, same pattern as Onslaught above). The 20260717 dump wired this AV
  // onto Legendary_Weapon_PolishedPerkApplyEffect's curve, which previously
  // had a NULL input and rode an edid-keyed NULL_CURVE_INPUT_BY_MGEF entry
  // (retired with this mapping). Semantics provenance unchanged: the cut
  // DEL_Legendary_Weapon_PolishedPerk gated the same base effect on a
  // GetEquippedWeaponHealthPercent condition row.
  '0x0000039F': 'weaponCondition',
  // Engine-hardcoded PlayerLevel slot (no AVIF) — Sheepsquatch Shard poison
  // DoT curve domain 1→50 (esm-walk 2026-08-28).
  '0x0000032C': 'playerLevel',
};

/** Per-arm +9 bleed counter written by Rusty Knuckles PA arm OMODs. */
export const PA_RUSTY_KNUCKLES_AV = '0x0020D96F';

/** Shared PA arm ENCH (Rusty Knuckles + Tesla Bracers). */
export const ENCH_POWER_ARMOR_COMMON_ARM = '0x00248490';

/** Tesla Bracers flat energy unarmed points (ShockDmg parent template). */
export const UNARMED_ENERGY_DAMAGE_AV = '0x00239EBA';

/** Enemy-directed delivery — Contact on-hit procs survive a Self outer ENCH. */
function isEnemyDirectedDelivery(targetType: string | null | undefined): boolean {
  return targetType === 'Contact' || targetType === 'Target';
}

function mergeDeliveryTargetType(
  outer: string | null | undefined,
  inner: string | null | undefined,
): string | null | undefined {
  if (isEnemyDirectedDelivery(inner)) return inner;
  return outer;
}

function isRustyKnucklesTierCondition(c: Condition): boolean {
  return (
    c.kind === 'unresolved' &&
    (/^GetValue\(PA_RustyKnuckles_AV\)=\d+$/.test(c.raw) ||
      /^GetValue\(0x0020D96F\)=\d+$/.test(c.raw))
  );
}

function rustyKnucklesTierRaw(tier: 9 | 18): string {
  return tier === 9 ? 'GetValue(PA_RustyKnuckles_AV)=9' : 'GetValue(PA_RustyKnuckles_AV)=18';
}

/**
 * The tier magnitude regardless of shape: a flat `value`, or a constant
 * (single-Y) curve's Y × curveScale — the live ENCH chase emits the bleed as
 * flat itemLevel curves (3→3 / 6→6), not bare values (2026-08-28 live-fail).
 */
function flatMagnitude(m: ModifierFragment): number | undefined {
  if (!m.curve) return m.value;
  const ys = new Set(m.curve.points.map((p) => p.y));
  if (ys.size !== 1) return undefined;
  return [...ys][0] * (m.curveScale ?? 1);
}

/** PA_CommonArmPerk bleed tiers (AV==9 → 3/tick, AV==18 → 6/tick) → wornPieces curve. */
export function collapseRustyKnucklesBleedTiers(modifiers: ModifierFragment[]): ModifierFragment[] {
  let tier1Idx = -1;
  let tier2Idx = -1;
  for (let i = 0; i < modifiers.length; i++) {
    const m = modifiers[i];
    if (m.bucket !== 'dotDamage' || m.op !== 'ADD') continue;
    const mag = flatMagnitude(m);
    if (mag === undefined) continue;
    const has9 = m.conditions.some(
      (c) =>
        c.kind === 'unresolved' &&
        (c.raw === rustyKnucklesTierRaw(9) || c.raw === 'GetValue(0x0020D96F)=9'),
    );
    const has18 = m.conditions.some(
      (c) =>
        c.kind === 'unresolved' &&
        (c.raw === rustyKnucklesTierRaw(18) || c.raw === 'GetValue(0x0020D96F)=18'),
    );
    if (has9 && mag === 3) tier1Idx = i;
    if (has18 && mag === 6) tier2Idx = i;
  }
  if (tier1Idx < 0 || tier2Idx < 0) return modifiers;
  const template = modifiers[tier1Idx];
  const merged: ModifierFragment = {
    bucket: 'dotDamage',
    op: 'ADD',
    curve: {
      input: 'wornPieces',
      points: [
        { x: 1, y: 3 },
        { x: 2, y: 6 },
      ],
    },
    curveScale: 1,
    conditions: template.conditions.filter((c) => !isRustyKnucklesTierCondition(c)),
    durationSec: template.durationSec,
  };
  return modifiers.filter((_, i) => i !== tier1Idx && i !== tier2Idx).concat(merged);
}

/**
 * Counter axes an AV pass-through effect (see the `effect.magnitude === 0`
 * branch below) may be read from, and the counter's cap — the AV pass-through
 * curve's domain runs 0..max. killStreak: 10 — both Barbarian's and Mind Over
 * Matter's card text say "(Max 10)", the MESG HelpAdrenaline help text states
 * the cap, and every sibling kill-streak curve in the ESM (Adrenal, Sole
 * Survivor, Crowd Control) ends its X domain at 10.
 */
const AV_PASSTHROUGH_DOMAINS: Partial<Record<CurveInput, number>> = { killStreak: 10 };

/**
 * Curve inputs with NO Actor Value at all (curveInputAv is null): the input
 * is an engine function read straight off the effect, keyed by MGEF editor id
 * (NOT a blanket "null input" rule — most null-input curves are genuinely
 * unmodeled and should keep surfacing their "needs override" note).
 */
const NULL_CURVE_INPUT_BY_MGEF: Record<string, CurveInput> = {
  // (empty since 20260717 — Polished's effect gained a real curve-input AV,
  // 0x0000039F 'weaponCondition' in CURVE_INPUT_AVS above. The mechanism
  // stays for the next null-input curve that proves decodable.)
};

/** Resolve a curve's input axis: named AV first, else an edid-keyed null-input override. */
function resolveCurveInput(curveInputAv: string | null, mgefEdid: string): CurveInput | undefined {
  return curveInputAv ? CURVE_INPUT_AVS[curveInputAv] : NULL_CURVE_INPUT_BY_MGEF[mgefEdid];
}

/**
 * Damage-archetype MGEFs (bleed/burn/shock weapon mods) carry their element in
 * the record's "Resist Value" AV. Resolved edid → app damage type; unknown
 * resists fall back to a note. Exported for `normalize/proc.ts`'s
 * `decodeInstantDamageComponent` (Circuit Breaker's instant-Contact-damage
 * shape — issue #42), which needs the same edid → DamageType mapping outside
 * the DoT path.
 */
export const RESIST_AV_DAMAGE_TYPES: Record<string, DamageType> = {
  DamageResist: 'ballistic', // bleeds resist as physical
  EnergyResist: 'energy',
  FireResist: 'fire',
  ElectricalResist: 'energy',
  FrostResist: 'cryo',
  PoisonResist: 'poison',
  RadResistExposure: 'radiation',
  RadiationResist: 'radiation',
};

export interface SpellEffect {
  mgefFormId: string;
  magnitude: number;
  duration: number;
  conditionRows: RawCondition[];
  /** Value curve: Y at X = effect-level input Actor Value (overrides magnitude). */
  curvePoints: Array<{ x: number; y: number }> | null;
  curveInputAv: string | null;
  /**
   * GLOB formid overriding the flat magnitude (Sniper's: unconditional +100 on
   * STAT_DmgVsFar via GLOB BOUNTY_SnipersBonus, sibling to Effect Item Data's
   * own Magnitude which reads 0 for these). Resolved async in
   * translateMagicEffect before the pure translate() call.
   */
  magnitudeGlobal: string | null;
  /**
   * The effect entry's own `Cooldown Duration` (a SIBLING of `Effect Item
   * Data`, not nested inside it — esm-walk-verified 2026-08-19 on Fracturer's
   * SPEL 0x00795779) — the per-cast cooldown of a Function-Type-5 "Spell
   * Item" granted spell (issue #42's `onCripple` proc trigger). Null when
   * absent/zero.
   */
  cooldownDurationSec: number | null;
  /**
   * `Effect Item Data.Area` — the effect's own area-of-effect radius, used by
   * `normalize/proc.ts`'s `decodeInstantDamageComponent` to flag
   * `GeneratedProcComponent.isAoe` (Circuit Breaker's shape). Null when absent.
   */
  area: number | null;
}

/** Parse the Effects list of a SPEL/ENCH/ALCH record. */
export function parseMagicEffects(record: EsmRecord): SpellEffect[] {
  const effects = record.fields['Effects'];
  if (!Array.isArray(effects)) return [];
  const out: SpellEffect[] = [];
  for (const item of effects as Array<Record<string, unknown>>) {
    const e = item['Effect'] as Record<string, unknown> | undefined;
    if (!e) continue;
    const data = (e['Effect Item Data'] ?? {}) as Record<string, unknown>;
    const curveTable = e['Curve Table'] as { curve?: Array<{ x: number; y: number }> } | undefined;
    const magnitudeGlobal = typeof e['Magnitude'] === 'string' ? (e['Magnitude'] as string) : null;
    out.push({
      mgefFormId: (e['Base Effect'] as string) ?? '',
      magnitude: (data['Magnitude'] as number) ?? 0,
      duration: (data['Duration'] as number) ?? 0,
      conditionRows: flattenConditionRows(e['Conditions']),
      curvePoints:
        Array.isArray(curveTable?.curve) && curveTable.curve.length > 0 ? curveTable.curve : null,
      curveInputAv: (e['Actor Value'] as string) ?? null,
      magnitudeGlobal,
      cooldownDurationSec:
        typeof e['Cooldown Duration'] === 'number' ? (e['Cooldown Duration'] as number) : null,
      area: typeof data['Area'] === 'number' ? (data['Area'] as number) : null,
    });
  }
  return out;
}

export interface MgefInfo {
  edid: string;
  name: string;
  archetype: string;
  actorValue: string | null;
  /** "Resist Value" AV formid — carries the element of Damage-archetype effects. */
  resistValue: string | null;
  /** "Perk to Apply" PERK formid — Script-archetype legendary effects carry their stats on a granted perk. */
  perkToApply: string | null;
  /**
   * "Explosion" EXPL formid — a Script- or Damage-archetype MGEF that detonates
   * an EXPL instead of (or alongside) carrying its own magnitude/curve
   * (Electrician's/Fracturer's proc payloads, issue #42). Authoritative over
   * the MGEF's own magnitude/curve when set — see `translateMagicEffect`'s
   * proc-chase branch. Null when absent/the zero sentinel.
   */
  explosion: string | null;
  /**
   * Consumable-only: raw KYWD formids from the MGEF's top-level
   * `Keywords.Keywords` field (empty array when the record carries none).
   */
  keywords: string[];
  /**
   * Consumable-only: `Magic Effect Data.Data.Flags.flags` includes "Dispel
   * with Keywords" — the engine dispels any other active effect that shares
   * this effect's full keyword set when this one is (re)applied. See
   * scripts/extract/extract-buffs.ts's dispelKeys construction.
   */
  dispelWithKeywords: boolean;
  /**
   * `Magic Effect Data.Data.Flags.flags` includes "Detrimental": the effect's
   * magnitude REDUCES its actor value (Mutation_ReduceStrength mag 3 = −3
   * STR, abReduceCharismaAlcoholAddiction mag 1 = −1 CHA). translate()
   * negates flat value-modifier magnitudes accordingly; Damage-archetype
   * effects (DoTs, also flagged Detrimental) are unaffected — their magnitude
   * is the damage amount, not a stat delta.
   */
  detrimental: boolean;
  /**
   * The MGEF record's OWN top-level `Conditions` rows. These gate every
   * application of the effect exactly like effect-entry rows do — Happy-Go-
   * Lucky's HasPerk rank gates and Gulper Venom's not-the-player poison gate
   * live here, NOT on the referencing ALCH/SPEL/ENCH entry.
   * translateMagicEffect merges them ahead of the entry's rows; before
   * 2026-08-19 they were silently dropped, which emitted every alcohol's
   * perk-gated Luck bonuses as unconditional modifiers.
   */
  conditionRows: RawCondition[];
}

export async function getMgefInfo(client: EsmSource, formId: string): Promise<MgefInfo> {
  const record = await client.get(formId);
  const data = ((record.fields['Magic Effect Data'] as Record<string, unknown> | undefined)?.[
    'Data'
  ] ?? {}) as Record<string, unknown>;
  const perkToApply = (data['Perk to Apply'] as string) || null;
  const keywordsNode = (record.fields['Keywords'] ?? {}) as Record<string, unknown>;
  const keywords = Array.isArray(keywordsNode['Keywords'])
    ? (keywordsNode['Keywords'] as string[])
    : [];
  const flagsNode = (data['Flags'] ?? {}) as Record<string, unknown>;
  const flagNames = Array.isArray(flagsNode['flags']) ? (flagsNode['flags'] as string[]) : [];
  return {
    edid: record.editor_id,
    name: (record.fields['Name'] as string) ?? record.editor_id,
    archetype:
      ((data['Archetype'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown',
    actorValue: (data['Actor Value'] as string) ?? null,
    resistValue: (data['Resist Value'] as string) ?? null,
    perkToApply: perkToApply === '0x00000000' ? null : perkToApply,
    explosion:
      typeof data['Explosion'] === 'string' && data['Explosion'] !== '0x00000000'
        ? (data['Explosion'] as string)
        : null,
    keywords,
    dispelWithKeywords: flagNames.includes('Dispel with Keywords'),
    detrimental: flagNames.includes('Detrimental'),
    conditionRows: flattenConditionRows(record.fields['Conditions']),
  };
}

export interface MgefTranslationDeps {
  client: EsmSource;
  routes: Map<string, AvifRoute[]>;
  edidByFormId: Map<string, string>;
  /**
   * Treat duration > 0 as always-active instead of flagging it: consumables
   * and equipped legendary effects are timed by nature — selecting them IS
   * the toggle. Perk proc-buffs keep the flag.
   */
  timedIsActive?: boolean;
  /**
   * Narrowly scoped to `chaseGrantedSpell`'s bash-triggered branch (Love Tap
   * — issue #80/#42 follow-up, user-directed 2026-08-20): when set alongside
   * `timedIsActive: false`, a real timed-buff Duration gets the
   * `bashBuffUptime` scaling condition instead of the generic `unresolved`
   * timedBuff gate. NOT a generalized combat-trigger-uptime model — other
   * Function-Type-5 timed grants (Holy Fire's friendly-hit trigger) stay on
   * the generic gate.
   */
  bashTriggered?: boolean;
  /** See TranslateOptions.noteUnroutedAvs. */
  noteUnroutedAvs?: boolean;
  /**
   * Perk formid → {family, rank} over all non-junk families
   * (buildCrossFamilyRankMap) — resolves cross-family HasPerk gates into
   * runtime perkFamilyRank conditions on every translation path sharing
   * these deps (granted-perk chase, enchantment walks). The omods pass sets
   * it; callers that build their own per-call conditionCtx (extract-perks)
   * pass it there instead.
   */
  crossFamilyRank?: Map<string, { family: string; rank: number }>;
  /**
   * Carrier OMOD's ActorValues ADD magnitude on ArmorPenetration AV — composed
   * with ModArmorPenetrationPerk's Multiply 1 + AV Mult (−0.01/point) when
   * extract-omods.ts processes enchModArmorPenetration weapon mods.
   */
  armorPenetrationAvMagnitude?: number;
  /** Add-Perk chase recursion guard (perk → ability SPEL → MGEF → perk ...). Internal. */
  grantDepth?: number;
}

export interface MgefTranslationResult {
  modifiers: ModifierFragment[];
  notes: string[];
  unmappedAvifs: string[];
  /**
   * Chased proc-damage components (issue #42 — PROC_DAMAGE_PLAN.md), not yet
   * classified into a `GeneratedProc` trigger — the caller decides that:
   * `translateEnchantment`'s `dedupeReloadStateFanout` classifies `reloadCycle`
   * off it directly (Electrician's reload-animation-state fan-out).
   */
  procComponents?: GeneratedProcComponent[];
  /**
   * The chased effect's own `Cooldown Duration` (seconds), when `procComponents`
   * came from a `chaseGrantedSpell` call — the `onCripple` trigger's
   * `cooldownSec` (Fracturer's). Set alongside the FIRST effect that
   * contributes to `procComponents`; irrelevant for `reloadCycle`/`lastRound`.
   */
  procCooldownSec?: number;
  /**
   * Already-classified procs (issue #42) — set only by `translateGrantedPerk`'s
   * Function-Type-5 "Spell Item" chase, which knows the trigger from the
   * granting Entry Point name (`onCripple`/`lastRound`) and so classifies
   * directly instead of leaving it to `procComponents`.
   */
  procs?: GeneratedProc[];
  /**
   * Tick-based continuous aura damage (ADR-0023) chased off Cloak-archetype
   * MGEFs — Tesla Coils, Miasma, Plague Walker. Empty when the cloak is
   * utility-only so the caller can fall through to the legacy note.
   */
  auras?: GeneratedAura[];
  /**
   * Innermost chased-SPEL delivery (Contact/Target) when modifiers were
   * produced through `chaseGrantedSpell` or a perk-grant chase — used by
   * `translateEnchantment` to avoid dropping enemy-directed DoTs from a
   * Self-delivery outer ENCH (Rusty Knuckles, Voice of Set).
   */
  deliveryTargetType?: string | null;
}

export interface TranslateOptions {
  timedIsActive?: boolean;
  /** See MgefTranslationDeps.bashTriggered. */
  bashTriggered?: boolean;
  conditionCtx?: Partial<ConditionTranslationContext>;
  /**
   * Note EVERY value-modifier effect whose AV has no route (instead of only
   * the STAT_Dmg / STAT_Crit / STAT_Sneak prefixes). Legendary/buff extraction
   * sets this so empty translations are visible gaps in _meta; perk extraction
   * keeps it off — perks carry many deliberately-unmodeled AVs (AP, carry
   * weight...).
   */
  noteUnroutedAvs?: boolean;
}

/**
 * Pure MGEF → IR translation. Every ESM lookup the effect needs must already
 * be resolved into `edidByFormId` (condition params + the MGEF's actor value) —
 * see `translateMagicEffect` for the async gather. A value curve overrides the
 * magnitude: effective value = interpolate(curve, input) × route scale. Non-stat
 * archetypes and unmapped damage AVIFs come back as notes for the overrides layer.
 */
export function translate(
  mgef: MgefInfo,
  effect: SpellEffect,
  routes: Map<string, AvifRoute[]>,
  edidByFormId: Map<string, string>,
  opts: TranslateOptions = {},
): MgefTranslationResult {
  const result: MgefTranslationResult = { modifiers: [], notes: [], unmappedAvifs: [] };

  const { conditions: effectConds, unresolved } = translateConditions(effect.conditionRows, {
    edidByFormId,
    ...opts.conditionCtx,
  });
  if (effectConds === null) return result;
  unresolved.forEach((u) => result.notes.push(`condition: ${u}`));

  // Damage-archetype effects are DoTs (bleed/burn/shock weapon mods): extract
  // value + duration + element into the dotDamage bucket, folded into
  // steady-state DPS by computeDotDps (refresh-only semantics — paper-damage.ts).
  // The element lives on the MGEF's Resist Value AV; the damageTypeScope
  // condition here denotes the DoT's OWN element.
  if (mgef.archetype === 'Damage' && (effect.magnitude > 0 || effect.curvePoints)) {
    // Resist provenance (docs/assumptions.md "DoT/proc resist provenance",
    // user-decided 2026-08-20): the record's OWN Resist Value AV is the ONLY
    // source of truth for a DoT's mitigation-relevant type. NO Resist Value AV
    // at all (`mgef.resistValue === null`) means the effect is mechanically
    // unresisted — flagged `unresisted: true` rather than left as an
    // unexplained absent scope. A Resist Value that's PRESENT but unmapped
    // (falls through `RESIST_AV_DAMAGE_TYPES`) is a DIFFERENT, narrower gap —
    // real resist data our map doesn't cover yet — and stays a note, not
    // `unresisted`.
    const unresisted = mgef.resistValue === null;
    const resistEdid = mgef.resistValue
      ? (edidByFormId.get(mgef.resistValue) ?? mgef.resistValue)
      : null;
    const damageType = resistEdid ? RESIST_AV_DAMAGE_TYPES[resistEdid] : undefined;
    if (resistEdid && !damageType) {
      result.notes.push(
        `MGEF ${mgef.edid}: unmapped Resist Value ${resistEdid} — DoT element unknown`,
      );
    }
    const dotConds: Condition[] = damageType
      ? [...effectConds, { kind: 'damageTypeScope', types: [damageType] }]
      : effectConds;
    let dotCurve: ValueCurve | undefined;
    let dotMagnitude = effect.magnitude;
    if (effect.curvePoints && effect.curvePoints.length === 1) {
      // A single-point curve table has no input axis to speak of — interpolating
      // one point always returns that Y regardless of X, so it's an authored
      // constant. Use the Y value directly rather than requiring a resolvable
      // curveInputAv (see docs/assumptions.md, "Single-point curve tables").
      dotMagnitude = effect.curvePoints[0].y;
    } else if (effect.curvePoints) {
      const input = resolveCurveInput(effect.curveInputAv, mgef.edid);
      if (input) {
        dotCurve = { input, points: effect.curvePoints };
      } else if (
        effect.curveInputAv === null &&
        effect.curvePoints[effect.curvePoints.length - 1].x <= 100
      ) {
        // No Actor Value at all (curveInputAv null) AND the curve's X domain
        // looks level-shaped (≤100, matching the 1-50 item-level range OMOD
        // properties use). Weapon-mod bleed/burn/poison DoTs are exactly this:
        // e.g. EnchWeapMod_HarpoonGunBleed (x 1→50, y 10→32) — no AVIF exists
        // for "item level" as an effect-level Actor Value, so the engine reads
        // it straight off the equipped weapon (mirrors the itemLevel default
        // extract-omods.ts already applies to OMOD-property curves). A wider
        // domain (e.g. PoisonStingwingBite's creature venom, x up to 540) is
        // NOT item level and correctly falls through to the drop below.
        dotCurve = { input: 'itemLevel', points: effect.curvePoints };
      } else {
        result.notes.push(
          `${mgef.edid}: DoT curve with unmapped input AV ${effect.curveInputAv} — needs override`,
        );
        return result;
      }
    }
    result.modifiers.push(
      dotCurve
        ? {
            bucket: 'dotDamage',
            op: 'ADD',
            curve: dotCurve,
            curveScale: 1,
            conditions: dotConds,
            durationSec: effect.duration,
            ...(unresisted ? { unresisted: true as const } : {}),
          }
        : {
            bucket: 'dotDamage',
            op: 'ADD',
            value: dotMagnitude,
            conditions: dotConds,
            durationSec: effect.duration,
            ...(unresisted ? { unresisted: true as const } : {}),
          },
    );
    return result;
  }

  // LGN legendary SPECIAL cards (AbLgnPerkFortifyStrength 0x005CF17F et al.):
  // Dual Value Modifier on AV Strength/… — magnitude is flat SPECIAL points;
  // Actor Value 2 (PerkPointBonus*) is perk-budget plumbing, out of scope.
  if (mgef.archetype === 'Dual Value Modifier' && mgef.actorValue) {
    const dualAvifEdid = edidByFormId.get(mgef.actorValue) ?? mgef.actorValue;
    const dualFallback = FALLBACK_AVIF_ROUTES[dualAvifEdid];
    if (dualFallback) {
      result.modifiers.push({
        bucket: dualFallback.bucket,
        op: 'ADD',
        value: effect.magnitude * dualFallback.scale,
        conditions: [...effectConds, ...(dualFallback.conditions ?? [])],
      });
      return result;
    }
  }

  if (mgef.archetype !== 'Peak Value Modifier' && mgef.archetype !== 'Value Modifier') {
    const unmeasuredScriptNote: Record<string, string> = {
      abFortifyDamageAll: 'unmeasured script-set damage bonus — needs in-game measurement',
      abFortifyDamageRecieved: 'unmeasured script-set damage bonus — needs in-game measurement',
    };
    const scriptNote = unmeasuredScriptNote[mgef.edid];
    if (scriptNote) {
      // docs/assumptions.md "Rage (mod_Custom_Rage)"
      result.notes.push(`${mgef.edid}: ${scriptNote}`);
      return result;
    }
    if (effect.magnitude !== 0 || mgef.archetype === 'Script') {
      result.notes.push(`MGEF ${mgef.edid} archetype ${mgef.archetype} — needs override`);
    }
    return result;
  }
  if (!mgef.actorValue) return result;

  const avifEdid = edidByFormId.get(mgef.actorValue) ?? mgef.actorValue;

  // Value curve (Bloodied, Nerd Rage...): Y at X = input AV; overrides magnitude.
  let curve: ValueCurve | undefined;
  let effectiveMagnitude = effect.magnitude;
  if (effect.curvePoints && effect.curvePoints.length === 1) {
    // Single-point curve → flat magnitude (same rule as the DoT branch above).
    effectiveMagnitude = effect.curvePoints[0].y;
  } else if (effect.curvePoints) {
    const input = resolveCurveInput(effect.curveInputAv, mgef.edid);
    if (input) {
      curve = { input, points: effect.curvePoints };
    } else if (effect.curveInputAv === '0x006DE64A' && avifEdid === 'ArmorPenetration') {
      // Blade of Bastet (MoM_ench_BladeofBastet): MoM_EyeOfRa curve input is
      // 0/1 for Eye of Ra worn — armor loadout unmodeled; emit the base +50
      // tier (curve Y at X=0) as a flat ADD. Eye of Ra doubling to +100 is a
      // documented gap (docs/assumptions.md "Unique weapons").
      effectiveMagnitude = effect.curvePoints[0]?.y ?? effect.magnitude;
    } else {
      result.notes.push(
        `${mgef.edid}: curve with unmapped input AV ${effect.curveInputAv} — needs override`,
      );
      return result;
    }
  } else if (effect.magnitude === 0) {
    // AV pass-through: a zero-magnitude, curve-less Peak Value Modifier whose
    // effect-level Actor Value names a player counter reads its magnitude off
    // that counter at runtime — Barbarian (OMOD 0x0083DA6B → ENCH 0x0083F305 →
    // MGEF AbPerkFortifyStrength 0x004351E3, "+ STR per kill while on a Kill
    // Streak (Max 10).") and Mind Over Matter (PERK 0x008F2AEC → SPEL
    // 0x008F2AEF → MGEF AbPerkFortifyIntelligence 0x004351E1, "Gain +1 INT per
    // kill while on a Kill Streak (Max 10)"). Guarded on the MGEF's OWN AV
    // routing to a SPECIAL-point bucket so the units match (counter points in
    // → SPECIAL points out); a blanket rule would also fire on
    // Legendary_Armor_OvereaterAddValue (AV hungerThirstTier), where identity
    // would be wrong. ESM census over the 20260724 dump: exactly these two
    // effects match (ench_IntFromHacking is the only other zero-magnitude
    // SPECIAL-fortify candidate, but its input AV 0x00356A14 is not in
    // AV_PASSTHROUGH_DOMAINS — only killStreak is — so it correctly falls
    // through to the note below).
    const passthroughInput = resolveCurveInput(effect.curveInputAv, mgef.edid);
    const max = passthroughInput ? AV_PASSTHROUGH_DOMAINS[passthroughInput] : undefined;
    if (
      passthroughInput &&
      max !== undefined &&
      FALLBACK_AVIF_ROUTES[avifEdid]?.bucket.startsWith('special')
    ) {
      curve = {
        input: passthroughInput,
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: max, y: max },
        ],
      };
    } else {
      const unmeasuredScriptNote: Record<string, string> = {
        abFortifyDamageAll: 'unmeasured script-set damage bonus — needs in-game measurement',
        abFortifyDamageRecieved: 'unmeasured script-set damage bonus — needs in-game measurement',
      };
      const scriptNote = unmeasuredScriptNote[mgef.edid];
      if (scriptNote) {
        result.notes.push(`${mgef.edid}: ${scriptNote}`);
        return result;
      }
      result.notes.push(
        `MGEF ${mgef.edid}: zero magnitude, no curve — script/scaled, needs override`,
      );
      return result;
    }
  }

  // Detrimental flag: the magnitude REDUCES the actor value (mutation/
  // addiction "Reduce" effects). Flat magnitudes negate here; a Detrimental
  // multi-point curve doesn't occur in this dump's value-modifier effects —
  // surface it as a note rather than silently mis-signing the curve Y.
  if (mgef.detrimental) {
    if (curve) {
      result.notes.push(
        `MGEF ${mgef.edid}: Detrimental + value curve — sign semantics unverified, needs override`,
      );
      return result;
    }
    effectiveMagnitude = -effectiveMagnitude;
  }

  const allConds = [...effectConds];

  // Contact-delivered on-hit DR shred — before the timedBuff gate so duration>0
  // debuffs (Sheepsquatch Shard DamageDamageResistEffect 0x0018C35D, mag 0.5
  // over 5s) are not parked as toggle-gated timed buffs.
  if (
    avifEdid === 'DamageResist' &&
    (mgef.archetype === 'Peak Value Modifier' || mgef.archetype === 'Value Modifier') &&
    mgef.detrimental &&
    opts.conditionCtx?.subjectIsTarget &&
    !curve
  ) {
    result.modifiers.push({
      bucket: 'armorPenFlat',
      op: 'ADD',
      value: Math.abs(effect.magnitude),
      conditions: allConds,
    });
    return result;
  }

  if (effect.duration > 0 && !opts.timedIsActive) {
    if (opts.bashTriggered) {
      allConds.push({ kind: 'bashBuffUptime', durationSec: effect.duration });
      result.notes.push(
        `${mgef.edid}: bash-triggered timedBuff(${effect.duration}s) — scaled by onBashBuffUptime`,
      );
    } else {
      const raw = `timedBuff(${effect.duration}s)`;
      allConds.push({ kind: 'unresolved', raw });
      result.notes.push(`${mgef.edid}: ${raw} — needs toggle override`);
    }
  }

  const push = (
    bucket: Bucket,
    scale: number,
    conditions: Condition[],
    op: Modifier['op'] = 'ADD',
  ) => {
    // With a curve, the scale is `curveScale` (applied to the interpolated Y);
    // otherwise it multiplies the flat magnitude.
    result.modifiers.push(
      curve
        ? { bucket, op, curve, curveScale: scale, conditions }
        : { bucket, op, value: effectiveMagnitude * scale, conditions },
    );
  };

  const avifRoutes = routes.get(mgef.actorValue);
  const fallbackEntry = FALLBACK_AVIF_ROUTES[avifEdid];
  // Archetype-restricted routes (Health → maxHealth is Peak-only) fall
  // through to the unrouted paths below when the archetype doesn't match.
  const fallback =
    fallbackEntry &&
    (!fallbackEntry.archetypes || fallbackEntry.archetypes.includes(mgef.archetype))
      ? fallbackEntry
      : undefined;
  if (avifRoutes) {
    for (const route of avifRoutes) {
      const { conditions: routeConds, unresolved: routeUnresolved } = translateConditions(
        route.rawConditions,
        { edidByFormId },
      );
      if (routeConds === null) continue;
      routeUnresolved.forEach((u) => result.notes.push(`route(${avifEdid}): ${u}`));
      push(
        route.bucket,
        route.scale,
        [...allConds, ...routeConds, ...(route.extraConditions ?? [])],
        route.op,
      );
    }
  } else if (fallback) {
    push(fallback.bucket, fallback.scale, [...allConds, ...(fallback.conditions ?? [])]);
  } else if (
    avifEdid.startsWith('STAT_Dmg') ||
    avifEdid.startsWith('STAT_Crit') ||
    avifEdid.startsWith('STAT_Sneak')
  ) {
    result.unmappedAvifs.push(avifEdid);
  } else if (
    mgef.archetype === 'Value Modifier' &&
    OUT_OF_SCOPE_INSTANT_RESTORE_AVS.has(avifEdid)
  ) {
    // Documented skip, not a gap: instant one-shot restores (RestoreHealthFood,
    // RestoreActionPoints/Food, Brain Bombs...) are out of scope by design —
    // the fortify (Peak Value Modifier) route on the same AV is what's modeled
    // (user decisions 2026-07-14 health / 2026-07-15 AP).
  } else if (NO_OP_FLAG_AVIFS.has(avifEdid)) {
    // Documented skip, not a gap — see NO_OP_FLAG_AVIFS above.
  } else if (opts.noteUnroutedAvs) {
    // Without this a value-modifier effect vanishes silently and the record
    // looks inexplicably empty in review (the pre-fix Juggernaut's failure mode).
    result.notes.push(`MGEF ${mgef.edid}: no route for AV ${avifEdid} — needs mapping`);
  }

  return result;
}

/** True when a perk-effect condition tab includes a GetRandomPercent gate. */
function hasGetRandomPercentCondition(rows: RawCondition[]): boolean {
  return rows.some((row) => row.Function === 'GetRandomPercent');
}

/**
 * Drop the `GetRandomPercent` gate from already-translated conditions, for the
 * branches that lift that roll INTO the modifier's value (a probability) —
 * `translateConditions` has no kind for it, so it survives as
 * `{ kind: 'unresolved' }`, which `resolve.ts`'s `evalCondition` always fails.
 * Leaving it would silently make the very modifier the branch just built inert.
 */
function withoutRandomPercentGate(conditions: Condition[]): Condition[] {
  return conditions.filter(
    (c) => !(c.kind === 'unresolved' && c.raw.startsWith('GetRandomPercent(')),
  );
}

/**
 * Read the percent bound from a GetRandomPercent row (e.g. `<= 20` → 0.20).
 * GLOB-valued Comparison Values resolve via `globalValues` when present.
 */
function parseGetRandomPercentChance(
  rows: RawCondition[],
  globalValues?: Map<string, number>,
): number | null {
  for (const row of rows) {
    if (row.Function !== 'GetRandomPercent') continue;
    const rawCmp = row['Comparison Value'];
    const cmp =
      typeof rawCmp === 'string' && rawCmp.startsWith('0x')
        ? globalValues?.get(rawCmp)
        : typeof rawCmp === 'number'
          ? rawCmp
          : undefined;
    if (typeof cmp !== 'number') continue;
    const op = row.Operator ?? 'Equal To';
    if (/^less than or equal to$/i.test(op) || /^equal to$/i.test(op)) {
      return cmp / 100;
    }
  }
  return null;
}

/**
 * Granted-perk chase (2026-07-10): Script-archetype legendary MGEFs carry a
 * "Perk to Apply" whose PERK record holds the real stats as entry-point
 * effects (Executioner's: `Mod Weapon DMG Bonus Mult` +0.5, target HP ≤ GLOB
 * threshold) or as a granted Ability SPEL (chased through the normal MGEF
 * translation). Entry points we can't model become notes, not silence.
 *
 * Exported (2026-07-13): also the decode path for OMOD property 116
 * ("AttachedPerk" — unique-mod rework, extract-omods.ts's `mod_Custom_*`
 * family), which attaches a PERK straight to the wielder with no MGEF wrapper
 * at all — `contextEdid` is just the caller's own edid for the not-found note
 * text, so either caller (an MGEF or an OMOD) works unchanged.
 */
/** Shared Onslaught consecutive-hit counter (ConsecutiveHitCount AVIF). */
export const SHARED_ONSLAUGHT_COUNTER_AV = '0x00000395';

/** ArmorPenetration AV (0x00097341) — weapon-mod spikes/mags write this; ModArmorPenetrationPerk reads it. */
export const ARMOR_PENETRATION_AV = '0x00097341';

/** enchModArmorPenetration — grants ModArmorPenetrationPerk via ModArmorPenetrationAddPerkEffect MGEF. */
export const MOD_ARMOR_PEN_ENCH = '0x001F4425';

export type DirectEntryPointResolution =
  | { handled: true; modifiers: ModifierFragment[]; notes?: string[] }
  | { handled: false };

export interface DirectEntryPointInput {
  epName: string;
  functionName: string;
  float: number;
  conditionRows: RawCondition[];
  conditions: Condition[];
  edidByFormId: Map<string, string>;
  globalValues?: Map<string, number>;
  avFormId?: string | null;
  armorPenetrationAvMagnitude?: number;
  perkEdid?: string;
}

/**
 * Shared entry-point special cases for direct PERK records (extract-perks.ts)
 * and granted-perk chase (translateGrantedPerk). Returns `handled: true` when
 * this EP shape is fully resolved — callers must not fall through to the
 * generic ENTRY_POINT_BUCKETS mapping.
 */
export function resolveDirectEntryPointModifiers(
  input: DirectEntryPointInput,
): DirectEntryPointResolution {
  const {
    epName: name,
    functionName,
    float,
    conditionRows,
    conditions,
    edidByFormId,
    globalValues,
    avFormId,
    armorPenetrationAvMagnitude,
    perkEdid,
  } = input;
  const perkLabel = perkEdid ? `perk ${perkEdid}` : 'entry point';

  if (name === 'Set VATS Gun-Fu' && functionName === 'Set Value') {
    return { handled: true, modifiers: [] };
  }

  const gunFuMin = GUN_FU_TARGET_EP[name];
  if (gunFuMin !== undefined && functionName === 'Set Value') {
    return {
      handled: true,
      modifiers: [
        {
          bucket: 'dbm',
          op: 'MUL_ADD',
          value: float - 1,
          conditions: [
            ...conditions,
            { kind: 'vatsOnly', value: true },
            { kind: 'vatsTargetIndex', min: gunFuMin },
          ],
        },
      ],
    };
  }

  if (
    name === 'Mod Ammo Used Count' &&
    (functionName === 'Multiply Value' || functionName === 'Set Value') &&
    float === 0 &&
    hasGetRandomPercentCondition(conditionRows)
  ) {
    const value = parseGetRandomPercentChance(conditionRows, globalValues);
    if (value !== null) {
      return {
        handled: true,
        modifiers: [
          {
            bucket: 'ammoFreeChance',
            op: 'ADD',
            value,
            conditions: withoutRandomPercentGate(conditions),
          },
        ],
      };
    }
    return {
      handled: true,
      modifiers: [],
      notes: [`${perkLabel}: ${name} — GetRandomPercent present but chance unparsed, skipped`],
    };
  }

  if (
    name === 'Instant Reload Clip On Bash' &&
    functionName === 'Set Value' &&
    float === 1 &&
    hasGetRandomPercentCondition(conditionRows)
  ) {
    const value = parseGetRandomPercentChance(conditionRows, globalValues);
    if (value !== null) {
      return {
        handled: true,
        modifiers: [
          {
            bucket: 'reloadSkipChanceBash',
            op: 'ADD',
            value,
            conditions: withoutRandomPercentGate(conditions).filter(
              (c) =>
                c.kind !== 'powerAttack' &&
                !(c.kind === 'unresolved' && c.raw.startsWith('GetDead(')),
            ),
          },
        ],
      };
    }
    return {
      handled: true,
      modifiers: [],
      notes: [`${perkLabel}: ${name} — GetRandomPercent present but chance unparsed, skipped`],
    };
  }

  if (
    name === 'Auto Fill Weapon Clip' &&
    functionName === 'Set Value' &&
    float === 1 &&
    hasGetRandomPercentCondition(conditionRows)
  ) {
    const value = parseGetRandomPercentChance(conditionRows, globalValues);
    if (value !== null) {
      return {
        handled: true,
        modifiers: [
          {
            bucket: 'reloadSkipChance',
            op: 'ADD',
            value,
            conditions: withoutRandomPercentGate(conditions),
          },
        ],
      };
    }
    return {
      handled: true,
      modifiers: [],
      notes: [`${perkLabel}: ${name} — GetRandomPercent present but chance unparsed, skipped`],
    };
  }

  if (name === 'Mod Gun Range Mult' && functionName === 'Multiply Value') {
    const delta = float - 1;
    const rangeMod = {
      bucket: 'weaponMinRange' as const,
      op: 'MUL_ADD' as const,
      value: delta,
      conditions,
    };
    return {
      handled: true,
      modifiers: [rangeMod, { ...rangeMod, bucket: 'weaponMaxRange' }],
    };
  }

  const brawlerAv = avFormId;
  if (
    name === 'Mod Weapon DMG Bonus Mult' &&
    functionName === 'Add Actor Value Mult' &&
    typeof brawlerAv === 'string' &&
    (edidByFormId.get(brawlerAv) === 'Mod_Brawler_AV' || brawlerAv === '0x00245B9C')
  ) {
    return {
      handled: true,
      modifiers: [{ bucket: 'dbm', op: 'ADD', value: 0.1, conditions }],
    };
  }

  const ignoreArmorAv = avFormId;
  if (
    name === 'Mod Target Damage Resistance' &&
    functionName === 'Multiply 1 + Actor Value Mult' &&
    typeof ignoreArmorAv === 'string' &&
    (edidByFormId.get(ignoreArmorAv) === 'Mod_IgnoreArmor_AV' || ignoreArmorAv === '0x00245BA4')
  ) {
    return {
      handled: true,
      modifiers: [],
      notes: [
        `${perkLabel}: ${name} on Mod_IgnoreArmor_AV — multiplicative arm intentionally not extracted (unverified double-dip vs flat rows)`,
      ],
    };
  }

  if (
    name === 'Mod Target Damage Resistance' &&
    functionName === 'Multiply 1 + Actor Value Mult' &&
    typeof ignoreArmorAv === 'string' &&
    (edidByFormId.get(ignoreArmorAv) === 'ArmorPenetration' ||
      ignoreArmorAv === ARMOR_PENETRATION_AV)
  ) {
    if (armorPenetrationAvMagnitude != null) {
      return {
        handled: true,
        modifiers: [
          {
            bucket: 'armorPen',
            op: 'ADD',
            value: Math.abs(float) * armorPenetrationAvMagnitude,
            conditions,
          },
        ],
      };
    }
    return {
      handled: true,
      modifiers: [],
      notes: [
        `${perkLabel}: ${name} on ArmorPenetration AV — carrier ActorValues magnitude required for composition`,
      ],
    };
  }

  if (name === 'Mod Power Attack Damage' && functionName === 'Select Spell') {
    return {
      handled: true,
      modifiers: [],
      notes: [
        `${perkLabel}: ${name} Select Spell — block-triggered sustain buff, not powerAttackBonus (docs/assumptions.md "LGN Retribution")`,
      ],
    };
  }

  if (name === 'Mod Restore Action Cost Value' && functionName === 'Add Value') {
    return {
      handled: true,
      modifiers: [],
      notes: [
        `${perkLabel}: restores AP by ${float * 100}% of damage taken — on-damage-taken resource mechanic, not modeled (issue #89)`,
      ],
    };
  }

  if (name === 'Mod VATS Penetration Min Visibility') {
    return {
      handled: true,
      modifiers: [],
      notes: [
        `${perkLabel}: ${name} — VATS pierce-through visibility (up to 3 targets), not armorPen (docs/assumptions.md "Penetrating (mod_weapon_penetrating)")`,
      ],
    };
  }

  if (
    name === 'Is Next Clip Last Shot' &&
    functionName === 'Add Value' &&
    float === 1 &&
    hasGetRandomPercentCondition(conditionRows)
  ) {
    const value = parseGetRandomPercentChance(conditionRows, globalValues);
    if (value !== null) {
      return {
        handled: true,
        modifiers: [
          {
            bucket: 'lastShotChance',
            op: 'ADD',
            value,
            conditions: withoutRandomPercentGate(conditions),
          },
        ],
      };
    }
    return {
      handled: true,
      modifiers: [],
      notes: [`${perkLabel}: ${name} — GetRandomPercent present but chance unparsed, skipped`],
    };
  }

  return { handled: false };
}

function resolvePerkEffectAvFormId(effect: Record<string, unknown>): string | null {
  const avId = effect['Function Parameter 3 (Actor Value)'];
  if (typeof avId === 'string' && avId.startsWith('0x')) return avId;
  if (avId && typeof avId === 'object' && 'formid' in avId) {
    const fid = (avId as { formid: unknown }).formid;
    if (typeof fid === 'string') return fid;
  }
  return null;
}

/**
 * Chase a granted SPEL's own Effects list into modifiers/procComponents —
 * shared by the `effectType === 'Ability'` branch below (Electrician's:
 * Perk to Apply → PERK → Ability → SPEL) and the Function-Type-5 "Spell
 * Item" branch (Fracturer's/Circuit Breaker: PERK Entry Point → Spell field
 * directly, no Ability wrapper — issue #42, PROC_DAMAGE_PLAN.md).
 *
 * Most effects route through the ordinary `translateMagicEffect` (which
 * already chases a Script/Damage-archetype Explosion field into
 * `procComponents` — see that function). ONE shape needs special handling
 * first: a Damage-archetype effect with NO Explosion and `Duration: 0` (the
 * "Circuit Breaker shape") is a one-shot Contact hit, not a refresh DoT —
 * `translateMagicEffect`'s generic Damage-archetype branch would otherwise
 * misread it via `computeDotDps`'s refresh-only semantics, so it's decoded
 * directly via `decodeInstantDamageComponent` instead.
 *
 * `outerConditions` (the granting perk-effect's own translated Perk
 * Conditions) are threaded onto ordinary `modifiers` fragments exactly like
 * the pre-refactor inline code did; `procComponents` carry no conditions
 * (see `GeneratedProcComponent`), so they're merged as-is. `procCooldownSec`
 * is the FIRST contributing effect's own `Cooldown Duration` — irrelevant
 * for triggers other than `onCripple`, whose caller reads it.
 */
export async function chaseGrantedSpell(
  deps: MgefTranslationDeps,
  contextEdid: string,
  spellFormId: string,
  outerConditions: Condition[],
  /**
   * false (Function-Type-5 "Spell Item" call site only) refuses ordinary
   * modifiers from an effect that is ITSELF a Script-archetype MGEF with its
   * own `Perk to Apply` — a second hop of indirection that can retarget the
   * grant onto the STRUCK ENEMY instead of the wielder. ESM-proven
   * 2026-08-19: Suppressor's (`mod_Legendary_Weapon1_DebuffDamage`) chases
   * EP51 "Apply Combat Hit Spell" → SPEL (Target Type Self) → MGEF (Script,
   * Perk to Apply) → PERK `LegendaryDebuffDamage_TargetPerk` ("Reduce
   * target's damage output by 25%... after you attack") — the SECOND
   * Perk-to-Apply hop is what actually lands on the struck enemy, not the
   * "Self" delivery on the first SPEL. Blindly folding its granted `Mod
   * Weapon Attack Damage` modifier onto THIS omod would read as "your own
   * weapon deals 25% less damage" — backwards. Neither of the two ESM-walked
   * proc targets that route through this branch (Fracturer's/Circuit
   * Breaker) has a nested Perk-to-Apply on their own chased effects, so this
   * restriction costs them nothing; `true` (the Ability branch, effectType
   * `'Ability'`) is unchanged from its pre-2026-08-19 behavior — Ability
   * grants are conventionally simple wielder self-buffs, and no case of this
   * shape is known to exist there.
   */
  allowNestedGrant: boolean,
): Promise<MgefTranslationResult> {
  const { client, edidByFormId } = deps;
  const result: MgefTranslationResult = { modifiers: [], notes: [], unmappedAvifs: [] };

  let spell: EsmRecord;
  try {
    spell = await client.get(spellFormId);
  } catch {
    result.notes.push(`${contextEdid}: spell ${spellFormId} not found`);
    return result;
  }
  result.deliveryTargetType = recordTargetType(spell);

  for (const se of parseMagicEffects(spell)) {
    const effectMgef = await getMgefInfo(client, se.mgefFormId);

    if (effectMgef.archetype === 'Damage' && !effectMgef.explosion && se.duration === 0) {
      if (effectMgef.resistValue && !edidByFormId.has(effectMgef.resistValue)) {
        edidByFormId.set(effectMgef.resistValue, await client.resolveEdid(effectMgef.resistValue));
      }
      const component = decodeInstantDamageComponent(effectMgef, se, edidByFormId);
      if (component) {
        result.procComponents = [...(result.procComponents ?? []), component];
        result.procCooldownSec ??= se.cooldownDurationSec ?? undefined;
      }
      continue;
    }

    if (!allowNestedGrant && effectMgef.archetype === 'Script' && effectMgef.perkToApply) {
      result.notes.push(
        `${contextEdid}: MGEF ${effectMgef.edid} grants a nested perk — target-redirect risk (see chaseGrantedSpell's allowNestedGrant doc comment), not modeled`,
      );
      continue;
    }

    // Non-Ability (Function-Type-5 "Spell Item") chases are combat-TRIGGERED
    // grants — a bash/hit/kill/cripple event casts the spell, it is not a
    // permanently-worn ability — so a Duration>0 effect on the chased spell
    // is a real timed buff whose uptime this engine doesn't model, exactly
    // the case `MgefTranslationDeps.timedIsActive`'s doc comment calls "perk
    // proc-buffs [that] keep the flag" (i.e. do NOT default to always-active).
    // `deps.timedIsActive` is `true` here regardless, because
    // extract-omods.ts sets it as a blanket default for the OMOD pass (right
    // for a directly-granted Ability SPEL — allowNestedGrant `true` — whose
    // Duration is typically a re-apply tick on a genuinely passive
    // while-equipped effect). Without this override, `translate()`'s
    // `effect.duration > 0 && !opts.timedIsActive` gate (mgef.ts) never
    // fires and the buff folds as unconditional — confirmed 2026-08-19 on
    // Love Tap (E09C_mod_Custom_LoveTap, EP173 "Apply Combat Melee Spell":
    // Bashing Grants +30% Damage for 30s) and Holy Fire's friendly-hit buff
    // (mod_custom_HolyFire_Effect, EP184 "Apply Friendly Hit Spell": +30%
    // Damage and +50 DR for 15s) — both emitted a bare unconditional dbm/
    // damageResistGain modifier instead of the `unresolved` timedBuff gate
    // + note every other timed perk-proc buff already gets (issue #80/#42).
    const sub = await translateMagicEffect(
      allowNestedGrant ? deps : { ...deps, timedIsActive: false },
      se,
    );
    sub.notes.forEach((n) => result.notes.push(`${contextEdid}: ${n}`));
    sub.unmappedAvifs.forEach((a) => result.unmappedAvifs.push(a));
    result.deliveryTargetType = mergeDeliveryTargetType(
      result.deliveryTargetType,
      sub.deliveryTargetType,
    );
    for (const fragment of sub.modifiers) {
      result.modifiers.push({
        ...fragment,
        conditions: [...outerConditions, ...fragment.conditions],
      });
    }
    if (sub.procComponents && sub.procComponents.length > 0) {
      result.procComponents = [...(result.procComponents ?? []), ...sub.procComponents];
      result.procCooldownSec ??= se.cooldownDurationSec ?? undefined;
    }
    if (sub.auras && sub.auras.length > 0) {
      result.auras = [...(result.auras ?? []), ...sub.auras];
    }
  }
  return result;
}

export async function translateGrantedPerk(
  deps: MgefTranslationDeps,
  contextEdid: string,
  perkFormId: string,
): Promise<MgefTranslationResult> {
  const { client, edidByFormId } = deps;
  const result: MgefTranslationResult = { modifiers: [], notes: [], unmappedAvifs: [] };

  let perk: EsmRecord;
  try {
    perk = await client.get(perkFormId);
  } catch {
    result.notes.push(`${contextEdid}: granted perk ${perkFormId} not found`);
    return result;
  }
  const perkEdid = perk.editor_id;
  const effects = perk.fields['Effects'];
  if (!Array.isArray(effects)) return result;
  const perkEffects = (effects as Array<Record<string, unknown>>)
    .map((item) => item['Effect'] as Record<string, unknown> | undefined)
    .filter((e): e is Record<string, unknown> => !!e);

  for (const e of perkEffects) {
    const header = (e['Effect Header'] ?? {}) as Record<string, unknown>;
    const effectType =
      ((header['Effect Type'] as Record<string, unknown> | undefined)?.['name'] as string) ??
      'Unknown';
    const conditionRows = flattenPerkConditionRows(e['Perk Conditions']);

    // Pre-resolve condition params + GLOB comparison values for sync translation.
    const globalValues = new Map<string, number>();
    for (const row of conditionRows) {
      const p = row['Parameter 1'];
      if (typeof p === 'string' && p.startsWith('0x') && !edidByFormId.has(p)) {
        edidByFormId.set(p, await client.resolveEdid(p));
      }
      const cmp = row['Comparison Value'];
      if (typeof cmp === 'string' && cmp.startsWith('0x') && !globalValues.has(cmp)) {
        try {
          const glob = await client.get(cmp);
          const value = glob.fields['Value'];
          if (typeof value === 'number') globalValues.set(cmp, value);
        } catch {
          /* stays unresolved in translation */
        }
      }
    }
    const conditionForms = await resolveConditionForms(client, conditionRows, edidByFormId);
    const { conditions, unresolved } = translateConditions(conditionRows, {
      edidByFormId,
      globalValues,
      conditionForms,
      crossFamilyRank: deps.crossFamilyRank,
    });
    if (conditions === null) continue;

    if (effectType === 'Entry Point') {
      const ep = (e['Entry Point'] ?? {}) as Record<string, unknown>;
      const name =
        ((ep['Entry Point'] as Record<string, unknown> | undefined)?.['name'] as string) ??
        'Unknown';
      const functionName =
        ((ep['Function'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown';
      const float = typeof e['Float'] === 'number' ? (e['Float'] as number) : 0;

      const directEp = resolveDirectEntryPointModifiers({
        epName: name,
        functionName,
        float,
        conditionRows,
        conditions,
        edidByFormId,
        globalValues,
        avFormId: resolvePerkEffectAvFormId(e),
        armorPenetrationAvMagnitude: deps.armorPenetrationAvMagnitude,
        perkEdid,
      });
      if (directEp.handled) {
        const foldRandom = hasGetRandomPercentCondition(conditionRows);
        unresolved
          .filter((u) => !(foldRandom && u.startsWith('GetRandomPercent')))
          .forEach((u) => result.notes.push(`perk ${perkEdid}: ${u}`));
        result.modifiers.push(...directEp.modifiers);
        directEp.notes?.forEach((n) => result.notes.push(n));
        continue;
      }

      unresolved.forEach((u) => result.notes.push(`perk ${perkEdid}: ${u}`));
      const stimpakHeal = resolveStimpakHealEntryPoint(
        name,
        perkFormId,
        conditionRows,
        edidByFormId,
      );
      if (stimpakHeal) {
        const { conditions: stimpakConditions, unresolved: stimpakUnresolved } =
          translateConditions(stimpakHeal.conditionRows, {
            edidByFormId,
            globalValues,
            conditionForms,
            crossFamilyRank: deps.crossFamilyRank,
          });
        if (stimpakConditions === null) continue;
        stimpakUnresolved.forEach((u) => result.notes.push(`perk ${perkEdid}: ${u}`));
        if (functionName === 'Multiply Value') {
          result.modifiers.push({
            bucket: stimpakHeal.bucket,
            op: 'MUL_ADD',
            value: float - 1,
            conditions: stimpakConditions,
          });
        } else {
          result.notes.push(
            `perk ${perkEdid}: entry point ${name} uses ${functionName} — stimpak-heal gate matched but function unhandled`,
          );
        }
        continue;
      }

      // Function-Type-5 "Spell Item" (issue #42 — PROC_DAMAGE_PLAN.md):
      // Fracturer's EP201 "Apply Spell On Actor When Limb Crippled" and
      // Circuit Breaker's EP51 "Apply Combat Hit Spell" grant a SPEL
      // directly rather than routing through a formula bucket — chase it via
      // the same `chaseGrantedSpell` the Ability branch below uses.
      // `functionName`/`float`/ENTRY_POINT_BUCKETS never apply to this shape
      // (`Function Type`, read off `e` directly, is a SIBLING of `Entry
      // Point`/`Perk Conditions` — NOT nested under `Effect Header` as
      // PROC_DAMAGE_PLAN.md's draft assumed; esm-walk-corrected 2026-08-19
      // against PERK 0x00795778/0x006EBCD6). Non-proc Spell-Item grants
      // (Love Tap's EP173 "Apply Combat Melee Spell", a FortifyDamageAll
      // dbm) fall through as ordinary modifiers — they never populate
      // `procComponents`, so no special-casing is needed for them here.
      const functionTypeName = (e['Function Type'] as Record<string, unknown> | undefined)?.[
        'name'
      ];
      if (functionTypeName === 'Spell Item' && typeof e['Spell'] === 'string') {
        // Bash-triggered uptime scaling (Love Tap — issue #80/#42 follow-up,
        // user-directed 2026-08-20) is scoped to EP173 "Apply Combat Melee
        // Spell" specifically — see MgefTranslationDeps.bashTriggered.
        const sub = await chaseGrantedSpell(
          { ...deps, bashTriggered: name === 'Apply Combat Melee Spell' },
          `perk ${perkEdid}`,
          e['Spell'],
          conditions,
          false,
        );
        sub.notes.forEach((n) => result.notes.push(n));
        sub.unmappedAvifs.forEach((a) => result.unmappedAvifs.push(a));
        result.deliveryTargetType = mergeDeliveryTargetType(
          result.deliveryTargetType,
          sub.deliveryTargetType,
        );
        result.modifiers.push(...sub.modifiers);
        if (sub.procComponents && sub.procComponents.length > 0) {
          const isOnCripple = name === 'Apply Spell On Actor When Limb Crippled';
          const isLastRoundHit =
            name === 'Apply Combat Hit Spell' && conditions.some((c) => c.kind === 'lastRound');
          if (isOnCripple) {
            result.procs = [
              ...(result.procs ?? []),
              {
                trigger: 'onCripple',
                cooldownSec: sub.procCooldownSec ?? 0,
                components: sub.procComponents,
              },
            ];
          } else if (isLastRoundHit) {
            result.procs = [
              ...(result.procs ?? []),
              { trigger: 'lastRound', components: sub.procComponents },
            ];
          } else {
            result.notes.push(
              `perk ${perkEdid}: ${name} — Function-Type-5 chase produced damage but no proc-trigger classification, dropped`,
            );
          }
        }
        if (sub.auras && sub.auras.length > 0) {
          result.auras = [...(result.auras ?? []), ...sub.auras];
        }
        continue;
      }

      const bucket = ENTRY_POINT_BUCKETS[name];
      if (!bucket) {
        result.notes.push(`perk ${perkEdid}: entry point ${name} — not modeled`);
        continue;
      }
      const epConditions = [...conditions, ...(ENTRY_POINT_EXTRA_CONDITIONS[name] ?? [])];
      const avFormId = resolvePerkEffectAvFormId(e);
      const onslaughtStacks: Condition = { kind: 'stacks', counter: 'onslaught', max: 99 };

      // Elder's Mark / Ticket to Revenge: reference the LIVE shared Onslaught
      // counter (0x395) directly — Float is already the per-stack magnitude; no
      // private-accumulator Default Value lookup (contrast the EP189 branch
      // below for Furious/Pounder's/Splinter's private AVs).
      if (avFormId === SHARED_ONSLAUGHT_COUNTER_AV) {
        if (functionName === 'Add Actor Value Mult') {
          result.modifiers.push({
            bucket,
            op: 'ADD',
            value: float,
            conditions: [...epConditions, onslaughtStacks],
          });
          continue;
        }
        if (functionName === 'Multiply 1 + Actor Value Mult') {
          // Game: entry × (1 + float × stacks). `armorPen` bootstrap-folds with
          // base 0 (ADD-only today) — MUL_ADD would be inert there, so map to
          // ADD(−float) per stack (Ticket's −0.03 → +0.03 pen/stack).
          const op = bucket === 'armorPen' ? 'ADD' : 'MUL_ADD';
          const value = bucket === 'armorPen' ? -float : float;
          result.modifiers.push({
            bucket,
            op,
            value,
            conditions: [...epConditions, onslaughtStacks],
          });
          continue;
        }
      }

      // Cultist Piercer: Multiply Value on target DR (×0.5 = 50% pen). The
      // generic MUL_ADD(float−1) shape is inert on `armorPen` (bootstrap base
      // 0) — ADD(1−float) matches mitigation.ts's fraction convention.
      if (name === 'Mod Target Damage Resistance' && functionName === 'Multiply Value') {
        result.modifiers.push({
          bucket,
          op: 'ADD',
          value: 1 - float,
          conditions: epConditions,
        });
        continue;
      }

      // Ignore Armor lining flat rows (mod_armor_IgnoreArmorPerk): Add Value −5/−10
      // are enemy DR points, not armorPen fractions — route to armorPenFlat.
      if (name === 'Mod Target Damage Resistance' && functionName === 'Add Value' && float < 0) {
        result.modifiers.push({
          bucket: 'armorPenFlat',
          op: 'ADD',
          value: Math.abs(float),
          conditions: epConditions,
        });
        continue;
      }

      // Entry-point Curve Table: ALWAYS beats the flat Float beside it
      // (docs/assumptions.md "Curve tables override flat values") — Lone
      // Wanderer's Mod Incoming Weapon Damage carries Float null with its
      // real ×0.99→×0.8 values in a curve. Single-point curves collapse
      // into the float (authored constants). A multi-point curve's input
      // axis is the EP's OWN "Function Parameter 4 (Actor Value)" (LW:
      // Charisma — USER-CORRECTED 2026-08-20 after a wrong player-level
      // guess), resolved through the same CURVE_INPUT_AVS map SPEL-effect
      // curves use; each Y then runs through the function shape's float
      // transform (Multiply Value folds as MUL_ADD of y−1). An unmapped
      // input AV (armor legendaries' per-effect stack counters, raw engine
      // slots like 0x39E) notes and skips — a missing modifier is honest,
      // a mislabeled axis is not.
      const epCurveNode = e['Curve Table'] as
        | { curve?: Array<{ x: number; y: number }> }
        | null
        | undefined;
      const epCurvePoints =
        Array.isArray(epCurveNode?.curve) && epCurveNode.curve.length > 0
          ? epCurveNode.curve
          : null;
      let epFloat = float;
      let epCurve: ValueCurve | undefined;
      if (epCurvePoints && epCurvePoints.length === 1) {
        epFloat = epCurvePoints[0].y;
      } else if (epCurvePoints) {
        const curveAv = (e['Function Parameter 4 (Actor Value)'] as string) ?? null;
        let input = curveAv ? CURVE_INPUT_AVS[curveAv] : undefined;
        if (!input && curveAv) {
          // Armor legendaries' per-effect piece counters (LGND_DmgFromAnimals,
          // LGND_EquippedArmorCount_Sentinel, ...): each worn piece increments
          // its LGND_* counter AV, and the curve IS the authored stacking
          // table — x = worn pieces (domains 0/1..5), y = the TOTAL effect at
          // that count (Hunter's 1−0.85ⁿ; USER-CONFIRMED 2026-08-20, no
          // hand stacking math). Resolved at armor assembly
          // (armor-roster.ts's scaleModifier), never engine-evaluated.
          let curveAvEdid = edidByFormId.get(curveAv);
          if (curveAvEdid === undefined) {
            try {
              curveAvEdid = await client.resolveEdid(curveAv);
              edidByFormId.set(curveAv, curveAvEdid);
            } catch {
              curveAvEdid = curveAv;
            }
          }
          const maxX = Math.max(...epCurvePoints.map((p) => p.x));
          if (curveAvEdid.startsWith('LGND_') && maxX <= 5) {
            input = 'wornPieces';
          }
        }
        if (!input) {
          result.notes.push(
            `perk ${perkEdid}: entry point ${name} curve input AV ${
              curveAv ? (edidByFormId.get(curveAv) ?? curveAv) : 'none'
            } unmapped — needs mapping`,
          );
          continue;
        }
        epCurve = { input, points: epCurvePoints };
      }

      if (functionName === 'Add Value') {
        if (epCurve) {
          result.modifiers.push({
            bucket,
            op: 'ADD',
            curve: epCurve,
            curveScale: 1,
            conditions: epConditions,
          });
        } else {
          result.modifiers.push({ bucket, op: 'ADD', value: epFloat, conditions: epConditions });
        }
      } else if (functionName === 'Set Value') {
        if (epCurve) {
          result.modifiers.push({
            bucket,
            op: 'SET',
            curve: epCurve,
            curveScale: 1,
            conditions: epConditions,
          });
        } else {
          result.modifiers.push({ bucket, op: 'SET', value: epFloat, conditions: epConditions });
        }
      } else if (functionName === 'Multiply Value') {
        if (epCurve) {
          result.modifiers.push({
            bucket,
            op: 'MUL_ADD',
            curve: { ...epCurve, points: epCurve.points.map((p) => ({ x: p.x, y: p.y - 1 })) },
            curveScale: 1,
            conditions: epConditions,
          });
        } else {
          result.modifiers.push({
            bucket,
            op: 'MUL_ADD',
            value: epFloat - 1,
            conditions: epConditions,
          });
        }
      } else if (
        functionName === 'Add Actor Value Mult' &&
        name === 'Mod Damage on Consecutive Hits'
      ) {
        // Onslaught per-stack dbm (Furious/Pounder's/Splinter's EP189): the
        // function ADDs Float × value(referencedAV), where the referenced AV
        // (Function Parameter 3) is a PRIVATE damage-accumulator — NOT the
        // shared Onslaught counter (0x00000395), and not the private raw hit
        // counter either (e.g. Furious's own LGND_WeaponConsecutiveHits
        // 0x001EF483, 0→9). The accumulator's AVIF Default Value IS the
        // per-stack step (Furious LGND_Furious 0x006C3172: Default 5.0, Max
        // 45.0 = 5×9; Pounder's Legendary_Pounders_ConsecutiveHits 0x007ACB37
        // and Splinter's P62_..._MaxConsecutiveHits 0x0080219A: Default 10.0,
        // Max 100.0) — confirmed via `esm get` 2026-07-15, replacing the prior
        // (wrong) assumption that the raw Float alone was the per-stack value
        // (docs/assumptions.md "Onslaught"). Modeled as dbm scaled by the
        // SHARED stack count via the existing `stacks` condition, max 99 (a
        // value the shared counter can never reach — the real clamp is the
        // equipped cap, applied by the `onslaught` reader in resolve.ts).
        const avId = e['Function Parameter 3 (Actor Value)'];
        let perStack = float;
        if (typeof avId === 'string' && avId.startsWith('0x')) {
          try {
            const av = await client.get(avId);
            const def = av.fields['Default Value'];
            if (typeof def === 'number') {
              perStack = float * def;
            } else {
              result.notes.push(
                `perk ${perkEdid}: ${name} AV ${avId} has no Default Value — used raw float`,
              );
            }
          } catch {
            result.notes.push(`perk ${perkEdid}: ${name} AV ${avId} unresolved — used raw float`);
          }
        } else {
          result.notes.push(
            `perk ${perkEdid}: ${name} — no referenced Actor Value found, used raw float`,
          );
        }
        result.modifiers.push({
          bucket,
          op: 'ADD',
          value: perStack,
          conditions: [...conditions, { kind: 'stacks', counter: 'onslaught', max: 99 }],
        });
      } else if (functionName === 'Add Actor Value Mult' && CURVE_INPUT_AVS[avFormId ?? '']) {
        result.modifiers.push({
          bucket,
          op: 'ADD', // 'Mod Weapon DMG Bonus Mult' is always additive
          value: float,
          scaledBy: CURVE_INPUT_AVS[avFormId!],
          conditions: epConditions,
        });
      } else {
        result.notes.push(`perk ${perkEdid}: entry point ${name} uses ${functionName} — skipped`);
      }
      continue;
    }

    unresolved.forEach((u) => result.notes.push(`perk ${perkEdid}: ${u}`));

    if (effectType === 'Ability' && typeof e['Ability'] === 'string') {
      const sub = await chaseGrantedSpell(deps, `perk ${perkEdid}`, e['Ability'], conditions, true);
      sub.notes.forEach((n) => result.notes.push(n));
      sub.unmappedAvifs.forEach((a) => result.unmappedAvifs.push(a));
      result.deliveryTargetType = mergeDeliveryTargetType(
        result.deliveryTargetType,
        sub.deliveryTargetType,
      );
      result.modifiers.push(...sub.modifiers);
      if (sub.procComponents && sub.procComponents.length > 0) {
        result.procComponents = [...(result.procComponents ?? []), ...sub.procComponents];
        result.procCooldownSec ??= sub.procCooldownSec;
      }
      if (sub.auras && sub.auras.length > 0) {
        result.auras = [...(result.auras ?? []), ...sub.auras];
      }
      continue;
    }

    result.notes.push(`perk ${perkEdid}: effect type ${effectType} — not modeled`);
  }
  result.modifiers = collapseRustyKnucklesBleedTiers(result.modifiers);
  return result;
}

/**
 * Async gather + `translate`: fetches the MGEF record and pre-resolves every
 * edid the pure translation reads (condition params + the actor value), then
 * delegates to the synchronous core.
 */
export async function translateMagicEffect(
  deps: MgefTranslationDeps,
  effect: SpellEffect,
  conditionCtx?: Partial<ConditionTranslationContext>,
): Promise<MgefTranslationResult> {
  const { client, edidByFormId } = deps;
  const mgef = await getMgefInfo(client, effect.mgefFormId);

  // MGEF-record-level Conditions gate the effect the same way entry-level
  // rows do (see MgefInfo.conditionRows). Merged FIRST so they resolve
  // through the same CNDF/edid gathering below and also gate the
  // Script-archetype granted-perk path. Consumable-side effects whose gates
  // route them to a different app source entirely are dropped upstream
  // instead (extract-buffs' CONSUMABLE_MGEFS_MODELED_ELSEWHERE).
  if (mgef.conditionRows.length > 0) {
    effect = { ...effect, conditionRows: [...mgef.conditionRows, ...effect.conditionRows] };
  }

  // CNDF indirections (IsTrueForConditionForm) pre-fetched for sync inline
  // expansion — extends the caller's shared map when one is passed
  // (extract-perks), else builds a local one (buff/consumable extraction).
  const conditionForms = await resolveConditionForms(
    client,
    effect.conditionRows,
    edidByFormId,
    conditionCtx?.conditionForms,
  );
  // deps.crossFamilyRank is the fallback — a caller's own conditionCtx (the
  // perks pass) wins when it carries one.
  conditionCtx = { crossFamilyRank: deps.crossFamilyRank, ...conditionCtx, conditionForms };

  // Script-archetype effects with a granted perk: the stats live on the PERK
  // record, not the MGEF — chase it (depth-capped against perk→spell→perk loops).
  // Armor lining enchants use Unknown 36 (Brawler) / Absorb (Ignore Armor) with
  // the same Perk-to-Apply shape — intentionally NOT chasing the sibling
  // ActorValues per-piece AV write on the PARENT template (double-count risk;
  // docs/assumptions.md "Armor lining Brawler / Ignore Armor").
  if (PERK_GRANT_ARCHETYPES.has(mgef.archetype) && mgef.perkToApply && (deps.grantDepth ?? 0) < 2) {
    const granted = await translateGrantedPerk(
      { ...deps, grantDepth: (deps.grantDepth ?? 0) + 1 },
      mgef.edid,
      mgef.perkToApply,
    );
    if (
      granted.modifiers.length > 0 ||
      granted.notes.length > 0 ||
      (granted.procComponents?.length ?? 0) > 0 ||
      (granted.procs?.length ?? 0) > 0 ||
      (granted.auras?.length ?? 0) > 0
    ) {
      // The effect's own condition rows still gate the grant.
      for (const row of effect.conditionRows) {
        const p = row['Parameter 1'];
        if (typeof p === 'string' && p.startsWith('0x') && !edidByFormId.has(p)) {
          edidByFormId.set(p, await client.resolveEdid(p));
        }
      }
      const { conditions: grantConds, unresolved } = translateConditions(effect.conditionRows, {
        edidByFormId,
        ...conditionCtx,
      });
      if (grantConds === null)
        return { modifiers: [], notes: granted.notes, unmappedAvifs: granted.unmappedAvifs };
      unresolved.forEach((u) => granted.notes.push(`condition: ${u}`));
      granted.modifiers = granted.modifiers.map((m) => ({
        ...m,
        conditions: [...grantConds, ...m.conditions],
      }));
      granted.modifiers = collapseRustyKnucklesBleedTiers(granted.modifiers);
      return {
        ...granted,
        deliveryTargetType: mergeDeliveryTargetType(undefined, granted.deliveryTargetType),
      };
    }
  }

  // Proc-triggered damage (issue #42 — PROC_DAMAGE_PLAN.md): a Script- or
  // Damage-archetype MGEF that detonates an EXPL is authoritative over its
  // own magnitude/curve (Electrician's/Fracturer's) — chased BEFORE the
  // generic translate() call below so it pre-empts both the Script "needs
  // override" note and the Damage-archetype dotDamage misread (a duration-0,
  // Explosion-bearing Damage effect is a one-shot detonation, not a refresh
  // DoT). Unconditional once `mgef.explosion` is set, even when the chase
  // finds no direct damage (VFX-only detonations, e.g. Circuit Breaker's
  // stun-cast spell) — the Explosion field is authoritative either way, so
  // falling through to translate() would risk misreading unrelated own
  // magnitude/curve data on the same MGEF.
  if (mgef.explosion && (mgef.archetype === 'Script' || mgef.archetype === 'Damage')) {
    const chaseUnresolved: string[] = [];
    const procComponents = await decodeProcComponentsFromExpl(
      client,
      mgef.explosion,
      chaseUnresolved,
    );
    const chaseNotes = chaseUnresolved.map((u) => `MGEF ${mgef.edid}: ${u}`);
    if (procComponents.length === 0) {
      chaseNotes.push(`MGEF ${mgef.edid}: Explosion ${mgef.explosion} chased — no direct damage`);
      return { modifiers: [], notes: chaseNotes, unmappedAvifs: [] };
    }
    return { modifiers: [], notes: chaseNotes, unmappedAvifs: [], procComponents };
  }

  // Cloak-archetype continuous damage auras (ADR-0023 — Tesla Coils, Miasma,
  // Plague Walker): chase Assoc. Item ENCH/SPEL chains BEFORE the generic
  // translate() "needs override" dead-end. Utility-only cloaks (Targeting
  // HUD, Conductor's, …) return no auras and fall through to that note.
  if (mgef.archetype === 'Cloak') {
    const chaseNotes: string[] = [];
    const auras = await decodeAuraFromCloakMgef(deps, mgef, effect, [], chaseNotes);
    if (auras.length > 0) {
      return { modifiers: [], notes: chaseNotes, unmappedAvifs: [], auras };
    }
  }

  for (const row of effect.conditionRows) {
    const p = row['Parameter 1'];
    if (typeof p === 'string' && p.startsWith('0x') && !edidByFormId.has(p)) {
      edidByFormId.set(p, await client.resolveEdid(p));
    }
  }
  // Only value-modifier archetypes read the actor value; skip the resolve for
  // the archetypes translate() discards (matches the old lazy resolution).
  const isValueArchetype =
    mgef.archetype === 'Peak Value Modifier' || mgef.archetype === 'Value Modifier';
  if (isValueArchetype && mgef.actorValue && !edidByFormId.has(mgef.actorValue)) {
    edidByFormId.set(mgef.actorValue, await client.resolveEdid(mgef.actorValue));
  }
  // Damage-archetype effects read the Resist Value (DoT element).
  if (mgef.archetype === 'Damage' && mgef.resistValue && !edidByFormId.has(mgef.resistValue)) {
    edidByFormId.set(mgef.resistValue, await client.resolveEdid(mgef.resistValue));
  }

  // GLOB-valued magnitude override (Sniper's-style): when an effect carries
  // a `magnitudeGlobal` FormID, that Global's Value is the authoritative
  // magnitude and overrides the flat Effect Item Data float — the same
  // relationship a Curve Table has to the flat magnitude (see the
  // curve-override path above, which needs no equivalent guard). A present
  // `magnitudeGlobal` is always this effect's own reference (the `esm` CLI's
  // decoder binds each effect's optional trailing subrecords to the
  // physically correct effect) and should always win over the flat
  // magnitude — never re-add a `magnitude === 0` gate here.
  let resolvedEffect = effect;
  if (effect.magnitudeGlobal) {
    try {
      const glob = await client.get(effect.magnitudeGlobal);
      const value = glob.fields['Value'];
      if (typeof value === 'number') resolvedEffect = { ...effect, magnitude: value };
    } catch {
      /* leave the flat magnitude as-is; if it was already 0 this surfaces downstream as
       * the usual zero-magnitude note, otherwise the flat value stands unresolved */
    }
  }

  return translate(mgef, resolvedEffect, deps.routes, edidByFormId, {
    timedIsActive: deps.timedIsActive,
    bashTriggered: deps.bashTriggered,
    noteUnroutedAvs: deps.noteUnroutedAvs,
    conditionCtx,
  });
}

/** Attach source identity + ids to bucket-level modifier fragments. */
export function withSource(
  fragments: ModifierFragment[],
  source: ModifierSource,
  idPrefix: string,
): Modifier[] {
  return fragments.map((f, i) => ({ id: `${idPrefix}:${i}`, source, ...f }));
}

export interface EnchantmentTranslation {
  modifiers: ModifierFragment[];
  notes: string[];
  /** The record's own Delivery ("Target Type") name (e.g. "Contact", "Self"), or null when the record wasn't found. */
  targetType: string | null;
  /**
   * Innermost chased-SPEL delivery when a Self outer ENCH grants a Contact
   * on-hit proc through a perk (Rusty Knuckles, Voice of Set). Falls back to
   * `targetType` when no deeper chase ran.
   */
  effectiveTargetType: string | null;
  /** Classified procs (issue #42) chased off this ENCH/SPEL's own Effects list — empty when none. */
  procs: GeneratedProc[];
  /** Tick-based aura damage (ADR-0023) chased off Cloak effects in this ENCH/SPEL. */
  auras: GeneratedAura[];
}

/** `GetActorGunState` Equal-To rows, or a `WornHasKeyword` row of any polarity — the two condition-row shapes an Electrician's-style reload-animation-state fan-out entry carries (esm-walk-verified 2026-08-19 on ENCH 0x00799381: each of its 5 duplicate effects gates on exactly one `GetActorGunState` state PLUS one `WornHasKeyword(WeaponNoReload)` row, Not-Equal-To-1 for the reload-capable branch and Equal-To-1 for each no-reload animation state). */
function isReloadFanoutConditionRow(row: RawCondition): boolean {
  if (row.Function === 'GetActorGunState') {
    return (row.Operator ?? 'Equal To').toLowerCase() === 'equal to';
  }
  return row.Function === 'WornHasKeyword' && typeof row['Parameter 1'] === 'string';
}

function isReloadFanoutEffect(effect: SpellEffect): boolean {
  return (
    effect.conditionRows.length > 0 &&
    effect.conditionRows.some((r) => r.Function === 'GetActorGunState') &&
    effect.conditionRows.every(isReloadFanoutConditionRow)
  );
}

export interface ReloadStateFanoutResult {
  /** Original effects list with reload-animation-state fan-out duplicates collapsed to their first occurrence. */
  effects: SpellEffect[];
  /** `mgefFormId`s recognized as reload-animation-state fan-out — classify their chased proc as `reloadCycle`. */
  reloadCycleMgefFormIds: Set<string>;
}

/**
 * Collapse ENCH/SPEL effects sharing the same `mgefFormId` whose ENTIRE
 * condition-row set is reload-animation-state-fan-out-shaped (Electrician's:
 * one MGEF chased 5 times, once per `GetActorGunState` value the weapon can
 * be in mid-reload) down to a single kept effect — every duplicate detonates
 * the exact same proc, so translating all 5 would 5x the damage. A group only
 * counts as fan-out when it has more than one member; a lone effect that
 * happens to carry a `GetActorGunState` gate is left alone (nothing to
 * collapse, and singling it out here would be a needless behavior change for
 * unrelated content).
 */
export function dedupeReloadStateFanout(effects: SpellEffect[]): ReloadStateFanoutResult {
  const groups = new Map<string, SpellEffect[]>();
  for (const e of effects) {
    const list = groups.get(e.mgefFormId);
    if (list) list.push(e);
    else groups.set(e.mgefFormId, [e]);
  }

  const reloadCycleMgefFormIds = new Set<string>();
  for (const [mgefFormId, group] of groups) {
    if (group.length > 1 && group.every(isReloadFanoutEffect)) {
      reloadCycleMgefFormIds.add(mgefFormId);
    }
  }

  const seen = new Set<string>();
  const kept: SpellEffect[] = [];
  for (const e of effects) {
    if (reloadCycleMgefFormIds.has(e.mgefFormId)) {
      if (seen.has(e.mgefFormId)) continue;
      seen.add(e.mgefFormId);
    }
    kept.push(e);
  }
  return { effects: kept, reloadCycleMgefFormIds };
}

/**
 * Resolve an ENCH or SPEL record's own Delivery field ("Target Type" — ENCH
 * nests it under `Effect Data`, SPEL directly under `Data`; same enum,
 * different parent key).
 */
function recordTargetType(record: EsmRecord): string {
  const effectData = (record.fields['Effect Data'] ?? record.fields['Data'] ?? {}) as Record<
    string,
    unknown
  >;
  return (
    ((effectData['Target Type'] as Record<string, unknown> | undefined)?.['name'] as string) ?? ''
  );
}

/**
 * Walk an ENCH's (or a HAZD-placed SPEL's — same "Effects" list shape,
 * `parseMagicEffects` is signature-agnostic) own Effects list into modifier
 * fragments, exactly like a granted ability — EXCEPT: Contact/Fire-and-
 * Forget-delivery records (on-hit weapon-mod procs: bleed/burn/poison DoTs,
 * Cremator's fire hit, Lobber-family hazard ticks) apply to the STRUCK
 * TARGET, not the wielder, so their `GetIsPlayer` rows need the inverted
 * reading `subjectIsTarget` supplies (conditions.ts) — Self/other-delivery
 * records (ordinary granted legendary effects) keep the default reading.
 * Shared by extract-omods.ts's OMOD `Enchantments`/`OverrideProjectile`
 * chases and extract-weapons.ts's WEAP `Enchantment` chase.
 */
export async function translateEnchantment(
  deps: MgefTranslationDeps,
  enchOrSpelFormId: string,
): Promise<EnchantmentTranslation> {
  let record: EsmRecord;
  try {
    record = await deps.client.get(enchOrSpelFormId);
  } catch {
    return {
      modifiers: [],
      notes: [`enchantment ${enchOrSpelFormId} not found`],
      targetType: null,
      effectiveTargetType: null,
      procs: [],
      auras: [],
    };
  }
  const targetType = recordTargetType(record);
  let effectiveTargetType = targetType;
  // deps.crossFamilyRank flows via translateMagicEffect's conditionCtx default.
  const conditionCtx = targetType === 'Contact' ? { subjectIsTarget: true } : undefined;
  const modifiers: ModifierFragment[] = [];
  const notes: string[] = [];
  const procs: GeneratedProc[] = [];
  const auras: GeneratedAura[] = [];
  const { effects, reloadCycleMgefFormIds } = dedupeReloadStateFanout(parseMagicEffects(record));
  for (const effect of effects) {
    const result = await translateMagicEffect(deps, effect, conditionCtx);
    result.notes.forEach((n) => notes.push(n));
    effectiveTargetType =
      mergeDeliveryTargetType(effectiveTargetType, result.deliveryTargetType) ??
      effectiveTargetType;
    modifiers.push(...result.modifiers);
    // Already-classified procs bubbled up from a nested Script+perkToApply
    // chase (Fracturer's/Circuit Breaker's Function-Type-5 branch,
    // translateGrantedPerk — issue #42): pass through as-is.
    if (result.procs) procs.push(...result.procs);
    if (result.auras) auras.push(...result.auras);
    if (result.procComponents && result.procComponents.length > 0) {
      if (reloadCycleMgefFormIds.has(effect.mgefFormId)) {
        procs.push({ trigger: 'reloadCycle', components: result.procComponents });
      } else {
        // A chased proc with no trigger classification at THIS level —
        // reloadCycle is the only trigger dedupeReloadStateFanout classifies
        // here; every other trigger is classified inside translateGrantedPerk
        // before its result ever reaches this loop. Note instead of silently
        // dropping so a future same-shaped legendary shows up for review
        // rather than vanishing.
        notes.push(
          `MGEF ${effect.mgefFormId}: Explosion chase produced damage components but no proc-trigger classification — dropped`,
        );
      }
    }
  }
  return { modifiers, notes, targetType, effectiveTargetType, procs, auras };
}
