import { describe, it, expect } from 'vitest';
import type { GeneratedBuff } from '@/types/generated';
import type { Bucket, Condition, Modifier } from '@/types/modifiers';
import { applyClassFreakPenaltyScaling } from '@/lib/class-freak-mutations';
import { getMutations } from '@/data/buffs';

function mod(id: string, opts: { bucket?: Bucket; value?: number; conditions?: Condition[] } = {}): Modifier {
  return {
    id,
    source: { kind: 'mutation', formId: '0xC1A55', edid: 'TestMutation', name: 'Test Mutation' },
    bucket: opts.bucket ?? 'specialStrength',
    op: 'ADD',
    conditions: opts.conditions ?? [],
    value: opts.value ?? -3,
  };
}

function mutation(overrides: Partial<GeneratedBuff> = {}): GeneratedBuff {
  return {
    id: 'TestMutation',
    formId: '0xC1A55',
    name: 'Test Mutation',
    kind: 'mutation',
    modifiers: [mod('0xC1A55:0')],
    penaltyModifierIds: ['0xC1A55:0'],
    notes: [],
    ...overrides,
  };
}

describe('applyClassFreakPenaltyScaling', () => {
  it('a buff without penaltyModifierIds passes its modifiers through unchanged', () => {
    const buff = mutation({ penaltyModifierIds: undefined });
    expect(applyClassFreakPenaltyScaling(buff)).toBe(buff.modifiers); // same array, no copy
  });

  it('a tagged flat modifier expands into 4 rank-conditioned variants (×1/×0.75/×0.5/×0.25)', () => {
    const buff = mutation(); // specialStrength −3, tagged
    const result = applyClassFreakPenaltyScaling(buff);
    expect(result).toHaveLength(4);
    expect(result.map(m => ('value' in m ? m.value : null))).toEqual([-3, -2.25, -1.5, -0.75]);
    expect(result.map(m => m.id)).toEqual([
      '0xC1A55:0:cf0',
      '0xC1A55:0:cf1',
      '0xC1A55:0:cf2',
      '0xC1A55:0:cf3',
    ]);
    result.forEach((m, rank) => {
      expect(m.conditions).toEqual([{ kind: 'classFreakRank', min: rank, max: rank }]);
    });
  });

  it('appends the classFreakRank condition AFTER existing ones; untagged siblings pass through untouched, ordering preserved', () => {
    const preConditioned = mod('0xC1A55:0', { conditions: [{ kind: 'strangeInNumbers', value: false }] });
    const untagged = mod('0xC1A55:1', {
      bucket: 'specialEndurance',
      value: 2,
      conditions: [{ kind: 'strangeInNumbers', value: true }],
    });
    const buff = mutation({ modifiers: [preConditioned, untagged], penaltyModifierIds: ['0xC1A55:0'] });
    const result = applyClassFreakPenaltyScaling(buff);

    expect(result).toHaveLength(5); // 4 expanded + 1 untouched
    expect(result.map(m => m.id)).toEqual([
      '0xC1A55:0:cf0',
      '0xC1A55:0:cf1',
      '0xC1A55:0:cf2',
      '0xC1A55:0:cf3',
      '0xC1A55:1',
    ]);

    const expanded = result.filter(m => m.id.startsWith('0xC1A55:0:cf'));
    expanded.forEach((m, rank) => {
      expect(m.conditions).toEqual([
        { kind: 'strangeInNumbers', value: false },
        { kind: 'classFreakRank', min: rank, max: rank },
      ]);
    });

    const passthrough = result.find(m => m.id === '0xC1A55:1');
    expect(passthrough).toMatchObject({
      bucket: 'specialEndurance',
      value: 2,
      conditions: [{ kind: 'strangeInNumbers', value: true }],
    });
  });

  it('a tagged curve modifier scales curveScale by the tier factor (curve points untouched)', () => {
    const curveMod: Modifier = {
      id: '0xC1A55:0',
      source: { kind: 'mutation', formId: '0xC1A55', edid: 'TestMutation', name: 'Test Mutation' },
      bucket: 'dbm',
      op: 'ADD',
      conditions: [],
      curve: { input: 'healthFraction', points: [{ x: 0, y: 1 }, { x: 1, y: 0 }] },
      curveScale: 0.01,
    };
    const buff = mutation({ modifiers: [curveMod] });
    const result = applyClassFreakPenaltyScaling(buff);

    expect(result).toHaveLength(4);
    expect(result.map(m => ('curveScale' in m ? m.curveScale : null))).toEqual([0.01, 0.0075, 0.005, 0.0025]);
    result.forEach(m => {
      expect('curve' in m && m.curve).toMatchObject({ points: curveMod.curve!.points });
    });
  });
});

describe('real extracted data (Egg Head, 2026-07-14 Class Freak audit)', () => {
  const eggHead = getMutations('live').find(m => m.id === 'Mutation_EggHead');

  it('exists and carries the expected penalty tags (STR/END flat ADDs, not the INT SIN variants)', () => {
    expect(eggHead).toBeDefined();
    expect(eggHead!.penaltyModifierIds).toEqual(['0x003C4045:0', '0x003C4045:1']);
  });

  it('2 tagged ids expand to 8 variants + 2 untagged INT variants pass through = 10 total', () => {
    const result = applyClassFreakPenaltyScaling(eggHead!);
    expect(result).toHaveLength(10);

    const expanded = result.filter(m => m.id.includes(':cf'));
    expect(expanded).toHaveLength(8);

    const passthrough = result.filter(m => !m.id.includes(':cf'));
    expect(passthrough).toHaveLength(2);
    expect(passthrough.every(m => m.bucket === 'specialIntelligence')).toBe(true);
  });

  it('the rank-3 STR variant is −0.75 (base −3 × 0.25)', () => {
    const result = applyClassFreakPenaltyScaling(eggHead!);
    const strRank3 = result.find(m => m.id === '0x003C4045:0:cf3');
    expect(strRank3).toBeDefined();
    expect(strRank3).toMatchObject({ bucket: 'specialStrength', value: -0.75 });
    expect(strRank3!.conditions).toContainEqual({ kind: 'classFreakRank', min: 3, max: 3 });
  });
});
