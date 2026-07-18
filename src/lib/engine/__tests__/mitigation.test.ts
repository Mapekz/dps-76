import { describe, it, expect } from 'vitest';
import type { Weapon } from '@/types';
import { createDefaultEnemyConditions, createDefaultPlayerConditions } from '@/types';
import { applyMitigation, type EnemyDefenses } from '@/lib/engine/mitigation';
import type { HitBreakdown } from '@/lib/engine/paper-damage';
import { computeScenarios, type ScenarioInput } from '@/lib/engine/scenarios';

function hit(components: Array<{ damageType: HitBreakdown['components'][number]['damageType']; damage: number }>): HitBreakdown {
  const full = components.map(c => ({ ...c, base: c.damage }));
  return { components: full, total: full.reduce((sum, c) => sum + c.damage, 0) };
}

const defenses = (resists: EnemyDefenses['resists']): EnemyDefenses => ({ hp: 1000, resists });

describe('applyMitigation — formula + clamps', () => {
  it('matches (damage × 0.15 / resist)^0.365, unclamped range', () => {
    const h = hit([{ damageType: 'ballistic', damage: 100 }]);
    const mitigated = applyMitigation(h, defenses({ physical: 300 }), 0, 0);
    expect(mitigated.components[0].damage).toBeCloseTo(100 * Math.pow((100 * 0.15) / 300, 0.365), 10);
  });

  it('clamps the multiplier to [0.01, 0.99]', () => {
    const tinyResist = hit([{ damageType: 'ballistic', damage: 100000 }]);
    const highMult = applyMitigation(tinyResist, defenses({ physical: 1 }), 0, 0);
    expect(highMult.components[0].damage).toBeCloseTo(100000 * 0.99, 6);

    const hugeResist = hit([{ damageType: 'ballistic', damage: 1 }]);
    const lowMult = applyMitigation(hugeResist, defenses({ physical: 1e9 }), 0, 0);
    expect(lowMult.components[0].damage).toBeCloseTo(1 * 0.01, 6);
  });

  it('Resist ≤ 0 fully penetrates (mult 1), not the 0.99 clamp ceiling', () => {
    const h = hit([{ damageType: 'ballistic', damage: 500 }]);
    const zeroResist = applyMitigation(h, defenses({ physical: 0 }), 0, 0);
    expect(zeroResist.components[0].damage).toBe(500);

    // A flat debuff that fully strips a small base resist also fully penetrates.
    const strippedResist = applyMitigation(h, defenses({ physical: 6 }), 0, 6);
    expect(strippedResist.components[0].damage).toBe(500);
  });

  it('returns the hit unchanged (identity) when no defenses are supplied', () => {
    const h = hit([{ damageType: 'ballistic', damage: 500 }]);
    expect(applyMitigation(h, undefined, 0.5, 10)).toBe(h);
  });
});

describe('applyMitigation — armorPen fraction', () => {
  it('scales Resist by (1 − armorPenTotal) before the formula', () => {
    const h = hit([{ damageType: 'ballistic', damage: 100 }]);
    const noPen = applyMitigation(h, defenses({ physical: 300 }), 0, 0);
    const halfPen = applyMitigation(h, defenses({ physical: 300 }), 0.5, 0);
    // Resist halved → (damage×0.15/(resist/2))^0.365 = noPen's factor × 2^0.365 → MORE damage gets through.
    expect(halfPen.components[0].damage).toBeGreaterThan(noPen.components[0].damage);
    expect(halfPen.components[0].damage).toBeCloseTo(100 * Math.pow((100 * 0.15) / 150, 0.365), 10);
  });

  it('clamps armorPenTotal to [0, 1] — over-100% penetration behaves like Resist ≤ 0', () => {
    const h = hit([{ damageType: 'ballistic', damage: 500 }]);
    const overPen = applyMitigation(h, defenses({ physical: 300 }), 1.5, 0);
    expect(overPen.components[0].damage).toBe(500);
  });

  it('a negative armorPenTotal (shouldn\'t occur from real data, but the formula stays sane) never REDUCES the resist below base', () => {
    const h = hit([{ damageType: 'ballistic', damage: 100 }]);
    const noPen = applyMitigation(h, defenses({ physical: 300 }), 0, 0);
    const negPen = applyMitigation(h, defenses({ physical: 300 }), -0.5, 0);
    // clamp01(-0.5) = 0 → armorPenFactor = 1 — identical to no armorPen.
    expect(negPen.components[0].damage).toBeCloseTo(noPen.components[0].damage, 10);
  });
});

