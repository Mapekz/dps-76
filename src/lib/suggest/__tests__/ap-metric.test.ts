import { describe, it, expect } from 'bun:test';
import {
  makeBuildReducer,
  createDefaultBuildState,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';
import { resolveLoadout } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';
import { evaluateSuggestions, snapshotOf, topSuggestions } from '@/lib/suggest/evaluate';
import type { SuggestionReport, EvaluatedSuggestion, ScenarioHeadline } from '@/lib/suggest/types';

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

describe('VATS-Window DPS ranking objective', () => {
  it('vats.windowDps equals uptime × VATS sustained, and is below the canonical AP-limited DPS on a throttled build', () => {
    const input = resolveLoadout(fixerState.player, fixerState.enemy, 'live')!;
    const scenarios = computeScenarios(input);
    const snapshot = snapshotOf(scenarios);
    expect(snapshot.vats.windowDps).toBeCloseTo(
      scenarios.vats.ap!.uptime * scenarios.vats.sustain.sustainedDps,
      6,
    );
    expect(snapshot.vats.windowDps).toBeLessThan(scenarios.vats.ap!.apLimitedDps);
  });

  it('freeAim.windowDps equals freeAim.sustainedDps (no ap block, no window/canonical distinction)', () => {
    const input = resolveLoadout(fixerState.player, fixerState.enemy, 'live')!;
    const scenarios = computeScenarios(input);
    expect(scenarios.freeAim.ap).toBeUndefined();
    const snapshot = snapshotOf(scenarios);
    expect(snapshot.freeAim.windowDps).toBe(snapshot.freeAim.sustainedDps);
  });

  it('a VATS-only gain scores its full ΔV/V under the window metric, strictly higher than the old blended score would have given it', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'vats');
    const vatsOnly = report.suggestions.find(
      (s) => s.delta.freeAim.sustainedDps === 0 && s.delta.vats.windowDps > 0,
    );
    expect(vatsOnly).toBeDefined();
    expect(vatsOnly!.primaryDeltaPct).toBeCloseTo(
      vatsOnly!.delta.vats.windowDps / report.baseline!.vats.windowDps,
      6,
    );
    const oldBlendedScore =
      vatsOnly!.delta.vats.sustainedDps / report.baseline!.vats.sustainedDps;
    expect(vatsOnly!.primaryDeltaPct).toBeGreaterThan(oldBlendedScore);
  });

  it('an AP-economy pick (Company Tea) still scores positive under the window metric — rejecting unblended V was correct', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'vats');
    const tea = report.suggestions.find((s) => s.id === 'consumable:CompanyTea_RSVP02');
    expect(tea).toBeDefined();
    expect(tea!.primaryDeltaPct).toBeGreaterThan(0);
  });

  it('topSuggestions never shows a row that raises windowDps but lowers canonical sustainedDps (the guard against contradicting the headline)', () => {
    const zeroHeadline: ScenarioHeadline = {
      perHit: 0,
      burstDps: 0,
      sustainedDps: 0,
      windowDps: 0,
    };
    const baseline = { freeAim: zeroHeadline, vats: zeroHeadline };

    function syntheticSuggestion(
      id: string,
      primaryDeltaPct: number,
      vatsSustainedDelta: number,
      vatsWindowDelta: number,
    ): EvaluatedSuggestion {
      return {
        id,
        action: [],
        label: id,
        group: 'perk',
        budget: { legal: true },
        family: id,
        cost: 0,
        result: baseline,
        delta: {
          freeAim: zeroHeadline,
          vats: {
            ...zeroHeadline,
            sustainedDps: vatsSustainedDelta,
            windowDps: vatsWindowDelta,
          },
        },
        primaryDeltaPct,
      };
    }

    const fakeReport: SuggestionReport = {
      baseline,
      metric: 'vats',
      suggestions: [
        syntheticSuggestion('bad', 0.05, -1, 5),
        syntheticSuggestion('good', 0.03, 2, 3),
      ],
    };

    const result = topSuggestions(fakeReport, 10);
    const shown = [...result.ranked, ...result.tied];
    expect(shown.some((s) => s.id === 'good')).toBe(true);
    expect(shown.some((s) => s.id === 'bad')).toBe(false);
  });

  it('metric: freeAim reports are unaffected by the windowDps change', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'freeAim');
    const metricBase = report.baseline!.freeAim.sustainedDps;
    for (const s of report.suggestions) {
      const expected = metricBase > 0 ? s.delta.freeAim.sustainedDps / metricBase : 0;
      expect(s.primaryDeltaPct).toBeCloseTo(expected, 6);
    }
  });
});
