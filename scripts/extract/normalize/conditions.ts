import type { Condition, DamageType } from '../../../src/types/modifiers';

/**
 * ESM condition rows → IR conditions.
 *
 * ESM condition lists chain with AND/OR where OR binds consecutive rows into
 * a group and groups AND together. We translate what we understand
 * (weapon-keyword gates, sneaking, power armor) and emit `unresolved` for the
 * rest so the _meta report keeps unknowns visible instead of silently wrong.
 */

export interface RawCondition {
  Function: string;
  'Parameter 1'?: string | null;
  /** A number, or a GLOB formid (0x...) whose value must be pre-resolved into ctx.globalValues. */
  'Comparison Value': number | string;
  Operator?: string;
  'AND/OR'?: string;
  'Run On'?: string;
}

export interface ConditionTranslationContext {
  /** formid (0x...) → editor_id for every Parameter 1 seen (pre-resolved, since translation is sync). */
  edidByFormId: Map<string, string>;
  /** GLOB formid → numeric value for global-valued Comparison Values (pre-resolved, since translation is sync). */
  globalValues?: Map<string, number>;
  /**
   * Rank-chain formids of the perk family being processed, in rank order.
   * HasPerk conditions on these are rank gating, consumed by the simulation.
   */
  familyFormIds?: string[];
  /** Ranks owned in the current simulation (1-based count). */
  ownedRanks?: number;
  /**
   * Rank-chain formids of a paired GENDER-TWIN family (Action Boy ↔ Action
   * Girl — extract-perks.ts's GENDER_TWIN_PAIRS), in rank order, mirroring
   * `familyFormIds`. The two cards share one ability SPEL whose per-tier
   * gates cross-reference BOTH families' own rank formids; the player owns
   * ONE gender's card at a time, so a HasPerk row on this list resolves as if
   * the paired family's rank mirrors `ownedRanks` (docs/assumptions.md).
   */
  pairedFamilyFormIds?: string[];
  /**
   * CNDF formid → its flattened condition rows, pre-fetched async (translation
   * is sync) by `resolveConditionForms` (normalize/mgef.ts). An
   * `IsTrueForConditionForm(x)=1` row expands to the form's own rows ONLY when
   * they translate completely (Ground Pounder's SmallGun_Actor_Condition →
   * weaponKeywordAny[Rifle,Shotgun,Pistol] + NOT HeavyGun); partially
   * translatable forms (Perk_Day_Condition's time-of-day rows) fall back to
   * the unresolved row unchanged.
   */
  conditionForms?: Map<string, RawCondition[]>;
  /**
   * Set while walking a Contact/Fire-and-Forget-delivery ENCH or SPEL (an
   * on-hit weapon-mod proc: bleed/burn/poison DoTs, Cremator's fire hit, the
   * Lobber-family hazard ticks) — its effects' Subject is the STRUCK TARGET,
   * not the wielder. `GetIsPlayer(Run On: Subject)` rows on these records
   * split an NPC-target branch (=0, the PvE case this calculator always
   * models) from a PVP-only player-target branch (=1) — the OPPOSITE of the
   * usual "granted to the player" GetIsPlayer reading used everywhere else
   * (perk/legendary self-gates). Set by `translateEnchantment`
   * (normalize/mgef.ts) from the record's own Delivery field; every other
   * caller leaves this unset and gets the default reading. See
   * docs/assumptions.md "Weapon-intrinsic DoT & OMOD replacement".
   */
  subjectIsTarget?: boolean;
  /**
   * Every non-junk perk family's rank-chain formids, mapped formid →
   * {family, rank} (1-based) — built ONCE over ALL families
   * (buildCrossFamilyRankMap, extract-perks.ts) before any single family
   * translates. The generalization of the self/paired-family rank gates
   * above to a DIFFERENT family's HasPerk reference: a hit translates to a
   * runtime `perkFamilyRank` condition (Lock and Load → Bullet Storm's
   * reload speed; MakeshiftWarrior → Mechanic's Best Friend's dbm) instead
   * of `unresolved`. Self/paired-family rows are checked FIRST, so this map
   * never shadows the simulation-consumed gates. CUT_-prefixed junk families
   * must stay out of the map (they resolve as permanently-inactive
   * unresolved rows, as before).
   */
  crossFamilyRank?: Map<string, { family: string; rank: number }>;
  /**
   * WornHasKeyword/HasKeyword rows whose edid is in this set are consumed
   * (the OMOD being extracted ADDs that keyword, so the self-gate is
   * tautological). Used by extract-omods.ts's SURV_WellTunedSpell keyword-
   * hook chase for Tone Death's CustomItemName_ToneDeath row — see
   * docs/assumptions.md "Tone Death Well Tuned melee buff".
   */
  tautologicalKeywords?: ReadonlySet<string>;
}

export interface TranslationResult {
  /** null = the whole effect is inactive under the current rank simulation. */
  conditions: Condition[] | null;
  unresolved: string[];
}

/**
 * Builds ConditionTranslationContext.crossFamilyRank from rank-ordered family
 * chains. Two callers, one join rule: extract-perks.ts (live EsmRecord
 * families) and run-all.ts (serialized GeneratedPerk {family, formIds} — the
 * omods pass reads the perks result or the checked-in perks.json).
 */
export function buildCrossFamilyRankMap(
  families: Array<{ family: string; formIds: string[] }>,
): Map<string, { family: string; rank: number }> {
  const map = new Map<string, { family: string; rank: number }>();
  for (const { family, formIds } of families) {
    formIds.forEach((formId, i) => map.set(formId, { family, rank: i + 1 }));
  }
  return map;
}

/**
 * Class Freak's rank-record formids (ClassFreak01/02/03 — the Luck perk that
 * reduces mutation penalties ×0.75/×0.5/×0.25 via its "Mod Spell Magnitude"
 * keyword scaling). HasPerk rows on these appear inside mutations' granted
 * penalty PERKs (Grounded's Mutation_ReduceEnergyDamage_Perk tiers) and
 * translate to `classFreakRank` range conditions instead of `unresolved`.
 */
const CLASS_FREAK_RANK_BY_FORM_ID: Record<string, number> = {
  '0x00391F0E': 1, // ClassFreak01
  '0x00391F11': 2, // ClassFreak02
  '0x00391F12': 3, // ClassFreak03
};

