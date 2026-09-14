import { describe, expect, it } from 'bun:test';
import { fixerCenterMasochistState, fixerOnlyState } from '@/state/__tests__/build-state-fixture';
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
import type { EvaluatedSuggestion, SuggestionGroup } from '@/lib/suggest/types';
import { createMemoScope } from '@/lib/loadout-memo';

const fixerState = fixerOnlyState();

describe('two-tier scope: STRUCTURAL_GROUPS excludes consumables', () => {
  it('contains the structural groups and omits consumables', () => {
    const expected: SuggestionGroup[] = ['mod', 'legendary', 'perk', 'mutation', 'armor', 'combo'];
    expect([...STRUCTURAL_GROUPS].sort()).toEqual(expected.sort());
    expect(STRUCTURAL_GROUPS.has('consumable')).toBe(false);
  });

  it('defaults topSuggestions to structural groups only, while an explicit consumable scope selects consumables', () => {
    const report = evaluateSuggestions(fixerState, 'live', 'vats');

    const { ranked, tied } = topSuggestions(report, 50);
    const structural = [...ranked, ...tied];
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
    const state = fixerCenterMasochistState();
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
      const metricBase = baseline.vats.totalDps;
      const primaryDeltaPct = metricBase > 0 ? result!.delta.vats.totalDps / metricBase : 0;
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
          s.delta.vats.uptime === 0 &&
          s.delta.freeAim.uptime === 0 &&
          s.delta.vats.totalDps === 0 &&
          s.delta.freeAim.totalDps === 0
        ),
    );
    expect(changing.length).toBeGreaterThan(0);
  });
});
