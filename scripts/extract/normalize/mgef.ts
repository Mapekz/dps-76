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
import {
  flattenConditionRows,
  flattenPerkConditionRows,
  translateConditions,
  type ConditionTranslationContext,
  type RawCondition,
} from './conditions';

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
 * Consumed by both entry-point translation sites (extract-perks.ts's direct
 * PERK path and `translateGrantedPerk` below). No plumbing perk carries
 * these entry points, so `buildAvifRoutes` needs no wiring.
 */
export const ENTRY_POINT_EXTRA_CONDITIONS: Record<string, Condition[]> = {
  // Explosion-scoped baseDamage (see the ENTRY_POINT_BUCKETS note): applies
  // to `fromExplosion` components and explosive twins only —
  // `damageTypeScope ['explosive']` matches both via
  // `ResolveContext.componentIsExplosion` (resolve.ts).
  'Mod Player Explosion Damage': [{ kind: 'damageTypeScope', types: ['explosive'] }],
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
  // must NOT feed it (docs/assumptions.md "Armor (Phase 3 engine + UI, 2026-07-18)").
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
};

export interface AvifRoute {
  bucket: Bucket;
  scale: number;
  rawConditions: RawCondition[];
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
      const list = routes.get(actorValue) ?? [];
      list.push({
        bucket,
        scale: typeof e['Float'] === 'number' ? (e['Float'] as number) : 0.01,
        rawConditions,
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
  '0x000002C2': 'strength', // Strength — The Debilitator's limb-damage-vs-STR curve
  '0x000002C4': 'endurance', // Endurance — Lifegiver's END-keyed max-HP curve (docs/assumptions.md "Max HP (derived)")
  '0x000002C5': 'charisma', // Charisma — The Peace Maker's explosive-damage-vs-CHA curve
  '0x000002C6': 'intelligence', // Intelligence — Science!/Pyro-Technician's/Cryologist's damage-vs-INT curves
  '0x000002C3': 'perception', // Perception — Awareness perk's VATS-accuracy-vs-PER curve (Phase 4, display-only)
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
};

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
 * resists fall back to a note.
 */
const RESIST_AV_DAMAGE_TYPES: Record<string, DamageType> = {
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
    keywords,
    dispelWithKeywords: flagNames.includes('Dispel with Keywords'),
    detrimental: flagNames.includes('Detrimental'),
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
  /** Add-Perk chase recursion guard (perk → ability SPEL → MGEF → perk ...). Internal. */
  grantDepth?: number;
}

export interface MgefTranslationResult {
  modifiers: ModifierFragment[];
  notes: string[];
  unmappedAvifs: string[];
}

export interface TranslateOptions {
  timedIsActive?: boolean;
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
          }
        : {
            bucket: 'dotDamage',
            op: 'ADD',
            value: dotMagnitude,
            conditions: dotConds,
            durationSec: effect.duration,
          },
    );
    return result;
  }

  if (mgef.archetype !== 'Peak Value Modifier' && mgef.archetype !== 'Value Modifier') {
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
  if (effect.duration > 0 && !opts.timedIsActive) {
    const raw = `timedBuff(${effect.duration}s)`;
    allConds.push({ kind: 'unresolved', raw });
    result.notes.push(`${mgef.edid}: ${raw} — needs toggle override`);
  }

  const push = (bucket: Bucket, scale: number, conditions: Condition[]) => {
    // With a curve, the scale is `curveScale` (applied to the interpolated Y);
    // otherwise it multiplies the flat magnitude.
    result.modifiers.push(
      curve
        ? { bucket, op: 'ADD', curve, curveScale: scale, conditions }
        : { bucket, op: 'ADD', value: effectiveMagnitude * scale, conditions },
    );
  };

  // Contact-delivered (on-hit), Hostile/Detrimental "Reduce Damage Resist" effects
  // (Cosmic Knife Super-Heated's ench_CosmicKnife_Superheated, Endangerol Syringe
  // Barrel's EnchSyringer_Endangerol — verified via `esm get`: Delivery Contact,
  // Archetype Peak Value Modifier, AV DamageResist, flags Hostile+Detrimental) apply
  // to the STRUCK TARGET, not the wielder — route to armorPenFlat (mitigation.ts's
  // physical resist-point debuff, the same bucket Taking One for the Team's companion
  // perk feeds) instead of the generic self-buff `damageResistGain` FALLBACK_AVIF_ROUTES
  // entry. armorPenFlat's sign convention is "positive = points removed from base
  // resist" (opposite of damageResistGain's direct-AV-delta reading), so this uses the
  // magnitude's absolute value, not `effectiveMagnitude` (already Detrimental-negated
  // for the AV-delta reading). Scoped to DamageResist + flat magnitude only — no
  // verified EnergyResist or curve-based instance exists today.
  if (
    avifEdid === 'DamageResist' &&
    mgef.archetype === 'Peak Value Modifier' &&
    mgef.detrimental &&
    opts.conditionCtx?.subjectIsTarget &&
    !curve
  ) {
    result.modifiers.push({
      bucket: 'armorPenFlat',
      op: 'ADD',
      value: Math.abs(effectiveMagnitude),
      conditions: allConds,
    });
    return result;
  }

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
      push(route.bucket, route.scale, [...allConds, ...routeConds]);
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

function resolvePerkEffectAvFormId(effect: Record<string, unknown>): string | null {
  const avId = effect['Function Parameter 3 (Actor Value)'];
  if (typeof avId === 'string' && avId.startsWith('0x')) return avId;
  if (avId && typeof avId === 'object' && 'formid' in avId) {
    const fid = (avId as { formid: unknown }).formid;
    if (typeof fid === 'string') return fid;
  }
  return null;
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
    unresolved.forEach((u) => result.notes.push(`perk ${perkEdid}: ${u}`));

    if (effectType === 'Entry Point') {
      const ep = (e['Entry Point'] ?? {}) as Record<string, unknown>;
      const name =
        ((ep['Entry Point'] as Record<string, unknown> | undefined)?.['name'] as string) ??
        'Unknown';
      const functionName =
        ((ep['Function'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown';
      const float = typeof e['Float'] === 'number' ? (e['Float'] as number) : 0;

      // EP-172 "Mod Ammo Used Count": narrowly map GetRandomPercent-gated zero-
      // ammo to ammoFreeChance (Tesla Science 5). Timed/keyword infinite-ammo
      // variants (HeadHunter's, Thirst Zapper) lack GetRandomPercent — stay
      // note-only. NOT in ENTRY_POINT_BUCKETS — would catch those variants.
      if (
        name === 'Mod Ammo Used Count' &&
        (functionName === 'Multiply Value' || functionName === 'Set Value') &&
        float === 0 &&
        hasGetRandomPercentCondition(conditionRows)
      ) {
        const value = parseGetRandomPercentChance(conditionRows, globalValues) ?? 0.2;
        const epConditions = [...conditions, ...(ENTRY_POINT_EXTRA_CONDITIONS[name] ?? [])];
        result.modifiers.push({
          bucket: 'ammoFreeChance',
          op: 'ADD',
          value,
          conditions: epConditions,
        });
        continue;
      }

      // EP-199 "Instant Reload Clip On Bash" (Battle-Loader's 4★ armor mod,
      // verified via `esm chase`/`esm get` 2026-07-18): all 5 effects carry
      // Function "Set Value" Float=1.0 — a boolean trigger placeholder. The
      // REAL per-worn-piece chance (15/30/45/60/75%) lives in each effect's
      // own GetRandomPercent gate, same shape as the EP-172 case above.
      // Narrowed to the exact Set Value 1.0 + GetRandomPercent combination so
      // a hypothetical un-gated future use of this entry point still falls
      // through to the generic ENTRY_POINT_BUCKETS mapping (SET 1.0 =
      // unconditional 100% skip) instead of being silently swallowed.
      if (
        name === 'Instant Reload Clip On Bash' &&
        functionName === 'Set Value' &&
        float === 1 &&
        hasGetRandomPercentCondition(conditionRows)
      ) {
        const value = parseGetRandomPercentChance(conditionRows, globalValues);
        if (value !== null) {
          result.modifiers.push({ bucket: 'reloadSkipChance', op: 'ADD', value, conditions });
        } else {
          result.notes.push(
            `perk ${perkEdid}: ${name} — GetRandomPercent present but chance unparsed, skipped`,
          );
        }
        continue;
      }

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

      if (functionName === 'Add Value') {
        result.modifiers.push({ bucket, op: 'ADD', value: float, conditions: epConditions });
      } else if (functionName === 'Set Value') {
        result.modifiers.push({ bucket, op: 'SET', value: float, conditions: epConditions });
      } else if (functionName === 'Multiply Value') {
        result.modifiers.push({
          bucket,
          op: 'MUL_ADD',
          value: float - 1,
          conditions: epConditions,
        });
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

    if (effectType === 'Ability' && typeof e['Ability'] === 'string') {
      let spell: EsmRecord;
      try {
        spell = await client.get(e['Ability']);
      } catch {
        result.notes.push(`perk ${perkEdid}: ability ${e['Ability']} not found`);
        continue;
      }
      for (const se of parseMagicEffects(spell)) {
        const sub = await translateMagicEffect(deps, se);
        sub.notes.forEach((n) => result.notes.push(`perk ${perkEdid}: ${n}`));
        sub.unmappedAvifs.forEach((a) => result.unmappedAvifs.push(a));
        for (const fragment of sub.modifiers) {
          result.modifiers.push({
            ...fragment,
            conditions: [...conditions, ...fragment.conditions],
          });
        }
      }
      continue;
    }

    result.notes.push(`perk ${perkEdid}: effect type ${effectType} — not modeled`);
  }
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
  if (mgef.archetype === 'Script' && mgef.perkToApply && (deps.grantDepth ?? 0) < 2) {
    const granted = await translateGrantedPerk(
      { ...deps, grantDepth: (deps.grantDepth ?? 0) + 1 },
      mgef.edid,
      mgef.perkToApply,
    );
    if (granted.modifiers.length > 0 || granted.notes.length > 0) {
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
      return granted;
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
    };
  }
  const targetType = recordTargetType(record);
  // deps.crossFamilyRank flows via translateMagicEffect's conditionCtx default.
  const conditionCtx = targetType === 'Contact' ? { subjectIsTarget: true } : undefined;
  const modifiers: ModifierFragment[] = [];
  const notes: string[] = [];
  for (const effect of parseMagicEffects(record)) {
    const result = await translateMagicEffect(deps, effect, conditionCtx);
    result.notes.forEach((n) => notes.push(n));
    modifiers.push(...result.modifiers);
  }
  return { modifiers, notes, targetType };
}
