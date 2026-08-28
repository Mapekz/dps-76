import type {
  BuffCategory,
  ExcludedRecordDetail,
  GeneratedAddiction,
  GeneratedAddictionRef,
  GeneratedAura,
  GeneratedBuff,
} from '../../src/types/generated';
import { mapPool, resolveKeywordEdids, type EsmRecord, type EsmSource } from './esm-client';
import { ObtainabilityClassifier } from './obtainability';
import {
  buildAvifRoutes,
  getMgefInfo,
  parseMagicEffects,
  translateMagicEffect,
  withSource,
  type AvifRoute,
  type MgefInfo,
  type SpellEffect,
} from './normalize/mgef';

/** Fixture-friendly inputs for {@link deriveEffectDescription}. */
export interface EffectDescriptionInput {
  /** The MGEF record's actual Name field — NOT the editor-id fallback. */
  mgefName?: string;
  magicItemDescription?: string | null;
  archetype: string;
  perkToApplyDescription?: string | null;
  magnitude: number;
}

function formatMagnitude(mag: number): string {
  return Number.isInteger(mag) ? String(mag) : String(mag);
}

/**
 * Tier-3 stat names rewritten into the app's house vocabulary
 * (src/data/overrides/consumable-corrections.ts): the ESM names the same
 * stat several ways ("Radiation Resistance" / "Radiation Resist" vs the
 * card's "Rad Resist"), and "Health Regen" is the Heal Rate AV
 * (FortifyHealRateFood), matching the collector items' "+0.2 Heal Rate".
 */
const STAT_NAME_REWRITES: Record<string, string> = {
  'Radiation Resistance': 'Rad Resist',
  'Radiation Resist': 'Rad Resist',
  'Health Regen': 'Heal Rate',
  'Resist Radiation Ingestion': 'Rad Resist against radiation from food and drink',
};

/** Replace `<mag>` / `<+MAG>` tokens in an MGEF Magic Item Description template. */
export function substituteMagTemplate(template: string, magnitude: number): string {
  const magStr = formatMagnitude(magnitude);
  return template.replace(/<\+?mag>/gi, (match) => (/<\+/i.test(match) ? `+${magStr}` : magStr));
}

/**
 * Per-effect game item text: Magic Item Description (with magnitude
 * substitution) → Script perk Description → MGEF Name (+mag). House style
 * (src/data/overrides/consumable-corrections.ts): tier 3 leads with the
 * signed magnitude ("+30 Carry Weight"), dropping the game's "Fortify …"/
 * "… Food" stat-plumbing affixes; no line ends with a period.
 */
export function deriveEffectDescription(input: EffectDescriptionInput): string | undefined {
  const { mgefName, magicItemDescription, archetype, perkToApplyDescription, magnitude } = input;

  // A template magnitude that substitutes to zero renders as noise ("Restore
  // 0 HP / second", "+0 Health Regen" — real magnitudes live in a GLOB or
  // curve this path can't see). Suppress; hand overrides fill the real value.
  if (magicItemDescription && /<\+?mag>/i.test(magicItemDescription) && magnitude === 0) {
    return undefined;
  }

  const text = magicItemDescription
    ? substituteMagTemplate(magicItemDescription, magnitude)
    : archetype === 'Script' && perkToApplyDescription
      ? perkToApplyDescription
      : undefined;
  if (text !== undefined) {
    // Unsubstituted game-text tokens (RadAway's "+50 <ITEM1.ABBR>") aren't
    // renderable outside the game UI — drop the part rather than leak markup.
    if (/<[^>]*>/.test(text)) return undefined;
    return (
      text
        .replace(/\.\s*$/, '')
        // The standard food-heal template, restyled to lead with the number.
        .replace(/^Restore ([\d.]+) HP \/ second$/, '+$1 HP/s')
        // Tier-1 spellings of stats the tier-3 rewrites already normalize.
        .replace(/\bHealth Regen\b/, 'Heal Rate')
        .replace(/^Breathe Underwater$/, 'breathe underwater')
    );
  }

  if (mgefName) {
    const cleaned = mgefName
      .replace(/^Food: /, '')
      .replace(/^Fortify /, '')
      .replace(/ Food$/, '');
    // STAT_XPMult magnitudes are percent (mag 5 = +5% XP — verified against
    // the Leader bobblehead, consumable-corrections.ts).
    if (cleaned === 'XP Bonus' && magnitude > 0) return `+${formatMagnitude(magnitude)}% XP`;
    // Flat one-time AP restore, not a rate — phrase it, don't fake a stat.
    if (cleaned === 'Restore Action Points' && magnitude > 0) {
      return `restores ${formatMagnitude(magnitude)} AP`;
    }
    const stat = STAT_NAME_REWRITES[cleaned] ?? cleaned;
    if (magnitude > 0) return `+${formatMagnitude(magnitude)} ${stat}`;
    return stat;
  }

  return undefined;
}

