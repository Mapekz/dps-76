import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Independent multi-select toggles — chip pills with gaps and a color-only
 * active state (never a border-width swap), so the shape itself reads as
 * "pick any" rather than ToggleGroup's joined, mutually-exclusive look.
 */

export interface ToggleChipOption<T extends string> {
  value: T;
  label: string;
  active: boolean;
  title?: string;
  icon?: LucideIcon;
  compactLabel?: string;
}

export function ToggleChips<T extends string>({
  options,
  onToggle,
  size = 'sm',
  compact = false,
  'aria-label': ariaLabel,
}: {
  options: ReadonlyArray<ToggleChipOption<T>>;
  onToggle: (value: T, wasActive: boolean) => void;
  size?: 'xs' | 'sm';
  compact?: boolean;
  'aria-label'?: string;
}) {
  return (
    <div role="group" aria-label={ariaLabel} className="flex flex-wrap items-center gap-1.5">
      {options.map(opt => (
        <button
          key={opt.value}
          type="button"
          aria-pressed={opt.active}
          title={opt.title}
          onClick={() => onToggle(opt.value, opt.active)}
          className={cn(
            'focus-visible:ring-ring inline-flex items-center gap-1 rounded-none border tracking-wide uppercase transition-colors focus-visible:outline-none focus-visible:ring-2',
            size === 'xs' ? 'px-2 py-0.5 text-xs' : 'h-8 px-3 text-sm font-medium',
            opt.active
              ? 'border-primary text-foreground bg-primary/15'
              : 'border-border text-muted-foreground hover:text-foreground'
          )}
        >
          {opt.icon && <opt.icon className="size-3" />}
          {compact && opt.compactLabel ? opt.compactLabel : opt.label}
        </button>
      ))}
    </div>
  );
}
