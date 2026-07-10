import type { GameMode } from '@/types';
import type { GeneratedBuff } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';
import { getDataset } from './dataset';

// Reads the merged mutation/consumable lists from the dataset chokepoint
// (buff-value overrides already applied).

export function getMutations(mode: GameMode): GeneratedBuff[] {
  return getDataset(mode).mutations;
}

export function getConsumables(mode: GameMode): GeneratedBuff[] {
  return getDataset(mode).consumables;
}

/** Engine modifiers for the selected mutation/consumable ids. */
export function getBuffModifiers(mode: GameMode, mutationIds: string[], consumableIds: string[]): Modifier[] {
  const dataset = getDataset(mode);
  const modifiers: Modifier[] = [];
  for (const buff of dataset.mutations) {
    if (mutationIds.includes(buff.id)) modifiers.push(...buff.modifiers);
  }
  for (const buff of dataset.consumables) {
    if (consumableIds.includes(buff.id)) modifiers.push(...buff.modifiers);
  }
  return modifiers;
}
