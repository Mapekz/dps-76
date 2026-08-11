import * as React from 'react';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild } from '@/state/BuildProvider';
import { resolveLoadout } from '@/lib/loadout';
import { describeAffordances, type BuildAffordances } from '@/lib/engine/affordances';
import { computeScenarios, type ScenarioSet } from '@/lib/engine/scenarios';
import { pickEmphasizedScenario } from '@/lib/scenario-emphasis';
import type { ScenarioKey } from '@/state/build-reducer';

export interface ScenarioResults {
  scenarios: ScenarioSet | null;
  affordances: BuildAffordances | null;
  /**
   * The emphasized card — suggestions metric + condensed-bar lead. User
   * pick, else whichever scenario has the higher canonical DPS (VATS ←
   * AP-limited when throttled, `vats.ap?.apLimitedDps ?? vats.sustain.sustainedDps`;
   * Free Aim ← sustained, since it has no AP economy).
   */
  emphasized: ScenarioKey;
}

/**
 * Computes damage via the paper-damage engine (src/lib/engine/) for the
 * committed build, and picks which scenario card is emphasized. Assembly of
 * the effective weapon + modifier list lives in `resolveLoadout`
 * (src/lib/loadout.ts) so it has a testable home outside React — this hook
 * just memoizes the call, adds the trace-collection flag the DISPLAYED
 * result needs (speculative evals in useHoverDiffs/useSuggestions go through
 * suggest/evaluate.ts instead, without traces), and derives the auto-emphasis
 * pick. Memoized on `state.player`/`state.enemy` specifically (not the whole
 * `state`) so a `view/set`- or `buildName`-only change doesn't recompute.
 */
export function useScenarioResults(): ScenarioResults {
  const { mode } = useGameMode();
  const state = useBuild();

  const { scenarios, affordances } = React.useMemo(() => {
    const input = resolveLoadout(state.player, state.enemy, mode);
    if (!input) return { scenarios: null, affordances: null };
    return {
      scenarios: computeScenarios({ ...input, collectTrace: true }),
      affordances: describeAffordances(input),
    };
  }, [state.player, state.enemy, mode]);

  const auto: ScenarioKey = scenarios ? pickEmphasizedScenario(scenarios) : 'freeAim';

  return { scenarios, affordances, emphasized: state.view.emphasized ?? auto };
}
