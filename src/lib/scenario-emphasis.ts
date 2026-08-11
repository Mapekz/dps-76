import type { ScenarioSet } from '@/lib/engine/scenarios';
import type { ScenarioKey } from '@/state/build-reducer';

/**
 * Auto-emphasis rule: whichever scenario has the higher canonical DPS (VATS ←
 * AP-limited when throttled, `vats.ap?.apLimitedDps ?? vats.sustain.sustainedDps`;
 * Free Aim ← sustained, since it has no AP economy).
 */
export function pickEmphasizedScenario(scenarios: ScenarioSet): ScenarioKey {
  const vatsDps = scenarios.vats.ap?.apLimitedDps ?? scenarios.vats.sustain.sustainedDps;
  const freeAimDps = scenarios.freeAim.sustain.sustainedDps;
  return vatsDps >= freeAimDps ? 'vats' : 'freeAim';
}
