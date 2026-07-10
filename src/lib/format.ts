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
