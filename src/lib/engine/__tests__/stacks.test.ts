import { describe, expect, it } from 'vitest';
import { resolveBulletStormStacks, resolveOnslaughtStacks } from '@/lib/engine/stacks';

describe('resolveOnslaughtStacks', () => {
  it('resolves the follow-max sentinel to the folded max', () => {
    expect(resolveOnslaughtStacks(-1, 10)).toBe(10);
  });

  it('passes through an explicit stored value below max', () => {
    expect(resolveOnslaughtStacks(4, 10)).toBe(4);
  });

  it('clamps an explicit stored value above max', () => {
    expect(resolveOnslaughtStacks(14, 10)).toBe(10);
  });

  it('uses an override when present and clamps it to max', () => {
    expect(resolveOnslaughtStacks(2, 10, 14)).toBe(10);
  });
});

describe('resolveBulletStormStacks', () => {
  it('resolves the follow-max sentinel to the folded max', () => {
    expect(resolveBulletStormStacks(-1, 3, 10)).toBe(10);
  });

  it('passes through an explicit stored value within the bounds', () => {
    expect(resolveBulletStormStacks(6, 3, 10)).toBe(6);
  });

  it('clamps an explicit stored value above max', () => {
    expect(resolveBulletStormStacks(14, 3, 10)).toBe(10);
  });

  it('clamps an explicit stored value below min', () => {
    expect(resolveBulletStormStacks(1, 3, 10)).toBe(3);
  });

  it('degrades min above max to max', () => {
    expect(resolveBulletStormStacks(7, 12, 10)).toBe(10);
  });

  it('uses an override when present and clamps it to the same bounds', () => {
    expect(resolveBulletStormStacks(2, 3, 10, 14)).toBe(10);
    expect(resolveBulletStormStacks(8, 3, 10, 1)).toBe(3);
  });
});
