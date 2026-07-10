import { cn } from '@/lib/utils';
import { useDeltaFlash } from '@/hooks/useDeltaFlash';
import { formatDamage, formatPercentDelta } from '@/lib/format';

interface DeltaFlashProps {
  value: number | null | undefined;
  format?: (value: number) => string;
  className?: string;
}

/**
 * A number that pulses green/red when it changes, with a ghost "+4.2%"
 * superscript. Text stays in ink tokens; only the transient pulse is colored.
 */
export function DeltaFlash({ value, format = formatDamage, className }: DeltaFlashProps) {
  const flash = useDeltaFlash(value);

  return (
    <span className={cn('relative inline-block font-mono tabular-nums', className)}>
      <span
        key={flash?.id ?? 'idle'}
        className={cn(flash && (flash.dir === 'up' ? 'animate-flash-positive' : 'animate-flash-negative'))}
      >
        {value === null || value === undefined ? '—' : format(value)}
      </span>
      {flash && (
        <span
          key={`ghost-${flash.id}`}
          aria-hidden
          className={cn(
            'animate-ghost-rise absolute -right-1 -top-3 translate-x-full text-[10px] font-medium',
            flash.dir === 'up' ? 'text-positive' : 'text-negative'
          )}
        >
          {formatPercentDelta(flash.pct)}
        </span>
      )}
    </span>
  );
}
