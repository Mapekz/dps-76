import type { GameMode } from '@/types';
import type { GeneratedBuff } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';
import { buffValueOverrides } from './overrides/buff-overrides';
import generatedMutationsLive from './live/generated/mutations.json';
import generatedConsumablesLive from './live/generated/consumables.json';

function applyOverrides(buffs: GeneratedBuff[]): GeneratedBuff[] {
  return buffs.map(b => {
    const override = buffValueOverrides[b.id];
    return override ? { ...b, modifiers: override } : b;
  });
}

// PTS generated data doesn't exist yet — single ESM for now (see plan).
const mutationsLive = applyOverrides(generatedMutationsLive as GeneratedBuff[]);
const consumablesLive = applyOverrides(generatedConsumablesLive as GeneratedBuff[]);
const mutationsByMode: Record<GameMode, GeneratedBuff[]> = { live: mutationsLive, pts: mutationsLive };
const consumablesByMode: Record<GameMode, GeneratedBuff[]> = { live: consumablesLive, pts: consumablesLive };

export function getMutations(mode: GameMode): GeneratedBuff[] {
  return mutationsByMode[mode];
}

export function getConsumables(mode: GameMode): GeneratedBuff[] {
  return consumablesByMode[mode];
}

/** Engine modifiers for the selected mutation/consumable ids. */
export function getBuffModifiers(mode: GameMode, mutationIds: string[], consumableIds: string[]): Modifier[] {
  const modifiers: Modifier[] = [];
  for (const buff of mutationsByMode[mode]) {
    if (mutationIds.includes(buff.id)) modifiers.push(...buff.modifiers);
  }
  for (const buff of consumablesByMode[mode]) {
    if (consumableIds.includes(buff.id)) modifiers.push(...buff.modifiers);
  }
  return modifiers;
}
