/**
 * Generic argument-keyed memoization for one `evaluateSuggestions` sweep
 * (src/lib/suggest/evaluate.ts).
 *
 * `resolveLoadout`'s assembly step (`assemble()`, loadout.ts) re-derives
 * ~10 independent modifier sources from `PlayerConfig`'s array/record slices
 * on every call. The suggestions sweep calls it ~600+ times per config
 * change, folding ONE `BuildAction` at a time through the (immutable-update)
 * reducer — so every slice EXCEPT the one the candidate's action actually
 * touches keeps referential identity between the baseline and that candidate
 * (`makeBuildReducer`'s `withPlayer` only ever replaces the touched field —
 * see state/build-reducer.ts). A `MemoScope` is a short-lived, one
 * sweep's-worth cache keyed on those slice REFERENCES.
 *
 * `scoped()` wraps a pure function so a `MemoScope` caches it on its own
 * ARGUMENT TUPLE — the cache key IS the parameter list, not a separately
 * declared array a caller has to keep in sync by hand. A function can only
 * read what it was passed, so an under-declared key (reading a slice the key
 * array doesn't list) is not expressible: see loadout.ts's call sites for how
 * every memoized sub-step of `assemble()` is now `scoped()`'s parameter list.
 *
 * The one constraint this shifts onto callers: parameters MUST stay narrow —
 * individual `PlayerConfig`/`EnemyConfig` slices (perks, armorEffects, a
 * derived primitive), never a whole config object. The reducer replaces the
 * touched config for every candidate, so a whole-object parameter would key
 * on a reference that changes on every call and the cache would never hit.
 * This is the same discipline the old hand-written key arrays existed to
 * satisfy — `scoped()` just makes violating it impossible to do silently,
 * because the parameter shows up in the wrapped function's own signature.
 *
 * OPT-IN: every wrapper takes an optional leading `scope` argument. Every
 * caller besides the suggestions sweep (the app's normal single-shot render
 * path, golden-case tests, the hover-diff single-action eval) omits it and
 * gets the exact same unmemoized computation as before — there is no shared
 * or cross-render cache to invalidate.
 *
 * `createArrayInterner`/`createRecordInterner` restore referential identity
 * for a value that's already been computed, rather than caching a
 * computation — see their own doc-comments. `createKeyedCache` is a narrow
 * escape hatch for the rare case where the sound cache key is provably
 * NARROWER than what the cached computation reads, because of an invariant
 * the caller (not the callee) knows to hold — see its own doc-comment.
 */

/**
 * One trie node: `children` is the path onward for each key at this depth,
 * `value`/`hasValue` is the memoized result for the EXACT path ending here.
 * Kept as two separate fields (not "value stashed in the same Map the
 * children live in") specifically so a SHORT key tuple's leaf can never be
 * mistaken for an intermediate node a LONGER tuple sharing that prefix
 * needs to keep walking through — `weaponRelevantModifiersFor` (loadout.ts)
 * keys on a variable-length array of Modifier objects (one key per element),
 * so two calls' tuples routinely prefix one another.
 */
interface MemoNode {
  children: Map<unknown, MemoNode> | null;
  hasValue: boolean;
  value: unknown;
}

function makeMemoNode(): MemoNode {
  return { children: null, hasValue: false, value: undefined };
}

/** Tuple-keyed memoize: walks/creates one trie level per key, caches `compute()`'s result at the exact path's own node. */
function memoize<V>(root: MemoNode, keys: readonly unknown[], compute: () => V): V {
  let node = root;
  for (const key of keys) {
    if (!node.children) node.children = new Map();
    let next = node.children.get(key);
    if (!next) {
      next = makeMemoNode();
      node.children.set(key, next);
    }
    node = next;
  }
  if (node.hasValue) return node.value as V;
  const value = compute();
  node.value = value;
  node.hasValue = true;
  return value;
}

/**
 * One sweep's worth of memo roots, one per `scoped()`/interner identity
 * (allocated lazily on first use — see `scoped`). Plain `Map`, not
 * `WeakMap`: the whole scope is discarded at the end of the sweep (nothing
 * outlives it to leak), which lets a wrapped function's own identity (a
 * plain object reference, stable for the module's lifetime) key the roots
 * map, and lets an individual cache KEY be a primitive (a string/number
 * field read straight off a config) as well as an object/array reference —
 * `WeakMap` would reject the former.
 */