describe('applyMitigation — flat resist debuff (Taking One for the Team), physical-only', () => {
  it('subtracts from physical (ballistic) resist before the formula', () => {
    const h = hit([{ damageType: 'ballistic', damage: 100 }]);
    const noDebuff = applyMitigation(h, defenses({ physical: 300 }), 0, 0);
    const debuffed = applyMitigation(h, defenses({ physical: 300 }), 0, 50);
    expect(debuffed.components[0].damage).toBeGreaterThan(noDebuff.components[0].damage);
    expect(debuffed.components[0].damage).toBeCloseTo(100 * Math.pow((100 * 0.15) / 250, 0.365), 10);
  });

  it('applies to the physical resist type EXPLOSIVE damage also maps to', () => {
    const h = hit([{ damageType: 'explosive', damage: 100 }]);
    const noDebuff = applyMitigation(h, defenses({ physical: 300 }), 0, 0);
    const debuffed = applyMitigation(h, defenses({ physical: 300 }), 0, 50);
    expect(debuffed.components[0].damage).toBeGreaterThan(noDebuff.components[0].damage);
  });

  it('does NOT apply to any non-physical resist type (ESM shows no Energy Resist component)', () => {
    for (const damageType of ['energy', 'fire', 'cryo', 'poison'] as const) {
      const h = hit([{ damageType, damage: 100 }]);
      const resistType = damageType; // 1:1 mapping for these four
      const noDebuff = applyMitigation(h, defenses({ [resistType]: 300 }), 0, 0);
      const debuffed = applyMitigation(h, defenses({ [resistType]: 300 }), 0, 50);
      expect(debuffed.components[0].damage).toBeCloseTo(noDebuff.components[0].damage, 10);
    }
  });
});

describe('applyMitigation — per-damage-type routing', () => {
  it('mitigates each component against ITS OWN resist type on a mixed-damage weapon', () => {
    const h = hit([
      { damageType: 'ballistic', damage: 100 },
      { damageType: 'energy', damage: 100 },
    ]);
    // Physical resist is much higher than energy resist — the ballistic
    // component should retain LESS damage than the energy component.
    const mitigated = applyMitigation(h, defenses({ physical: 600, energy: 50 }), 0, 0);
    expect(mitigated.components[0].damage).toBeLessThan(mitigated.components[1].damage);
  });

  it('radiation and poison and cryo and fire each read their own named resist', () => {
    for (const damageType of ['radiation', 'poison', 'cryo', 'fire'] as const) {
      const h = hit([{ damageType, damage: 100 }]);
      const mitigated = applyMitigation(h, defenses({ [damageType]: 300 }), 0, 0);
      expect(mitigated.components[0].damage).toBeCloseTo(100 * Math.pow((100 * 0.15) / 300, 0.365), 10);
    }
  });

  it('an unset resist on the defenses object defaults to 0 (full penetration for that type)', () => {
    const h = hit([{ damageType: 'fire', damage: 100 }]);
    const mitigated = applyMitigation(h, defenses({ physical: 300 }), 0, 0);
    expect(mitigated.components[0].damage).toBe(100);
  });

  it('recomputes total as the sum of mitigated components', () => {
    const h = hit([
      { damageType: 'ballistic', damage: 100 },
      { damageType: 'energy', damage: 100 },
    ]);
    const mitigated = applyMitigation(h, defenses({ physical: 300, energy: 300 }), 0, 0);
    expect(mitigated.total).toBeCloseTo(mitigated.components[0].damage + mitigated.components[1].damage, 10);
  });
});