/**
 * Unique-mod self-name keyword gates (`CustomItemName_*`/`RD01_CustomItemName_*`
 * — WornHasKeyword rows a legendary/unique effect uses to check "is the
 * wielder actually holding THIS specific unique weapon", verified via `esm
 * get` 2026-07-16). Not a weapon-TYPE keyword (`isWeaponTypeKeyword`), so
 * these fell through to `{kind:'unresolved'}` (permanently false) before this
 * allowlist — a real bug for the two entries below:
 * - `CustomItemName_FoundationsVengeance` (0x0064781E): gates the +5
 *   max-stack tier of the Bullet Storm/Heavy Gunner SPEL's abAmmoSpenderFortifyStacks
 *   effect (AND'd with GetHealthPercentage ≤0.25).
 * - `RD01_CustomItemName_Valkyrie` (0x00793434): gates Bullet Storm's
 *   Valkyrie spin-up curve (AbPerkFortifyActorWeaponChargeUpSpeedMult).
 * `dn_TheActionHero` (0x00918E50, The Action Hero's deflect-chance gate) is
 * DELIBERATELY NOT added — the effect it gates carries magnitude 0 with no
 * curve table (data-broken), so it stays a "needs override" note either way.
 * A broader CustomItemName_* rule would un-gate every other unique's
 * self-check (Cold Shoulder etc.) — that's separate, un-scoped work; this
 * allowlist only covers the two Bullet Storm gates verified above.
 * Tone Death's `CustomItemName_ToneDeath` (0x0064D000) is NOT listed —
 * that WornHasKeyword lives on SPEL SURV_WellTunedSpell, attributed to
 * the unique OMOD by extract-omods.ts's keyword-hook chase, which consumes
 * the row as tautological and emits `{kind:'wellTuned'}` instead.
 */
const UNIQUE_SELF_GATE_KEYWORDS = new Set([
  'CustomItemName_FoundationsVengeance',
  'RD01_CustomItemName_Valkyrie',
]);

/**
 * Enemy-side HasKeyword(x)=0 exclusion markers consumed under the same
 * "generic hostile target is assumed vulnerable" reading as Viper's
 * HasPerk(ImmuneToPoison)=0 (docs/assumptions.md): weapon bleed/poison/
 * disintegrate DoT MGEFs gate on the struck target NOT being immune
 * (modWeapBleedEffect's BleedImmune row) or NOT being a teammate (IsAlly).
 * These surfaced 2026-08-19 when MGEF-record-level Conditions started
 * translating; leaving them unresolved would have deactivated every
 * intrinsic bleed DoT.
 */
const TARGET_EXCLUSION_KEYWORDS = new Set([
  'BleedImmune',
  'NoDisintegrate',
  'ImmuneParalysis',
  'IsAlly',
]);

/**
 * HasKeyword(DamageType*) on a weapon/damage row gates by component element
 * (Tesla Science magazine crit tiers, energy-weapon damage rows, …). Target-
 * side "is burning/poisoned" uses GetNumActiveEffectsWithKeyword →
 * enemyHasActiveEffect — do NOT route those through here.
 */
export const DAMAGE_TYPE_KEYWORD_SCOPE: Record<string, DamageType> = {
  DamageTypeEnergy: 'energy',
  DamageTypeFire: 'fire',
  DamageTypeCryo: 'cryo',
  DamageTypePoison: 'poison',
  DamageTypeRadiation: 'radiation',
  DamageTypeRadiationExposure: 'radiation',
  DamageTypePhysical: 'ballistic',
  DamageTypeBleed: 'poison',
};

/** Scope-mod keywords added to scoped weapons (verify omods.json addedKeywords). */
export const SCOPE_WEAPON_KEYWORDS = ['HasScope', 'HasScopeRecon'] as const;

/** Per-weapon identity keywords checked via WornHasKeyword on wielder-side rows. */
const WEAPON_IDENTITY_KEYWORDS = new Set([
  'ma_GatlingLaser',
  'ma_Ultracite_GatlingLaser',
  'MoMVoiceofSetKeyword',
]);

function isScopeWeaponKeyword(edid: string): boolean {
  return (SCOPE_WEAPON_KEYWORDS as readonly string[]).includes(edid);
}

function isWeaponTypeKeyword(edid: string): boolean {
  // HasLegendary_* keywords are ADDed by the legendary OMOD itself, so a
  // HasKeyword self-gate on one auto-passes once the mod is equipped
  // (effective-weapon merges addedKeywords). Newer content prefixes its
  // records (SDOW_HasLegendary_Weapon_Severing) — match anywhere after a
  // prefix, not just at the start.
  // ma_GatlingLaser/ma_Ultracite_GatlingLaser are per-weapon-model identity
  // keywords (Power User/Repair Bobblehead's Ammo Health Mult OR-group gate
  // — issue #46, user-directed 2026-08-20). Narrowly listed rather than a
  // blanket `ma_` prefix — other `ma_` keywords are armor-material gates
  // (WornApparelHasKeywordCount), a different Function entirely, and
  // ma_Knife/ma_Switchblade's unarmed OR-group is unaudited, left unresolved.
  return (
    edid.startsWith('WeaponType') ||
    edid.startsWith('UI_WeaponType') ||
    edid === 'HasSilencer' ||
    edid.startsWith('HasLegendary_') ||
    edid.includes('_HasLegendary_') ||
    edid === 'ma_GatlingLaser' ||
    edid === 'ma_Ultracite_GatlingLaser'
  );
}

/**
 * The enemy-type classification boundary, shared with extract-bodyparts: a
 * HasKeyword on one of these becomes an `enemyType` condition here, and the
 * bodyparts extractor stores exactly this keyword subset per curated race so
 * the engine's target matching can never under-cover what conditions reference.
 */
export function isEnemyKeyword(edid: string): boolean {
  return edid.startsWith('ActorType');
}

