import { describe, it, expect } from 'bun:test';
import type { AuraSource } from '@/types/auras';
import { collectAuraStreams, computeAuraDps } from '@/lib/engine/aura-damage';
import { computeScenarios } from '@/lib/engine/scenarios';
import { makeWeapon, makeCtx, scenarioInput } from '@/lib/engine/__tests__/engine-fixture';

function makeAura(overrides: Partial<AuraSource> = {}): AuraSource {
  return {
    id: 'test-aura',
    source: { kind: 'omod', formId: '0x0', edid: 'TestAura', name: 'Test Aura' },
    damageType: 'radiation',
    magnitudePerTick: 100,
    tickSec: 1,
    conditions: [],
    ...overrides,
  };
}

describe('computeAuraDps (ADR-0023)', () => {
  const weapon = makeWeapon();
  const ctx = makeCtx(weapon);

  it('magnitudePerTick / tickSec at steady state', () => {
    expect(computeAuraDps([makeAura({ magnitudePerTick: 100, tickSec: 1 })], 50, ctx)).toBe(100);
    expect(computeAuraDps([makeAura({ magnitudePerTick: 20, tickSec: 2 })], 50, ctx)).toBe(10);
  });

  it('magnitudePending contributes 0 DPS', () => {
    expect(
      computeAuraDps([makeAura({ magnitudePending: true, magnitudePerTick: undefined })], 50, ctx),
    ).toBe(0);
  });

  it('curve Y × curveScale only (Tesla Coils: flat ×5 = 5/tick, not 20×5)', () => {
    const aura = makeAura({
      damageType: 'energy',
      magnitudePerTick: undefined,
      tickSec: 1,
      curve: {
        input: 'itemLevel',
        points: [
          { x: 1, y: 5 },
          { x: 50, y: 5 },
        ],
      },
    });
    expect(computeAuraDps([aura], 50, ctx)).toBe(5);
  });
});

describe('collectAuraStreams unresolved gates', () => {
  const weapon = makeWeapon();
  const ctx = makeCtx(weapon);

  it('keeps unresolved-gated auras as inert streams (0 DPS), not silent drops', () => {
    const streams = collectAuraStreams(
      [
        makeAura({
          damageType: 'poison',
          magnitudePerTick: 5,
          conditions: [
            { kind: 'unresolved', raw: 'GetNumActiveSpellsWithKeyword(SURV_Icon_Disease)=1' },
          ],
        }),
      ],
      50,
      ctx,
    );
    expect(streams).toHaveLength(1);
    expect(streams[0]).toMatchObject({ dps: 0, inert: true, damageType: 'poison' });
  });

  it('computes DPS when every gate resolves', () => {
    const streams = collectAuraStreams(
      [makeAura({ magnitudePerTick: 5, conditions: [{ kind: 'strangeInNumbers', value: false }] })],
      50,
      ctx,
    );
    expect(streams).toHaveLength(1);
    expect(streams[0].dps).toBe(5);
    expect(streams[0].inert).toBeUndefined();
  });
});

describe('computeScenarios: auraDps parallel stream', () => {
  const weapon = makeWeapon();

  it('surfaces auraDps without moving perHit/burstDps/sustain', () => {
    const withAura = computeScenarios(
      scenarioInput(weapon, { auras: [makeAura({ magnitudePerTick: 50, tickSec: 1 })] }),
    );
    const withoutAura = computeScenarios(scenarioInput(weapon, { auras: [] }));

    expect(withAura.freeAim.auraDps).toBe(50);
    expect(withoutAura.freeAim.auraDps).toBe(0);
    expect(withAura.freeAim.perHit.total).toBe(withoutAura.freeAim.perHit.total);
    expect(withAura.freeAim.sustain.sustainedDps).toBe(withoutAura.freeAim.sustain.sustainedDps);
    expect(withAura.freeAim.totalDps).toBe(
      withAura.freeAim.sustain.sustainedDps + withAura.freeAim.auraDps,
    );
  });

  it('sets auraMagnitudePending when a source has pending magnitude', () => {
    const s = computeScenarios(
      scenarioInput(weapon, { auras: [makeAura({ magnitudePending: true })] }),
    );
    expect(s.freeAim.auraMagnitudePending).toBe(true);
    expect(s.freeAim.auraDps).toBe(0);
  });
});
