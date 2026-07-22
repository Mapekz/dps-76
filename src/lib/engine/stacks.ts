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

/** Whether the Onslaught stack slider counts as an active (non-auto) condition. */
export function isOnslaughtStacksActive(stored: number, reverse: boolean): boolean {
  return stored !== -1 && !reverse;
}

/** Whether the Bullet Storm stack slider counts as an active (non-auto) condition. */
export function isBulletStormStacksActive(stored: number, averageMode: boolean): boolean {
  return stored !== -1 && !averageMode;
}
