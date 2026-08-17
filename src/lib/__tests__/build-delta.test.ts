import { describe, expect, it } from 'bun:test';
import { buildDelta, buildDeltaCount } from '@/lib/build-delta';

describe('buildDelta', () => {
  const defaults = { a: 1, b: 'x', c: false };

  it('returns an empty diff when every field matches defaults', () => {
    expect(buildDelta({ a: 1, b: 'x', c: false }, defaults)).toEqual({});
    expect(buildDeltaCount({ a: 1, b: 'x', c: false }, defaults)).toBe(0);
  });

  it('returns only the changed field when one value differs', () => {
    expect(buildDelta({ a: 2, b: 'x', c: false }, defaults)).toEqual({ a: 2 });
    expect(buildDeltaCount({ a: 2, b: 'x', c: false }, defaults)).toBe(1);
  });

  it('returns every changed field when several values differ', () => {
    const value = { a: 2, b: 'y', c: true };
    expect(buildDelta(value, defaults)).toEqual({ a: 2, b: 'y', c: true });
    expect(buildDeltaCount(value, defaults)).toBe(3);
  });

  it('treats two distinct-but-empty arrays as equal', () => {
    const value = { ids: [] as string[] };
    const defs = { ids: [] as string[] };
    expect(buildDelta(value, defs)).toEqual({});
    expect(buildDeltaCount(value, defs)).toBe(0);
  });

  it('includes an array when its content differs from the default', () => {
    const value = { ids: ['challenge-a'] };
    const defs = { ids: [] as string[] };
    expect(buildDelta(value, defs)).toEqual({ ids: ['challenge-a'] });
    expect(buildDeltaCount(value, defs)).toBe(1);
  });

  it('treats same array content with different references as equal', () => {
    const value = { ids: ['a', 'b'] };
    const defs = { ids: ['a', 'b'] };
    expect(buildDelta(value, defs)).toEqual({});
    expect(buildDeltaCount(value, defs)).toBe(0);
  });

  it('compares nested plain objects by content', () => {
    const value = { counts: { alpha: 1, beta: 2 } };
    const defs = { counts: { alpha: 1, beta: 2 } };
    expect(buildDelta(value, defs)).toEqual({});
    expect(buildDeltaCount(value, defs)).toBe(0);

    const changed = { counts: { alpha: 1, beta: 3 } };
    expect(buildDelta(changed, defs)).toEqual({ counts: { alpha: 1, beta: 3 } });
    expect(buildDeltaCount(changed, defs)).toBe(1);
  });

  it('keeps strict primitive comparison (including 0, false, and null)', () => {
    const defs = { n: 1, flag: true, label: 'x', empty: null as string | null };
    expect(buildDelta({ n: 0, flag: true, label: 'x', empty: null }, defs)).toEqual({ n: 0 });
    expect(buildDelta({ n: 1, flag: false, label: 'x', empty: null }, defs)).toEqual({
      flag: false,
    });
    expect(buildDelta({ n: 1, flag: true, label: 'x', empty: 'set' }, defs)).toEqual({
      empty: 'set',
    });
    expect(buildDelta({ n: 1, flag: true, label: 'x', empty: null }, defs)).toEqual({});
  });
});
