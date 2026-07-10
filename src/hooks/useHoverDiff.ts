import * as React from 'react';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild } from '@/state/BuildProvider';
import { resolveLoadout } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';
import { evaluateAction, snapshotOf } from '@/lib/suggest/evaluate';
import type { DpsSnapshot } from '@/lib/suggest/types';
import type { BuildAction } from '@/state/build-reducer';

/**
 * Speculative what-if evals for the current build, with a cache keyed by the
 * action and cleared whenever the committed state changes. Evals are ~5µs
 * (benched), so this is synchronous — no worker/Promise indirection needed at
 * current engine cost.
 */
export function useHoverDiffs(): {
  baseline: DpsSnapshot | null;
  getDiff: (action: BuildAction) => DpsSnapshot | null;
} {
  const { mode } = useGameMode();
  const state = useBuild();

  return React.useMemo(() => {
    const cache = new Map<string, DpsSnapshot | null>();
    const input = resolveLoadout(state.player, state.enemy, mode);
    const baseline = input ? snapshotOf(computeScenarios(input)) : null;

    const getDiff = (action: BuildAction): DpsSnapshot | null => {
      if (!baseline) return null;
      const key = JSON.stringify(action);
      let hit = cache.get(key);
      if (hit === undefined) {
        const evaluated = evaluateAction(state, mode, action, baseline);
        hit = evaluated ? evaluated.delta : null;
        cache.set(key, hit);
      }
      return hit;
    };

    return { baseline, getDiff };
  }, [state, mode]);
}
