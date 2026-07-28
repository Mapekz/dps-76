import { useGameMode } from '@/hooks/useGameMode';
import { useBuild } from '@/state/BuildProvider';
import { computePerkBudget } from '@/data/perk-budget';
import { SPECIAL_KEYS } from '@/lib/player-stats';
import { LEGENDARY_PERK_SLOTS, type SpecialKey } from '@/state/build-reducer';

/**
 * Card/loadout status shared by the perk editor body (PerkEditorSection.tsx)
 * and the SPECIAL Loadout section trigger (badge + summary).
 */
export function usePerkStatus() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const allocation = Object.fromEntries(
    SPECIAL_KEYS.map((k) => [k, player.conditions[k]]),
  ) as Record<SpecialKey, number>;
  const budget = computePerkBudget(mode, player.perks, player.legendaryPerks, allocation);
  return {
    budget,
    cardCount: player.perks.length + player.legendaryPerks.length,
    overBudget: budget.overBudget || player.legendaryPerks.length > LEGENDARY_PERK_SLOTS,
  };
}