/**
 * MGEF edids whose derived text is survival/bookkeeping plumbing (see the
 * skip site in resolveEffectDescription): the hunger/thirst restore meters
 * and their GHL_ ghoul twins, disease-vector markers, addiction-odds rolls,
 * rads-from-eating, per-item `*_Duration` markers, and the fall-speed joke
 * effects (Lead Champagne). Deliberately NOT a bare `SURV_` prefix —
 * SURV_IncreaseDiseaseResistance_Food_Effect and friends are real buffs.
 */
const DESCRIPTION_PLUMBING_MGEF_RE =
  /^(?:SURV_Food_Effect$|SURV_Drink_Effect$|SURV_AddHunger|SURV_AddThirst|SURV_DiseaseVector|GHL_SURV_|AddictionOdds)|^DamageRadiationEating$|_Duration$|_AdjustFallSpeed$/;

async function resolveEffectDescription(
  client: EsmSource,
  effect: SpellEffect,
): Promise<string | undefined> {
  if (!effect.mgefFormId) return undefined;

  let record: EsmRecord;
  let mgef: MgefInfo;
  try {
    record = await client.get(effect.mgefFormId);
    mgef = await getMgefInfo(client, effect.mgefFormId);
  } catch {
    return undefined;
  }

  // Survival/bookkeeping plumbing — hunger/thirst/duration meters, addiction
  // odds, rads-from-eating, ghoul survival twins — is metadata the in-game
  // card renders separately, not a buff worth a description line. Effects
  // whose modifiers are deliberately skipped (CONSUMABLE_MGEFS_MODELED_
  // ELSEWHERE) must not resurface as description text either.
  if (
    DESCRIPTION_PLUMBING_MGEF_RE.test(mgef.edid) ||
    CONSUMABLE_MGEFS_MODELED_ELSEWHERE[mgef.edid] !== undefined
  ) {
    return undefined;
  }

  const magicItemDescription = record.fields['Magic Item Description'] as string | null | undefined;

  let perkToApplyDescription: string | null = null;
  if (!magicItemDescription && mgef.archetype === 'Script' && mgef.perkToApply) {
    try {
      const perk = await client.get(mgef.perkToApply);
      perkToApplyDescription = (perk.fields['Description'] as string) || null;
    } catch {
      // skip — fall through to tier 3
    }
  }

  // Magnitude resolution mirrors translateMagicEffect's precedence: an
  // attached Curve Table ALWAYS beats the hardcoded magnitude (docs/
  // assumptions.md "Curve tables override flat values"; USER-CONFIRMED
  // 2026-08-20 — the flat float is stale authoring residue when a curve is
  // attached: Alcohol_ResistRadiationExpose carries flat 250 vs curve 100),
  // then a GLOB-valued Magnitude beats the flat float (RestoreHealthFood-
  // style effects carry 0 flat and the real value in SURV_Food_Heal_Mag_*
  // Globals). Every consumable curve in live data is single-point (an
  // authored constant — same "Single-point curve tables" reading translate()
  // uses); a multi-point curve has no single number to substitute, so fall
  // through to the GLOB/flat chain rather than guess.
  let magnitude = effect.magnitude;
  if (effect.curvePoints && effect.curvePoints.length === 1) {
    magnitude = effect.curvePoints[0].y;
  } else if (effect.magnitudeGlobal) {
    try {
      const glob = await client.get(effect.magnitudeGlobal);
      const value = glob.fields['Value'];
      if (typeof value === 'number') magnitude = value;
    } catch {
      // keep the flat magnitude
    }
  }

  return deriveEffectDescription({
    // The record's actual Name only — getMgefInfo's name falls back to the
    // editor id, and a raw edid ("GHL_SURV_Chem_Effect") is not prose.
    mgefName: (record.fields['Name'] as string | undefined) || undefined,
    magicItemDescription,
    archetype: mgef.archetype,
    perkToApplyDescription,
    magnitude,
  });
}

