import { describe, expect, it } from 'bun:test';
import {
  createArrayInterner,
  createKeyedCache,
  createMemoScope,
  createRecordInterner,
  scoped,
} from '@/lib/loadout-memo';

/**
 * Property tests for the argument-keyed memoization primitives underneath
 * `resolveLoadout`'s suggestions-sweep cache (see that file's doc-comment):
 * `scoped()`'s whole soundness case rests on "same arguments → same
 * reference; any differing argument → recompute" — these tests assert that
 * property directly at the primitive level, rather than only observing it
 * transitively through `evaluate-memo.test.ts`'s differential DPS checks.
 */

describe('scoped', () => {
  it('with no scope, is a plain passthrough — no caching, calls every time', () => {
    let calls = 0;
    const fn = scoped((n: number) => {
      calls++;
      return n * 2;
    });
    expect(fn(undefined, 5)).toBe(10);
    expect(fn(undefined, 5)).toBe(10);
    expect(calls).toBe(2);
  });

  it('same argument tuple returns the cached reference, not a recomputed one', () => {
    let calls = 0;
    const fn = scoped((n: number) => {
      calls++;
      return { n };
    });
    const scope = createMemoScope();
    const first = fn(scope, 5);
    const second = fn(scope, 5);
    expect(second).toBe(first);
    expect(calls).toBe(1);
  });

  it('a differing argument recomputes', () => {
    let calls = 0;
    const fn = scoped((n: number) => {
      calls++;
      return n * 2;
    });
    const scope = createMemoScope();
    fn(scope, 5);
    fn(scope, 6);
    expect(calls).toBe(2);
  });

  it('two different scoped() wrappers never collide even with identical argument tuples', () => {
    const scope = createMemoScope();
    const a = scoped((n: number) => ({ tag: 'a', n }));
    const b = scoped((n: number) => ({ tag: 'b', n }));
    expect(a(scope, 1)).toEqual({ tag: 'a', n: 1 });
    expect(b(scope, 1)).toEqual({ tag: 'b', n: 1 });
  });

  it('a primitive argument (not just an object reference) is a valid cache key', () => {
    let calls = 0;
    const fn = scoped((mode: string, n: number) => {
      calls++;
      return `${mode}:${n}`;
    });
    const scope = createMemoScope();
    fn(scope, 'live', 1);
    fn(scope, 'live', 1);
    fn(scope, 'pts', 1);
    expect(calls).toBe(2);
  });

  it("a longer key tuple that prefixes a shorter one doesn't collide (trie leaf vs intermediate node)", () => {
    let calls = 0;
    const fn = scoped((...keys: number[]) => {
      calls++;
      return keys.length;
    });
    const scope = createMemoScope();
    expect(fn(scope, 1)).toBe(1);
    expect(fn(scope, 1, 2)).toBe(2);
    expect(calls).toBe(2);
  });
});

describe('createArrayInterner', () => {
  it('two different (by reference) arrays with the same elements collapse to the first reference seen', () => {
    const intern = createArrayInterner<number>();
    const scope = createMemoScope();
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    expect(intern(scope, a)).toBe(a);
    expect(intern(scope, b)).toBe(a);
  });

  it('arrays with different elements do not collapse', () => {
    const intern = createArrayInterner<number>();
    const scope = createMemoScope();
    const a = [1, 2, 3];
    const b = [1, 2, 4];
    expect(intern(scope, b)).toBe(b);
    expect(intern(scope, a)).not.toBe(b);
  });

  it('two different interners never collide even given the same elements', () => {
    const scope = createMemoScope();
    const internA = createArrayInterner<number>();
    const internB = createArrayInterner<number>();
    const a = [1, 2, 3];
    const b = [1, 2, 3];
    const internedA = internA(scope, a);
    const internedB = internB(scope, b);
    // Each interner still returns ITS OWN first-seen reference — proves the
    // two interners have independent roots (a global interner would make
    // internedB === internedA here, since b is elementwise identical to a).
    expect(internedA).toBe(a);
    expect(internedB).toBe(b);
  });
});

describe('createRecordInterner', () => {
  it('two different (by reference) records with the same entries collapse, regardless of key order', () => {
    const intern = createRecordInterner<Record<string, number>>();
    const scope = createMemoScope();
    const a = { x: 1, y: 2 };
    const b = { y: 2, x: 1 };
    expect(intern(scope, a)).toBe(a);
    expect(intern(scope, b)).toBe(a);
  });

  it('records with different entries do not collapse', () => {
    const intern = createRecordInterner<Record<string, number>>();
    const scope = createMemoScope();
    const a = { x: 1 };
    const b = { x: 2 };
    expect(intern(scope, a)).toBe(a);
    expect(intern(scope, b)).toBe(b);
  });
});

describe('createKeyedCache', () => {
  it('caches on the explicit key tuple, independent of what compute() reads', () => {
    const cache = createKeyedCache<number>();
    const scope = createMemoScope();
    let calls = 0;
    // compute() closes over `input`, which is fresh every call — the key is
    // deliberately narrower, exactly like evaluate.ts's `computeSnapshot`.
    const run = (key: readonly unknown[], input: { value: number }) =>
      cache(scope, key, () => {
        calls++;
        return input.value;
      });
    expect(run(['a'], { value: 1 })).toBe(1);
    expect(run(['a'], { value: 999 })).toBe(1); // cache hit — fresh input ignored
    expect(calls).toBe(1);
    expect(run(['b'], { value: 2 })).toBe(2);
    expect(calls).toBe(2);
  });

  it('two different keyed caches never collide even given the same key tuple', () => {
    const scope = createMemoScope();
    const cacheA = createKeyedCache<string>();
    const cacheB = createKeyedCache<string>();
    expect(cacheA(scope, ['k'], () => 'a')).toBe('a');
    expect(cacheB(scope, ['k'], () => 'b')).toBe('b');
  });
});
