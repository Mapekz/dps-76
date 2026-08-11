import { describe, expect, it } from 'bun:test';
import { isBulletStormStacksActive, isOnslaughtStacksActive } from '@/lib/engine/affordances';
import { resolveBulletStormStacks, resolveOnslaughtStacks } from '@/lib/engine/stacks';

describe('resolveOnslaughtStacks', () => {
  it('resolves the auto sentinel to max when no forward average is available', () => {
    expect(resolveOnslaughtStacks(-1, 10)).toBe(10);
  });

  it('uses forward average for the auto sentinel, clamped to max', () => {
    expect(resolveOnslaughtStacks(-1, 10, { forwardAvg: 6.5 })).toBe(6.5);
    expect(resolveOnslaughtStacks(-1, 10, { forwardAvg: 14 })).toBe(10);
  });

  it('passes through a manual pin below max', () => {
    expect(resolveOnslaughtStacks(4, 10)).toBe(4);
  });

  it('clamps a manual pin above max', () => {
    expect(resolveOnslaughtStacks(14, 10)).toBe(10);
  });

  it('manual pin beats a provided forward average', () => {
    expect(resolveOnslaughtStacks(4, 10, { forwardAvg: 8 })).toBe(4);
  });

  it('reverse average always wins over manual pin and forward average', () => {
    expect(resolveOnslaughtStacks(4, 10, { reverseAvg: 7, forwardAvg: 3 })).toBe(7);
    expect(resolveOnslaughtStacks(4, 10, { reverseAvg: 14 })).toBe(10);
  });
});

describe('resolveBulletStormStacks', () => {
  it('resolves the auto sentinel to max when no sustained average is available', () => {
    expect(resolveBulletStormStacks(-1, 3, 10)).toBe(10);
  });

  it('uses sustained average for the auto sentinel, clamped to bounds', () => {
    expect(resolveBulletStormStacks(-1, 3, 10, 6.5)).toBe(6.5);
    expect(resolveBulletStormStacks(-1, 3, 10, 1)).toBe(3);
    expect(resolveBulletStormStacks(-1, 3, 10, 14)).toBe(10);
  });

  it('manual pin wins over sustained average and clamps into [min, max]', () => {
    expect(resolveBulletStormStacks(6, 3, 10, 8)).toBe(6);
    expect(resolveBulletStormStacks(14, 3, 10, 8)).toBe(10);
    expect(resolveBulletStormStacks(1, 3, 10, 8)).toBe(3);
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
});

describe('isOnslaughtStacksActive', () => {
  it('is inactive at the auto sentinel regardless of reverse mode', () => {
    expect(isOnslaughtStacksActive(-1, false)).toBe(false);
    expect(isOnslaughtStacksActive(-1, true)).toBe(false);
  });

  it('is active for a manual pin when reverse mode is off', () => {
    expect(isOnslaughtStacksActive(4, false)).toBe(true);
  });

  it('is inactive for a manual pin when reverse mode is on', () => {
    expect(isOnslaughtStacksActive(4, true)).toBe(false);
  });
});

describe('isBulletStormStacksActive', () => {
  it('is inactive at the auto sentinel', () => {
    expect(isBulletStormStacksActive(-1)).toBe(false);
  });

  it('is active for a manual pin', () => {
    expect(isBulletStormStacksActive(6)).toBe(true);
  });
});
