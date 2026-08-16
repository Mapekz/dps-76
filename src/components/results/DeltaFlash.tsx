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
 *
 * Not color-only: `formatPercentDelta` always includes an explicit sign
 * (`+4.2%` / `-4.2%`, never bare digits), so the ghost badge already reads
 * correctly for a color-blind sighted user without a direction icon —
 * deliberately not an arrow/chevron, since those already mean "disclosure"
 * elsewhere in this app (accordion, combobox).
 *
 * `animate-flash-{positive,negative}` is the primary number's ONLY color
 * source, entirely inside the keyframe's `from` — disabling it under
 * `prefers-reduced-motion` would leave the headline number with zero visual
 * feedback (only the small corner badge would still show anything, since its
 * color is already a static class). `motion-reduce:text-*` below adds a
 * static fallback so the number itself still signals under reduced motion,
 * without needing the keyframe.
 *
 * The ghost badge stays `aria-hidden`: it's a decorative superscript that
 * fires on every recompute (every keystroke that moves a stat), and wiring
 * it into an `aria-live` region would spam screen-reader users constantly —
 * a worse experience than the transient visual pulse, not a better one.
 */
export function DeltaFlash({ value, format = formatDamage, className }: DeltaFlashProps) {
  const flash = useDeltaFlash(value);

  return (
    <span className={cn('relative inline-block font-mono tabular-nums', className)}>
      <span
        key={flash?.id ?? 'idle'}
        className={cn(
          flash &&
            (flash.dir === 'up'
              ? 'animate-flash-positive motion-reduce:text-positive'
              : 'animate-flash-negative motion-reduce:text-negative'),
        )}
      >
        {value === null || value === undefined ? '—' : format(value)}
      </span>
      {flash && (
        <span
          key={`ghost-${flash.id}`}
          aria-hidden
          className={cn(
            'animate-ghost-rise absolute -right-1 -top-3 translate-x-full text-micro font-medium',
            flash.dir === 'up' ? 'text-positive' : 'text-negative',
          )}
        >
          {formatPercentDelta(flash.pct)}
        </span>
      )}
    </span>
  );
}
