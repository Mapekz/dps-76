import { createDefaultEnemyConditions } from '@/types';
import { createDefaultResolvedPlayer, type ResolvedPlayer } from '@/types/player';

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