function translateSingle(
  cond: RawCondition,
  ctx: ConditionTranslationContext,
): Condition | 'inactive' | null {
  const fn = cond.Function;
  const param = cond['Parameter 1'] ?? '';
  // Comparison Values can reference a GLOB (Executioner's ≤ LGND_ExecuteHealthThreshold).
  const rawCmp = cond['Comparison Value'];
  const cmp = typeof rawCmp === 'string' ? ctx.globalValues?.get(rawCmp) : rawCmp;
  const wants = cmp === 1;
  const edid = ctx.edidByFormId.get(param) ?? param;
  // Which actor a row's Run On names. Plain contexts: 'Target' is the enemy.
  // Contact-delivery walks (ctx.subjectIsTarget — on-hit procs) invert the
  // frame: Subject IS the struck enemy, and a 'Target' row refers back to the
  // WIELDER (modWeapBleedEffect's WornHasKeyword(HasLegendary_Weapon_
  // HealAllies)=0 — "the attacker has no Heal Allies mod equipped").
  const onEnemySide = ctx.subjectIsTarget
    ? cond['Run On'] !== 'Target'
    : cond['Run On'] === 'Target';

  switch (fn) {
    case 'HasPerk': {
      const rankIndex = ctx.familyFormIds?.indexOf(param) ?? -1;
      if (rankIndex >= 0 && ctx.ownedRanks !== undefined) {
        const owns = rankIndex < ctx.ownedRanks;
        return owns === wants ? null : 'inactive'; // rank gate: consumed or kills the effect
      }
      // Gender-twin paired family (Action Boy/Girl, Stage C4): the player owns
      // ONE gender's card at a time, so the paired family's rank mirrors the
      // rank being simulated (docs/assumptions.md).
      const pairedRankIndex = ctx.pairedFamilyFormIds?.indexOf(param) ?? -1;
      if (pairedRankIndex >= 0 && ctx.ownedRanks !== undefined) {
        const owns = pairedRankIndex < ctx.ownedRanks;
        return owns === wants ? null : 'inactive';
      }
      // Viper's gates on the target lacking ImmuneToPoison — a generic target
      // is assumed vulnerable, so the row is consumed (docs/assumptions.md).
      // `onEnemySide` (not a literal Run On check) so poison DoT MGEFs'
      // record-level twins — spelled Run On: Subject inside contact-delivery
      // walks — get the same reading.
      if (onEnemySide && edid === 'ImmuneToPoison' && !wants) return null;
      // The engine's "wearer is in power armor" marker perk — same gate the
      // ArmorTypePower keyword expresses, so reuse that condition kind
      // (wielder-side rows only; an enemy-in-PA gate has no kind yet).
      if (edid === 'PowerArmorPerk' && !onEnemySide) {
        return { kind: 'inPowerArmor', value: wants };
      }
      // Class Freak tier gates on mutation penalty perks (Grounded's Mod
      // Weapon Attack Damage tiers): =1 → rank ≥ N, =0 → rank < N. The rows
      // AND together into exact-tier ranges — no OR-group handling needed.
      const cfRank = CLASS_FREAK_RANK_BY_FORM_ID[param];
      if (cfRank !== undefined) {
        return wants
          ? { kind: 'classFreakRank', min: cfRank, max: 3 }
          : { kind: 'classFreakRank', min: 0, max: cfRank - 1 };
      }
      // Cross-family gate: a reference into ANOTHER family's rank chain
      // becomes a runtime perkFamilyRank condition (evaluated against the
      // selected perk loadout — resolve.ts / PlayerInput.equippedPerkRanks).
      const cross = ctx.crossFamilyRank?.get(param);
      if (cross) {
        return {
          kind: 'perkFamilyRank',
          family: cross.family,
          minRank: cross.rank,
          present: wants,
        };
      }
      return { kind: 'unresolved', raw: `HasPerk(${edid})=${cond['Comparison Value']}` };
    }
    case 'IsSpellTarget':
      // RadX/serum suppression of mutation effects is deliberately NOT
      // modeled — selecting the mutation IS the app's active/inactive toggle
      // (docs/assumptions.md "Carnivore's / Herbivore's food scaling",
      // reaffirmed under "Mutation penalties & Class Freak"). The =0 rows
      // (effect active while unsuppressed) are consumed; the =1 rows gate the
      // treated/serum variants we never model, killing those effects.
      if (edid === 'RadX' || edid.startsWith('Serum_')) return wants ? 'inactive' : null;
      return { kind: 'unresolved', raw: `IsSpellTarget(${edid})=${cond['Comparison Value']}` };
    case 'IsMemberOfAPlayerTeam':
      // Herd Mentality's solo penalty / team bonus gate. "In a team" is
      // approximated as ≥1 teammate (consistent with Strange in Numbers'
      // derivation — docs/assumptions.md "Mutation penalties & Class Freak").
      return wants
        ? { kind: 'teammateCount', count: 1, orMore: true }
        : { kind: 'teammateCount', count: 0 };
    case 'HasKeyword':
    case 'WornHasKeyword': {
      // Wielder-side weapon-flavored rows first: in a contact-delivery walk
      // a 'Target' row names the wielder (see onEnemySide), so
      // modWeapBleedEffect's HasLegendary_Weapon_HealAllies=0 row lands here
      // as a present:false weaponKeyword (effective-weapon merges the
      // legendary omod's added keywords), not on the enemy path below.
      if (!onEnemySide && ctx.tautologicalKeywords?.has(edid) && wants) return null;
      const damageScope = DAMAGE_TYPE_KEYWORD_SCOPE[edid];
      if (!onEnemySide && wants && damageScope) {
        return { kind: 'damageTypeScope', types: [damageScope] };
      }
      if (!onEnemySide && wants && isScopeWeaponKeyword(edid)) {
        return { kind: 'weaponKeyword', keyword: edid, present: true };
      }
      // Eye of Ra worn-armor gate — no armor-loadout UI; NOT-worn rows consumed
      // on the base Voice of Set proc branch, =1 stays unresolved for upgrade notes.
      if (edid === 'MoMEyeOfRaItemKeyword' && fn === 'WornHasKeyword') {
        const notWearing =
          (/^not equal to$/i.test(cond.Operator ?? '') && cmp === 1) ||
          (/^equal to$/i.test(cond.Operator ?? '') && cmp === 0);
        if (notWearing) return null;
      }
      if (
        !onEnemySide &&
        (isWeaponTypeKeyword(edid) ||
          UNIQUE_SELF_GATE_KEYWORDS.has(edid) ||
          WEAPON_IDENTITY_KEYWORDS.has(edid))
      ) {
        return { kind: 'weaponKeyword', keyword: edid, present: wants };
      }
      if (onEnemySide || isEnemyKeyword(edid)) {
        if (!wants) {
          // Exclusion rows on the enemy side: known immunity/teammate
          // markers are consumed under the generic-hostile-target
          // assumption (the reading Viper's ImmuneToPoison row gets above);
          // enemyType carries no negation, so anything else stays
          // unresolved rather than silently inverting into a "vs X" gate.
          if (TARGET_EXCLUSION_KEYWORDS.has(edid)) return null;
          return { kind: 'unresolved', raw: `${fn}(${edid})=${cond['Comparison Value']}` };
        }
        return { kind: 'enemyType', keywordOrRace: edid };
      }
      if (isWeaponTypeKeyword(edid)) {
        return { kind: 'weaponKeyword', keyword: edid, present: wants };
      }
      if (edid === 'ArmorTypePower') {
        return { kind: 'inPowerArmor', value: wants };
      }
      if (UNIQUE_SELF_GATE_KEYWORDS.has(edid)) {
        return { kind: 'weaponKeyword', keyword: edid, present: wants };
      }
      return { kind: 'unresolved', raw: `${fn}(${edid})=${cond['Comparison Value']}` };
    }
    case 'GetIsRace':
      return { kind: 'enemyType', keywordOrRace: edid };
    case 'GetIsPlayer':
      // Two ways a GetIsPlayer row can mean "run against a target other than
      // the wielder": a Contact-delivery on-hit effect (ctx.subjectIsTarget —
      // Subject IS the struck target), or a granted-PERK tab-index-2 row
      // (flattenPerkConditionRows forces Run On: 'Target' — Battle-Loader's
      // Legendary_Armor_BattleLoadersPerk 0x0079B522, verified 2026-07-18:
      // tab 2 carries "GetIsPlayer Equal To 0.0" meaning "the bashed target
      // isn't a player", always true in PvE). Either way the =1 (PVP-only)
      // branch is inactive; the =0 (NPC target) branch is what this
      // calculator models, so it's consumed — the OPPOSITE of the Subject
      // reading below.
      if (ctx.subjectIsTarget || cond['Run On'] === 'Target') {
        return wants ? 'inactive' : null;
      }
      // Perk effects granted to the player: always true — consumed.
      return wants ? null : 'inactive';
    case 'GetIsPlayerGhoul':
      // Character-type gate: Gourmand's (=0, human-only), Glowing Criticals (=1).
      return { kind: 'playerIsGhoul', value: wants };
    // Trivial NPC-state gates on weapon-enchantment / on-hit proc rows (2026-08-28
    // pile-1): calculator targets are always alive non-essential hostiles.
    // | Function | Comparison | Meaning | Translation |
    // | GetDead | =0 / Not Equal To 1 | target alive | consumed (null) |
    // | IsEssential / IsProtected | =1 | essential-NPC exemption branch | inactive |
    // | IsEssential / IsProtected | =0 | not essential/protected | consumed (null) |
    case 'GetDead':
      if (
        (/^equal to$/i.test(cond.Operator ?? '') && cmp === 0) ||
        (/^not equal to$/i.test(cond.Operator ?? '') && cmp === 1)
      ) {
        return null;
      }
      return { kind: 'unresolved', raw: `GetDead() ${cond.Operator} ${rawCmp}` };
    case 'IsEssential':
    case 'IsProtected':
      if (wants) return 'inactive';
      return null;
    case 'IsOverEncumbered':
      // Packin' Light's gate (AbPerkPackinLight: +25% AP regen while not over
      // encumbered). The calculator assumes optimal play — never over
      // encumbered — so =0 is always true (consumed) and an =1-gated effect
      // can never apply (docs/assumptions.md "Packin' Light").
      return wants ? 'inactive' : null;
    case 'IsUsingAltCurveTable':
      // Fire/poison DoT uniques gate the curve-table branch with =1 (=0 is the
      // unused flat-magnitude fallback on the same ENCH). Player-facing mods
      // always take the alt-curve path — consume =1, kill =0.
      return wants ? null : 'inactive';
    case 'IsInCombat':
      // Continuous damage auras (Tesla Coils — ADR-0023) gate on in-combat.
      // The calculator models sustained combat — always in combat for aura
      // streams (docs/assumptions.md "Aura damage streams").
      return wants ? null : 'inactive';
    case 'IsHostileToActor':
      // Contact-delivery aura ticks (Tesla Coils, Plague Walker) gate on
      // hostile targets. Calculator enemies are always hostile hostiles
      // (docs/assumptions.md "Aura damage streams").
      return wants ? null : 'inactive';
    case 'IsSprinting':
    case 'IsSwimming':
      // The calculator models grounded, non-sprint combat (aiming/firing) — never
      // sprinting or swimming. So a "not sprinting/swimming" gate (=0) is always
      // true (consumed) and a sprint-/swim-only gate (=1) can never apply
      // (inactive). Same shape as IsOverEncumbered. (docs/assumptions.md)
      return wants ? 'inactive' : null;
    case 'IsMoving':
      return { kind: 'standingStill', value: !wants };
    case 'IsSneaking':
      return wants ? { kind: 'sneaking' } : { kind: 'unresolved', raw: 'IsSneaking=0' };
    case 'IsPowerAttacking':
      return { kind: 'powerAttack', value: wants };
    case 'GetIsInVATS':
      return { kind: 'vatsOnly', value: wants };
    case 'GetInIronSights':
      return { kind: 'aimingDownSights', value: wants };
    case 'HasScopeWeaponEquipped':
      return wants
        ? { kind: 'weaponKeywordAny', keywords: [...SCOPE_WEAPON_KEYWORDS] }
        : { kind: 'unresolved', raw: 'HasScopeWeaponEquipped()=0' };
    case 'IsMeleeAttacking':
      // Martial Artist's melee gate uses GetWeaponAnimType ≤6 → weaponAnimTypeMax.
      // =1 → melee/unarmed anim types; =0 → sustained non-melee-attack combat.
      if (wants) return { kind: 'weaponAnimTypeMax', max: 6 };
      return null;
    case 'HasCompletedChallenge':
      if (/^equal to$/i.test(cond.Operator ?? '')) {
        return wants
          ? { kind: 'lifetimeChallengeCompleted', challengeId: edid }
          : { kind: 'unresolved', raw: `HasCompletedChallenge(${edid})=0` };
      }
      return {
        kind: 'unresolved',
        raw: `HasCompletedChallenge(${edid}) ${cond.Operator} ${rawCmp}`,
      };
    case 'GetValuePercent':
    case 'GetHealthPercentage': {
      if (fn === 'GetValuePercent' && param !== '0x000002D4') {
        // Only the Health AVIF (0x000002D4) maps to a health-percent gate. The
        // two other observed params — Rads (mod_Legendary_PowerArmor4_
        // RadioactivePowered's =0 rads gate) and ActionPoints (its =1 full-AP
        // gate) — have no condition kind yet, so they stay unresolved. Unlike
        // the generic `default:` fallback below, include the operator here —
        // GetHealthPercentage's own unresolved fallback (a few lines down)
        // already does, and dropping it (as the shared default does) hid that
        // this was `Less Than`, not `Equal To`.
        return {
          kind: 'unresolved',
          raw: `GetValuePercent(${edid}) ${cond.Operator} ${rawCmp}`,
        };
      }
      if (typeof cmp !== 'number') {
        return {
          kind: 'unresolved',
          raw: `GetHealthPercentage ${cond.Operator} ${rawCmp} (unresolved global)`,
        };
      }
      const pct = cmp * 100;
      const onTarget = cond['Run On'] === 'Target';
      // Tab-index-2 perk conditions run on the target: that's the ENEMY's health
      // (Executioner's ≤40%), not the player's (Bloodied-style gates). The ESM's
      // strict "<"/">" vs inclusive "≤"/"≥" is preserved via `inclusive` (absent
      // ⇒ inclusive, the shape of every current ESM source — Foundation's
      // Vengeance's player gate is ≤; docs/assumptions.md "Bullet Storm") so a
      // future strict-comparison perk isn't silently mis-modeled as inclusive.
      const below = /^less than( or equal to)?$/i.exec(cond.Operator ?? '');
      if (below) {
        const extra = below[1] ? {} : { inclusive: false };
        return onTarget
          ? { kind: 'enemyHealthBelowPct', pct, ...extra }
          : { kind: 'healthBelowPct', pct, ...extra };
      }
      const above = onTarget ? /^greater than( or equal to)?$/i.exec(cond.Operator ?? '') : null;
      if (above) {
        return { kind: 'enemyHealthAbovePct', pct, ...(above[1] ? {} : { inclusive: false }) }; // Instigating: enemy ≥60%
      }
      return { kind: 'unresolved', raw: `GetHealthPercentage ${cond.Operator} ${cmp}` };
    }
    case 'IsPowerArmorFrame':
    case 'IsInPowerArmor':
      return { kind: 'inPowerArmor', value: wants };
    case 'GetValue': {
      if (param === '0x00000399') {
        // Thrill-Seeker's (Stage C3): 10 discrete GetValue(killStreak) Equal
        // To N tiers, each gating its own 0.03×N-scaled effect — translate to
        // an exact-count condition (evaluated against PlayerInput.killStreak).
        if (/^equal to$/i.test(cond.Operator ?? '') && typeof cmp === 'number') {
          return { kind: 'killStreakCount', count: cmp };
        }
        // "Kill streak ≥ 1" gates on curve-driven effects are redundant — the
        // curves are 0 at 0 stacks (Adrenaline perk, Adrenal effects). Only
        // consume the ≤1 redundant case; anything else stays unresolved so an
        // unrecognized comparison doesn't silently vanish.
        if (typeof cmp === 'number' && cmp <= 1) return null;
        return { kind: 'unresolved', raw: `GetValue(${edid}) ${cond.Operator} ${rawCmp}` };
      }
      if (param === '0x00000398') {
        // Shotgun Champ: "projectiles fired ≥ 1" is always true (every
        // weapon fires ≥1 projectile) and redundant with the
        // projectileCount curve itself — same reasoning as the killStreak
        // ≥1 case above.
        if (typeof cmp === 'number' && cmp <= 1) return null;
        return { kind: 'unresolved', raw: `GetValue(${edid}) ${cond.Operator} ${rawCmp}` };
      }
      if (param === '0x000002E1') {
        // Rads AV = the ghoul Glow meter. Every Rads gate on a real player
        // perk in the 20260710 dump (GHL_GlowingCriticals*, GHL_MadScientist,
        // GHL_BrickWall, GHL_RadiationPower, GHL_RadioactiveStrength,
        // GHL_BombScientist) uses "Greater Than Or Equal To", against either a
        // literal (180.0) or a GLOB (GHL_BasicGlowUse=5, GHL_PowerGlowUseBasic=50,
        // resolved via ctx.globalValues into `cmp` same as any other row). A
        // strict "Greater Than" doesn't occur in data; approximate it the same
        // as ≥ (min = cmp exactly) rather than leaving it unresolved, since the
        // Glow meter's practical granularity makes the off-by-epsilon
        // difference immaterial. Non-≥ comparisons (e.g. the companion-perk
        // "Less Than" tiers on OverlyGenerous01) stay unresolved.
        if (/^greater than( or equal to)?$/i.test(cond.Operator ?? '') && typeof cmp === 'number') {
          return { kind: 'glowAtLeast', min: cmp };
        }
        return { kind: 'unresolved', raw: `GetValue(${edid}) ${cond.Operator} ${rawCmp}` };
      }
      if (param === '0x0000036C') {
        // PerceptionCondition AV ("Head") — PlayerPerk's Mod VATS Hit Chance
        // −15% when the head is crippled (≤0). Calculator assumes intact limbs.
        if (/^less than or equal to$/i.test(cond.Operator ?? '') && cmp === 0) return null;
        return { kind: 'unresolved', raw: `GetValue(${edid}) ${cond.Operator} ${rawCmp}` };
      }
      if (param === '0x000002EA') {
        // RadResistExposure — Daisy Cutter's rebuilt effect (20260724 patch):
        // 8 discrete GetValue(RadResistExposure) ≥ N rows (N = 1000..8000),
        // each gating its own +20% dbm ADD step, for a +160% cap at 8000
        // (docs/assumptions.md "Unique weapons"). Same ≥-only approximation as
        // the Glow branch above — no non-≥ comparison occurs in data for this
        // AV; stay unresolved rather than guess if one shows up.
        if (/^greater than( or equal to)?$/i.test(cond.Operator ?? '') && typeof cmp === 'number') {
          return { kind: 'radResistAtLeast', min: cmp };
        }
        return { kind: 'unresolved', raw: `GetValue(${edid}) ${cond.Operator} ${rawCmp}` };
      }
      return { kind: 'unresolved', raw: `GetValue(${edid})=${cond['Comparison Value']}` };
    }
    case 'GetLoadedAmmoCount':
      // Last Shot: the fired round empties the magazine. Circuit Breaker
      // spells the same gate "< 1" (integer count).
      if (
        (/^equal to$/i.test(cond.Operator ?? '') && cmp === 0) ||
        (/^less than$/i.test(cond.Operator ?? '') && cmp === 1)
      ) {
        return { kind: 'lastRound' };
      }
      return { kind: 'unresolved', raw: `GetLoadedAmmoCount ${cond.Operator} ${rawCmp}` };
    case 'IsNextClipLastShot':
      // Companion row to GetLoadedAmmoCount()=0 — the same last-round gate
      // (translateConditions dedupes the pair to one lastRound condition).
      if ((/^greater than$/i.test(cond.Operator ?? '') && cmp === 0) || wants)
        return { kind: 'lastRound' };
      return { kind: 'unresolved', raw: `IsNextClipLastShot ${cond.Operator} ${rawCmp}` };
    case 'GetNumActiveEffectsWithKeyword': {
      // "Target is burning/poisoned" gates (Pyromaniac's fire, Viper's poison).
      const atLeastOne =
        (/^greater than or equal to$/i.test(cond.Operator ?? '') && cmp === 1) ||
        (/^greater than$/i.test(cond.Operator ?? '') && cmp === 0);
      if (cond['Run On'] === 'Target' && atLeastOne)
        return { kind: 'enemyHasActiveEffect', keyword: edid };
      return {
        kind: 'unresolved',
        raw: `GetNumActiveEffectsWithKeyword(${edid}) ${cond.Operator} ${rawCmp}`,
      };
    }
    case 'GetGroupTargetCount': {
      // Encircler's tiers: == 1..4, ≥ 5 for the top.
      if (typeof cmp === 'number') {
        if (/^equal to$/i.test(cond.Operator ?? '')) return { kind: 'enemyGroupCount', count: cmp };
        if (/^greater than or equal to$/i.test(cond.Operator ?? '')) {
          return { kind: 'enemyGroupCount', count: cmp, orMore: true };
        }
      }
      return { kind: 'unresolved', raw: `GetGroupTargetCount ${cond.Operator} ${rawCmp}` };
    }
    case 'WornApparelHasKeywordCount': {
      // Battle-Loader's per-piece tiers: == 1..4, ≥ 5 for the top (same
      // equal-to/or-more shape as GetGroupTargetCount/GetPlayerTeammateCount
      // above). `edid` here is the worn-keyword itself (e.g.
      // HasLegendary_Armor_BattleLoaders), not an enemy/weapon keyword.
      if (typeof cmp === 'number') {
        if (/^equal to$/i.test(cond.Operator ?? ''))
          return { kind: 'wornPieceCount', keyword: edid, count: cmp };
        if (/^greater than or equal to$/i.test(cond.Operator ?? '')) {
          return { kind: 'wornPieceCount', keyword: edid, count: cmp, orMore: true };
        }
      }
      return {
        kind: 'unresolved',
        raw: `WornApparelHasKeywordCount(${edid}) ${cond.Operator} ${rawCmp}`,
      };
    }
    case 'GetPlayerTeammateCount':
      // Fencer's tiers: exact teammate counts 0..3.
      if (typeof cmp === 'number') {
        if (/^equal to$/i.test(cond.Operator ?? '')) return { kind: 'teammateCount', count: cmp };
        // United Ordeal &c.: "in a team of ≥N".
        if (/^greater than or equal to$/i.test(cond.Operator ?? '')) {
          return { kind: 'teammateCount', count: cmp, orMore: true };
        }
      }
      return { kind: 'unresolved', raw: `GetPlayerTeammateCount ${cond.Operator} ${rawCmp}` };
    case 'GetDistance':
      // Fencer's teammate-range rows (< 2500 units on Potential Players):
      // consumed — teammates are assumed in range (docs/assumptions.md).
      if (cond['Run On'] === 'Potential Players' && /^less than/i.test(cond.Operator ?? ''))
        return null;
      return {
        kind: 'unresolved',
        raw: `GetDistance ${cond.Operator} ${rawCmp} on ${cond['Run On']}`,
      };
    case 'GetDistanceToClosestHostileActor':
      // Eye of the Hunter (Ghoul-exclusive, GHL_EyeOfTheHunter01-03): the
      // ONLY numeric distance-threshold condition rows found anywhere in the
      // ESM (>= 10/20/30 by rank — contrast the close/far damage gates,
      // which are native-code-only with NO condition rows at all,
      // docs/assumptions.md "Target distance (Close / Far)"). Approximated
      // onto the app's existing far-range bucket rather than adding a third
      // distance tier just for this one perk (Phase 4 — VATS hit-chance
      // aggregate, display-only; docs/assumptions.md "VATS hit-chance
      // aggregate (display-only)").
      if (
        /^greater than or equal to$/i.test(cond.Operator ?? '') &&
        typeof cmp === 'number' &&
        cmp > 0
      ) {
        return { kind: 'targetDistance', range: 'far' };
      }
      return {
        kind: 'unresolved',
        raw: `GetDistanceToClosestHostileActor ${cond.Operator} ${rawCmp}`,
      };
    case 'IsTrueForConditionForm': {
      // Mutation value-tier CNDFs (base vs Strange-in-Numbers-boosted).
      if (edid === 'Mutation_Check_UseNormalVersion')
        return { kind: 'strangeInNumbers', value: !wants };
      if (edid === 'Mutation_Check_UseSuperVersion')
        return { kind: 'strangeInNumbers', value: wants };
      // Other forms: translateConditions tries a full inline expansion via
      // ctx.conditionForms before settling for this unresolved fallback.
      return {
        kind: 'unresolved',
        raw: `IsTrueForConditionForm(${edid})=${cond['Comparison Value']}`,
      };
    }
    case 'HasActiveMagicEffect': {
      // "Apply only while <effect> is NOT already active" — an anti-restack /
      // exclusivity guard (Nukashine's fresh-vs-vintage lockout, NukaCola
      // vaccines' self-guard spelled "Not Equal To 1"). A steady-state
      // calculator has no re-application moment: selecting the source IS the
      // effect being active, so the guard is consumed. Cross-rank exclusivity
      // spellings (Happy-Go-Lucky rank 1 requiring rank 2's effect inactive)
      // always ride with HasPerk rows carrying the same exclusion, so nothing
      // is lost. A positive dependency ("only while X IS active") has no
      // condition kind and stays unresolved.
      const notActive =
        (/^equal to$/i.test(cond.Operator ?? '') && cmp === 0) ||
        (/^not equal to$/i.test(cond.Operator ?? '') && cmp === 1) ||
        // Auto Stim's spelling (Legendary_AutoStimpakEffect "Less Than 1").
        (/^less than$/i.test(cond.Operator ?? '') && cmp === 1);
      if (notActive) return null;
      return {
        kind: 'unresolved',
        raw: `HasActiveMagicEffect(${edid}) ${cond.Operator} ${rawCmp}`,
      };
    }
    case 'GetIsReference':
      // On PlayerRef this is GetIsPlayer by another name — same two readings.
      // The =0-on-Subject case is Gulper Venom's DamageHealthPoison MGEF
      // gate: the poison DoT only fires when the subject ISN'T the player, so
      // eaten as a consumable it never damages (or buffs) anyone — 'inactive'
      // correctly drops what used to extract as a phantom player DoT buff.
      if (edid === 'PlayerRef' || param === '0x00000014') {
        if (ctx.subjectIsTarget || cond['Run On'] === 'Target') return wants ? 'inactive' : null;
        return wants ? null : 'inactive';
      }
      return { kind: 'unresolved', raw: `GetIsReference(${edid})=${cond['Comparison Value']}` };
    case 'GetWeaponAnimType':
      // WEAP Data."Weapon Type" anim enum. Only ≤ occurs in data (Martial
      // Artist/Swinger ≤6 = melee/unarmed; the FO76 roster has no anim types
      // between 6 and Gun=9 — 2026-07-14 all-roster sweep). Other operators
      // stay unresolved until a real use appears.
      if (/^less than or equal to$/i.test(cond.Operator ?? '') && typeof cmp === 'number') {
        return { kind: 'weaponAnimTypeMax', max: cmp };
      }
      return { kind: 'unresolved', raw: `GetWeaponAnimType() ${cond.Operator} ${rawCmp}` };
    default:
      return { kind: 'unresolved', raw: `${fn}(${edid})=${cond['Comparison Value']}` };
  }
}

