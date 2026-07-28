import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Independent multi-select toggles — gapped chip pills (never joined, unlike
 * ToggleGroup's segmented single-select look), each rendered as a real
 * `Button` so the selected/unselected treatment (solid gold fill vs outline)
 * matches ToggleGroup's exactly — same component, same typography, just laid
 * out with gaps to read as "pick any" rather than "mutually exclusive."
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
      {options.map((opt) => (
        <Button
          key={opt.value}
          type="button"
          size={size}
          variant={opt.active ? 'default' : 'outline'}
          className={opt.active ? 'border border-primary hover:border-primary/90' : undefined}
          aria-pressed={opt.active}
          title={opt.title}
          onClick={() => onToggle(opt.value, opt.active)}
        >
          {opt.icon && <opt.icon data-icon="inline-start" />}
          {compact && opt.compactLabel ? opt.compactLabel : opt.label}
        </Button>
      ))}
    </div>
  );
}
