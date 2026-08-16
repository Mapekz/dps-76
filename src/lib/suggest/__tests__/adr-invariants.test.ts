import { describe, expect, it } from 'bun:test';
import {
  makeBuildReducer,
  createDefaultBuildState,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';
import { PerkId } from '@/data/perk-ids';
import {
  collapseSuggestionFamilies,
  evaluateActions,
  evaluateSuggestions,
  STRUCTURAL_GROUPS,
  topSuggestions,
  comboCharts,
  COMBO_GATE_POLICY,
} from '@/lib/suggest/evaluate';
import { enumerateVariants } from '@/lib/suggest/variants';
import type {
  DpsSnapshot,
  EvaluatedSuggestion,
  ScenarioHeadline,
  SuggestionGroup,
  SuggestionReport,
} from '@/lib/suggest/types';
import { createMemoScope } from '@/lib/loadout-memo';

const buildReducer = makeBuildReducer('live');

function stateFrom(
  actions: BuildAction[],
  from: BuildState = createDefaultBuildState(),
): BuildState {
  return actions.reduce(buildReducer, from);
}

const fixerState = stateFrom([{ type: 'weapon/select', weaponId: 'CombatRifle_Fixer' }]);

describe('ADR 0007: suggestions rank on windowDps, not sustainedDps', () => {
  it('orders candidates by vats windowDps delta when that differs from sustainedDps ordering', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'vats');
    const apEconomy = report.suggestions.find((s) => s.id === 'consumable:CompanyTea_RSVP02');
    const rawDamage = report.suggestions.find((s) => s.id === 'perk-add:CenterMasochist:3:alloc');
    expect(apEconomy).toBeDefined();
    expect(rawDamage).toBeDefined();

    const teaWindow = apEconomy!.delta.vats.windowDps;
    const teaSustained = apEconomy!.delta.vats.sustainedDps;
    const masoWindow = rawDamage!.delta.vats.windowDps;
    const masoSustained = rawDamage!.delta.vats.sustainedDps;

    expect(teaWindow).toBeGreaterThan(masoWindow);
    expect(teaSustained).toBeLessThan(masoSustained);

    const teaRank = report.suggestions.indexOf(apEconomy!);
    const masoRank = report.suggestions.indexOf(rawDamage!);
    expect(teaRank).toBeLessThan(masoRank);
    expect(apEconomy!.primaryDeltaPct).toBeGreaterThan(rawDamage!.primaryDeltaPct);
  });
});

describe('ADR 0007: canonical-delta guard rejects windowDps-up/sustained-down candidates', () => {
  it('filters suggestions whose delta[metric].sustainedDps is not positive', () => {
    const zeroHeadline: ScenarioHeadline = {
      perHit: 0,
      burstDps: 0,
      sustainedDps: 0,
      windowDps: 0,
    };
    const baseline: DpsSnapshot = { freeAim: zeroHeadline, vats: zeroHeadline };

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
        syntheticSuggestion('window-up-sustained-down', 0.05, -1, 5),
        syntheticSuggestion('both-up', 0.03, 2, 3),
      ],
    };

    const shown = [
      ...topSuggestions(fakeReport, 10).ranked,
      ...topSuggestions(fakeReport, 10).tied,
    ];
    expect(shown.some((s) => s.id === 'both-up')).toBe(true);
    expect(shown.some((s) => s.id === 'window-up-sustained-down')).toBe(false);
  });
});

describe('family collapse emits at most 2 rows per family (next positive + best)', () => {
  const headline: ScenarioHeadline = { perHit: 0, burstDps: 0, sustainedDps: 0, windowDps: 0 };
  const snapshot: DpsSnapshot = { freeAim: headline, vats: headline };

  function fixture(
    id: string,
    family: string,
    cost: number,
    primaryDeltaPct: number,
  ): EvaluatedSuggestion {
    return {
      id,
      action: [],
      label: id,
      group: 'perk',
      family,
      cost,
      result: snapshot,
      delta: snapshot,
      primaryDeltaPct,
    };
  }

  it('keeps the cheapest positive step and the best when they differ in a 4-member family', () => {
    const members = [
      fixture('fam:0', 'fam', 0, -0.05),
      fixture('fam:1', 'fam', 1, 0.05),
      fixture('fam:2', 'fam', 2, 0.12),
      fixture('fam:3', 'fam', 3, 0.2),
    ];
    const result = collapseSuggestionFamilies(members);
    expect(result.map((r) => r.id)).toEqual(['fam:1', 'fam:3']);
  });

  it('collapses a family with no positive member to a single best row', () => {
    const members = [
      fixture('neg:0', 'neg', 0, -0.2),
      fixture('neg:1', 'neg', 1, -0.05),
      fixture('neg:2', 'neg', 2, -0.1),
    ];
    const result = collapseSuggestionFamilies(members);
    expect(result.map((r) => r.id)).toEqual(['neg:1']);
  });

  it('passes size-1 families through untouched', () => {
    const members = [fixture('solo:0', 'solo', 0, 0.08)];
    expect(collapseSuggestionFamilies(members)).toEqual(members);
  });
});