/** Join per-effect descriptions from an ALCH Effects list (`'; '`). */
async function deriveConsumableItemDescription(
  client: EsmSource,
  effects: readonly SpellEffect[],
): Promise<string | undefined> {
  const parts: string[] = [];
  for (const effect of effects) {
    const text = await resolveEffectDescription(client, effect);
    if (text) parts.push(text);
  }
  return parts.length > 0 ? parts.join('; ') : undefined;
}

/**
 * Mutations (SPEL) and consumables (ALCH). Mutations stay a curated
 * whitelist (a small, stable set — pattern-matching would pull in dozens of
 * aux sub-spells). Consumables are fully enumerated from ALCH: see
 * docs/assumptions.md "Consumable stacking & addictions" for the
 * category/dispelKeys/addiction design.
 */

const MUTATION_SPELLS = [
  'Mutation_AdrenalReaction',
  'Mutation_BirdBones',
  'Mutation_Carnivore',
  'Mutation_Chameleon',
  'Mutation_EagleEyes',
  'Mutation_EggHead',
  'Mutation_ElectricallyCharged',
  'Mutation_Empath',
  'Mutation_Grounded',
  'Mutation_HealingFactor',
  'Mutation_Herbivore',
  'Mutation_HerdMentality',
  'Mutation_Marsupial',
  'Mutation_PlagueWalker',
  'Mutation_ScalySkin',
  'Mutation_SpeedDemon',
  'Mutation_Talons',
  'Mutation_TwistedMuscles',
  'Mutation_UnstableIsotope',
];

// Dev/dead-record prefixes (shared shape with the weapon/omod junk filters).
// Real gating for consumables is category classification + obtainability
// below — this is only a cheap pre-filter.
const CONSUMABLE_JUNK_EDID_RE = /^(zzz|del_|deleted|deprecated|cut_|test|debug|post_)/i;

/** Exposed for tests: does the pre-filter drop this editor_id? */
export function isExcludedConsumableEdid(edid: string): boolean {
  return CONSUMABLE_JUNK_EDID_RE.test(edid);
}

/**
 * Category keywords on ALCH records (verified live, 2026-07-12/13 dumps):
 * ObjectTypeChem 0x000F4AE7, ObjectTypeFood 0x00055ECC, ObjectTypeDrink
 * 0x000F4AEC, DrinkTypeAlcohol 0x0010C416 (always co-occurs with
 * ObjectTypeDrink). Priority chem > alcohol (drink∧alcohol) > drink > food —
 * purified water carries both food+drink keywords, so drink wins over food.
 * ObjectTypeSerum / MealTypeRaw / raw ingredients carry none of these and
 * fall through to `null` (excluded — consumableNoCategory).
 *
 * Magazines and bobbleheads (2026-07-13) are ALCH records too, but carry
 * their own dedicated keywords instead — MagazineKeyword (0x001D4A70) /
 * BobbleheadKeyword (0x00135E6C), verified live against
 * Magazine_GunsAndBullets07_Potion / BobbleHead_Strength_Potion. Checked
 * ahead of chem/food/drink since they never co-occur with those keywords.
 */
export function classifyConsumableCategory(keywordEdids: readonly string[]): BuffCategory | null {
  const set = new Set(keywordEdids);
  if (set.has('MagazineKeyword')) return 'magazine';
  if (set.has('BobbleheadKeyword')) return 'bobblehead';
  if (set.has('ObjectTypeChem')) return 'chem';
  if (set.has('ObjectTypeDrink') && set.has('DrinkTypeAlcohol')) return 'alcohol';
  if (set.has('ObjectTypeDrink')) return 'drink';
  if (set.has('ObjectTypeFood')) return 'food';
  return null;
}

/** Ingredient-type keywords — the Carnivore/Herbivore spell-level classification input (src/lib/diet-mutations.ts). */
const INGREDIENT_KEYWORD_RE = /^(IngredientType|MealType)/;

