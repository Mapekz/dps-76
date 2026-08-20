import { describe, expect, it } from 'bun:test';
import type { ScenarioResult, ScenarioSet } from '@/lib/engine/scenarios';
import { pickEmphasizedScenario } from '@/lib/scenario-emphasis';

function stubScenario(totalDps: number): ScenarioResult {
  return {
    perHit: {} as ScenarioResult['perHit'],
    burstDps: totalDps,
    sustain: { sustainedDps: totalDps } as ScenarioResult['sustain'],
    hitRatePct: 100,
    fireRate: 1,
    fireRateApproximate: true,
    dotDps: 0,
    procDps: 0,
    totalDps,
  };
}

function stubSet(
  vats: { totalDps: number; apLimitedTotalDps?: number },
  freeAim: { totalDps: number },
): ScenarioSet {
  const vatsScenario = stubScenario(vats.totalDps);
  if (vats.apLimitedTotalDps !== undefined) {
    vatsScenario.ap = { apLimitedTotalDps: vats.apLimitedTotalDps } as NonNullable<
      ScenarioResult['ap']
    >;
  }
  return {
    freeAim: stubScenario(freeAim.totalDps),
    vats: vatsScenario,
    onslaughtMaxStacks: 0,
    onslaughtReverse: false,
    onslaughtEffectiveStacks: 0,
    bulletStormMaxStacks: 0,
    bulletStormMinStacks: 0,
    bulletStormEffectiveStacks: 0,
  };
}

describe('pickEmphasizedScenario', () => {
  it('emphasizes VATS when its canonical DPS is higher', () => {
    expect(
      pickEmphasizedScenario(stubSet({ totalDps: 120, apLimitedTotalDps: 110 }, { totalDps: 90 })),
    ).toBe('vats');
  });

  it('emphasizes Free Aim when its canonical DPS is higher', () => {
    expect(
      pickEmphasizedScenario(stubSet({ totalDps: 120, apLimitedTotalDps: 80 }, { totalDps: 95 })),
    ).toBe('freeAim');
  });

  it('uses AP-limited VATS DPS when throttled, not the unthrottled totalDps', () => {
    // Canonical VATS = 40 (AP-limited), not 100 (raw total) — Free Aim at 50 wins.
    expect(
      pickEmphasizedScenario(stubSet({ totalDps: 100, apLimitedTotalDps: 40 }, { totalDps: 50 })),
    ).toBe('freeAim');
  });

  it('falls back to VATS totalDps when no AP economy is present', () => {
    expect(pickEmphasizedScenario(stubSet({ totalDps: 85 }, { totalDps: 70 }))).toBe('vats');
  });

  it('breaks ties in favor of VATS', () => {
    expect(
      pickEmphasizedScenario(stubSet({ totalDps: 75, apLimitedTotalDps: 60 }, { totalDps: 60 })),
    ).toBe('vats');
  });
});
