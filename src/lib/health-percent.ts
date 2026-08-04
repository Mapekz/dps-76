/**
 * Health % is a discrete slider, not a free-form input — game builds only
 * ever sit at a handful of meaningful bands. The player set is dense at the
 * low end because that's where Bloodied / Nerd Rage / Serendipity actually
 * live; the enemy set (Executioner's / Instigating) only needs coarse bands.
 * Single source of truth shared by ConditionsSection, TargetSection, the
 * `race/set`/`build/importNd` reducer cases, and the codec's decode-time
 * migration for off-grid values from older saved URLs.
 */
export const PLAYER_HEALTH_PERCENT_STOPS = [5, 10, 15, 20, 40, 60, 80, 100] as const;
export const ENEMY_HEALTH_PERCENT_STOPS = [20, 40, 60, 80, 100] as const;

/** Nearest stop; exact ties round up. Values outside the list clamp to its ends. */
export function snapHealthPercent(value: number, stops: readonly number[]): number {
  let best = stops[0];
  let bestDist = Math.abs(value - best);
  for (const stop of stops) {
    const dist = Math.abs(value - stop);
    if (dist < bestDist || (dist === bestDist && stop > best)) {
      best = stop;
      bestDist = dist;
    }
  }
  return best;
}

/** Index of the nearest stop — the player slider's coordinate space (Base UI needs a uniform step). */
export function healthPercentIndex(value: number, stops: readonly number[]): number {
  return stops.indexOf(snapHealthPercent(value, stops) as (typeof stops)[number]);
}