/**
 * Effect-level gate on the Carnivore/Herbivore scaling perks
 * (Mutation_EatAllTheMeat_Perk & co., condition tab 3): only effects whose
 * MGEF carries one of these keywords have their magnitude multiplied (×2 /
 * ×2.5 / ×0). Every Fortify*Food MGEF carries SURV_EffectTypeFoodBuff; the
 * one live outlier is Moon_Rudy_Pozole's plain FortifyCharisma/FortifyLuck
 * (audited 2026-07-13 across all 77 meat/veg foods).
 */
const FOOD_SCALE_KEYWORD_EDIDS = new Set([
  'SURV_EffectTypeFoodBuff',
  'SURV_EffectTypeFoodHunger',
  'SURV_EffectTypeFoodHealing',
]);

/**
 * Effect-level gate on Class Freak's own perk ranks (ClassFreak01/02/03,
 * 0x00391F0E/0x00391F11/0x00391F12): each rank's "Mod Spell Magnitude"
 * ×0.75/×0.5/×0.25 applies to spell effects carrying this keyword
 * (EPAlchemyEffectHasKeyword 0x00391F0F). Every mutation "Reduce" MGEF
 * (Mutation_ReduceStrength & co.) carries it alongside the Detrimental flag —
 * both are required for the penalty tag (the keyword alone also sits on
 * non-stat UI-dummy effects).
 */
const MUTATION_NEGATIVE_EFFECT_KEYWORD = 'AbilityTypeMutation_NegativeEffect';

/**
 * Addiction-SPEL effects computed app-side instead of extracted:
 * abAddictionCount feeds the Junkie's curve via `deriveAddictionCount`
 * (src/lib/player-stats.ts), and CA_AddictionEffect is a no-op Script marker.
 * Skipped by edid so they don't surface as spurious "no route" notes.
 */
const ADDICTION_BOOKKEEPING_MGEF_EDIDS = new Set(['abAddictionCount', 'CA_AddictionEffect']);

/**
 * Consumable-side MGEFs whose effect belongs to a DIFFERENT app source —
 * emitting them here would double-count it. All three ride on every (or
 * nearly every) alcohol ALCH record, gated by MGEF-record-level Conditions
 * (verified via `esm get` 2026-08-19; each is also flagged "Hide in UI", so
 * the in-game drink card omits them too):
 * - PerkHappyGoLuckyFortifyLuck (+2) / PerkHappyGoLucky02FortifyLuck (+3):
 *   the Happy-Go-Lucky perk card's Luck-while-drunk bonus, HasPerk-gated on
 *   HappyGoLucky01/02. Modeled on the card itself via
 *   extraPerkModifiers.HappyGoLucky (src/data/overrides/perk-overrides.ts)
 *   with an underAlcoholEffect condition — same split as Live & Love 5.
 * - FortifyLuckMagazineLiveLove (+1): legacy companion-gated variant
 *   (HasPerk PerkMagLiveNLove05 AND GetGlobalValue(PlayerHasActiveCompanion)
 *   > 0 — an FO4 leftover; 76 has no companions, the GLOB stays 0). Live &
 *   Love 5's real +2-Luck-under-alcohol is already carried by
 *   buffValueOverrides (src/data/overrides/buff-overrides.ts).
 */
const CONSUMABLE_MGEFS_MODELED_ELSEWHERE: Record<string, string> = {
  PerkHappyGoLuckyFortifyLuck: 'modeled by Happy-Go-Lucky rank 1 (extraPerkModifiers)',
  PerkHappyGoLucky02FortifyLuck: 'modeled by Happy-Go-Lucky rank 2 (extraPerkModifiers)',
  FortifyLuckMagazineLiveLove:
    'dead companion-gated variant (Live & Love 5 itself is modeled in buffValueOverrides)',
};

/**
 * Same-bonus collision key for one dispel-flagged effect: its resolved
 * keyword edids, sorted and joined with '|'. Exact keyword-SET equality
 * (not any-keyword intersection — all foods share broad keywords like
 * FoodEffect, all chems share ChemEffect, which would wrongly collide every
 * item in a category). See docs/assumptions.md "Consumable stacking".
 */
export async function buildDispelKeys(
  client: EsmSource,
  effects: readonly SpellEffect[],
): Promise<string[]> {
  const keys = new Set<string>();
  for (const effect of effects) {
    const mgef = await getMgefInfo(client, effect.mgefFormId);
    if (!mgef.dispelWithKeywords) continue;
    const kwEdids = await Promise.all(mgef.keywords.map((k) => client.resolveEdid(k)));
    keys.add([...kwEdids].sort().join('|'));
  }
  return [...keys].sort();
}

