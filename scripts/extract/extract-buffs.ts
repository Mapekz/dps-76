import type {
  BuffCategory,
  ExcludedRecordDetail,
  GeneratedAddiction,
  GeneratedAddictionRef,
  GeneratedBuff,
} from '../../src/types/generated';
import { EsmClient, mapPool, type EsmRecord } from './esm-client';
import { ObtainabilityClassifier } from './obtainability';
import {
  buildAvifRoutes,
  getMgefInfo,
  parseMagicEffects,
  translateMagicEffect,
  withSource,
  type AvifRoute,
  type SpellEffect,
} from './normalize/mgef';

/**
 * Mutations (SPEL) and consumables (ALCH). Mutations stay a curated
 * whitelist (a small, stable set — pattern-matching would pull in dozens of
 * aux sub-spells). Consumables are fully enumerated from ALCH: see
 * dps-todos/consumables-overhaul.md and the implementation plan for the
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
 */
export function classifyConsumableCategory(keywordEdids: readonly string[]): BuffCategory | null {
  const set = new Set(keywordEdids);
  if (set.has('ObjectTypeChem')) return 'chem';
  if (set.has('ObjectTypeDrink') && set.has('DrinkTypeAlcohol')) return 'alcohol';
  if (set.has('ObjectTypeDrink')) return 'drink';
  if (set.has('ObjectTypeFood')) return 'food';
  return null;
}

/** Ingredient-type keywords captured for the deferred Carnivore/Herbivore follow-up (no consumer yet). */
const INGREDIENT_KEYWORD_RE = /^(IngredientType|MealType)/;

/**
 * Same-bonus collision key for one dispel-flagged effect: its resolved
 * keyword edids, sorted and joined with '|'. Exact keyword-SET equality
 * (not any-keyword intersection — all foods share broad keywords like
 * FoodEffect, all chems share ChemEffect, which would wrongly collide every
 * item in a category). See docs/assumptions.md "Consumable stacking".
 */
export async function buildDispelKeys(
  client: EsmClient,
  effects: readonly SpellEffect[]
): Promise<string[]> {
  const keys = new Set<string>();
  for (const effect of effects) {
    const mgef = await getMgefInfo(client, effect.mgefFormId);
    if (!mgef.dispelWithKeywords) continue;
    const kwEdids = await Promise.all(mgef.keywords.map(k => client.resolveEdid(k)));
    keys.add([...kwEdids].sort().join('|'));
  }
  return [...keys].sort();
}

/**
 * The addiction an ALCH record causes, from `Effect Data.Addiction` — a SPEL
 * formid directly on the record (no AVIF chase needed). Absent/null/zero ⇒
 * non-addictive.
 */
