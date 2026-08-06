/**
 * Stimpak/RadAway heal profile resolver — concurrent-from-t=0 model.
 *
 * Each healing item's ESM legs all start at t=0 with no sequencing delay;
 * magnitude and duration scale independently per leg via the player's
 * `stimpakHealMagMult` / `stimpakHealDurationMult` product-folds. Healing
 * from concurrent legs superposes (sums), so peak HPS is the sum of all
 * scaled magnitudes at t=0⁺ and total HP is the sum of each leg's integral.
 */
import type { GeneratedHealingItem } from '@/types/generated';
import type { DerivedPlayerStats } from './player-stats';

export interface ResolvedHealingLeg {
  hpPerSec: number;
  durationSec: number;
}

export interface ResolvedHealing {
  legs: ResolvedHealingLeg[];
  totalHp: number;
  peakHpsPerSec: number;
  windowSec: number;
}

/**
 * Applies the player's stimpakHealMagMult/DurationMult to one healing item's
 * base legs (see this file's header comment / docs/assumptions.md "Stimpak
 * base-heal unit" for the concurrent-from-t=0 model and its ESM basis). No
 * DPS/engine consumer yet — feeds the future incoming-DPS/HPS simulator.
 */
export function resolveStimpakHealing(
  item: GeneratedHealingItem,
  stats: Pick<DerivedPlayerStats, 'stimpakHealMagMult' | 'stimpakHealDurationMult'>,
): ResolvedHealing {
  const legs = item.legs.map((leg) => ({
    hpPerSec: leg.magnitudePctMaxHpPerSec * stats.stimpakHealMagMult,
    durationSec: leg.durationSec * stats.stimpakHealDurationMult,
  }));
  const totalHp = legs.reduce((sum, leg) => sum + leg.hpPerSec * leg.durationSec, 0);
  const peakHpsPerSec = legs.reduce((sum, leg) => sum + leg.hpPerSec, 0);
  const windowSec = legs.reduce((max, leg) => Math.max(max, leg.durationSec), 0);
  return { legs, totalHp, peakHpsPerSec, windowSec };
}