/**
 * The addiction an ALCH record causes, from `Effect Data.Addiction` — a SPEL
 * formid directly on the record (no AVIF chase needed). Absent/null/zero ⇒
 * non-addictive.
 */
export async function resolveAddiction(
  client: EsmSource,
  record: EsmRecord,
  notes: Set<string>,
): Promise<GeneratedAddictionRef | undefined> {
  const effectData = (record.fields['Effect Data'] ?? {}) as Record<string, unknown>;
  const addictionFormId = effectData['Addiction'];
  if (typeof addictionFormId !== 'string' || addictionFormId === '0x00000000') return undefined;
  try {
    const spel = await client.get(addictionFormId);
    return {
      id: spel.editor_id,
      formId: spel.header.form_id,
      name: (spel.fields['Name'] as string) ?? spel.editor_id,
    };
  } catch {
    notes.add(`${record.editor_id}: addiction ${addictionFormId} not found`);
    return undefined;
  }
}

export interface ExtractBuffsResult {
  mutations: GeneratedBuff[];
  consumables: GeneratedBuff[];
  addictions: GeneratedAddiction[];
  excluded: Record<string, string[]>;
  excludedDetailed: Record<string, ExcludedRecordDetail[]>;
  notes: string[];
  unmappedAvifs: string[];
}

/**
 * Exported for tests (precedent: isExcludedConsumableEdid/classifyConsumableCategory/
 * buildDispelKeys/resolveAddiction below are all extraction internals exposed the
 * same way): pins the Detrimental + AbilityTypeMutation_NegativeEffect →
 * penaltyModifierIds tagging without standing up the full extractBuffs graph
 * (AVIF-route plumbing perks, ALCH search, obtainability). Otherwise only
 * called from extractBuffs' MUTATION_SPELLS loop.
 */
export async function extractMutation(
  client: EsmSource,
  edid: string,
  routes: Map<string, AvifRoute[]>,
  edidByFormId: Map<string, string>,
  allNotes: string[],
  allUnmapped: Set<string>,
): Promise<GeneratedBuff | null> {
  let record;
  try {
    record = await client.get(edid);
  } catch {
    allNotes.push(`mutation ${edid}: record not found`);
    return null;
  }

  const notes = new Set<string>();
  const fragments = [];
  const auras: GeneratedAura[] = [];
  // Fragment indexes from a penalty MGEF (NegativeEffect keyword +
  // Detrimental — the Class Freak scaling gate), mapped to modifier ids
  // below, after withSource assigns them (mirrors buildConsumable's
  // scalableIndexes pattern).
  const penaltyIndexes = new Set<number>();
  for (const effect of parseMagicEffects(record)) {
    const result = await translateMagicEffect(
      { client, routes, edidByFormId, timedIsActive: true, noteUnroutedAvs: true },
      effect,
    );
    if (result.modifiers.length > 0) {
      const mgef = await getMgefInfo(client, effect.mgefFormId);
      const kwEdids = await Promise.all(mgef.keywords.map((k) => client.resolveEdid(k)));
      if (mgef.detrimental && kwEdids.includes(MUTATION_NEGATIVE_EFFECT_KEYWORD)) {
        for (let i = 0; i < result.modifiers.length; i++) penaltyIndexes.add(fragments.length + i);
      }
    }
    fragments.push(...result.modifiers);
    if (result.auras) auras.push(...result.auras);
    result.notes.forEach((n) => notes.add(`${edid}: ${n}`));
    result.unmappedAvifs.forEach((a) => allUnmapped.add(a));
  }

  const source = {
    kind: 'mutation' as const,
    formId: record.header.form_id,
    edid: record.editor_id,
    name: (record.fields['Name'] as string) ?? record.editor_id,
  };

  const modifiers = withSource(fragments, source, record.header.form_id);
  const penaltyModifierIds = modifiers.filter((_, i) => penaltyIndexes.has(i)).map((m) => m.id);

  allNotes.push(...notes);
  return {
    id: record.editor_id,
    formId: record.header.form_id,
    name: source.name,
    kind: 'mutation',
    modifiers,
    notes: [...notes],
    ...(auras.length > 0 ? { auraChase: auras } : {}),
    ...(penaltyModifierIds.length > 0 ? { penaltyModifierIds } : {}),
  };
}

