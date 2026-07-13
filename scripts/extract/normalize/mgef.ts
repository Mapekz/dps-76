import type { Bucket, Condition, CurveInput, DamageType, Modifier, ModifierFragment, ModifierSource, ValueCurve } from '../../../src/types/modifiers';
import type { EsmClient, EsmRecord } from '../esm-client';
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
  'Mod Player Explosion Damage': 'explosionMult',
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
};

/** Fallback AVIF routes for stats consumed outside the plumbing perks (DFOBs etc.). */
export const FALLBACK_AVIF_ROUTES: Record<string, { bucket: Bucket; scale: number; conditions?: Condition[] }> = {
  STAT_SneakAttackBonus: { bucket: 'sneakBonus', scale: 0.01 },
  STAT_DmgPowerAttack: { bucket: 'powerAttackBonus', scale: 0.01 },
  // Read directly by DamageVsNonWeakpoint_DO in the damage formula.
  STAT_DmgVsTorso: { bucket: 'dbm', scale: 0.01, conditions: [{ kind: 'bodyPart', part: 'torso' }] },
  // Legendary-effect AVs carried as OMOD ActorValues properties (2026-07-10
  // review). Consumers: weakpoint/limb read by the damage formula directly;
  // bash/explosive-payload buckets are stored-inert until their mechanics land.
  STAT_DmgVsWeakSpot: { bucket: 'weakpointBonus', scale: 0.01 }, // Pin-Pointer's
  STAT_DmgLimbs: { bucket: 'limbDamage', scale: 0.01 }, // Crippling
  STAT_DmgBash: { bucket: 'bashDamage', scale: 0.01 }, // Basher's
  LGND_ExplosivePayload: { bucket: 'explosivePayload', scale: 0.01 }, // Explosive
  // Bully's: +X% per crippled enemy limb (6 limbs max — docs/assumptions.md).
  STAT_DmgPerCrippled: { bucket: 'dbm', scale: 0.01, conditions: [{ kind: 'perCrippledLimb', max: 6 }] },
  // Enemy-status 4★ effects, reworked by the 2026-07-10 patch from ENCH
  // properties to these new plumbing AVs (Pyromaniac's / Viper's / Icemen's /
  // Severing, each ADD 50 = +50%). Conditions mirror the pre-patch ENCH
  // translation — resolve.ts maps the keyword to isBurning/isPoisoned/
  // isFrozen/isBleeding. Icemen's is a REAL rework: it was +20% cryo-scoped
  // baseDamage, now +50% vs Freezing targets.
  STAT_DmgVsBurning: { bucket: 'dbm', scale: 0.01, conditions: [{ kind: 'enemyHasActiveEffect', keyword: 'DamageTypeFire' }] },
  STAT_DmgVsPoisoned: { bucket: 'dbm', scale: 0.01, conditions: [{ kind: 'enemyHasActiveEffect', keyword: 'DamageTypePoison' }] },
  STAT_DmgVsFreezing: { bucket: 'dbm', scale: 0.01, conditions: [{ kind: 'enemyHasActiveEffect', keyword: 'DamageTypeCryo' }] },
  STAT_DmgVsBleeding: { bucket: 'dbm', scale: 0.01, conditions: [{ kind: 'enemyHasActiveEffect', keyword: 'DamageTypeBleed' }] },
  // The new 2★ elemental effects (Pyro-Technician's / Cryologist's /
  // Poisoner's, 2026-07-10 patch): ADD 0.2 on these AVs. User-confirmed
  // semantics (2026-07-12): additive into the general dbm parenthesis but
  // scoped to the matching damage type only (a laser + gamma emitter gains
  // Pyro-Technician's on the fire portion and fire DoT, not the energy
  // portion) — same per-component damageTypeScope fold as Demolition Expert.
  // Values are already decimal fractions → scale 1.
  STAT_DmgMultEnergy: { bucket: 'dbm', scale: 1, conditions: [{ kind: 'damageTypeScope', types: ['energy'] }] },
  STAT_DmgMultFire: { bucket: 'dbm', scale: 1, conditions: [{ kind: 'damageTypeScope', types: ['fire'] }] },
  STAT_DmgMultCryo: { bucket: 'dbm', scale: 1, conditions: [{ kind: 'damageTypeScope', types: ['cryo'] }] },
  STAT_DmgMultPoison: { bucket: 'dbm', scale: 1, conditions: [{ kind: 'damageTypeScope', types: ['poison'] }] },
  // Target-distance perks (2026-07-11 review): abPerkFortifyDmgClose /
  // abPerkFortifyDmgFar are Peak Value Modifier MGEFs on these AVIFs with NO
  // distance condition rows in data — the close/far range gate is native
  // engine code (GMST fDistanceForCloseDamage = 850 units, docs/assumptions.md).
  // Bake the gate as a targetDistance condition instead. Consumers: Guerrilla
  // family (close), Down Ranger / Sniper's (far). Guerrilla Master's
  // Onslaught-stack curve routes separately and stays unresolved (Onslaught plan).
  STAT_DmgVsClose: { bucket: 'dbm', scale: 0.01, conditions: [{ kind: 'targetDistance', range: 'close' }] },
  STAT_DmgVsFar: { bucket: 'dbm', scale: 0.01, conditions: [{ kind: 'targetDistance', range: 'far' }] },
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
  // SPECIAL stat bonuses (Buffout +2 STR, Mentats +2 INT, legendary +SPECIAL
  // stars...). Flat points, scale 1. Strength/Luck fold into player state in
  // resolveLoadout; the rest are stored for perk-SPECIAL scaling. NOTE: these
  // routes apply to every translate() caller (perks included) — review the
  // perk diff after regeneration.
  // Max-HP bonuses (Lifegiver's AbPerkFortifyHealth — Peak Value Modifier on
  // AV HealthBonus 0x007B74E4 "Health"/HP, END-keyed curve; also Nocturnal
  // Fortitude etc.). Flat HP points, scale 1. Folded over the base-HP formula
  // in resolveLoadout (docs/assumptions.md "Max HP").
  HealthBonus: { bucket: 'maxHealth', scale: 1 },
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

const PLUMBING_PERKS = ['STAT_DamagePerk', 'STAT_CritDamagePerk', 'STAT_DamageVsPerk'];

export function collectConditionFormIds(rows: RawCondition[], into: Set<string>): void {
  for (const row of rows) {
    const p = row['Parameter 1'];
    if (typeof p === 'string' && p.startsWith('0x')) into.add(p);
  }
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

export async function buildAvifRoutes(client: EsmClient, formIdPool: Set<string>): Promise<Map<string, AvifRoute[]>> {
  const routes = new Map<string, AvifRoute[]>();
  for (const edid of PLUMBING_PERKS) {
    const record = await client.get(edid);
    const effects = record.fields['Effects'];
    if (!Array.isArray(effects)) continue;
    for (const item of effects as Array<Record<string, unknown>>) {
      const e = item['Effect'] as Record<string, unknown>;
      const ep = (e['Entry Point'] ?? {}) as Record<string, unknown>;
      const name = ((ep['Entry Point'] as Record<string, unknown> | undefined)?.['name'] as string) ?? '';
      const bucket = ENTRY_POINT_BUCKETS[name];
      const actorValue = e['Function Parameter 3 (Actor Value)'] as string | undefined;
      if (!bucket || !actorValue) continue;

      const rawConditions = flattenPerkConditionRows(e['Perk Conditions']);
      collectConditionFormIds(rawConditions, formIdPool);
      const list = routes.get(actorValue) ?? [];
      list.push({ bucket, scale: typeof e['Float'] === 'number' ? (e['Float'] as number) : 0.01, rawConditions });
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
const CURVE_INPUT_AVS: Record<string, CurveInput> = {
  '0x000002C4': 'endurance', // Endurance — Lifegiver's END-keyed max-HP curve (docs/assumptions.md "Max HP")
  '0x00000392': 'healthFraction', // current HP / max HP (Bloodied, Nerd Rage)
  '0x00000393': 'capsOnHand', // Aristocrat's
  '0x00000399': 'killStreak', // Adrenal Reaction
  '0x001EB998': 'addictionCount', // Junkie's
  '0x000002D4': 'healthCurrent', // Health (absolute) — Juggernaut's (x 0→1000, y 0→100)
  '0x000002E3': 'enemyDamageResist', // DamageResist — DamageUnarmored (inert until enemy defenses)
  '0x006C2DBA': 'mutationCount', // MutationCount — Mutant's
  '0x006D37DC': 'hungerThirstTier', // HungerThirstTier — Gourmand's
  '0x007A767A': 'feralTier', // GHL_FeralTier — Lucid / ghoul effects
  // Onslaught (2026-07-12): the shared engine counter, no AVIF record
  // (hardcoded slot). Whacker Smacker reads it directly as a curve input
  // (+5%/stack power-attack damage); Guerrilla/Gunslinger Expert+Master's
  // per-stack Ability SPELs curve off the same AV.
  '0x00000395': 'onslaughtStacks',
};

/**
 * Curve inputs with NO Actor Value at all (curveInputAv is null): the input
 * is an engine function read straight off the effect, keyed by MGEF editor id
 * (NOT a blanket "null input" rule — most null-input curves are genuinely
 * unmodeled and should keep surfacing their "needs override" note).
 */
const NULL_CURVE_INPUT_BY_MGEF: Record<string, CurveInput> = {
  // Polished: curve input is GetEquippedWeaponHealthPercent (0.0-2.0 fraction,
  // no AVIF). Proven by the cut DEL_Legendary_Weapon_PolishedPerk → SPEL
  // DEL_Legendary_Weapon_PolishedSpell predecessor, which gates the same base
  // effect (0x007B9459) with a GetEquippedWeaponHealthPercent condition row.
  Legendary_Weapon_PolishedPerkApplyEffect: 'weaponCondition',
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
      curvePoints: Array.isArray(curveTable?.curve) && curveTable.curve.length > 0 ? curveTable.curve : null,
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
}

export async function getMgefInfo(client: EsmClient, formId: string): Promise<MgefInfo> {
  const record = await client.get(formId);
  const data = ((record.fields['Magic Effect Data'] as Record<string, unknown> | undefined)?.['Data'] ?? {}) as Record<string, unknown>;
  const perkToApply = (data['Perk to Apply'] as string) || null;
  const keywordsNode = (record.fields['Keywords'] ?? {}) as Record<string, unknown>;
  const keywords = Array.isArray(keywordsNode['Keywords']) ? (keywordsNode['Keywords'] as string[]) : [];
  const flagsNode = (data['Flags'] ?? {}) as Record<string, unknown>;
  const flagNames = Array.isArray(flagsNode['flags']) ? (flagsNode['flags'] as string[]) : [];
  return {
    edid: record.editor_id,
    name: (record.fields['Name'] as string) ?? record.editor_id,
    archetype: ((data['Archetype'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown',
    actorValue: (data['Actor Value'] as string) ?? null,
    resistValue: (data['Resist Value'] as string) ?? null,
    perkToApply: perkToApply === '0x00000000' ? null : perkToApply,
    keywords,
    dispelWithKeywords: flagNames.includes('Dispel with Keywords'),
  };
}

export interface MgefTranslationDeps {
  client: EsmClient;
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
  opts: TranslateOptions = {}
): MgefTranslationResult {
  const result: MgefTranslationResult = { modifiers: [], notes: [], unmappedAvifs: [] };

  const { conditions: effectConds, unresolved } = translateConditions(effect.conditionRows, {
    edidByFormId,
    ...opts.conditionCtx,
  });
  if (effectConds === null) return result;
  unresolved.forEach(u => result.notes.push(`condition: ${u}`));

  // Damage-archetype effects are DoTs (bleed/burn/shock weapon mods): extract
  // value + duration + element into the inert dotDamage bucket (no DoT model
  // in the engine yet). The element lives on the MGEF's Resist Value AV; the
  // damageTypeScope condition here denotes the DoT's OWN element.
  if (mgef.archetype === 'Damage' && (effect.magnitude > 0 || effect.curvePoints)) {
    const resistEdid = mgef.resistValue ? (edidByFormId.get(mgef.resistValue) ?? mgef.resistValue) : null;
    const damageType = resistEdid ? RESIST_AV_DAMAGE_TYPES[resistEdid] : undefined;
    if (resistEdid && !damageType) {
      result.notes.push(`MGEF ${mgef.edid}: unmapped Resist Value ${resistEdid} — DoT element unknown`);
    }
    const dotConds: Condition[] = damageType ? [...effectConds, { kind: 'damageTypeScope', types: [damageType] }] : effectConds;
    let dotCurve: ValueCurve | undefined;
    if (effect.curvePoints) {
      const input = resolveCurveInput(effect.curveInputAv, mgef.edid);
      if (input) {
        dotCurve = { input, points: effect.curvePoints };
      } else {
        result.notes.push(`${mgef.edid}: DoT curve with unmapped input AV ${effect.curveInputAv} — needs override`);
        return result;
      }
    }
    result.modifiers.push(
      dotCurve
        ? { bucket: 'dotDamage', op: 'ADD', curve: dotCurve, curveScale: 1, conditions: dotConds, durationSec: effect.duration }
        : { bucket: 'dotDamage', op: 'ADD', value: effect.magnitude, conditions: dotConds, durationSec: effect.duration }
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

  // Value curve (Bloodied, Nerd Rage...): Y at X = input AV; overrides magnitude.
  let curve: ValueCurve | undefined;
  if (effect.curvePoints) {
    const input = resolveCurveInput(effect.curveInputAv, mgef.edid);
    if (input) {
      curve = { input, points: effect.curvePoints };
    } else {
      result.notes.push(`${mgef.edid}: curve with unmapped input AV ${effect.curveInputAv} — needs override`);
      return result;
    }
  } else if (effect.magnitude === 0) {
    result.notes.push(`MGEF ${mgef.edid}: zero magnitude, no curve — script/scaled, needs override`);
    return result;
  }

  const avifEdid = edidByFormId.get(mgef.actorValue) ?? mgef.actorValue;

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
        : { bucket, op: 'ADD', value: effect.magnitude * scale, conditions }
    );
  };

  const avifRoutes = routes.get(mgef.actorValue);
  const fallback = FALLBACK_AVIF_ROUTES[avifEdid];
  if (avifRoutes) {
    for (const route of avifRoutes) {
      const { conditions: routeConds, unresolved: routeUnresolved } = translateConditions(route.rawConditions, { edidByFormId });
      if (routeConds === null) continue;
      routeUnresolved.forEach(u => result.notes.push(`route(${avifEdid}): ${u}`));
      push(route.bucket, route.scale, [...allConds, ...routeConds]);
    }
  } else if (fallback) {
    push(fallback.bucket, fallback.scale, [...allConds, ...(fallback.conditions ?? [])]);
  } else if (avifEdid.startsWith('STAT_Dmg') || avifEdid.startsWith('STAT_Crit') || avifEdid.startsWith('STAT_Sneak')) {
    result.unmappedAvifs.push(avifEdid);
  } else if (opts.noteUnroutedAvs) {
    // Without this a value-modifier effect vanishes silently and the record
    // looks inexplicably empty in review (the pre-fix Juggernaut's failure mode).
    result.notes.push(`MGEF ${mgef.edid}: no route for AV ${avifEdid} — needs mapping`);
  }

  return result;
}

/**
 * esm CLI quirk (verified via `esm get --raw` byte inspection on
 * GuerrillaExpert01/GunslingerExpert01 vs GuerrillaMaster01/GunslingerMaster01,
 * 2026-07-12): when a PERK record's Effects list pairs an "Ability" entry
 * with an "Entry Point" entry, the ENTRY POINT's own trailing subrecords
 * (PRKC/CTDA "Perk Conditions" + EPFT/EPFD "Float") are attached by the esm
 * tool's JSON serializer to the PRECEDING Ability entry instead of their true
 * owner. The raw bytes prove ownership: an Ability entry is always a bare
 * `PRKE+DATA+PRKF` triple with no scalar param of its own, so a trailing
 * Float/Perk-Conditions group can ONLY belong to the following Entry Point.
 * (30 PERK records carry this pattern game-wide; Guerrilla/Gunslinger Expert
 * are two of them — Guerrilla/Gunslinger MASTER don't, because their Entry
 * Point effect already comes first in the array and so already owns its own
 * group.) Reassign in place before parsing: Perk Conditions are COPIED (the
 * Ability grant needs its own gate too — it's what the shared PRKC actually
 * gates in-game), Float is MOVED (Ability entries never consume it; only the
 * Entry Point's function reads it).
 */
export function repairMisattributedPerkEntryFields(effects: Array<Record<string, unknown>>): void {
  const typeName = (e: Record<string, unknown>): unknown => {
    const header = e['Effect Header'] as Record<string, unknown> | undefined;
    const type = header?.['Effect Type'] as Record<string, unknown> | undefined;
    return type?.['name'];
  };
  for (let i = 0; i < effects.length - 1; i++) {
    const cur = effects[i];
    const next = effects[i + 1];
    if (typeName(cur) === 'Ability' && typeName(next) === 'Entry Point' && typeof cur['Float'] === 'number' && typeof next['Float'] !== 'number') {
      next['Perk Conditions'] = cur['Perk Conditions'];
      next['Float'] = cur['Float'];
      delete cur['Float'];
    }
  }
}

/**
 * Granted-perk chase (2026-07-10): Script-archetype legendary MGEFs carry a
 * "Perk to Apply" whose PERK record holds the real stats as entry-point
 * effects (Executioner's: `Mod Weapon DMG Bonus Mult` +0.5, target HP ≤ GLOB
 * threshold) or as a granted Ability SPEL (chased through the normal MGEF
 * translation). Entry points we can't model become notes, not silence.
 */
async function translateGrantedPerk(
  deps: MgefTranslationDeps,
  mgefEdid: string,
  perkFormId: string
): Promise<MgefTranslationResult> {
  const { client, edidByFormId } = deps;
  const result: MgefTranslationResult = { modifiers: [], notes: [], unmappedAvifs: [] };

  let perk: EsmRecord;
  try {
    perk = await client.get(perkFormId);
  } catch {
    result.notes.push(`MGEF ${mgefEdid}: granted perk ${perkFormId} not found`);
    return result;
  }
  const perkEdid = perk.editor_id;
  const effects = perk.fields['Effects'];
  if (!Array.isArray(effects)) return result;
  const perkEffects = (effects as Array<Record<string, unknown>>)
    .map(item => item['Effect'] as Record<string, unknown> | undefined)
    .filter((e): e is Record<string, unknown> => !!e);
  repairMisattributedPerkEntryFields(perkEffects);

  for (const e of perkEffects) {
    const header = (e['Effect Header'] ?? {}) as Record<string, unknown>;
    const effectType = ((header['Effect Type'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown';
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
    const { conditions, unresolved } = translateConditions(conditionRows, { edidByFormId, globalValues });
    if (conditions === null) continue;
    unresolved.forEach(u => result.notes.push(`perk ${perkEdid}: ${u}`));

    if (effectType === 'Entry Point') {
      const ep = (e['Entry Point'] ?? {}) as Record<string, unknown>;
      const name = ((ep['Entry Point'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown';
      const functionName = ((ep['Function'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown';
      const float = typeof e['Float'] === 'number' ? (e['Float'] as number) : 0;
      const bucket = ENTRY_POINT_BUCKETS[name];
      if (!bucket) {
        result.notes.push(`perk ${perkEdid}: entry point ${name} — not modeled`);
        continue;
      }
      if (functionName === 'Add Value') {
        result.modifiers.push({ bucket, op: 'ADD', value: float, conditions });
      } else if (functionName === 'Set Value') {
        result.modifiers.push({ bucket, op: 'SET', value: float, conditions });
      } else if (functionName === 'Multiply Value') {
        result.modifiers.push({ bucket, op: 'MUL_ADD', value: float - 1, conditions });
      } else if (functionName === 'Add Actor Value Mult' && name === 'Mod Damage on Consecutive Hits') {
        // Onslaught per-stack dbm (Furious/Pounder's/Splinter's EP189): the
        // function reads a PRIVATE per-effect AV (LGND_Furious 0x006C3172,
        // Legendary_Pounders_ConsecutiveHits 0x007ACB37, P62_..._MaxConsecutiveHits
        // 0x0080219A) that we ASSUME ticks in lockstep with the shared
        // Onslaught counter (0x00000395) — every one of these MGEFs'
        // descriptions says "per Onslaught stack", and there is no way to
        // prove the private-AV update cadence from static ESM data (engine-
        // opaque, docs/assumptions.md "Onslaught"). Modeled as dbm scaled by
        // the SHARED stack count via the existing `stacks` condition, max 99
        // (a value the shared counter can never reach — the real clamp is
        // the equipped cap, applied by the `onslaught` reader in resolve.ts).
        result.modifiers.push({
          bucket,
          op: 'ADD',
          value: float,
          conditions: [...conditions, { kind: 'stacks', counter: 'onslaught', max: 99 }],
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
        sub.notes.forEach(n => result.notes.push(`perk ${perkEdid}: ${n}`));
        sub.unmappedAvifs.forEach(a => result.unmappedAvifs.push(a));
        for (const fragment of sub.modifiers) {
          result.modifiers.push({ ...fragment, conditions: [...conditions, ...fragment.conditions] });
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
  conditionCtx?: Partial<ConditionTranslationContext>
): Promise<MgefTranslationResult> {
  const { client, edidByFormId } = deps;
  const mgef = await getMgefInfo(client, effect.mgefFormId);

  // Script-archetype effects with a granted perk: the stats live on the PERK
  // record, not the MGEF — chase it (depth-capped against perk→spell→perk loops).
  if (mgef.archetype === 'Script' && mgef.perkToApply && (deps.grantDepth ?? 0) < 2) {
    const granted = await translateGrantedPerk({ ...deps, grantDepth: (deps.grantDepth ?? 0) + 1 }, mgef.edid, mgef.perkToApply);
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
      if (grantConds === null) return { modifiers: [], notes: granted.notes, unmappedAvifs: granted.unmappedAvifs };
      unresolved.forEach(u => granted.notes.push(`condition: ${u}`));
      granted.modifiers = granted.modifiers.map(m => ({ ...m, conditions: [...grantConds, ...m.conditions] }));
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
  const isValueArchetype = mgef.archetype === 'Peak Value Modifier' || mgef.archetype === 'Value Modifier';
  if (isValueArchetype && mgef.actorValue && !edidByFormId.has(mgef.actorValue)) {
    edidByFormId.set(mgef.actorValue, await client.resolveEdid(mgef.actorValue));
  }
  // Damage-archetype effects read the Resist Value (DoT element).
  if (mgef.archetype === 'Damage' && mgef.resistValue && !edidByFormId.has(mgef.resistValue)) {
    edidByFormId.set(mgef.resistValue, await client.resolveEdid(mgef.resistValue));
  }

  // GLOB-valued magnitude override (Sniper's-style): resolve the Global's
  // Value and substitute it for the ZERO Effect Item Data magnitude. Only
  // when the flat magnitude is 0 — consumables (Psycho, Buffout...) carry a
  // sibling Magnitude GLOB that is a survival size/scale constant
  // (SURV_Chem_AddThirstSize_2_Normal = 108...), NOT the effect magnitude;
  // overriding their real nonzero flat values corrupted every chem
  // (Psycho dbm 0.15 → 10.8, Buffout STR 2 → 720; found 2026-07-12).
  let resolvedEffect = effect;
  if (effect.magnitudeGlobal && effect.magnitude === 0) {
    try {
      const glob = await client.get(effect.magnitudeGlobal);
      const value = glob.fields['Value'];
      if (typeof value === 'number') resolvedEffect = { ...effect, magnitude: value };
    } catch {
      /* leave magnitude as-is; an unresolved GLOB surfaces as the usual zero-magnitude note */
    }
  }

  return translate(mgef, resolvedEffect, deps.routes, edidByFormId, {
    timedIsActive: deps.timedIsActive,
    noteUnroutedAvs: deps.noteUnroutedAvs,
    conditionCtx,
  });
}

/** Attach source identity + ids to bucket-level modifier fragments. */
export function withSource(fragments: ModifierFragment[], source: ModifierSource, idPrefix: string): Modifier[] {
  return fragments.map((f, i) => ({ id: `${idPrefix}:${i}`, source, ...f }));
}
