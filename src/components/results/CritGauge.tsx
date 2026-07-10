import { cn } from '@/lib/utils';
import type { CritMeterResult } from '@/lib/engine/crit-meter';

const MAX_SEGMENTS = 12;

/**
 * Segmented crit-cadence gauge: one segment per shot in the steady-state
 * cycle, the final (crit) shot in gold. Driven by the crit meter the engine
 * already computes; the label carries the number, the marks carry the rhythm.
 */
export function CritGauge({ critMeter }: { critMeter: CritMeterResult }) {
  const { shotsPerCrit } = critMeter;

  if (!Number.isFinite(shotsPerCrit)) {
    return <p className="text-muted-foreground text-xs">No crits — the meter never fills.</p>;
  }

  const segments = Math.min(shotsPerCrit, MAX_SEGMENTS);
  const truncated = shotsPerCrit > MAX_SEGMENTS;

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-0.5" role="img" aria-label={`Critical hit every ${shotsPerCrit} shots`}>
        {Array.from({ length: segments }, (_, i) => {
          const isCritShot = !truncated && i === segments - 1;
          return (
            <span
              key={i}
              className={cn(
                'h-1.5 flex-1 rounded-[1px] transition-colors',
                isCritShot ? 'bg-primary' : 'bg-muted-foreground/30'
              )}
            />
          );
        })}
        {truncated && <span className="text-muted-foreground pl-1 text-[10px]">…</span>}
      </div>
      <p className="text-muted-foreground text-xs">
        Crit every {shotsPerCrit === 2 ? '2nd' : `${shotsPerCrit}th`} shot
      </p>
    </div>
  );
}
