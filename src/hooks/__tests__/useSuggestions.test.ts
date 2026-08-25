import { describe, it, expect } from 'bun:test';
import { isReportStale, type Inputs, type HeldResult } from '@/hooks/useSuggestions';
import { createDefaultPlayerConfig, createDefaultEnemyConfig } from '@/types';
import type { SuggestionReport } from '@/lib/suggest/types';

/**
 * `isReportStale` is the render-time derivation that replaced a
 * setState-in-effect `stale` flag (the `react/set-state-in-effect` bailout fixed
 * in b43cc64). Its whole contract is *reference* identity, not deep equality —
 * these tests exist to stop someone "fixing" it into a deep compare, which would
 * silently stop the panel dimming for any edit that preserves shape.
 *
 * The one-frame-earlier dim that the rewrite also introduced is a rendering
 * timing property, not a property of this function, and stays manually verified
 * — this repo has no DOM/component test infrastructure by design (see CLAUDE.md's
 * Testing section, and dps-76#86 for why that tradeoff was accepted).
 */

// The report is opaque to `isReportStale` — it only ever compares the 4 inputs.
const REPORT = {} as SuggestionReport;

function inputs(overrides: Partial<Inputs> = {}): Inputs {
  return {
    player: createDefaultPlayerConfig(),
    enemy: createDefaultEnemyConfig(),
    mode: 'live',
    metric: 'vats',
    ...overrides,
  };
}

function held(from: Inputs): HeldResult {
  return { report: REPORT, ...from };
}

describe('isReportStale', () => {
  it('is stale when no report is held yet', () => {
    expect(isReportStale(null, inputs())).toBe(true);
  });

  it('is not stale when every input is reference-identical', () => {
    const current = inputs();
    expect(isReportStale(held(current), current)).toBe(false);
  });

  it.each([
    ['player', () => ({ player: createDefaultPlayerConfig() })],
    ['enemy', () => ({ enemy: createDefaultEnemyConfig() })],
    ['mode', () => ({ mode: 'pts' as const })],
    ['metric', () => ({ metric: 'freeAim' as const })],
  ])('is stale when %s alone differs', (_name, change) => {
    const current = inputs();
    expect(isReportStale(held(current), { ...current, ...change() })).toBe(true);
  });

  it('is stale for a structurally-equal but newly-allocated player slice', () => {
    // The load-bearing case: the reducer only allocates a new slice when
    // something actually changed, so a fresh-but-equal object must read as
    // stale. A deep-equality implementation would wrongly return false here.
    const current = inputs();
    const rebuilt = { ...current, player: { ...current.player } };
    expect(rebuilt.player).toEqual(current.player);
    expect(isReportStale(held(current), rebuilt)).toBe(true);
  });

  it('ignores the report itself — only the four inputs decide', () => {
    const current = inputs();
    const other = { report: {} as SuggestionReport, ...current };
    expect(isReportStale(other, current)).toBe(false);
  });
});
