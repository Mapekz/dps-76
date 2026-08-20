import type { ScenarioSet } from '@/lib/engine/scenarios';
import type { ScenarioKey } from '@/state/build-reducer';

/**
 * Auto-emphasis rule: whichever scenario has the higher canonical DPS (VATS ←
 * AP-limited `totalDps` when throttled, `vats.ap?.apLimitedTotalDps ??
 * vats.totalDps`; Free Aim ← `totalDps`, since it has no AP economy).
 */
export function pickEmphasizedScenario(scenarios: ScenarioSet): ScenarioKey {
  const vatsDps = scenarios.vats.ap?.apLimitedTotalDps ?? scenarios.vats.totalDps;
  const freeAimDps = scenarios.freeAim.totalDps;
  return vatsDps >= freeAimDps ? 'vats' : 'freeAim';
}
