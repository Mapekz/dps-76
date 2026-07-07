import { describe, it, expect } from 'vitest';
import { calculateDamageResistMult } from '@/lib/damage-formulas';

describe('calculateDamageResistMult (dormant scaffolding)', () => {
  it('returns 0 for non-positive damage', () => {
    expect(calculateDamageResistMult(0, 300)).toBe(0);
    expect(calculateDamageResistMult(-5, 300)).toBe(0);
  });

  it('caps at 0.99 when resist is zero or fully penetrated', () => {
    expect(calculateDamageResistMult(100, 0)).toBe(0.99);
    expect(calculateDamageResistMult(100, 300, 100)).toBe(0.99);
  });

  it('applies (dmg × 0.15 / resist)^0.365, clamped to [0.01, 0.99]', () => {
    expect(calculateDamageResistMult(100, 300)).toBeCloseTo(Math.pow(15 / 300, 0.365), 10);
    expect(calculateDamageResistMult(10000, 10)).toBe(0.99);
    expect(calculateDamageResistMult(1, 1e9)).toBe(0.01);
  });
});
