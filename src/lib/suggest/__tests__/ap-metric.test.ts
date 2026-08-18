import { describe, it, expect } from 'bun:test';
import {
  makeBuildReducer,
  createDefaultBuildState,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';
import { resolveLoadout } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';
import {
  evaluateSuggestions,
  snapshotOf,
  STRUCTURAL_GROUPS,
  topSuggestions,
} from '@/lib/suggest/evaluate';
import type { SuggestionGroup } from '@/lib/suggest/types';

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

describe('canonical ranking objective', () => {
  it('a VATS-only gain scores its blended share (delta.vats.sustainedDps / baseline.vats.sustainedDps)', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'vats');
    const vatsOnly = report.suggestions.find(
      (s) => s.delta.freeAim.sustainedDps === 0 && s.delta.vats.sustainedDps > 0,
    );
    expect(vatsOnly).toBeDefined();
    expect(vatsOnly!.primaryDeltaPct).toBeCloseTo(
      vatsOnly!.delta.vats.sustainedDps / report.baseline!.vats.sustainedDps,
      6,
    );
  });

  it('an AP-economy pick (Company Tea) still scores positive — anti-unblended-V guard (canonical blend contains uptime)', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'vats');
    const tea = report.suggestions.find((s) => s.id === 'consumable:CompanyTea_RSVP02');
    expect(tea).toBeDefined();
    expect(tea!.primaryDeltaPct).toBeGreaterThan(0);
  });

  it('primaryDeltaPct IS the canonical delta ratio for every suggestion — a row contradicting the headline is structurally impossible', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'vats');
    const metricBase = report.baseline!.vats.sustainedDps;
    for (const s of report.suggestions) {
      const expected = metricBase > 0 ? s.delta.vats.sustainedDps / metricBase : 0;
      expect(s.primaryDeltaPct).toBeCloseTo(expected, 6);
    }
  });

  it('metric: freeAim reports use sustainedDps as the ranking objective', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'freeAim');
    const metricBase = report.baseline!.freeAim.sustainedDps;
    for (const s of report.suggestions) {
      const expected = metricBase > 0 ? s.delta.freeAim.sustainedDps / metricBase : 0;
      expect(s.primaryDeltaPct).toBeCloseTo(expected, 6);
    }
  });

  it('Tesla Science 5 scores positive primaryDeltaPct while lowering VATS uptime — sustained up, uptime down', () => {
    // Exact shape that read ±0% under the window metric: magazine capacity
    // cuts reload downtime and therefore AP-regen time.
    const report = evaluateSuggestions(fixerState, 'live', 'vats');
    const tesla = report.suggestions.find(
      (s) => s.id === 'consumable:Magazine_TeslaScience05_Potion',
    );
    expect(tesla).toBeDefined();
    expect(tesla!.primaryDeltaPct).toBeGreaterThan(0);
    expect(tesla!.delta.vats.uptime).toBeLessThan(0);
  });

  it('a damage receiver that raises canonical DPS but lowers uptime survives topSuggestions ranked', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'vats');
    const candidate = report.suggestions.find(
      (s) => s.group === 'mod' && s.delta.vats.sustainedDps > 0 && s.delta.vats.uptime < 0,
    );
    expect(candidate).toBeDefined();
    const { ranked } = topSuggestions(report, 500);
    expect(ranked.some((s) => s.id === candidate!.id)).toBe(true);
  });

  it('topSuggestions uptime filter selects AP-economy levers, not pure damage mods', () => {
    // Presentation scope only — filter must never influence primaryDeltaPct.
    const report = evaluateSuggestions(fixerState, 'live', 'vats');
    const allGroups: ReadonlySet<SuggestionGroup> = new Set([...STRUCTURAL_GROUPS, 'consumable']);
    const { ranked } = topSuggestions(report, 50, undefined, {
      groups: allGroups,
      filter: (s) => s.delta.vats.uptime > 0,
    });
    const tea = ranked.find((s) => s.id === 'consumable:CompanyTea_RSVP02');
    expect(tea).toBeDefined();
    const pureDamage = report.suggestions.find(
      (s) => s.group === 'mod' && s.delta.vats.uptime <= 0 && s.delta.vats.sustainedDps > 0,
    );
    expect(pureDamage).toBeDefined();
    expect(ranked.some((s) => s.id === pureDamage!.id)).toBe(false);
  });
});