describe('two-tier scope: STRUCTURAL_GROUPS excludes consumables', () => {
  it('contains the structural groups and omits consumables', () => {
    const expected: SuggestionGroup[] = ['mod', 'legendary', 'perk', 'mutation', 'armor', 'combo'];
    expect([...STRUCTURAL_GROUPS].sort()).toEqual(expected.sort());
    expect(STRUCTURAL_GROUPS.has('consumable')).toBe(false);
  });

  it('defaults topSuggestions to structural groups only, while an explicit consumable scope selects consumables', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'vats');

    const structural = [...topSuggestions(report, 50).ranked, ...topSuggestions(report, 50).tied];
    expect(structural.every((s) => s.group !== 'consumable')).toBe(true);

    const consumableOnly = topSuggestions(report, 50, 0.01, {
      groups: new Set(['consumable']),
    });
    const consumables = [...consumableOnly.ranked, ...consumableOnly.tied];
    expect(consumables.length).toBeGreaterThan(0);
    expect(consumables.every((s) => s.group === 'consumable')).toBe(true);
  });
});

describe('ADR 0011: the sweep evaluates every candidate (no pruning)', () => {
  it('evaluates every enumerated candidate with real deltas — no placeholder skip path', () => {
    const state = stateFrom([
      { type: 'weapon/select', weaponId: 'CombatRifle_Fixer' },
      { type: 'perk/add', perkId: PerkId.CenterMasochist, rank: 1, legendary: false },
    ]);
    const report = evaluateSuggestions(state, 'live', 'vats');
    expect(report.baseline).not.toBeNull();

    for (const s of report.suggestions) {
      expect(s.delta).toBeDefined();
      expect(s.result).toBeDefined();
      expect(Number.isFinite(s.primaryDeltaPct)).toBe(true);
    }

    const scope = createMemoScope();
    const baseline = report.baseline!;
    const evaluated: EvaluatedSuggestion[] = [];
    for (const candidate of enumerateVariants(state, 'live', 'vats')) {
      const result = evaluateActions(state, 'live', candidate.action, baseline, scope);
      expect(result).not.toBeNull();
      const metricBase = baseline.vats.windowDps;
      const primaryDeltaPct = metricBase > 0 ? result!.delta.vats.windowDps / metricBase : 0;
      evaluated.push({ ...candidate, ...result!, primaryDeltaPct });
    }

    const bestByPiece = new Map<string, number>();
    for (const s of evaluated) {
      if (s.group === 'combo') continue;
      if (s.group === 'perk') {
        const max = bestByPiece.get(s.family) ?? 0;
        bestByPiece.set(s.family, Math.max(max, s.primaryDeltaPct));
      } else if (s.group === 'legendary') {
        const secondColon = s.id.indexOf(':', s.id.indexOf(':') + 1);
        if (secondColon > 0) {
          const pieceKey = 'omod:' + s.id.substring(secondColon + 1);
          const max = bestByPiece.get(pieceKey) ?? 0;
          bestByPiece.set(pieceKey, Math.max(max, s.primaryDeltaPct));
        }
      }
    }

    const filtered = evaluated.filter((s) => {
      if (s.group !== 'combo') return true;
      const bestConstituent = Math.max(...s.comboPieces!.map((key) => bestByPiece.get(key) ?? 0));
      return comboCharts(s.primaryDeltaPct, bestConstituent, COMBO_GATE_POLICY);
    });

    const collapsed = collapseSuggestionFamilies(filtered);
    expect(report.suggestions.length).toBe(collapsed.length);

    const changing = report.suggestions.filter(
      (s) =>
        !(
          s.delta.vats.windowDps === 0 &&
          s.delta.freeAim.windowDps === 0 &&
          s.delta.vats.sustainedDps === 0 &&
          s.delta.freeAim.sustainedDps === 0
        ),
    );
    expect(changing.length).toBeGreaterThan(0);
  });
});