/**
 * Resolve an OR-group made ENTIRELY of HasPerk rows against the rank-chain
 * simulation (own family and/or its gender-twin paired family — Action
 * Boy/Girl's shared-ability tiers, Stage C4): 'consumed' when at least one
 * row's actual owned/not-owned state matches what it demands (the group
 * passes, so it's dropped from the output like a single-row rank gate);
 * 'inactive' when every row can be resolved but none match (kills the whole
 * effect, same as a failing single-row rank gate); undefined when the group
 * isn't a pure rank-gate OR-group (mixed content, or a formid outside both
 * families) — the caller falls through to the existing weaponKeywordAny /
 * enemyTypeAny handling.
 */
function resolveHasPerkRankGroup(
  group: RawCondition[],
  ctx: ConditionTranslationContext,
): 'consumed' | 'inactive' | undefined {
  if (ctx.ownedRanks === undefined) return undefined;
  let anySatisfied = false;
  for (const row of group) {
    if (row.Function !== 'HasPerk') return undefined;
    const param = row['Parameter 1'] ?? '';
    const wants = row['Comparison Value'] === 1;
    const ownIdx = ctx.familyFormIds?.indexOf(param) ?? -1;
    const pairedIdx = ctx.pairedFamilyFormIds?.indexOf(param) ?? -1;
    let owns: boolean;
    if (ownIdx >= 0) owns = ownIdx < ctx.ownedRanks;
    else if (pairedIdx >= 0) owns = pairedIdx < ctx.ownedRanks;
    else return undefined;
    if (owns === wants) anySatisfied = true;
  }
  return anySatisfied ? 'consumed' : 'inactive';
}

