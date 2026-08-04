import * as React from 'react';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild } from '@/state/BuildProvider';
import { resolveLoadout } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';
import { evaluateActions, snapshotOf } from '@/lib/suggest/evaluate';
import type { DpsSnapshot } from '@/lib/suggest/types';
import type { BuildAction, BuildState } from '@/state/build-reducer';
import type { GameMode } from '@/types';

/**
 * Speculative what-if evals for the current build, with a cache keyed by the
 * action (or action sequence) and cleared whenever the committed state
 * changes. Evals are ~5µs (benched), so this is synchronous — no
 * worker/Promise indirection needed at current engine cost.
 *
 * The baseline + cache are shared at module scope, keyed by the
 * `(BuildState, GameMode)` pair via a `WeakMap`-of-`Map` — every
 * `useHoverDiffs()` call for the SAME build+mode reuses the same baseline
 * computation and the same action cache, rather than each mounted
 * `<ActionDelta>` (there can be dozens in one combobox's option list) paying
 * for its own `resolveLoadout`/`computeScenarios` and keeping its own Map.
 * `state` changing (a new object, since the reducer is immutable) naturally
 * invalidates — the WeakMap entry for the old object is simply never looked
 * up again and gets collected.
 */
const sharedCache = new WeakMap<
  BuildState,
  Map<GameMode, { baseline: DpsSnapshot | null; cache: Map<string, DpsSnapshot | null> }>
>();

function getSharedEntry(state: BuildState, mode: GameMode) {
  let byMode = sharedCache.get(state);
  if (!byMode) {
    byMode = new Map();
    sharedCache.set(state, byMode);
  }
  let entry = byMode.get(mode);
  if (!entry) {
    const input = resolveLoadout(state.player, state.enemy, mode);
    const baseline = input ? snapshotOf(computeScenarios(input)) : null;
    entry = { baseline, cache: new Map() };
    byMode.set(mode, entry);
  }
  return entry;
}

export function useHoverDiffs(): {
  baseline: DpsSnapshot | null;
  getDiff: (action: BuildAction | readonly BuildAction[]) => DpsSnapshot | null;
} {
  const { mode } = useGameMode();
  const state = useBuild();

  return React.useMemo(() => {
    const { baseline, cache } = getSharedEntry(state, mode);

    const getDiff = (action: BuildAction | readonly BuildAction[]): DpsSnapshot | null => {
      if (!baseline) return null;
      const actions = Array.isArray(action) ? action : [action];
      const key = JSON.stringify(actions);
      let hit = cache.get(key);
      if (hit === undefined) {
        const evaluated = evaluateActions(state, mode, actions, baseline);
        hit = evaluated ? evaluated.delta : null;
        cache.set(key, hit);
      }
      return hit;
    };

    return { baseline, getDiff };
  }, [state, mode]);
}
