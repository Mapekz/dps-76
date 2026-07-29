import { describe, it, expect } from 'bun:test';
import {
  CLOSE_THRESHOLD_UNITS,
  FAR_THRESHOLD_UNITS,
  DEFAULT_DISTANCE_UNITS,
  PIP_BOY_UNIT_DIVISOR,
  gameUnitsToPipBoy,
  pipBoyToGameUnits,
  rangeFalloffMult,
} from '@/lib/distance';

describe('unit conversion', () => {
  it('round-trips game units <-> Pip-Boy units', () => {
    expect(gameUnitsToPipBoy(pipBoyToGameUnits(100))).toBeCloseTo(100, 9);
    expect(pipBoyToGameUnits(gameUnitsToPipBoy(2612))).toBeCloseTo(2612, 9);
  });

  it('divides by 64/3', () => {
    expect(gameUnitsToPipBoy(64)).toBeCloseTo(3, 9);
    expect(PIP_BOY_UNIT_DIVISOR).toBeCloseTo(21.333333, 5);
  });
});

describe('default distance sits strictly between the gates', () => {
  it('DEFAULT_DISTANCE_UNITS activates neither Close nor Far', () => {
    expect(DEFAULT_DISTANCE_UNITS).toBeGreaterThan(CLOSE_THRESHOLD_UNITS);
    expect(DEFAULT_DISTANCE_UNITS).toBeLessThan(FAR_THRESHOLD_UNITS);
  });
});

describe('threshold boundaries (resolve.ts case "targetDistance" semantics: close <= gate, far >= gate)', () => {
  it('CLOSE_THRESHOLD_UNITS is 850, FAR_THRESHOLD_UNITS is 1000', () => {
    expect(CLOSE_THRESHOLD_UNITS).toBe(850);
    expect(FAR_THRESHOLD_UNITS).toBe(1000);
  });
});

describe('rangeFalloffMult — composite model (docs/assumptions.md "Target distance (Close / Far)")', () => {
  // Hunting Rifle: minRange 2612, maxRange 5225 (real ESM data — NOT exactly
  // 2x minRange, 5225 vs 5224; used for the shape checks that don't depend
  // on an exact ratio). Clean synthetic 2x-ratio numbers are used below for
  // the exact curve-breakpoint assertions (X = d/maxRange-shaped checks are
  // wrong on purpose here — X reads relative to minRange, see distance.ts).
  const min = 2612;
  const max = 5225;
  const outOfRangeMult = 0.5;

  it('is 1.0 at or below minRange', () => {
    expect(rangeFalloffMult(0, min, max, outOfRangeMult)).toBe(1.0);
    expect(rangeFalloffMult(min, min, max, outOfRangeMult)).toBe(1.0);
    expect(rangeFalloffMult(min - 1, min, max, outOfRangeMult)).toBe(1.0);
  });

  it('interpolates linearly from 1.0 to outOfRangeMult between min and max', () => {
    const midpoint = (min + max) / 2;
    expect(rangeFalloffMult(midpoint, min, max, outOfRangeMult)).toBeCloseTo(
      1.0 + (outOfRangeMult - 1.0) * 0.5,
      9,
    );
  });

  it('equals outOfRangeMult exactly at maxRange (continuous with the curve segment)', () => {
    expect(rangeFalloffMult(max, min, max, outOfRangeMult)).toBeCloseTo(outOfRangeMult, 9);
  });

  it('guards a non-positive maxRange (melee sentinel-ish data) to 1.0', () => {
    expect(rangeFalloffMult(9999, 0, 0, 0.0)).toBe(1.0);
    expect(rangeFalloffMult(9999, 0, -1, -1)).toBe(1.0);
  });

  it('guards a degenerate span (maxRange <= minRange) to 1.0', () => {
    expect(rangeFalloffMult(9999, 1024, 1024, 0.7)).toBe(1.0);
  });
});

describe('rangeFalloffMult — exact curve breakpoints at a clean maxRange = 2x minRange ratio', () => {
  // Synthetic clean numbers so X = (d - minRange) / (maxRange - minRange)
  // lands exactly on the curve's own sample points (1.0, 1.5, 1.75, 2.0).
  const min = 1000;
  const max = 2000;
  const outOfRangeMult = 0.5;

  it('at 1.25x maxRange (X=1.5) applies curveY(1.5) = 0.75', () => {
    expect(rangeFalloffMult(1.25 * max, min, max, outOfRangeMult)).toBeCloseTo(
      outOfRangeMult * 0.75,
      9,
    );
  });

  it('at 1.5x maxRange (X=2.0) applies curveY(2.0) = 0.2 (curve floor)', () => {
    expect(rangeFalloffMult(1.5 * max, min, max, outOfRangeMult)).toBeCloseTo(
      outOfRangeMult * 0.2,
      9,
    );
  });

  it('is flat beyond 1.5x maxRange (curve clamps to its own endpoint)', () => {
    const at1_5x = rangeFalloffMult(1.5 * max, min, max, outOfRangeMult);
    const at2x = rangeFalloffMult(2 * max, min, max, outOfRangeMult);
    const at10x = rangeFalloffMult(10 * max, min, max, outOfRangeMult);
    expect(at2x).toBeCloseTo(at1_5x, 9);
    expect(at10x).toBeCloseTo(at1_5x, 9);
  });
});
