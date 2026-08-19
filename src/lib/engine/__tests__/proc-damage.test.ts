import { describe, it, expect } from 'bun:test';
import type { Weapon } from '@/types';
import { createDefaultEnemyConditions } from '@/types';
import type { ProcSource } from '@/types/procs';
import type { ResolveContext } from '@/lib/engine/resolve';
import { computeProcDps } from '@/lib/engine/proc-damage';
import { makeResolvedPlayer } from '@/lib/engine/__tests__/resolved-player-fixture';

// computeProcDps unit tests: synthetic ProcSources, hand-computed
// expectations. Mirrors computeDotDps's describe block (engine.test.ts) —
// one case per trigger kind, plus charge-time independence (procs take no
// chargeTimeSec input at all, structurally impossible to reach it).

const FLAT_100 = [
  { x: 1, y: 100 },
  { x: 50, y: 100 },
];

function makeWeapon(overrides: Partial<Weapon> = {}): Weapon {
  return {
    id: 'test_rifle',
    name: 'Test Rifle',
    components: [{ damageType: 'ballistic', tier: -1, levelCap: 50, curvePoints: FLAT_100 }],
    damageType: 'ballistic',
    weaponClass: 'rifle',
    isAutomatic: false,
    isPhysical: true,
    critDamageMult: 2.0,
    critChargeBonus: 1.0,
    sneakAttackMult: 2.0,
    damageBonusMult: 1.0,
    ...overrides,
  };
}

function makeCtx(weapon: Weapon, overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    weapon,
    player: makeResolvedPlayer(),
    enemy: createDefaultEnemyConditions(),
    scenario: { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false },
    ...overrides,
  };
}

function makeProc(overrides: Partial<ProcSource> = {}): ProcSource {
  return {
    id: 'test-proc',
    source: { kind: 'omod', formId: '0x0', edid: 'TestOmod', name: 'Test Omod' },
    trigger: { kind: 'reloadCycle' },
    components: [{ damageType: 'fire', value: 50 }],
    conditions: [],
    ...overrides,
  };
}