interface CategorizedBuff {
  buff: GeneratedBuff;
  category: BuffCategory;
}

/**
 * Withdrawal penalty modifiers from an addiction SPEL's own effects — flat
 * Detrimental SPECIAL reducers (abReduce<SPECIAL><Family>Addiction, e.g.
 * Alcohol Addiction: −1 AGI, −1 CHA), translated through the same MGEF
 * pipeline as mutations. Bookkeeping effects (abAddictionCount /
 * CA_AddictionEffect) are skipped; unrouted ones (Med-X/Psycho's
 * abReduceDamageResistAddiction — player DR, out of scope) become notes.
 *
 * Exported for tests (same precedent as extractMutation above).
 */
export async function extractAddictionEffects(
  client: EsmSource,
  spel: EsmRecord,
  routes: Map<string, AvifRoute[]>,
  edidByFormId: Map<string, string>,
  allUnmapped: Set<string>,
): Promise<{ modifiers: GeneratedAddiction['modifiers']; notes: string[] }> {
  const notes = new Set<string>();
  const fragments = [];
  for (const effect of parseMagicEffects(spel)) {
    const mgef = await getMgefInfo(client, effect.mgefFormId);
    if (ADDICTION_BOOKKEEPING_MGEF_EDIDS.has(mgef.edid)) continue;
    const result = await translateMagicEffect(
      { client, routes, edidByFormId, timedIsActive: true, noteUnroutedAvs: true },
      effect,
    );
    fragments.push(...result.modifiers);
    result.notes.forEach((n) => notes.add(`${spel.editor_id}: ${n}`));
    result.unmappedAvifs.forEach((a) => allUnmapped.add(a));
  }
  const source = {
    kind: 'addiction' as const,
    formId: spel.header.form_id,
    edid: spel.editor_id,
    name: (spel.fields['Name'] as string) ?? spel.editor_id,
  };
  return { modifiers: withSource(fragments, source, spel.header.form_id), notes: [...notes] };
}

/** Build a GeneratedBuff for one categorized ALCH record (even when 0 modifiers result — needed for the addiction catalog). */
async function buildConsumable(
  client: EsmSource,
  record: EsmRecord,
  routes: Map<string, AvifRoute[]>,
  edidByFormId: Map<string, string>,
  allUnmapped: Set<string>,
): Promise<CategorizedBuff | null> {
  const keywordEdids = await resolveKeywordEdids(client, record.fields);
  const category = classifyConsumableCategory(keywordEdids);
  if (!category) return null;

  const effects = parseMagicEffects(record);
  const notes = new Set<string>();
  const fragments = [];
  // Fragment indexes whose source MGEF carries a food-scale keyword (the
  // Carnivore/Herbivore effect-level gate) — mapped to modifier ids below,
  // after withSource assigns them.
  const scalableIndexes = new Set<number>();
  for (const effect of effects) {
    const mgef = await getMgefInfo(client, effect.mgefFormId);
    const elsewhere = CONSUMABLE_MGEFS_MODELED_ELSEWHERE[mgef.edid];
    if (elsewhere) {
      notes.add(`${record.editor_id}: MGEF ${mgef.edid} skipped — ${elsewhere}`);
      continue;
    }
    const result = await translateMagicEffect(
      { client, routes, edidByFormId, timedIsActive: true, noteUnroutedAvs: true },
      effect,
    );
    if (result.modifiers.length > 0) {
      const kwEdids = await Promise.all(mgef.keywords.map((k) => client.resolveEdid(k)));
      if (kwEdids.some((k) => FOOD_SCALE_KEYWORD_EDIDS.has(k))) {
        for (let i = 0; i < result.modifiers.length; i++) scalableIndexes.add(fragments.length + i);
      }
    }
    fragments.push(...result.modifiers);
    result.notes.forEach((n) => notes.add(`${record.editor_id}: ${n}`));
    result.unmappedAvifs.forEach((a) => allUnmapped.add(a));
  }

  const dispelKeys = await buildDispelKeys(client, effects);
  const addiction = await resolveAddiction(client, record, notes);
  const ingredientKeywords = keywordEdids.filter((e) => INGREDIENT_KEYWORD_RE.test(e));

  const source = {
    kind: 'consumable' as const,
    formId: record.header.form_id,
    edid: record.editor_id,
    name: (record.fields['Name'] as string) ?? record.editor_id,
  };

  const modifiers = withSource(fragments, source, record.header.form_id);
  const foodScalableModifierIds = modifiers
    .filter((_, i) => scalableIndexes.has(i))
    .map((m) => m.id);

  // ESM-derived fallback text for the app's `describeBuffModifiers(...) ??
  // description` chain. Collector categories always derive (their pick lists
  // are complete, so many members have no modeled effect); other categories
  // derive only when nothing is modeled — a modifier-less food/chem/drink
  // would otherwise render a bare name (Firecracker Whiskey's accuracy buff,
  // Rad-X's Rad Resist — real effects this engine doesn't model yet).
  const description =
    category === 'bobblehead' || category === 'magazine' || fragments.length === 0
      ? await deriveConsumableItemDescription(client, effects)
      : undefined;

  const buff: GeneratedBuff = {
    id: record.editor_id,
    formId: record.header.form_id,
    name: source.name,
    kind: 'consumable',
    modifiers,
    notes: [...notes],
    category,
    dispelKeys,
    addiction,
    ingredientKeywords,
    ...(foodScalableModifierIds.length > 0 ? { foodScalableModifierIds } : {}),
    ...(description ? { description } : {}),
  };
  return { buff, category };
}

