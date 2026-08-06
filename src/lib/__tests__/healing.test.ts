import { describe, it, expect } from 'bun:test';
import { resolveStimpakHealing } from '@/lib/healing';
import type { GeneratedHealingItem } from '@/types/generated';

function healingItem(
  legs: GeneratedHealingItem['legs'],
  overrides: Partial<GeneratedHealingItem> = {},
): GeneratedHealingItem {
  return {
    id: 'TestHealing',
    formId: '0xTEST',
    name: 'Test Healing',
    legs,
    keywords: [],
    notes: [],
    ...overrides,
  };
}

const plainStimpak = healingItem([
  { magnitudePctMaxHpPerSec: 2, durationSec: 20 },
  { magnitudePctMaxHpPerSec: 10, durationSec: 2 },
]);

const baseStats = { stimpakHealMagMult: 1, stimpakHealDurationMult: 1 };

describe('resolveStimpakHealing', () => {
  it('plain Stimpak with no multipliers (worked example)', () => {
    const result = resolveStimpakHealing(plainStimpak, baseStats);
    expect(result.totalHp).toBe(60);
    expect(result.windowSec).toBe(20);
    expect(result.peakHpsPerSec).toBe(12);
  });

  it('Field Surgeon multipliers are rate-buff net-neutral on total HP', () => {
    const result = resolveStimpakHealing(plainStimpak, {
      stimpakHealMagMult: 1.67,
      stimpakHealDurationMult: 0.6,
    });
    expect(result.totalHp).toBeCloseTo(60, 0);
    expect(result.peakHpsPerSec).toBeGreaterThan(12);
    expect(result.windowSec).toBeLessThan(20);
  });

  it('empty legs (Stimpak Diffuser shape) returns all-zero without throwing', () => {
    const result = resolveStimpakHealing(healingItem([]), baseStats);
    expect(result).toEqual({
      legs: [],
      totalHp: 0,
      peakHpsPerSec: 0,
      windowSec: 0,
    });
  });

  it('single-leg item (Healing Salve shape) with no multipliers', () => {
    const result = resolveStimpakHealing(
      healingItem([{ magnitudePctMaxHpPerSec: 4, durationSec: 5 }]),
      baseStats,
    );
    expect(result.totalHp).toBe(20);
    expect(result.windowSec).toBe(5);
    expect(result.peakHpsPerSec).toBe(4);
  });
});