/**
 * Expand a standalone `IsTrueForConditionForm(x)=1` row into the CNDF's own
 * translated conditions (Ground Pounder's SmallGun_Actor_Condition — the
 * pre-fetch lives in normalize/mgef.ts `resolveConditionForms`). Returns null
 * (caller keeps the unresolved row) unless every nested row translates: a
 * partial expansion would silently activate a still-gated effect, and an
 * 'inactive' verdict from nested rank-gate-shaped rows is not trusted either.
 * `=0` (negated) references never expand — negating a multi-row AND/OR list
 * has no IR representation.
 */
function tryExpandConditionForm(
  row: RawCondition,
  ctx: ConditionTranslationContext,
): Condition[] | null {
  if (row.Function !== 'IsTrueForConditionForm') return null;
  if (row['Comparison Value'] !== 1 || !/^equal to$/i.test(row.Operator ?? 'Equal To')) return null;
  const nested = ctx.conditionForms?.get(row['Parameter 1'] ?? '');
  if (!nested || nested.length === 0) return null;
  const result = translateConditions(nested, { ...ctx, conditionForms: undefined });
  if (result.conditions === null || result.unresolved.length > 0) return null;
  return result.conditions;
}

/**
 * Translate an ESM condition list. Returns conditions: null when a rank gate
 * fails under the current simulation (effect inactive).
 */
