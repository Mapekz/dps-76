import { describe, it, expect } from 'bun:test';
import {
  AP_POOL_BASE,
  AP_POOL_PER_AGILITY,
  AP_REGEN_RATE_PCT,
  AP_REGEN_RATE_PCT_POWER_ARMOR,
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
  it('Fixer-shaped example (16 AP/shot, 4 shots/s, 15 AGI, no perks/legendaries): passive regen does not offset drain', () => {
    // maxAp = 60 + 10×15 = 210; regenPerSec = 210 × 6/100 = 12.6 (HumanRace
    // ActionPointsRate 6.0 = % of max AP per second) is reported but does NOT
    // tick during sustained VATS fire (user-confirmed 2026-07-15) — with no
    // in-combat restores (apPerCrit 0), apGainPerSec = 0; drainPerSec = 16×4 = 64.
    const result = computeApEconomy({
      apCost: 16,
      shotsPerSec: 4,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 0,
      shotsPerCrit: Infinity, // never crits
    });
    expect(result.maxAp).toBe(210);
    expect(result.regenPerSec).toBeCloseTo(12.6, 10);
    expect(result.apGainPerSec).toBe(0);
    expect(result.drainPerSec).toBe(64);
    expect(result.uptime).toBe(0);
    // secondsToEmpty = maxAp / (drain − gain) = 210 / 64
    expect(result.secondsToEmpty).toBeCloseTo(210 / 64, 10);
  });

  it('a large flat apPerCrit at a crit every 2nd shot pushes gain above drain → uptime saturates at 1', () => {
    // Same weapon/shots as above, but crits fire every 2nd shot: critsPerSec =
    // 4/2 = 2; apGainPerSec = 110×2 = 220 > drainPerSec 64 → uptime 1, no
    // secondsToEmpty — passive regen is excluded entirely (110 was
    // Conductor's retired flat model — kept as a synthetic magnitude here).
    const result = computeApEconomy({
      apCost: 16,
      shotsPerSec: 4,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 110,
      shotsPerCrit: 2,
    });
    expect(result.apGainPerSec).toBeCloseTo(220, 10);
    expect(result.drainPerSec).toBe(64);
    expect(result.uptime).toBe(1);
    expect(result.secondsToEmpty).toBeUndefined();
  });

  it("crit HoTs saturate at their raw rate when crits refresh inside the window (Conductor's fast cadence)", () => {
    // Conductor's split model: 10 instant + 20 AP/s over 5s, refresh-only.
    // Crit every 2nd shot at 4 shots/s → critsPerSec 2, crit interval 0.5s ≪ 5s
    // → HoT active fraction min(1, 5×2) = 1 → HoT contributes its raw 20 AP/s.
    // apGainPerSec = 10×2 + 20 = 40 — passive regen (12.6) is excluded.
    const result = computeApEconomy({
      apCost: 16,
      shotsPerSec: 4,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 10,
      critHots: [{ ratePerSec: 20, durationSec: 5 }],
      shotsPerCrit: 2,
    });
    expect(result.apGainPerSec).toBeCloseTo(40, 10);
    expect(result.uptime).toBeCloseTo(40 / 64, 10);
  });

  it('crit HoTs pay out in full at slow cadence (crit interval ≥ HoT duration → 110/crit equivalence)', () => {
    // Crit every 10s (shotsPerCrit 10 at 1 shot/s): HoT active fraction =
    // min(1, 5×0.1) = 0.5 → HoT AP/sec = 20×0.5 = 10, i.e. the full 100 AP per
    // crit spread over the 10s interval; spike adds 10×0.1 = 1 → gain = 1+10
    // (passive regen 12.6 excluded).
    const result = computeApEconomy({
      apCost: 16,
      shotsPerSec: 1,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 10,
      critHots: [{ ratePerSec: 20, durationSec: 5 }],
      shotsPerCrit: 10,
    });
    expect(result.apGainPerSec).toBeCloseTo(11, 10);
  });

  it('flat sources (Company Tea +10 on ActionPointsRate) add to the RACE base BEFORE the % multiplier', () => {
    // regen = maxAp × (raceBase + flat)/100 × (1 + %): 60 × (6+10)/100 × 1.45
    // — race-base composition, semantics user-confirmed 2026-07-15, absolute
    // numbers pending the in-game stopwatch goldens (docs/assumptions.md).
    const result = computeApEconomy({
      apCost: 0,
      shotsPerSec: 0,
      agility: 0,
      apRegenBonus: 0.45,
      apRegenFlatBonus: 10,
      apPerCrit: 0,
      shotsPerCrit: Infinity,
    });
    expect(result.regenPerSec).toBeCloseTo(
      ((AP_POOL_BASE * (AP_REGEN_RATE_PCT + 10)) / 100) * 1.45,
      10,
    );
  });

  it('power armor swaps the race base to 3.0 — regen halves', () => {
    const human = computeApEconomy({
      apCost: 0,
      shotsPerSec: 0,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 0,
      shotsPerCrit: Infinity,
    });
    const pa = computeApEconomy({
      apCost: 0,
      shotsPerSec: 0,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 0,
      shotsPerCrit: Infinity,
      isInPowerArmor: true,
    });
    expect(pa.regenPerSec).toBeCloseTo(
      human.regenPerSec * (AP_REGEN_RATE_PCT_POWER_ARMOR / AP_REGEN_RATE_PCT),
      10,
    );
  });

  it('apMax penalties shrink the pool AND its (informational, non-uptime) regen (rate is % of max AP per second)', () => {
    // Scaly Skin-shaped −50 max AP: pool 210−50 = 160; regenPerSec = 160 × 6/100 =
    // 9.6 (vs 12.6 at 210 — the %-of-max model makes regen pool-proportional)
    // but it's excluded from uptime; secondsToEmpty = 160/64 with no in-combat
    // restores.
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
    expect(result.regenPerSec).toBeCloseTo(9.6, 10);
    expect(result.uptime).toBe(0);
    expect(result.secondsToEmpty).toBeCloseTo(160 / 64, 10);
  });

  it('apRegen perk bonuses multiply the race-base rate', () => {
    // Action Boy rank 3 shape: +45% → regenPerSec = 60 × 6/100 × 1.45.
    const result = computeApEconomy({
      apCost: 0,
      shotsPerSec: 0,
      agility: 0,
      apRegenBonus: 0.45,
      apPerCrit: 0,
      shotsPerCrit: Infinity,
    });
    expect(result.regenPerSec).toBeCloseTo(((AP_POOL_BASE * AP_REGEN_RATE_PCT) / 100) * 1.45, 10);
    expect(result.maxAp).toBe(AP_POOL_BASE);
  });

  it('agility scales the AP pool linearly via the named GMST constants', () => {
    const result = computeApEconomy({
      apCost: 10,
      shotsPerSec: 1,
      agility: 30,
      apRegenBonus: 0,
      apPerCrit: 0,
      shotsPerCrit: Infinity,
    });
    expect(result.maxAp).toBe(AP_POOL_BASE + AP_POOL_PER_AGILITY * 30);
  });

  it('zero drain (no AP cost or no shots fired) never constrains uptime', () => {
    const noCost = computeApEconomy({
      apCost: 0,
      shotsPerSec: 4,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 0,
      shotsPerCrit: Infinity,
    });
    expect(noCost.drainPerSec).toBe(0);
    expect(noCost.uptime).toBe(1);

    const noShots = computeApEconomy({
      apCost: 16,
      shotsPerSec: 0,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 0,
      shotsPerCrit: Infinity,
    });
    expect(noShots.drainPerSec).toBe(0);
    expect(noShots.uptime).toBe(1);
  });

  it('uptime is clamped to [0, 1] even for pathological inputs', () => {
    const negativeCost = computeApEconomy({
      apCost: -5,
      shotsPerSec: 4,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 0,
      shotsPerCrit: Infinity,
    });
    expect(negativeCost.uptime).toBe(1);
  });

  describe('reload-window regen credit (2026-07-15, AP_REGEN_DELAY_SEC)', () => {
    // Common shape: 210 max AP → regenPerSec 12.6; drain 16 AP × shotsPerSec.
    const base = {
      apCost: 16,
      agility: 15,
      apRegenBonus: 0,
      apPerCrit: 0,
      shotsPerCrit: Infinity,
    };

    it('credits regenPerSec × (reloadSec − delay), averaged over the magazine cycle', () => {
      // 20s dump + 4s reload cycle at 20/24 shots/s: credit = 12.6 × (4−1)/24
      // = 1.575; uptime = 1.575 / (16 × 20/24).
      const result = computeApEconomy({
        ...base,
        shotsPerSec: 20 / 24,
        magDumpSec: 20,
        reloadSec: 4,
      });
      expect(result.reloadRegenPerSec).toBeCloseTo(1.575, 10);
      expect(result.apGainPerSec).toBeCloseTo(1.575, 10);
      expect(result.uptime).toBeCloseTo(1.575 / (16 * (20 / 24)), 10);
    });

    it('a reload at or below the 1s delay earns nothing', () => {
      const atDelay = computeApEconomy({ ...base, shotsPerSec: 1, magDumpSec: 20, reloadSec: 1 });
      expect(atDelay.reloadRegenPerSec).toBe(0);
      const below = computeApEconomy({ ...base, shotsPerSec: 1, magDumpSec: 20, reloadSec: 0.5 });
      expect(below.reloadRegenPerSec).toBe(0);
    });

    it('no magazine cycle (reloadSec/magDumpSec omitted) earns nothing — melee/degenerate weapons', () => {
      const result = computeApEconomy({ ...base, shotsPerSec: 1 });
      expect(result.reloadRegenPerSec).toBe(0);
      expect(result.apGainPerSec).toBe(0);
    });

    it('a long reload can saturate uptime at 1 purely from passive regen (apPerCrit 0)', () => {
      // 2s dump + 8s reload at 2/10 shots/s: credit = 12.6 × 7/10 = 8.82 >
      // drain 16 × 0.2 = 3.2 → AP never constrains.
      const result = computeApEconomy({ ...base, shotsPerSec: 0.2, magDumpSec: 2, reloadSec: 8 });
      expect(result.reloadRegenPerSec).toBeCloseTo(8.82, 10);
      expect(result.uptime).toBe(1);
      expect(result.secondsToEmpty).toBeUndefined();
    });

    it('stacks with crit restores into one apGainPerSec (breakout stays separate)', () => {
      // Crit every 2nd shot at 20/24 shots/s: spike = 10 × (20/24)/2 = 25/6.
      const result = computeApEconomy({
        ...base,
        apPerCrit: 10,
        shotsPerCrit: 2,
        shotsPerSec: 20 / 24,
        magDumpSec: 20,
        reloadSec: 4,
      });
      expect(result.reloadRegenPerSec).toBeCloseTo(1.575, 10);
      expect(result.apGainPerSec).toBeCloseTo(1.575 + (10 * 20) / 24 / 2, 10);
    });
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
