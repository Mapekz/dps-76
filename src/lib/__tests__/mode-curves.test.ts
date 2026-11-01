import { describe, expect, it, vi } from 'bun:test';

// Distinct PTS values prove each consumer reads the requested mode's snapshot.
// The mocks must exist before `curve-tables` first loads, hence the dynamic imports.
vi.mock('@/data/pts/curvetables/player/vats/luckvatscriticalcharge.json', () => ({
  default: {
    curve: [
      { x: 1, y: 40 },
      { x: 100, y: 40 },
    ],
  },
}));
vi.mock('@/data/pts/curvetables/player/range/percentofmintomaxrangedamagemult.json', () => ({
  default: {
    curve: [
      { x: 1, y: 1 },
      { x: 2, y: 0.5 },
    ],
  },
}));
vi.mock('@/data/pts/curvetables/legendarymods/weapon_chargedmeleeattack.json', () => ({
  default: {
    curve: [
      { x: 0, y: 0 },
      { x: 5, y: 9 },
    ],
  },
}));

const { computeCritMeter } = await import('@/lib/engine/crit-meter');
const { rangeFalloffMult } = await import('@/lib/distance');
const { getChargedMeleeCurve } = await import('@/lib/curve-tables');
const { makeCtx } = await import('@/lib/engine/__tests__/engine-fixture');
const { makeResolvedPlayer } = await import('@/lib/engine/__tests__/resolved-player-fixture');
const { getWeapons } = await import('@/data');

describe('mode-keyed engine curves', () => {
  it('fills the crit meter from the requested mode', () => {
    const weapon = { ...getWeapons('live').CombatRifle_Fixer, critChargeBonus: 0 };
    const ctx = makeCtx(weapon, {
      player: { ...makeResolvedPlayer(), luck: 10 },
      scenario: { isVats: true, isSneaking: false, isPowerAttack: false, isCrit: false },
    });
    const live = computeCritMeter('live', [], weapon, ctx);
    const pts = computeCritMeter('pts', [], weapon, ctx);
    expect(pts.fillPerHit).toBe(45);
    expect(live.fillPerHit).not.toBe(pts.fillPerHit);
  });

  it('applies the requested mode to range falloff', () => {
    expect(rangeFalloffMult('pts', 2000, 0, 1000, 1)).toBe(0.5);
    expect(rangeFalloffMult('live', 2000, 0, 1000, 1)).toBeCloseTo(0.2, 9);
  });

  it('selects the requested mode for the charged cycle', () => {
    expect(getChargedMeleeCurve('pts').at(-1)).toEqual({ x: 5, y: 9 });
    expect(getChargedMeleeCurve('live').at(-1)?.x).toBe(3);
  });
});
