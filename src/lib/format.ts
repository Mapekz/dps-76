/** Damage-number formatting: 1 decimal under 1k, thousands-separated above. */
export function formatDamage(value: number): string {
  if (!Number.isFinite(value)) return '—';
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString('en-US');
  return value.toFixed(1);
}

export function formatPercentDelta(fraction: number): string {
  const pct = fraction * 100;
  return `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`;
}

/** Below this fractional magnitude, a delta reads as unchanged (float noise), not a real move. */
const DELTA_NEUTRAL_EPSILON = 0.0005;

/**
 * Sign of a fractional delta → the semantic color class it renders in.
 * Shared by every "+4.2%"-style delta (DeltaText, DeltaFlash's ghost badge,
 * SuggestionsPanel's ranked-gain column) so the sign→class mapping lives in
 * one place instead of being re-derived per call site. Not used for
 * DeltaFlash's primary-number `motion-reduce:text-*` class — that variant
 * needs the complete class name to appear as a literal source substring for
 * Tailwind's scanner to generate it, so it stays a hand-written ternary.
 */
export function deltaToneClass(
  fraction: number,
): 'text-positive' | 'text-negative' | 'text-muted-foreground' {
  if (Math.abs(fraction) < DELTA_NEUTRAL_EPSILON) return 'text-muted-foreground';
  return fraction > 0 ? 'text-positive' : 'text-negative';
}

/** "+25%" for whole-number percentages, "+7.5%" otherwise. */
export function formatPercent(fraction: number): string {
  const pct = fraction * 100;
  const rounded = Math.round(pct * 10) / 10;
  const magnitude = Number.isInteger(rounded) ? rounded.toString() : rounded.toFixed(1);
  return `${pct > 0 ? '+' : ''}${magnitude}%`;
}

/** Percentage with rounded integer — "75%". */
export function formatRetainedPct(value: number): string {
  return `${Math.round(value)}%`;
}

/** Time-to-kill: seconds under a minute (1 decimal), "Xm Ys" (whole seconds, no "0s") at or past it, or infinity symbol. */
export function formatTtk(ttkSec: number): string {
  if (!Number.isFinite(ttkSec)) return '∞';
  if (ttkSec < 60) return `${ttkSec.toFixed(1)}s`;
  const minutes = Math.floor(ttkSec / 60);
  const seconds = Math.round(ttkSec - minutes * 60);
  // Rounding seconds up can itself reach 60 (e.g. 119.6s), which would
  // otherwise print as the invalid "1m 60s" — roll it into the next minute.
  if (seconds === 60) return `${minutes + 1}m`;
  return seconds === 0 ? `${minutes}m` : `${minutes}m ${seconds}s`;
}
