import { describe, expect, it } from 'bun:test';
import type { ScenarioResult, ScenarioSet } from '@/lib/engine/scenarios';
import { pickEmphasizedScenario } from '@/lib/scenario-emphasis';

function stubScenario(sustainedDps: number): ScenarioResult {
  return {
    perHit: {} as ScenarioResult['perHit'],
    burstDps: sustainedDps,
    sustain: { sustainedDps } as ScenarioResult['sustain'],
    hitRatePct: 100,
    fireRate: 1,
    fireRateApproximate: true,
    dotDps: 0,
  };
}

function stubSet(
  vats: { sustainedDps: number; apLimitedDps?: number },
  freeAim: { sustainedDps: number },
): ScenarioSet {
  const vatsScenario = stubScenario(vats.sustainedDps);
  if (vats.apLimitedDps !== undefined) {
    vatsScenario.ap = { apLimitedDps: vats.apLimitedDps } as NonNullable<ScenarioResult['ap']>;
  }
  return {
    freeAim: stubScenario(freeAim.sustainedDps),
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
      pickEmphasizedScenario(
        stubSet({ sustainedDps: 120, apLimitedDps: 110 }, { sustainedDps: 90 }),
      ),
    ).toBe('vats');
  });

  it('emphasizes Free Aim when its sustained DPS is higher', () => {
    expect(
      pickEmphasizedScenario(
        stubSet({ sustainedDps: 120, apLimitedDps: 80 }, { sustainedDps: 95 }),
      ),
    ).toBe('freeAim');
  });

  it('uses AP-limited VATS DPS when throttled, not the unthrottled sustain rate', () => {
    // Canonical VATS = 40 (AP-limited), not 100 (sustain) — Free Aim at 50 wins.
    expect(
      pickEmphasizedScenario(
        stubSet({ sustainedDps: 100, apLimitedDps: 40 }, { sustainedDps: 50 }),
      ),
    ).toBe('freeAim');
  });

  it('falls back to VATS sustain when no AP economy is present', () => {
    expect(pickEmphasizedScenario(stubSet({ sustainedDps: 85 }, { sustainedDps: 70 }))).toBe(
      'vats',
    );
  });

  it('breaks ties in favor of VATS', () => {
    expect(
      pickEmphasizedScenario(stubSet({ sustainedDps: 75, apLimitedDps: 60 }, { sustainedDps: 60 })),
    ).toBe('vats');
  });
});