describe('computeProcDps (issue #42, PROC_DAMAGE_PLAN.md commit 7)', () => {
  const weapon = makeWeapon();
  const ctx = makeCtx(weapon);

  it('returns 0 for an empty proc list', () => {
    expect(computeProcDps([], 50, ctx, { magDumpSec: 4, reloadSec: 2 }, 0)).toBe(0);
  });

  describe('reloadCycle / lastRound cadence — 1/(magDumpSec+reloadSec)', () => {
    it('reloadCycle: flat 50 damage, mag cycle 4s dump + 2s reload → 50/6 per sec', () => {
      const proc = makeProc({ trigger: { kind: 'reloadCycle' } });
      expect(computeProcDps([proc], 50, ctx, { magDumpSec: 4, reloadSec: 2 }, 0)).toBeCloseTo(
        50 / 6,
        10,
      );
    });

    it('lastRound: same cadence formula as reloadCycle', () => {
      const proc = makeProc({ trigger: { kind: 'lastRound' } });
      expect(computeProcDps([proc], 50, ctx, { magDumpSec: 4, reloadSec: 2 }, 0)).toBeCloseTo(
        50 / 6,
        10,
      );
    });

    it('0 when the cycle denominator is 0 (melee/no magazine — nothing to cycle)', () => {
      const proc = makeProc({ trigger: { kind: 'reloadCycle' } });
      expect(computeProcDps([proc], 50, ctx, { magDumpSec: 0, reloadSec: 0 }, 0)).toBe(0);
    });
  });

  describe('onCripple cadence — min(cripplesPerMin/60, 1/cooldownSec), ADR-0009 manual knob', () => {
    it('honest zero at the default cripplesPerMin=0 (ADR-0009)', () => {
      const proc = makeProc({ trigger: { kind: 'onCripple', cooldownSec: 3 } });
      expect(computeProcDps([proc], 50, ctx, { magDumpSec: 4, reloadSec: 2 }, 0)).toBe(0);
    });

    it('nonzero once cripplesPerMin is raised, below the cooldown cap', () => {
      // 6 cripples/min = 0.1/sec, well under the cooldown cap of 1/3 ≈ 0.333/sec.
      const proc = makeProc({ trigger: { kind: 'onCripple', cooldownSec: 3 } });
      expect(computeProcDps([proc], 50, ctx, { magDumpSec: 4, reloadSec: 2 }, 6)).toBeCloseTo(
        50 * 0.1,
        10,
      );
    });

    it('caps at 1/cooldownSec once cripplesPerMin exceeds the cooldown-limited rate', () => {
      // 120 cripples/min = 2/sec, way past the cooldown cap of 1/3 ≈ 0.333/sec.
      const proc = makeProc({ trigger: { kind: 'onCripple', cooldownSec: 3 } });
      expect(computeProcDps([proc], 50, ctx, { magDumpSec: 4, reloadSec: 2 }, 120)).toBeCloseTo(
        50 / 3,
        10,
      );
    });
  });

  describe('component damage — flat value vs itemLevel curve', () => {
    it('sums multiple flat-value components', () => {
      const proc = makeProc({
        trigger: { kind: 'reloadCycle' },
        components: [
          { damageType: 'fire', value: 20 },
          { damageType: 'energy', value: 30 },
        ],
      });
      expect(computeProcDps([proc], 50, ctx, { magDumpSec: 1, reloadSec: 0 }, 0)).toBeCloseTo(
        50,
        10,
      );
    });

    it('interpolates a curve component at the given itemLevel', () => {
      const proc = makeProc({
        trigger: { kind: 'reloadCycle' },
        components: [
          {
            damageType: 'explosive',
            curve: {
              input: 'itemLevel',
              points: [
                { x: 1, y: 10 },
                { x: 50, y: 100 },
              ],
            },
          },
        ],
      });
      // Linear ramp: itemLevel 25 is roughly the midpoint (1→50 domain).
      const dpsAtLevel25 = computeProcDps([proc], 25, ctx, { magDumpSec: 1, reloadSec: 0 }, 0);
      const dpsAtLevel50 = computeProcDps([proc], 50, ctx, { magDumpSec: 1, reloadSec: 0 }, 0);
      expect(dpsAtLevel50).toBeCloseTo(100, 10);
      expect(dpsAtLevel25).toBeGreaterThan(10);
      expect(dpsAtLevel25).toBeLessThan(100);
    });

    it('clamps itemLevel to [1,50] before interpolating, same as componentBase (paper-damage.ts)', () => {
      const proc = makeProc({
        trigger: { kind: 'reloadCycle' },
        components: [
          {
            damageType: 'explosive',
            curve: {
              input: 'itemLevel',
              points: [
                { x: 1, y: 10 },
                { x: 50, y: 100 },
              ],
            },
          },
        ],
      });
      const dpsAt50 = computeProcDps([proc], 50, ctx, { magDumpSec: 1, reloadSec: 0 }, 0);
      const dpsAt999 = computeProcDps([proc], 999, ctx, { magDumpSec: 1, reloadSec: 0 }, 0);
      expect(dpsAt999).toBeCloseTo(dpsAt50, 10);
    });
  });

  describe('conditions gate the whole proc (conditionsActive, resolve.ts)', () => {
    it('an unmet weaponClass condition zeroes out the proc entirely', () => {
      const proc = makeProc({
        trigger: { kind: 'reloadCycle' },
        conditions: [{ kind: 'weaponClass', classes: ['heavy'] }],
      });
      // Test weapon is a 'rifle' — weaponClass ['heavy'] never matches.
      expect(computeProcDps([proc], 50, ctx, { magDumpSec: 1, reloadSec: 0 }, 0)).toBe(0);
    });

    it('an empty conditions array (every proc today) is vacuously active', () => {
      const proc = makeProc({ trigger: { kind: 'reloadCycle' }, conditions: [] });
      expect(computeProcDps([proc], 50, ctx, { magDumpSec: 1, reloadSec: 0 }, 0)).toBeGreaterThan(
        0,
      );
    });
  });

  it('sums multiple independent procs', () => {
    const a = makeProc({
      id: 'a',
      trigger: { kind: 'reloadCycle' },
      components: [{ damageType: 'fire', value: 30 }],
    });
    const b = makeProc({
      id: 'b',
      trigger: { kind: 'onCripple', cooldownSec: 3 },
      components: [{ damageType: 'explosive', value: 150 }],
    });
    // a: 30 / (1+0) = 30/s. b: min(6/60, 1/3) = 0.1/s → 15/s.
    expect(computeProcDps([a, b], 50, ctx, { magDumpSec: 1, reloadSec: 0 }, 6)).toBeCloseTo(
      30 + 15,
      10,
    );
  });

  describe('proc damage ignores charge time — structurally impossible to reach (mirrors computeDotDps)', () => {
    it('computeProcDps has no chargeTimeSec input at all', () => {
      const proc = makeProc({ trigger: { kind: 'reloadCycle' } });
      expect(computeProcDps([proc], 50, ctx, { magDumpSec: 1, reloadSec: 0 }, 0)).toBeCloseTo(
        50,
        10,
      );
    });
  });
});
