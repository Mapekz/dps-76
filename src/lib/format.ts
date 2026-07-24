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

/** Time-to-kill in seconds or infinity symbol. */
export function formatTtk(ttkSec: number): string {
  return Number.isFinite(ttkSec) ? `${ttkSec.toFixed(1)}s` : '∞';
}