export interface MemoScope {
  readonly roots: Map<unknown, MemoNode>;
}

export function createMemoScope(): MemoScope {
  return { roots: new Map() };
}

/**
 * Wrap a pure function so a `MemoScope` caches it on its own argument tuple.
 * `fn`'s identity (stable for the module's lifetime — always assign the
 * result to a top-level `const`) selects its private root within the scope,
 * so two different `scoped()` wrappers never collide even if their argument
 * tuples happen to coincide. With no `scope` (every caller but the
 * suggestions sweep), this is a plain passthrough to `fn`.
 */
export function scoped<A extends readonly unknown[], V>(fn: (...args: A) => V) {
  return (scope: MemoScope | undefined, ...args: A): V => {
    if (!scope) return fn(...args);
    let root = scope.roots.get(fn);
    if (!root) {
      root = makeMemoNode();
      scope.roots.set(fn, root);
    }
    return memoize(root, args, () => fn(...args));
  };
}

/**
 * Create an array-interning function with its own private identity: within
 * one `MemoScope`, the first array with a given elementwise-identical
 * sequence wins, and later structurally-equal-but-freshly-allocated arrays
 * collapse onto that same reference — letting a DOWNSTREAM reference-keyed
 * `scoped()` call hit even though its input was rebuilt with `[...]`. This
 * restores referential identity; it does not cache a computation (the
 * filter/spread already ran before interning sees the result).
 *
 * Each call site should create its own interner via this factory (mirrors
 * `scoped`'s per-wrapped-function isolation via `fn` identity) — sharing one
 * interner across unrelated arrays would let two different sources collide
 * whenever they happen to produce the same elements.
 */
export function createArrayInterner<T>() {
  const identity = {};
  return (scope: MemoScope | undefined, value: T[]): T[] => {
    if (!scope) return value;
    let root = scope.roots.get(identity);
    if (!root) {
      root = makeMemoNode();
      scope.roots.set(identity, root);
    }
    return memoize(root, value, () => value);
  };
}

/**
 * Same idea as `createArrayInterner`, for a small `Record<string, number>`:
 * flatten to a `[key1, value1, key2, value2, ...]` tuple (sorted so key
 * ORDER can't cause a spurious miss) and use that as the trie key, so two
 * calls whose Record has the same entries — even though each is a
 * freshly-allocated object — collapse to the SAME reference. Cheap here
 * because these Records are tiny (a handful of self-scaling armor-effect
 * keywords at most).
 */
export function createRecordInterner<T extends Record<string, number>>() {
  const identity = {};
  return (scope: MemoScope | undefined, rec: T): T => {
    if (!scope) return rec;
    let root = scope.roots.get(identity);
    if (!root) {
      root = makeMemoNode();
      scope.roots.set(identity, root);
    }
    const flatKey = Object.keys(rec)
      .sort()
      .flatMap((k) => [k, rec[k]]);
    return memoize(root, flatKey, () => rec);
  };
}

/**
 * Escape hatch: cache `compute()`'s result on an EXPLICIT key tuple the
 * CALLER vouches for, decoupled from what `compute()` itself reads. Prefer
 * `scoped()` — its key is enforced to be exactly what the wrapped function
 * reads, so there is nothing to get wrong. Reach for `createKeyedCache` only
 * when the key is deliberately NARROWER than `compute()`'s real inputs
 * because of an invariant the CALLER (not the callee) knows to hold — e.g.
 * `evaluate.ts`'s `computeSnapshot`, which knows every `ScenarioInput` field
 * except weapon/modifiers/player is invariant for one suggestions sweep
 * (the sweep never touches `EnemyConfig` or `mode`), even though those other
 * fields aren't reference-stable the way weapon/modifiers/player are — so
 * keying `computeScenarios`'s cache on the full `ScenarioInput` (a fresh
 * object every call) would never hit. Each call site should still create its
 * own cache via this factory (same per-call-site isolation as `scoped`'s `fn`
 * identity and the interners' `identity` object) — this primitive relaxes
 * WHICH key you supply, not the one-identity-per-call-site discipline.
 */
export function createKeyedCache<V>() {
  const identity = {};
  return (scope: MemoScope | undefined, key: readonly unknown[], compute: () => V): V => {
    if (!scope) return compute();
    let root = scope.roots.get(identity);
    if (!root) {
      root = makeMemoNode();
      scope.roots.set(identity, root);
    }
    return memoize(root, key, compute);
  };
}