export function translateConditions(
  rows: RawCondition[],
  ctx: ConditionTranslationContext,
): TranslationResult {
  const out: Condition[] = [];
  const unresolved: string[] = [];

  // Split into OR-groups: a row with AND/OR = 'OR' joins the NEXT row.
  const groups: RawCondition[][] = [];
  let current: RawCondition[] = [];
  for (const row of rows) {
    current.push(row);
    if ((row['AND/OR'] ?? 'AND') !== 'OR') {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);

  for (const group of groups) {
    if (group.length === 1) {
      const translated = translateSingle(group[0], ctx);
      if (translated === 'inactive') return { conditions: null, unresolved };
      if (translated === null) continue; // consumed rank gate
      if (translated.kind === 'unresolved') {
        // IsTrueForConditionForm indirection: inline the referenced CNDF's own
        // rows when they translate COMPLETELY (recursion depth 1 — nested
        // forms stay unexpanded). Partial translations and 'inactive' results
        // fall back to the unresolved row so nothing silently vanishes.
        const expanded = tryExpandConditionForm(group[0], ctx);
        if (expanded) {
          out.push(...expanded);
          continue;
        }
        unresolved.push(translated.raw);
      }
      out.push(translated);
      continue;
    }

    // HasPerk rank-gate OR-group (Action Boy/Girl's cross-family tiers,
    // Stage C4): resolve via the SAME rank simulation the single-row branch
    // uses, extended with the optional paired family.
    const hasPerkResolution = resolveHasPerkRankGroup(group, ctx);
    if (hasPerkResolution === 'inactive') return { conditions: null, unresolved };
    if (hasPerkResolution === 'consumed') continue;

    // Essential-NPC exemption OR-groups (weapon enchantments): IsProtected |
    // IsEssential =1 branches never apply to calculator targets.
    const essentialOnly = group.every(
      (row) =>
        (row.Function === 'IsEssential' || row.Function === 'IsProtected') &&
        row['Comparison Value'] === 1,
    );
    if (essentialOnly) return { conditions: null, unresolved };

    // Contact-delivery PvE target OR-groups (Plague Walker/Tesla): every member
    // individually consumes under subjectIsTarget (GetIsPlayer=0 on Target |
    // IsHostileToActor=1 on Subject).
    if (ctx.subjectIsTarget) {
      let allConsumed = true;
      for (const row of group) {
        const translated = translateSingle(row, ctx);
        if (translated === 'inactive') return { conditions: null, unresolved };
        if (translated !== null) allConsumed = false;
      }
      if (allConsumed) continue;
    }

    // OR-group: supported when every row is a positive weapon-keyword check,
    // or every row is a positive enemy-type check (Ghoul Slayer's:
    // ActorTypeFeralGhoul OR ActorTypeGhoul).
    const keywords: string[] = [];
    const enemyTypes: string[] = [];
    let supported = true;
    let enemySupported = true;
    for (const row of group) {
      const edid = ctx.edidByFormId.get(row['Parameter 1'] ?? '') ?? '';
      const isKeywordFn = row.Function === 'HasKeyword' || row.Function === 'WornHasKeyword';
      const positive = row['Comparison Value'] === 1;
      const weaponKw =
        isWeaponTypeKeyword(edid) ||
        WEAPON_IDENTITY_KEYWORDS.has(edid) ||
        isScopeWeaponKeyword(edid);
      if (!(isKeywordFn && positive && weaponKw && row['Run On'] !== 'Target')) {
        supported = false;
      }
      const isEnemyCheck =
        (isKeywordFn && (row['Run On'] === 'Target' || isEnemyKeyword(edid))) ||
        row.Function === 'GetIsRace';
      if (!(isEnemyCheck && positive)) {
        enemySupported = false;
      }
      keywords.push(edid);
      enemyTypes.push(edid);
    }
    if (supported) {
      out.push({ kind: 'weaponKeywordAny', keywords });
    } else if (enemySupported) {
      out.push({ kind: 'enemyTypeAny', keywordsOrRaces: enemyTypes });
    } else {
      const raw = `OR-group[${group.map((r) => `${r.Function}(${ctx.edidByFormId.get(r['Parameter 1'] ?? '') ?? r['Parameter 1']})=${r['Comparison Value']}`).join(' | ')}]`;
      unresolved.push(raw);
      out.push({ kind: 'unresolved', raw });
    }
  }

  // Distinct ESM rows can translate to the same IR condition (Last Shot's
  // GetLoadedAmmoCount()=0 + IsNextClipLastShot pair → one lastRound gate).
  const seen = new Set<string>();
  const deduped = out.filter((c) => {
    const key = JSON.stringify(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { conditions: deduped, unresolved };
}

/**
 * Flatten a PERK "Perk Conditions" node (tabbed) into raw condition rows.
 * Tab-index 2 conditions run on the target, so their `Run On` is forced to
 * 'Target'. Shared by the plumbing-perk route builder and perk-effect parsing.
 */
export function flattenPerkConditionRows(perkConditions: unknown): RawCondition[] {
  if (!Array.isArray(perkConditions)) return [];
  const rows: RawCondition[] = [];
  for (const tab of perkConditions as Array<Record<string, unknown>>) {
    const pc = tab['Perk Condition'] as Record<string, unknown> | undefined;
    const tabIndex = (pc?.['Run On (Tab Index)'] as number) ?? 0;
    const conditions = pc?.['Conditions'];
    if (!Array.isArray(conditions)) continue;
    for (const item of conditions as Array<Record<string, unknown>>) {
      const data = (item['Condition'] as Record<string, unknown> | undefined)?.[
        'Condition Data'
      ] as RawCondition | undefined;
      if (data) rows.push(tabIndex === 2 ? { ...data, 'Run On': 'Target' } : data);
    }
  }
  return rows;
}

/** Pull the flat condition rows out of the ESM's nested Conditions structures. */
export function flattenConditionRows(node: unknown): RawCondition[] {
  if (!node || typeof node !== 'object') return [];
  const rows: RawCondition[] = [];
  const conditions = (node as Record<string, unknown>)['Conditions'];
  if (Array.isArray(conditions)) {
    for (const item of conditions as Array<Record<string, unknown>>) {
      const data = (item['Condition'] as Record<string, unknown> | undefined)?.[
        'Condition Data'
      ] as RawCondition | undefined;
      if (data) rows.push(data);
    }
  }
  return rows;
}