/**
 * Option A divergence (docs/assumptions.md "Resist mitigation"): mitigation
 * is applied ONCE to the crit-weighted BLENDED hit, not to the non-crit and
 * crit hits separately before blending. Because `mult(damage)` is concave in
 * damage (exponent 0.365 < 1), `damage × mult(damage)` — the RETAINED
 * damage, what mitigation actually scales — is CONVEX (exponent 1.365).
 * Jensen's inequality for a convex f: E[f(X)] ≥ f(E[X]), i.e. the true
 * per-hit-mitigated-then-blended figure is always ≥ Option A's
 * blend-then-mitigate figure — Option A systematically slightly
 * UNDER-states retained (mitigated) damage. The gap is a pure function of
 * the crit multiplier and crit rate (it cancels out resist/armorPen/flat
 * debuff algebraically — verified numerically), so one representative resist
 * value is sufficient to pin the magnitude.
 */
describe('Option A divergence (blended-hit mitigation vs. true per-hit mitigation)', () => {
  function perHitMitigatedTotal(dNonCrit: number, dCrit: number, critRate: number, resist: number): number {
    const nonCrit = applyMitigation(hit([{ damageType: 'ballistic', damage: dNonCrit }]), defenses({ physical: resist }), 0, 0).total;
    const crit = applyMitigation(hit([{ damageType: 'ballistic', damage: dCrit }]), defenses({ physical: resist }), 0, 0).total;
    return (1 - critRate) * nonCrit + critRate * crit;
  }

  function optionAMitigatedTotal(dNonCrit: number, dCrit: number, critRate: number, resist: number): number {
    const blended = (1 - critRate) * dNonCrit + critRate * dCrit;
    return applyMitigation(hit([{ damageType: 'ballistic', damage: blended }]), defenses({ physical: resist }), 0, 0).total;
  }

  it.each([
    // [critRate, expected divergence %, tolerance] — 2× crit multiplier (this
    // app's default), resist 300 (representative mid-tier target). Measured
    // 2026-07-18: divergence is CONSTANT across resist values (the resist
    // term factors out of the ratio algebraically) — only crit rate and the
    // crit multiplier matter.
    [0.15, -2.117, 0.01],
    [0.3, -2.857, 0.01],
    [0.45, -2.837, 0.01],
  ])('at a %s%% steady-state VATS crit rate, Option A under-states retained damage by ~%s%%', (critRate, expectedPct) => {
    const dNonCrit = 50;
    const dCrit = 100; // 2× crit mult
    const resist = 300;
    const perHit = perHitMitigatedTotal(dNonCrit, dCrit, critRate, resist);
    const optionA = optionAMitigatedTotal(dNonCrit, dCrit, critRate, resist);
    const divergencePct = ((optionA - perHit) / perHit) * 100;
    expect(divergencePct).toBeCloseTo(expectedPct, 2);
    // Small in absolute terms (a few percent) — the plan's "upgrade to
    // per-hit only if non-trivial" bar is not crossed; Option A ships as
    // specified.
    expect(Math.abs(divergencePct)).toBeLessThan(5);
  });

  it('divergence magnitude is independent of the resist value (algebraic cancellation)', () => {
    const perResist = [50, 300, 1200].map(resist => {
      const perHit = perHitMitigatedTotal(50, 100, 0.3, resist);
      const optionA = optionAMitigatedTotal(50, 100, 0.3, resist);
      return ((optionA - perHit) / perHit) * 100;
    });
    expect(perResist[0]).toBeCloseTo(perResist[1], 6);
    expect(perResist[1]).toBeCloseTo(perResist[2], 6);
  });
});