export async function resolveAddiction(client: EsmClient, record: EsmRecord, notes: Set<string>): Promise<GeneratedAddictionRef | undefined> {
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

async function extractMutation(
  client: EsmClient,
  edid: string,
  routes: Map<string, AvifRoute[]>,
  edidByFormId: Map<string, string>,
  allNotes: string[],
  allUnmapped: Set<string>
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
  for (const effect of parseMagicEffects(record)) {
    const result = await translateMagicEffect({ client, routes, edidByFormId, timedIsActive: true, noteUnroutedAvs: true }, effect);
    fragments.push(...result.modifiers);
    result.notes.forEach(n => notes.add(`${edid}: ${n}`));
    result.unmappedAvifs.forEach(a => allUnmapped.add(a));
  }

  const source = {
    kind: 'mutation' as const,
    formId: record.header.form_id,
    edid: record.editor_id,
    name: (record.fields['Name'] as string) ?? record.editor_id,
  };

  allNotes.push(...notes);
  return {
    id: record.editor_id,
    formId: record.header.form_id,
    name: source.name,
    kind: 'mutation',
    modifiers: withSource(fragments, source, record.header.form_id),
    notes: [...notes],
  };
}

interface CategorizedBuff {
  buff: GeneratedBuff;
  category: BuffCategory;
}

/** Build a GeneratedBuff for one categorized ALCH record (even when 0 modifiers result — needed for the addiction catalog). */
async function buildConsumable(
  client: EsmClient,
  record: EsmRecord,
  routes: Map<string, AvifRoute[]>,
  edidByFormId: Map<string, string>,
  allUnmapped: Set<string>
): Promise<CategorizedBuff | null> {
  const keywordsNode = (record.fields['Keywords'] ?? {}) as Record<string, unknown>;
  const keywordFormIds = Array.isArray(keywordsNode['Keywords']) ? (keywordsNode['Keywords'] as string[]) : [];
  const keywordEdids = await Promise.all(keywordFormIds.map(id => client.resolveEdid(id)));
  const category = classifyConsumableCategory(keywordEdids);
  if (!category) return null;

  const effects = parseMagicEffects(record);
  const notes = new Set<string>();
  const fragments = [];
  for (const effect of effects) {
    const result = await translateMagicEffect({ client, routes, edidByFormId, timedIsActive: true, noteUnroutedAvs: true }, effect);
    fragments.push(...result.modifiers);
    result.notes.forEach(n => notes.add(`${record.editor_id}: ${n}`));
    result.unmappedAvifs.forEach(a => allUnmapped.add(a));
  }

  const dispelKeys = await buildDispelKeys(client, effects);
  const addiction = await resolveAddiction(client, record, notes);
  const ingredientKeywords = keywordEdids.filter(e => INGREDIENT_KEYWORD_RE.test(e));

  const source = {
    kind: 'consumable' as const,
    formId: record.header.form_id,
    edid: record.editor_id,
    name: (record.fields['Name'] as string) ?? record.editor_id,
  };

  const buff: GeneratedBuff = {
    id: record.editor_id,
    formId: record.header.form_id,
    name: source.name,
    kind: 'consumable',
    modifiers: withSource(fragments, source, record.header.form_id),
    notes: [...notes],
    category,
    dispelKeys,
    addiction,
    ingredientKeywords,
  };
  return { buff, category };
}

export async function extractBuffs(client: EsmClient): Promise<ExtractBuffsResult> {
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
  const candidates = alchRows.filter(row => {
    if (isExcludedConsumableEdid(row.editor_id)) {
      excluded.consumableJunkEdid.push(row.editor_id);
      return false;
    }
    return true;
  });

  const records = await mapPool(candidates, 8, row => client.get(row.form_id));

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
  const verdicts = await classifier.classify(categorized.map(c => ({ formId: c.buff.formId, edid: c.buff.id })));
  for (const { buff } of categorized) {
    const verdict = verdicts.get(buff.formId);
    buff.obtainable = verdict?.obtainable ?? false;
    if (!buff.obtainable) {
      excluded.consumableUnobtainable.push(buff.id);
      excludedDetailed.consumableUnobtainable.push({ id: buff.id, name: buff.name, signals: verdict?.signals });
    }
  }

  // Final consumables list: categorized records with ≥1 routed modifier
  // (HealthBonus→maxHealth already routes, so flat-HP food stays relevant;
  // rads/hunger/disease effects have no route and correctly drop out).
  // Unobtainable records with real modifiers STILL make this list (kept in
  // the JSON, hidden app-side) — obtainability and the damage gate are
  // independent filters, same as weapons/omods.
  const consumables = categorized.map(c => c.buff).filter(b => b.modifiers.length > 0);
  for (const { buff } of categorized) {
    if (buff.modifiers.length === 0) {
      excluded.consumableNoDamageOrSpecial.push(buff.id);
      excludedDetailed.consumableNoDamageOrSpecial.push({ id: buff.id, name: buff.name });
    }
  }
  consumables.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  const consumableIds = new Set(consumables.map(c => c.id));

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
      addictionById.set(buff.addiction.id, {
        id: buff.addiction.id,
        formId: buff.addiction.formId,
        name: buff.addiction.name,
        causedBy: [],
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

  return { mutations, consumables, addictions, excluded, excludedDetailed, notes, unmappedAvifs: [...unmapped] };
}
