import { useGameMode } from '@/hooks/useGameMode';
import { useDamageCalc } from '@/hooks/useDamageCalc';
import { useBuild } from '@/state/BuildProvider';
import type { ScenarioSet } from '@/lib/engine/scenarios';
import type { ScenarioKey } from '@/state/build-reducer';

export interface ScenarioResults {
  scenarios: ScenarioSet | null;
  /** The emphasized card — suggestions metric + condensed-bar lead. User pick, else higher sustained DPS. */
  emphasized: ScenarioKey;
}

export function useScenarioResults(): ScenarioResults {
  const { mode } = useGameMode();
  const state = useBuild();
  const { scenarios } = useDamageCalc(state.player, state.enemy, mode);

  const auto: ScenarioKey =
    scenarios && scenarios.vats.sustain.sustainedDps >= scenarios.freeAim.sustain.sustainedDps ? 'vats' : 'freeAim';

  return { scenarios, emphasized: state.view.emphasized ?? auto };
}