// ── computeScenarios integration (synthetic enemy, hand-computed) ──────────

const FLAT_100 = [{ x: 1, y: 100 }, { x: 50, y: 100 }];

function makeWeapon(overrides: Partial<Weapon> = {}): Weapon {
  return {
    id: 'test_weapon',
    name: 'Test Weapon',
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

describe('computeScenarios — ScenarioInput.enemyDefenses (synthetic enemy)', () => {
  const weapon = makeWeapon();
  const baseInput: ScenarioInput = {
    mode: 'live',
    weapon,
    itemLevel: 50,
    modifiers: [],
    player: createDefaultPlayerConditions(),
    enemy: createDefaultEnemyConditions(),
    weakpointMult: 2.0,
  };

  it('is absent with no enemyDefenses (no target selected)', () => {
    const s = computeScenarios(baseInput);
    expect(s.freeAim.effective).toBeUndefined();
    expect(s.vats.effective).toBeUndefined();
  });

  it('mitigates the free-aim hit against a synthetic 1000-HP/300-physical-resist enemy, hand-computed', () => {
    const enemyDefenses = { hp: 1000, resists: { physical: 300 } };
    const s = computeScenarios({ ...baseInput, enemyDefenses });

    // Flat 100 dbm-1.0 ballistic hit, no crit/sneak/power-attack in free aim.
    expect(s.freeAim.perHit.total).toBeCloseTo(100, 6);
    const expectedMult = Math.pow((100 * 0.15) / 300, 0.365);
    expect(s.freeAim.effective?.perHit.total).toBeCloseTo(100 * expectedMult, 6);
    expect(s.freeAim.effective?.retainedPct).toBeCloseTo(expectedMult * 100, 6);
    // sustainedDps scales by the SAME retained fraction as perHit.
    const retainedFraction = s.freeAim.effective!.perHit.total / s.freeAim.perHit.total;
    expect(s.freeAim.effective?.sustainedDps).toBeCloseTo(s.freeAim.sustain.sustainedDps * retainedFraction, 6);
    // TTK = enemy HP ÷ mitigated sustained DPS.
    expect(s.freeAim.effective?.ttk).toBeCloseTo(1000 / s.freeAim.effective!.sustainedDps, 6);
  });

  it('armorPen and armorPenFlat bucket modifiers fold into the mitigation call (end-to-end)', () => {
    const enemyDefenses = { hp: 1000, resists: { physical: 300 } };
    const modifiers: ScenarioInput['modifiers'] = [
      {
        id: 'test-armorpen',
        source: { kind: 'legendaryEffect', formId: '0x0', edid: 'TestAntiArmor', name: 'Test Anti-Armor' },
        bucket: 'armorPen',
        op: 'ADD',
        value: 0.5,
        conditions: [],
      },
    ];
    const withPen = computeScenarios({ ...baseInput, modifiers, enemyDefenses });
    const withoutPen = computeScenarios({ ...baseInput, enemyDefenses });
    expect(withPen.freeAim.effective!.perHit.total).toBeGreaterThan(withoutPen.freeAim.effective!.perHit.total);
  });

  it('DoT stays unmitigated and separate from `effective` (v1 scope)', () => {
    const enemyDefenses = { hp: 1000, resists: { physical: 300 } };
    const dotModifiers: ScenarioInput['modifiers'] = [
      {
        id: 'test-dot',
        source: { kind: 'omod', formId: '0x0', edid: 'TestBleed', name: 'Test Bleed' },
        bucket: 'dotDamage',
        op: 'ADD',
        value: 10,
        conditions: [],
      },
    ];
    const s = computeScenarios({ ...baseInput, modifiers: dotModifiers, enemyDefenses });
    expect(s.freeAim.dotDps).toBe(10);
    // `effective` only reflects perHit/sustainedDps — dotDps is a wholly
    // separate ScenarioResult field mitigation never touches.
    expect(s.freeAim.effective).toBeDefined();
  });
});
