import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';

/**
 * Single-select segmented control over a small discrete range — the ButtonGroup
 * + active/outline Button idiom (TargetSection's status/distance rows) lifted
 * into one component. Preferred over a Slider for few-valued inputs like
 * damage-multiplier tiers (0–40%), teammate count (0–3), or enemy group size.
 */

export interface ToggleGroupOption<T extends string | number> {
  value: T;
  label: string;
  title?: string;
}

export function ToggleGroup<T extends string | number>({
  options,
  value,
  onValueChange,
  disabled,
  'aria-label': ariaLabel,
}: {
  options: ReadonlyArray<ToggleGroupOption<T>>;
  value: T;
  onValueChange: (value: T) => void;
  disabled?: boolean;
  'aria-label'?: string;
}) {
  return (
    <ButtonGroup role="radiogroup" aria-label={ariaLabel}>
      {options.map(opt => (
        <Button
          key={opt.value}
          type="button"
          size="sm"
          role="radio"
          aria-checked={value === opt.value}
          variant={value === opt.value ? 'default' : 'outline'}
          className={value === opt.value ? 'border border-primary hover:border-primary/90' : undefined}
          disabled={disabled}
          title={opt.title}
          onClick={() => onValueChange(opt.value)}
        >
          {opt.label}
        </Button>
      ))}
    </ButtonGroup>
  );
}
