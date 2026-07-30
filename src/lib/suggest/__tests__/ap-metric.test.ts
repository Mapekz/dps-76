import { describe, it, expect } from 'bun:test';
import {
  makeBuildReducer,
  createDefaultBuildState,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';
import { resolveLoadout } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';
import { evaluateSuggestions, snapshotOf } from '@/lib/suggest/evaluate';

/**
 * Canonical-metric contract: VATS suggestion/emphasis deltas must reward
 * AP-economy picks, not just raw sustained DPS (docs/agents plan "Canonical
 * metric" — sustainedDps in the snapshot is `ap?.apLimitedDps ?? sustain.sustainedDps`).
 *
 * The Fixer at the default build's AGI 1 (createDefaultBuildState seeds every
 * SPECIAL to 1) is real ESM-throttled VATS AP economy — no synthetic weapon
 * needed: maxAp = 60 + 10×1 = 70, well below what 16 AP/shot sustained VATS
 * fire drains, so `vats.ap.uptime` is under 1 out of the box (confirmed
 * empirically below, not hand-derived, since the effective per-shot AP cost
 * includes fold-ins beyond the raw WEAP value).
 */

const buildReducer = makeBuildReducer('live');

function stateFrom(
  actions: BuildAction[],
  from: BuildState = createDefaultBuildState(),
): BuildState {
  return actions.reduce(buildReducer, from);
}

const fixerState = stateFrom([{ type: 'weapon/select', weaponId: 'CombatRifle_Fixer' }]);

describe('canonical VATS metric (AP-limited when throttled)', () => {
  it('the default-AGI Fixer build is AP-throttled in VATS (sanity check for the rest of this file)', () => {
    const input = resolveLoadout(fixerState.player, fixerState.enemy, 'live')!;
    const scenarios = computeScenarios(input);
    expect(scenarios.vats.ap).toBeDefined();
    expect(scenarios.vats.ap!.uptime).toBeLessThan(1);
    expect(scenarios.vats.ap!.apLimitedDps).toBeLessThan(scenarios.vats.sustain.sustainedDps);
  });

  it('snapshotOf captures ap.apLimitedDps for VATS when throttled, and raw sustained for Free Aim (no ap economy)', () => {
    const input = resolveLoadout(fixerState.player, fixerState.enemy, 'live')!;
    const scenarios = computeScenarios(input);
    const snapshot = snapshotOf(scenarios);
    expect(snapshot.vats.sustainedDps).toBe(scenarios.vats.ap!.apLimitedDps);
    expect(snapshot.freeAim.sustainedDps).toBe(scenarios.freeAim.sustain.sustainedDps);
  });

  it('an apRegen-boosting consumable outranks a genuine no-op once the VATS metric is AP-limited', () => {
    // Company Tea: apRegenFlat +10 (src/data/live/generated/consumables.json,
    // CompanyTea_RSVP02) — moves ap.apLimitedDps but never touches raw
    // sustain.sustainedDps, so it was invisible to the pre-fix metric.
    // Carnivore: 0 modifiers in generated data — a true no-op for every
    // scenario field, the control for "ranks above a no-op".
    const report = evaluateSuggestions(fixerState, 'live', 'vats');
    const tea = report.suggestions.find((s) => s.id === 'consumable:CompanyTea_RSVP02');
    const carnivore = report.suggestions.find((s) => s.id === 'mutation:Mutation_Carnivore');
    expect(tea).toBeDefined();
    expect(carnivore).toBeDefined();

    expect(carnivore!.primaryDeltaPct).toBe(0);
    expect(tea!.primaryDeltaPct).toBeGreaterThan(0);

    const teaRank = report.suggestions.findIndex((s) => s.id === tea!.id);
    const carnivoreRank = report.suggestions.findIndex((s) => s.id === carnivore!.id);
    expect(teaRank).toBeLessThan(carnivoreRank);
  });
});
