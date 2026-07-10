import type { GeneratedBuff } from '../../src/types/generated';
import type { EsmClient } from './esm-client';
import {
  buildAvifRoutes,
  parseMagicEffects,
  translateMagicEffect,
  withSource,
  type AvifRoute,
} from './normalize/mgef';

/**
 * Mutations (SPEL) and consumables (ALCH) — both are curated whitelists:
 * pattern-matching pulls in dozens of aux sub-spells and junk items, and the
 * damage-relevant set is small and stable. Extend the lists as needed.
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

const CONSUMABLE_ITEMS = [
  // Damage- or SPECIAL-relevant chems (full food/drink/alcohol extraction with
  // category + stacking data is the consumables-overhaul workstream).
  // Removed 2026-07: MedX, NukaColaQuantum — no damage or SPECIAL contribution.
  'Buffout', 'Psycho', 'Psychobuff', 'Psychotats', 'Bufftats', 'Fury',
  'Overdrive', 'Calmex', 'Mentats', 'BerryMentats',
];

export interface ExtractBuffsResult {
  mutations: GeneratedBuff[];
  consumables: GeneratedBuff[];
  notes: string[];
  unmappedAvifs: string[];
}

async function extractBuff(
  client: EsmClient,
  edid: string,
  kind: 'mutation' | 'consumable',
  routes: Map<string, AvifRoute[]>,
  edidByFormId: Map<string, string>,
  allNotes: string[],
  allUnmapped: Set<string>
): Promise<GeneratedBuff | null> {
  let record;
  try {
    record = await client.get(edid);
  } catch {
    allNotes.push(`${kind} ${edid}: record not found`);
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
    kind,
    formId: record.header.form_id,
    edid: record.editor_id,
    name: (record.fields['Name'] as string) ?? record.editor_id,
  } as const;

  allNotes.push(...notes);
  return {
    id: record.editor_id,
    formId: record.header.form_id,
    name: source.name,
    kind,
    modifiers: withSource(fragments, source, record.header.form_id),
    notes: [...notes],
  };
}

export async function extractBuffs(client: EsmClient): Promise<ExtractBuffsResult> {
  const formIdPool = new Set<string>();
  const routes = await buildAvifRoutes(client, formIdPool);
  const edidByFormId = new Map<string, string>();
  for (const id of formIdPool) edidByFormId.set(id, await client.resolveEdid(id));

  const notes: string[] = [];
  const unmapped = new Set<string>();

  const mutations: GeneratedBuff[] = [];
  for (const edid of MUTATION_SPELLS) {
    const buff = await extractBuff(client, edid, 'mutation', routes, edidByFormId, notes, unmapped);
    if (buff) mutations.push(buff);
  }

  const consumables: GeneratedBuff[] = [];
  for (const edid of CONSUMABLE_ITEMS) {
    const buff = await extractBuff(client, edid, 'consumable', routes, edidByFormId, notes, unmapped);
    if (buff) consumables.push(buff);
  }

  return { mutations, consumables, notes, unmappedAvifs: [...unmapped] };
}
