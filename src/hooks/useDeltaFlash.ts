import * as React from 'react';

export interface DeltaFlashState {
  /** Monotonic id so consecutive flashes restart the CSS animation. */
  id: number;
  dir: 'up' | 'down';
  /** Fractional change vs the previous value (0.042 = +4.2%). */
  pct: number;
}

/** Ignore float noise below ±0.05%. */
const MIN_DELTA = 0.0005;
const FLASH_MS = 900;

/**
 * Previous-vs-current comparison for one displayed number. First mount and
 * null→number transitions (weapon equip, boot hydration from an empty
 * default) never flash — a flash means "your change moved this number".
 */
export function useDeltaFlash(value: number | null | undefined): DeltaFlashState | null {
  const prevRef = React.useRef<number | null | undefined>(undefined);
  const idRef = React.useRef(0);
  const [flash, setFlash] = React.useState<DeltaFlashState | null>(null);

  React.useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = value;
    if (prev === undefined || prev === null || value === null || value === undefined) return;
    if (prev === 0) return;
    const pct = (value - prev) / Math.abs(prev);
    if (Math.abs(pct) < MIN_DELTA) return;

    idRef.current += 1;
    setFlash({ id: idRef.current, dir: pct > 0 ? 'up' : 'down', pct });
    const timer = window.setTimeout(() => setFlash(null), FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [value]);

  return flash;
}