export async function extractBuffs(client: EsmSource): Promise<ExtractBuffsResult> {
  const formIdPool = new Set<string>();
  const routes = await buildAvifRoutes(client, formIdPool);
  const edidByFormId = new Map<string, string>();
  for (const id of formIdPool) edidByFormId.set(id, await client.resolveEdid(id));

  const notes: string[] = [];
  const unmapped = new Set<string>();

  // Mutations — unchanged: curated whitelist, no new fields.
  const mutations: GeneratedBuff[] = [];
  for (const edid of MUTATION_SPELLS) {
    const buff = await extractMutation(client, edid, routes, edidByFormId, notes, unmapped);
    if (buff) mutations.push(buff);
  }

  // Consumables — full ALCH enumeration.
  const excluded: Record<string, string[]> = {
    consumableJunkEdid: [],
    consumableNoCategory: [],
    consumableNoDamageOrSpecial: [],
    consumableUnobtainable: [],
  };
  const excludedDetailed: Record<string, ExcludedRecordDetail[]> = {
    consumableUnobtainable: [],
    consumableNoDamageOrSpecial: [],
  };

  const alchRows = await client.search('*', { type: 'ALCH', searchIn: 'name' });
  const candidates = alchRows.filter((row) => {
    if (isExcludedConsumableEdid(row.editor_id)) {
      excluded.consumableJunkEdid.push(row.editor_id);
      return false;
    }
    return true;
  });

  const records = await mapPool(candidates, 8, (row) => client.get(row.form_id));

  const categorized: CategorizedBuff[] = [];
  for (const record of records) {
    const built = await buildConsumable(client, record, routes, edidByFormId, unmapped);
    if (!built) {
      excluded.consumableNoCategory.push(record.editor_id);
      continue;
    }
    categorized.push(built);
  }

  // Obtainability over the full categorized set (chem/food/drink/alcohol
  // alike) — same contract as weapons/omods: failures stay in the JSON
  // flagged obtainable:false (app hides, corrections.ts can force-visible).
  const classifier = new ObtainabilityClassifier(client);
  const verdicts = await classifier.classify(
    categorized.map((c) => ({ formId: c.buff.formId, edid: c.buff.id })),
  );
  for (const { buff } of categorized) {
    const verdict = verdicts.get(buff.formId);
    buff.obtainable = verdict?.obtainable ?? false;
    if (!buff.obtainable) {
      excluded.consumableUnobtainable.push(buff.id);
      excludedDetailed.consumableUnobtainable.push({
        id: buff.id,
        name: buff.name,
        signals: verdict?.signals,
      });
    }
  }

  // Final consumables list: categorized records with ≥1 routed modifier
  // (HealthBonus→maxHealth already routes, so flat-HP food stays relevant) —
  // OR at least one dispel-flagged effect — OR a collector category.
  //
  // `dispelKeys` (one entry per dispel-flagged MGEF — i.e. per actual named
  // buff the game applies and tracks for stacking) is the flood guard that
  // separates "applies a real effect this engine just doesn't model yet"
  // (Rad-X's Rad Resist, cooked meals' rad reduction, Firecracker Whiskey's
  // accuracy — kept, shown with the ESM-derived description + "no effect
  // yet" badge) from hunger/rads-only look-alikes (raw meats, junk food,
  // waters, the unfermented Brew_*Ferm mash records — still excluded; the
  // pickers must not flood with items whose in-game card is only
  // Food/HP/Rads). Widened from the old addiction-suppressor-only clause
  // (2026-08-19, "add no-DPS-impact consumables"): a suppressor (Med-X
  // costing a Junkie's stack) is now just the addictive subset of this rule.
  //
  // Unobtainable records with real modifiers STILL make this list (kept in
  // the JSON, hidden app-side) — obtainability and the damage gate are
  // independent filters, same as weapons/omods.
  //
  // Bobbleheads and magazines bypass both gates: collector categories whose
  // pick lists must be complete (Bobblehead: Lockpick/Caps, Grognak 2/3/6/7/9,
  // …). A no-effect one still lands in the app with the "no effect yet" badge.
  // The dispel clause additionally requires an addiction (a suppressor is a
  // Junkie's lever even with nothing else) or a derived description (Winner's
  // Cup carries a dispel-flagged Duration marker and nothing else — a bare
  // name row helps nobody).
  const isRelevant = (b: GeneratedBuff): boolean =>
    b.modifiers.length > 0 ||
    ((b.dispelKeys?.length ?? 0) > 0 &&
      (b.addiction !== undefined || b.description !== undefined)) ||
    b.category === 'bobblehead' ||
    b.category === 'magazine';
  const consumables = categorized.map((c) => c.buff).filter(isRelevant);
  for (const { buff } of categorized) {
    if (!isRelevant(buff)) {
      excluded.consumableNoDamageOrSpecial.push(buff.id);
      excludedDetailed.consumableNoDamageOrSpecial.push({ id: buff.id, name: buff.name });
    }
  }
  consumables.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const consumableIds = new Set(consumables.map((c) => c.id));

  // Addiction catalog: from ALL obtainable categorized records (including
  // 0-modifier ones — an addiction whose chem has no modeled DPS effect must
  // stay selectable for Junkie's). Unobtainable chems' addictions drop out
  // automatically (e.g. Jet, per user confirmation it's unobtainable).
  // causedBy is restricted to ids present in the final consumables list —
  // the only ones the UI can actually select as suppressors.
  const addictionById = new Map<string, GeneratedAddiction>();
  for (const { buff } of categorized) {
    if (!buff.obtainable || !buff.addiction) continue;
    if (!addictionById.has(buff.addiction.id)) {
      // Withdrawal penalties extracted ONCE per family from the shared SPEL
      // (every causing consumable references the same record).
      let penalty: { modifiers: GeneratedAddiction['modifiers']; notes: string[] } = {
        modifiers: [],
        notes: [],
      };
      try {
        const spel = await client.get(buff.addiction.formId);
        penalty = await extractAddictionEffects(client, spel, routes, edidByFormId, unmapped);
      } catch {
        penalty.notes.push(
          `${buff.addiction.id}: addiction SPEL ${buff.addiction.formId} not readable — no withdrawal penalties extracted`,
        );
      }
      notes.push(...penalty.notes);
      addictionById.set(buff.addiction.id, {
        id: buff.addiction.id,
        formId: buff.addiction.formId,
        name: buff.addiction.name,
        causedBy: [],
        modifiers: penalty.modifiers,
        notes: penalty.notes,
      });
    }
    if (consumableIds.has(buff.id)) {
      addictionById.get(buff.addiction.id)!.causedBy.push(buff.id);
    }
  }
  const addictions = [...addictionById.values()];
  for (const a of addictions) a.causedBy.sort();
  addictions.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));

  // Notes hygiene: only surface notes from buffs that made the FINAL
  // consumables list, deduped — hundreds of excluded records' unrouted-AV
  // notes would otherwise flood meta.unresolved (excluded records are
  // already covered by the excluded/excludedDetailed buckets above).
  const finalConsumableNotes = new Set<string>();
  for (const buff of consumables) for (const n of buff.notes) finalConsumableNotes.add(n);
  notes.push(...finalConsumableNotes);

  return {
    mutations,
    consumables,
    addictions,
    excluded,
    excludedDetailed,
    notes,
    unmappedAvifs: [...unmapped],
  };
}
