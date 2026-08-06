import type { GameMode } from '@/types';
import type { GeneratedHealingItem } from '@/types/generated';
import { getDataset } from './dataset';

/** ESM-extracted base heal profiles for Stimpak/RadAway-adjacent items — see GeneratedHealingItem. */
export function getHealingItems(mode: GameMode): GeneratedHealingItem[] {
  return getDataset(mode).healingItems;
}
