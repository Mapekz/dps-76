import { describe, it, expect } from 'bun:test';
import {
  AP_POOL_BASE,
  AP_POOL_PER_AGILITY,
  AP_REGEN_DELAY_SEC,
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
  it('Fixer-shaped example (16 AP/shot, 4 shots/s, 15 AGI, no perks/legendaries): pool-cycle burst/pause/uptime', () => {
    // maxAp = 60 + 10×15 = 210; regenPerSec = 210 × 6/100 = 12.6 (HumanRace
    // ActionPointsRate 6.0 = % of max AP per second) does NOT tick during
    // sustained VATS fire (user-confirmed 2026-07-15) — with no in-combat
    // restores (apPerCrit 0), apGainPerSec = 0; drainPerSec = 16×4 = 64.
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
    // Pool-cycle model (ap-economy.ts "Pool-cycle uptime"): burst drains the
    // full pool at the net rate, pause is the post-drain delay plus a
    // full-pool refill at the passive rate, uptime is the resulting duty
    // cycle.
    // burstSec = 210 / (64 − 0) = 3.28125
    // pauseSec = 1 + 210/12.6 = 1 + 16.666667 = 17.666667
    // uptime = 3.28125 / (3.28125 + 17.666667) ≈ 0.156638
    const burstSec = 210 / 64;
    const pauseSec = AP_REGEN_DELAY_SEC + 210 / 12.6;
    const uptime = burstSec / (burstSec + pauseSec);
    expect(result.secondsToEmpty).toBeCloseTo(burstSec, 10);
    expect(result.pauseSec).toBeCloseTo(pauseSec, 10);
    expect(result.uptime).toBeCloseTo(uptime, 10);
  });

  it('a large flat apPerCrit at a crit every 2nd shot pushes gain above drain → uptime saturates at 1, no pauseSec', () => {
    // Same weapon/shots as above, but crits fire every 2nd shot: critsPerSec =
    // 4/2 = 2; apGainPerSec = 110×2 = 220 > drainPerSec 64 → gain ≥ drain, the
    // early-return branch: uptime 1, no secondsToEmpty/pauseSec (the pool
    // never empties, so there is no burst/pause cycle to report).
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
    expect(result.pauseSec).toBeUndefined();
  });

  it("crit HoTs saturate at their raw rate when crits refresh inside the window (Conductor's fast cadence)", () => {
    // Conductor's split model: 10 instant + 20 AP/s over 5s, REFRESH-ONLY
    // (ESM-proven: SPEL 0x007ACB0D's HoT effect MGEF 0x007ACB09 carries Magic
    // Effect Data Flags 0x100 "Dispel with Keywords" + KYWD
    // ConductorsDispelPlayerEffectKeyword 0x007B71D3 — module doc). Crit
    // every 2nd shot at 4 shots/s → critsPerSec 2, crit interval 0.5s ≪ 5s →
    // HoT active fraction min(1, 5×2) = 1 → HoT contributes its raw 20 AP/s.
    // apGainPerSec = 10×2 + 20 = 40 — passive regen (12.6) is still excluded
    // from the in-burst gain, but now feeds the pool-cycle pause.
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
    // burstSec = 210 / (64 − 40) = 8.75; pauseSec = 1 + 210/12.6 = 17.666667
    // (unchanged from the previous test — pauseSec depends only on
    // maxAp/regenPerSec, not on apGainPerSec); uptime ≈ 0.331230.
    const burstSec = 210 / (64 - 40);
    const pauseSec = AP_REGEN_DELAY_SEC + 210 / 12.6;
    const uptime = burstSec / (burstSec + pauseSec);
    expect(result.secondsToEmpty).toBeCloseTo(burstSec, 10);
    expect(result.pauseSec).toBeCloseTo(pauseSec, 10);
    expect(result.uptime).toBeCloseTo(uptime, 10);
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

  it('apMax penalties shrink the pool AND its regen (rate is % of max AP per second) — both feed the pool-cycle uptime now', () => {
    // Scaly Skin-shaped −50 max AP: pool 210−50 = 160; regenPerSec = 160 × 6/100 =
    // 9.6 (vs 12.6 at 210 — the %-of-max model makes regen pool-proportional);
    // drainPerSec = 64, apGainPerSec = 0 (no in-combat restores).
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
    // burstSec = 160/64 = 2.5; pauseSec = 1 + 160/9.6 = 17.666667; uptime ≈
    // 0.123967 — smaller pool than the 210-AGI-15 baseline (test above) means
    // a shorter burst against the SAME pauseSec (maxAp/regenPerSec is
    // pool-size-invariant at a fixed rate %), so uptime drops.
    const burstSec = 160 / 64;
    const pauseSec = AP_REGEN_DELAY_SEC + 160 / 9.6;
    const uptime = burstSec / (burstSec + pauseSec);
    expect(result.secondsToEmpty).toBeCloseTo(burstSec, 10);
    expect(result.pauseSec).toBeCloseTo(pauseSec, 10);
    expect(result.uptime).toBeCloseTo(uptime, 10);
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

    it('credits regenPerSec × (reloadSec − delay), averaged over the magazine cycle, then feeds the pool-cycle burst/pause', () => {
      // 20s dump + 4s reload cycle at 20/24 shots/s: credit = 12.6 × (4−1)/24
      // = 1.575; drainPerSec = 16 × 20/24 = 13.333333.
      const result = computeApEconomy({
        ...base,
        shotsPerSec: 20 / 24,
        magDumpSec: 20,
        reloadSec: 4,
      });
      expect(result.reloadRegenPerSec).toBeCloseTo(1.575, 10);
      expect(result.apGainPerSec).toBeCloseTo(1.575, 10);
      // burstSec = 210 / (13.333333 − 1.575) ≈ 17.859674
      // pauseSec = 1 + 210/12.6 ≈ 17.666667
      // uptime = burstSec / (burstSec + pauseSec) ≈ 0.502716
      const drainPerSec = 16 * (20 / 24);
      const burstSec = 210 / (drainPerSec - 1.575);
      const pauseSec = AP_REGEN_DELAY_SEC + 210 / 12.6;
      const uptime = burstSec / (burstSec + pauseSec);
      expect(result.secondsToEmpty).toBeCloseTo(burstSec, 10);
      expect(result.pauseSec).toBeCloseTo(pauseSec, 10);
      expect(result.uptime).toBeCloseTo(uptime, 10);
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
      expect(result.pauseSec).toBeUndefined();
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

  describe('pool-cycle uptime (adopted 2026-07-29)', () => {
    it('delay amortization: a bigger pool (higher AGI) strictly raises uptime at the same drain/gain rates', () => {
      // Same weapon (16 AP/shot, 4 shots/s), apGainPerSec = 0 both times, only
      // AGI changes. Because regenPerSec = maxAp × ratePct/100, the refill
      // term maxAp/regenPerSec = 100/ratePct is POOL-SIZE-INVARIANT — pauseSec
      // is identical at both AGI values (only burstSec grows), which is what
      // makes a bigger pool strictly better: it amortizes the same fixed
      // pause over a longer burst.
      const low = computeApEconomy({
        apCost: 16,
        shotsPerSec: 4,
        agility: 15, // maxAp 210, regenPerSec 12.6
        apRegenBonus: 0,
        apPerCrit: 0,
        shotsPerCrit: Infinity,
      });
      const high = computeApEconomy({
        apCost: 16,
        shotsPerSec: 4,
        agility: 50, // maxAp 560, regenPerSec 33.6
        apRegenBonus: 0,
        apPerCrit: 0,
        shotsPerCrit: Infinity,
      });
      expect(high.pauseSec).toBeCloseTo(low.pauseSec!, 10);
      expect(high.secondsToEmpty!).toBeGreaterThan(low.secondsToEmpty!);
      expect(high.uptime).toBeGreaterThan(low.uptime);
      // uptime@15 ≈ 0.156638, uptime@50 ≈ 0.331230 — hand-computed via the
      // same burst/pause formula as the tests above.
      expect(low.uptime).toBeCloseTo(3.28125 / (3.28125 + (AP_REGEN_DELAY_SEC + 210 / 12.6)), 10);
      expect(high.uptime).toBeCloseTo(8.75 / (8.75 + (AP_REGEN_DELAY_SEC + 560 / 33.6)), 10);
    });

    it('apRegenBonus/apRegenFlatBonus/apMaxBonus now move uptime (previously excluded — module doc)', () => {
      const baseline = computeApEconomy({
        apCost: 16,
        shotsPerSec: 4,
        agility: 15, // maxAp 210, regenPerSec 12.6, drainPerSec 64, gain 0
        apRegenBonus: 0,
        apPerCrit: 0,
        shotsPerCrit: Infinity,
      });

      // +100% apRegen doubles regenPerSec (12.6 → 25.2), shrinking pauseSec
      // (1 + 210/25.2 = 9.333333 vs baseline's 1 + 210/12.6 = 17.666667) while
      // burstSec is unchanged (gain still 0) → uptime rises.
      const withApRegen = computeApEconomy({
        apCost: 16,
        shotsPerSec: 4,
        agility: 15,
        apRegenBonus: 1.0,
        apPerCrit: 0,
        shotsPerCrit: Infinity,
      });
      const burstSec = 210 / 64;
      const pauseSecWithApRegen = AP_REGEN_DELAY_SEC + 210 / 25.2;
      expect(withApRegen.uptime).toBeCloseTo(burstSec / (burstSec + pauseSecWithApRegen), 10);
      expect(withApRegen.uptime).toBeGreaterThan(baseline.uptime);

      // +10 apRegenFlat (added onto the 6.0 race base before the % mult:
      // regenPerSec = 210 × 16/100 = 33.6) shrinks pauseSec the same way.
      const withApRegenFlat = computeApEconomy({
        apCost: 16,
        shotsPerSec: 4,
        agility: 15,
        apRegenBonus: 0,
        apRegenFlatBonus: 10,
        apPerCrit: 0,
        shotsPerCrit: Infinity,
      });
      const pauseSecWithFlat = AP_REGEN_DELAY_SEC + 210 / 33.6;
      expect(withApRegenFlat.uptime).toBeCloseTo(burstSec / (burstSec + pauseSecWithFlat), 10);
      expect(withApRegenFlat.uptime).toBeGreaterThan(baseline.uptime);

      // −50 apMax (Scaly Skin-shaped) shrinks BOTH the burst (smaller pool to
      // drain) and, via the %-of-max regen model, keeps pauseSec unchanged
      // (still 100/ratePct + delay) — so uptime strictly falls.
      const withApMaxPenalty = computeApEconomy({
        apCost: 16,
        shotsPerSec: 4,
        agility: 15,
        apRegenBonus: 0,
        apMaxBonus: -50,
        apPerCrit: 0,
        shotsPerCrit: Infinity,
      });
      expect(withApMaxPenalty.uptime).toBeLessThan(baseline.uptime);
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

  it('blends in a downtime-fallback dps for the (1 − uptime) pause window', () => {
    expect(apLimitedDps(500, 0.5, 100)).toBe(300); // half VATS, half fallback
    expect(apLimitedDps(500, 1, 100)).toBe(500); // uptime 1 → fallback weight 0
    expect(apLimitedDps(500, 0, 100)).toBe(100); // uptime 0 → pure fallback
    expect(apLimitedDps(500, 0.5)).toBe(250); // omitted fallback defaults to 0
  });
});
