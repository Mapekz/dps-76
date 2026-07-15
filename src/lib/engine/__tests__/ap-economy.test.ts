import { describe, it, expect } from 'vitest';
import {
  AP_BASE_REGEN_PER_SEC,
  AP_POOL_BASE,
  AP_POOL_PER_AGILITY,
  apLimitedDps,
  computeApEconomy,
  effectiveShotsPerSecond,
} from '@/lib/engine/ap-economy';
import type { SustainResult } from '@/lib/engine/sustain';

// Steady-state VATS AP economy (docs/assumptions.md "VATS AP economy").
// Hand-computed expectations straight from the spec formula in ap-economy.ts.

function sustain(overrides: Partial<SustainResult> = {}): SustainResult {
  return {
    burstDps: 0,
    sustainedDps: 0,
    shotsPerMag: 0,
    magDumpSec: 0,
    reloadSec: 0,
    reloadApproximate: true,
    ...overrides,
  };
}

describe('computeApEconomy', () => {
  it('Fixer-shaped example (16 AP/shot, 4 shots/s, 15 AGI, no perks/legendaries): drain outpaces regen', () => {
    // maxAp = 60 + 10×15 = 210; regenPerSec = 4.0×(1+0) = 4; no crits contribute
    // (apPerCrit 0) → apGainPerSec = 4; drainPerSec = 16×4 = 64.
    const result = computeApEconomy({
      apCost: 16,
      shotsPerSec: 4,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 0,
      shotsPerCrit: Infinity, // never crits
    });
    expect(result.maxAp).toBe(210);
    expect(result.regenPerSec).toBe(4);
    expect(result.apGainPerSec).toBe(4);
    expect(result.drainPerSec).toBe(64);
    expect(result.uptime).toBeCloseTo(4 / 64, 10);
    // secondsToEmpty = maxAp / (drain − gain) = 210 / 60 = 3.5
    expect(result.secondsToEmpty).toBeCloseTo(3.5, 10);
  });

  it('a large flat apPerCrit at a crit every 2nd shot pushes gain above drain → uptime saturates at 1', () => {
    // Same weapon/shots as above, but crits fire every 2nd shot: critsPerSec =
    // 4/2 = 2; apGainPerSec = 4 + 110×2 = 224 > drainPerSec 64 → uptime 1, no secondsToEmpty.
    // (110 was Conductor's retired flat model — kept as a synthetic magnitude here.)
    const result = computeApEconomy({
      apCost: 16,
      shotsPerSec: 4,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 110,
      shotsPerCrit: 2,
    });
    expect(result.apGainPerSec).toBe(224);
    expect(result.drainPerSec).toBe(64);
    expect(result.uptime).toBe(1);
    expect(result.secondsToEmpty).toBeUndefined();
  });

  it("crit HoTs saturate at their raw rate when crits refresh inside the window (Conductor's fast cadence)", () => {
    // Conductor's split model: 10 instant + 20 AP/s over 5s, refresh-only.
    // Crit every 2nd shot at 4 shots/s → critsPerSec 2, crit interval 0.5s ≪ 5s
    // → HoT active fraction min(1, 5×2) = 1 → HoT contributes its raw 20 AP/s.
    // apGainPerSec = 4 + 10×2 + 20 = 44 (vs 224 under the retired flat-110 model).
    const result = computeApEconomy({
      apCost: 16,
      shotsPerSec: 4,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 10,
      critHots: [{ ratePerSec: 20, durationSec: 5 }],
      shotsPerCrit: 2,
    });
    expect(result.apGainPerSec).toBeCloseTo(44, 10);
    expect(result.uptime).toBeCloseTo(44 / 64, 10);
  });

  it('crit HoTs pay out in full at slow cadence (crit interval ≥ HoT duration → 110/crit equivalence)', () => {
    // Crit every 10s (shotsPerCrit 10 at 1 shot/s): HoT active fraction =
    // min(1, 5×0.1) = 0.5 → HoT AP/sec = 20×0.5 = 10, i.e. the full 100 AP per
    // crit spread over the 10s interval; spike adds 10×0.1 = 1 → gain = 4+1+10.
    const result = computeApEconomy({
      apCost: 16,
      shotsPerSec: 1,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 10,
      critHots: [{ ratePerSec: 20, durationSec: 5 }],
      shotsPerCrit: 10,
    });
    expect(result.apGainPerSec).toBeCloseTo(15, 10);
  });

  it('flat AP/sec sources (Company Tea +10 on ActionPointsRate) add to the base rate BEFORE the % multiplier', () => {
    // AV-standard composition: (4 + 10) × (1 + 0.45) = 20.3 — documented
    // assumption pending the in-game stopwatch golden (docs/assumptions.md).
    const result = computeApEconomy({
      apCost: 0,
      shotsPerSec: 0,
      agility: 0,
      apRegenBonus: 0.45,
      apRegenFlatBonus: 10,
      apPerCrit: 0,
      shotsPerCrit: Infinity,
    });
    expect(result.regenPerSec).toBeCloseTo((AP_BASE_REGEN_PER_SEC + 10) * 1.45, 10);
  });

  it('apMax fortifies and penalties shift the pool (and secondsToEmpty) without touching uptime', () => {
    // Scaly Skin-shaped −50 max AP: pool 210−50 = 160; uptime = gain/drain is
    // pool-independent; secondsToEmpty = 160/(64−4) instead of 210/60.
    const result = computeApEconomy({
      apCost: 16,
      shotsPerSec: 4,
      agility: 15,
      apRegenBonus: 0,
      apMaxBonus: -50,
      apPerCrit: 0,
      shotsPerCrit: Infinity,
    });
    expect(result.maxAp).toBe(160);
    expect(result.uptime).toBeCloseTo(4 / 64, 10);
    expect(result.secondsToEmpty).toBeCloseTo(160 / 60, 10);
  });

  it('apRegen perk bonuses scale the flat GMST regen rate multiplicatively', () => {
    // Action Boy rank 3 shape: +45% → regenPerSec = 4×1.45 = 5.8.
    const result = computeApEconomy({
      apCost: 0,
      shotsPerSec: 0,
      agility: 0,
      apRegenBonus: 0.45,
      apPerCrit: 0,
      shotsPerCrit: Infinity,
    });
    expect(result.regenPerSec).toBeCloseTo(AP_BASE_REGEN_PER_SEC * 1.45, 10);
    expect(result.maxAp).toBe(AP_POOL_BASE);
  });

  it('agility scales the AP pool linearly via the named GMST constants', () => {
    const result = computeApEconomy({
      apCost: 10, shotsPerSec: 1, agility: 30, apRegenBonus: 0, apPerCrit: 0, shotsPerCrit: Infinity,
    });
    expect(result.maxAp).toBe(AP_POOL_BASE + AP_POOL_PER_AGILITY * 30);
  });

  it('zero drain (no AP cost or no shots fired) never constrains uptime', () => {
    const noCost = computeApEconomy({
      apCost: 0, shotsPerSec: 4, agility: 15, apRegenBonus: 0, apPerCrit: 0, shotsPerCrit: Infinity,
    });
    expect(noCost.drainPerSec).toBe(0);
    expect(noCost.uptime).toBe(1);

    const noShots = computeApEconomy({
      apCost: 16, shotsPerSec: 0, agility: 15, apRegenBonus: 0, apPerCrit: 0, shotsPerCrit: Infinity,
    });
    expect(noShots.drainPerSec).toBe(0);
    expect(noShots.uptime).toBe(1);
  });

  it('uptime is clamped to [0, 1] even for pathological inputs', () => {
    const negativeCost = computeApEconomy({
      apCost: -5, shotsPerSec: 4, agility: 15, apRegenBonus: 0, apPerCrit: 0, shotsPerCrit: Infinity,
    });
    expect(negativeCost.uptime).toBe(1);
  });
});

describe('effectiveShotsPerSecond', () => {
  it('reuses the sustain-model cadence (shotsPerMag / (magDumpSec + reloadSec)) when a magazine cycle exists', () => {
    // 20-round mag, 4s dump, 2s reload → 20/6 shots/s — the SAME cadence that
    // produces sustainedDps in sustain.ts, not the raw burst fire rate.
    const s = sustain({ shotsPerMag: 20, magDumpSec: 4, reloadSec: 2 });
    expect(effectiveShotsPerSecond(s, 5)).toBeCloseTo(20 / 6, 10);
  });

  it('falls back to the raw fire rate with no magazine (melee/degenerate sustain)', () => {
    const s = sustain({ shotsPerMag: 0, magDumpSec: 0, reloadSec: 0 });
    expect(effectiveShotsPerSecond(s, 3.5)).toBe(3.5);
  });
});

describe('apLimitedDps', () => {
  it('scales sustained VATS dps by the uptime duty cycle', () => {
    expect(apLimitedDps(500, 0.5)).toBe(250);
    expect(apLimitedDps(500, 1)).toBe(500);
    expect(apLimitedDps(500, 0)).toBe(0);
  });
});
