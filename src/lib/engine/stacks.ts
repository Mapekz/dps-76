/**
 * Resolve an Onslaught stored stack count or override against its folded max.
 */
export function resolveOnslaughtStacks(stored: number, max: number, override?: number): number {
  const raw = override ?? (stored === -1 ? max : stored);
  return Math.min(raw, max);
}

/**
 * Resolve a Bullet Storm stored stack count or override against its folded bounds.
 */
export function resolveBulletStormStacks(stored: number, min: number, max: number, override?: number): number {
  const raw = override ?? (stored === -1 ? max : stored);
  return Math.max(0, Math.min(Math.max(raw, min), max));
}
