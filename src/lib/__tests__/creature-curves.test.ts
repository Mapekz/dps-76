import { describe, it, expect } from 'vitest';
import { getCreatureHealth, getCreatureResist } from '@/lib/creature-curves';

/**
 * Hand-interpolated expectations against the checked-in, freshly re-extracted
 * (2026-07-18, scripts/extract/extract-curvetables.ts) curve files — the
 * exact bug the Phase 2 spike found (stale hand-copied curvetables) means
 * these numbers only hold post-re-extraction; if this test starts failing
 * after a `bun run extract --only curvetables` run, re-derive the expectations
 * from the new file rather than assuming a regression.
 */

describe('getCreatureHealth', () => {
  it('CT_Creatures_Health_Universal_Tier23 at effectiveLevel 25 (SuperMutantRace, level window 5-50) — linear interpolation between the x=23 and x=34 points', () => {
    // health_universal_tier23.json: …, {x:23,y:408}, {x:34,y:578}, …
    // t = (25-23)/(34-23) = 2/11; y = 408 + t*(578-408) ≈ 438.909
    expect(getCreatureHealth('live', 23, 25)).toBeCloseTo(438.90909, 4);
  });

  it('clamps below the curve domain to the first point (no synthetic zero floor — project-wide convention)', () => {
    // health_universal_tier23.json's first point is {x:1, y:87}.
    expect(getCreatureHealth('live', 23, -50)).toBe(87);
    expect(getCreatureHealth('live', 23, 0)).toBe(87);
  });

  it('clamps above the curve domain to the last point', () => {
    // health_universal_tier55.json (Earle / SBQ's tier) domain tops out at x=540.
    const atDomainMax = getCreatureHealth('live', 55, 540);
    expect(getCreatureHealth('live', 55, 10000)).toBe(atDomainMax);
  });

  it('returns 0 and warns for an unknown tier rather than throwing', () => {
    expect(getCreatureHealth('live', 9999, 50)).toBe(0);
  });
});

describe('getCreatureResist', () => {
  it('CT_Creatures_Armor_Universal_Tier22 at effectiveLevel 95 — linear interpolation between the x=89 and x=100 points (the exact tier/gap the Phase 2 spike proved stale)', () => {
    // armor_universal_tier22.json (post re-extraction): …, {x:89,y:80}, {x:100,y:88}, …
    // t = (95-89)/(100-89) = 6/11; y = 80 + t*(88-80) ≈ 84.364
    expect(getCreatureResist('live', 22, 95)).toBeCloseTo(84.36364, 4);
  });

  it('resolves an exact curve point without interpolation error', () => {
    expect(getCreatureResist('live', 22, 100)).toBe(88);
  });

  it('clamps below the curve domain to the first point (x=1)', () => {
    expect(getCreatureResist('live', 22, 1)).toBe(23);
    expect(getCreatureResist('live', 22, -100)).toBe(23);
  });

  it('returns 0 and warns for an unknown tier rather than throwing', () => {
    expect(getCreatureResist('live', 9999, 50)).toBe(0);
  });
});
