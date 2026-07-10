import { describe, it, expect } from 'vitest';
import { translate, type MgefInfo, type SpellEffect, type AvifRoute } from '../normalize/mgef';
import { flattenPerkConditionRows } from '../normalize/conditions';

// Pins the PURE (sync) MGEF → IR translation with plain fixtures — no esm CLI
// client, no shell-out. The async gather lives in translateMagicEffect.

function mgef(overrides: Partial<MgefInfo> = {}): MgefInfo {
  return { edid: 'TestMgef', name: 'Test', archetype: 'Value Modifier', actorValue: '0xAV', ...overrides };
}

function effect(overrides: Partial<SpellEffect> = {}): SpellEffect {
  return {
    mgefFormId: '0xM',
    magnitude: 0,
    duration: 0,
    conditionRows: [],
    curvePoints: null,
    curveInputAv: null,
    ...overrides,
  };
}

const noRoutes = new Map<string, AvifRoute[]>();
// AV resolves to a fallback route (STAT_SneakAttackBonus → sneakBonus, ×0.01).
const edids = new Map<string, string>([['0xAV', 'STAT_SneakAttackBonus']]);

describe('translate (pure MGEF → IR)', () => {
  it('emits a plain value modifier via a fallback route: value = magnitude × scale', () => {
    const r = translate(mgef(), effect({ magnitude: 50 }), noRoutes, edids);
    expect(r.modifiers).toHaveLength(1);
    expect(r.modifiers[0]).toEqual({ bucket: 'sneakBonus', op: 'ADD', value: 0.5, conditions: [] });
    expect('curve' in r.modifiers[0]).toBe(false);
  });

  it('emits a curve modifier carrying curveScale (not value) when the effect has a curve', () => {
    const curved = effect({ curvePoints: [{ x: 0.05, y: 130 }, { x: 1.0, y: 0 }], curveInputAv: '0x00000392' });
    const r = translate(mgef(), curved, noRoutes, edids);
    expect(r.modifiers).toHaveLength(1);
    const m = r.modifiers[0];
    expect(m.curve?.input).toBe('healthFraction');
    // The scale becomes curveScale; there is no `value` on the curve variant.
    expect(m.curve ? m.curveScale : null).toBeCloseTo(0.01, 10);
    expect('value' in m).toBe(false);
  });

  it('skips non-value archetypes and reports an override note', () => {
    const r = translate(mgef({ archetype: 'Script' }), effect({ magnitude: 5 }), noRoutes, edids);
    expect(r.modifiers).toHaveLength(0);
    expect(r.notes.some(n => n.includes('needs override'))).toBe(true);
  });
});

describe('flattenPerkConditionRows', () => {
  it('flattens tabbed perk conditions and forces Run On=Target for tab index 2', () => {
    const rows = flattenPerkConditionRows([
      {
        'Perk Condition': {
          'Run On (Tab Index)': 2,
          Conditions: [
            { Condition: { 'Condition Data': { Function: 'HasKeyword', 'Parameter 1': '0xKW', 'Comparison Value': 1 } } },
          ],
        },
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ Function: 'HasKeyword', 'Parameter 1': '0xKW', 'Run On': 'Target' });
  });

  it('returns [] for a non-array node', () => {
    expect(flattenPerkConditionRows(undefined)).toEqual([]);
  });
});
