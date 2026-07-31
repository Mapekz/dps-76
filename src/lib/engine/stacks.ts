/**
 * Resolve an Onslaught stored stack count against its folded max.
 * Reverse-mode average always wins; auto (`-1`) uses the forward sustained average;
 * a manual pin wins over forward average.
 */
export function resolveOnslaughtStacks(
  stored: number,
  max: number,
  sustained: { reverseAvg?: number; forwardAvg?: number } = {},
): number {
  if (sustained.reverseAvg !== undefined) {
    return Math.min(sustained.reverseAvg, max);
  }
  if (stored === -1) {
    return Math.min(sustained.forwardAvg ?? max, max);
  }
  return Math.min(stored, max);
}

/**
 * Resolve a Bullet Storm stored stack count against its folded bounds.
 * Auto (`-1`) uses the sustained average; a manual pin wins over it.
 */
export function resolveBulletStormStacks(
  stored: number,
  min: number,
  max: number,
  sustainedAvg?: number,
): number {
  const raw = stored === -1 ? (sustainedAvg ?? max) : stored;
  return Math.max(0, Math.min(Math.max(raw, min), max));
}

/** Whether the Onslaught stack slider counts as active — manual pin only (auto is `-1`). */
export function isOnslaughtStacksActive(stored: number, reverse: boolean): boolean {
  return stored !== -1 && !reverse;
}

/** Whether the Bullet Storm stack slider counts as active — manual pin only (auto is `-1`). */
export function isBulletStormStacksActive(stored: number): boolean {
  return stored !== -1;
}
