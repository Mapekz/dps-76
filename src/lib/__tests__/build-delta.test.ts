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
});
