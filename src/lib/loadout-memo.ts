import type { GameMode } from '@/types';

/**
 * Generic tuple-keyed memoization for one `evaluateSuggestions` sweep
 * (src/lib/suggest/evaluate.ts).
 *
 * `resolveLoadout`'s assembly step (`assemble()`, loadout.ts) re-derives
 * ~10 independent modifier sources from `PlayerConfig`'s array/record slices
 * on every call. The suggestions sweep calls it ~600+ times per config
 * change, folding ONE `BuildAction` at a time through the (immutable-update)
 * reducer — so every slice EXCEPT the one the candidate's action actually
 * touches keeps referential identity between the baseline and that candidate
 * (`makeBuildReducer`'s `withPlayer` only ever replaces the touched field —
 * see state/build-reducer.ts). A `LoadoutMemo` is a short-lived, one
 * sweep's-worth cache keyed on those slice REFERENCES.
 *
 * Plain `Map`, not `WeakMap`: the whole memo is discarded at the end of the
 * sweep (nothing outlives it to leak), which lets a cache key be a primitive
 * (a string/number field read straight off a config, e.g. `targetRace`) as
 * well as an object/array reference — `WeakMap` would reject the former.
 *
 * OPT-IN: `resolveLoadout`/`assemble()` take an optional trailing `memo`
 * parameter. Every other caller (the app's normal single-shot render path,
 * golden-case tests, the hover-diff single-action eval) omits it and gets
 * the exact same unmemoized computation as before — there is no shared or
 * cross-render cache to invalidate.
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
export interface MemoNode {
  children: Map<unknown, MemoNode> | null;
  hasValue: boolean;
  value: unknown;
}

function makeMemoNode(): MemoNode {
  return { children: null, hasValue: false, value: undefined };
}

/** Tuple-keyed memoize: walks/creates one trie level per key, caches `compute()`'s result at the exact path's own node. */
export function memoize<V>(root: MemoNode, keys: readonly unknown[], compute: () => V): V {
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

/** `cached(memo?.someNode, keys, compute)` — computes directly (no cache) when `node` is undefined. */
export function cached<V>(
  node: MemoNode | undefined,
  keys: readonly unknown[],
  compute: () => V,
): V {
  return node ? memoize(node, keys, compute) : compute();
}

/**
 * One cache slot per independent `assemble()`/`resolveLoadout()` sub-step —
 * see the doc-comments at each call site in loadout.ts for exactly what
 * depends on what. Every slot is a fresh, empty trie root for the sweep's
 * duration.
 */
export interface LoadoutMemo {
  readonly mode: GameMode;
  readonly equippedOmods: MemoNode;
  readonly conditions: MemoNode;
  readonly strangeInNumbers: MemoNode;
  readonly classFreakRank: MemoNode;
  readonly underAlcoholEffect: MemoNode;
  readonly equippedPerkFamilyRanks: MemoNode;
  readonly wornPieceCounts: MemoNode;
  readonly wornPieceCountsCanonical: MemoNode;
  readonly perkFamilyModifiers: MemoNode;
  readonly buffModifiers: MemoNode;
  readonly suppressedAddictions: MemoNode;
  readonly countedAddictions: MemoNode;
  readonly addictionModifiers: MemoNode;
  readonly manualUptimeModifiers: MemoNode;
  readonly publicTeamModifiers: MemoNode;
  readonly targetDebuffModifiers: MemoNode;
  readonly armorEffectModifiers: MemoNode;
  readonly loadoutModifiers: MemoNode;
  readonly nonWeaponStatModifiers: MemoNode;
  readonly nonWeaponStatModifiersCanonical: MemoNode;
  readonly weaponRelevantModifiers: MemoNode;
  readonly effectiveWeapon: MemoNode;
  readonly modifiersCanonical: MemoNode;
  readonly derivedPlayerStats: MemoNode;
  readonly player: MemoNode;
  readonly enemyTypeIds: MemoNode;
  readonly targetBodyPart: MemoNode;
  readonly targetNpc: MemoNode;
  readonly enemyDefenses: MemoNode;
  /** Sweep-level cache for `computeScenarios` itself — see evaluate.ts's `computeSnapshot`. */
  readonly scenarios: MemoNode;
}

export function createLoadoutMemo(mode: GameMode): LoadoutMemo {
  return {
    mode,
    equippedOmods: makeMemoNode(),
    conditions: makeMemoNode(),
    strangeInNumbers: makeMemoNode(),
    classFreakRank: makeMemoNode(),
    underAlcoholEffect: makeMemoNode(),
    equippedPerkFamilyRanks: makeMemoNode(),
    wornPieceCounts: makeMemoNode(),
    wornPieceCountsCanonical: makeMemoNode(),
    perkFamilyModifiers: makeMemoNode(),
    buffModifiers: makeMemoNode(),
    suppressedAddictions: makeMemoNode(),
    countedAddictions: makeMemoNode(),
    addictionModifiers: makeMemoNode(),
    manualUptimeModifiers: makeMemoNode(),
    publicTeamModifiers: makeMemoNode(),
    targetDebuffModifiers: makeMemoNode(),
    armorEffectModifiers: makeMemoNode(),
    loadoutModifiers: makeMemoNode(),
    nonWeaponStatModifiers: makeMemoNode(),
    nonWeaponStatModifiersCanonical: makeMemoNode(),
    weaponRelevantModifiers: makeMemoNode(),
    effectiveWeapon: makeMemoNode(),
    modifiersCanonical: makeMemoNode(),
    derivedPlayerStats: makeMemoNode(),
    player: makeMemoNode(),
    enemyTypeIds: makeMemoNode(),
    targetBodyPart: makeMemoNode(),
    targetNpc: makeMemoNode(),
    enemyDefenses: makeMemoNode(),
    scenarios: makeMemoNode(),
  };
}
