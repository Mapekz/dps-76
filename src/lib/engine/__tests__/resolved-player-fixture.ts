import { createDefaultEnemyConditions } from '@/types';
import { createDefaultResolvedPlayer, type ResolvedPlayer } from '@/types/player';
import { SPECIAL_KEYS, type SpecialKey } from '@/lib/player-stats';

/**
 * Test-fixture factory for engine call sites that need a `ResolvedPlayer`.
 * Replaces the old `buildEffectiveWeapon`/`derivePlayerStats` default-arg
 * synthetic values — production callers must pass a real resolved view.
 */
export function makeResolvedPlayer(overrides?: Partial<ResolvedPlayer>): ResolvedPlayer {
  return { ...createDefaultResolvedPlayer(), ...overrides };
}

/** Pair with `makeResolvedPlayer` when a test needs explicit enemy defaults. */
export function makeDefaultEnemy() {
  return createDefaultEnemyConditions();
}

/** Every SPECIAL at 1, with `overrides` spread over it. */
export function baseSpecial(
  overrides: Partial<Record<SpecialKey, number>> = {},
): Record<SpecialKey, number> {
  return {
    ...(Object.fromEntries(SPECIAL_KEYS.map((k) => [k, 1])) as Record<SpecialKey, number>),
    ...overrides,
  };
}
