import { MinusIcon, PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { DiffTooltip } from '@/components/diff/DiffTooltip';
import type { BuildAction } from '@/state/build-reducer';

export function CountStepper({
  count,
  min,
  max,
  onDecrement,
  onIncrement,
  decrementDisabled,
  incrementDisabled,
  incrementTitle,
  decrementTooltipAction,
  incrementTooltipAction,
  decrementAriaLabel,
  incrementAriaLabel,
}: {
  count: number;
  min: number;
  max: number;
  onDecrement: () => void;
  onIncrement: () => void;
  /** Extra disable conditions composed with the min/max bounds, never replacing them. */
  decrementDisabled?: boolean;
  incrementDisabled?: boolean;
  incrementTitle?: string;
  decrementTooltipAction: BuildAction;
  incrementTooltipAction: BuildAction;
  decrementAriaLabel: string;
  incrementAriaLabel: string;
}) {
  return (
    <>
      <DiffTooltip action={decrementTooltipAction}>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={count <= min || decrementDisabled}
          aria-label={decrementAriaLabel}
          onClick={onDecrement}
        >
          <MinusIcon className="size-3" />
        </Button>
      </DiffTooltip>
      <span className="w-4 text-center font-mono text-xs tabular-nums">{count}</span>
      <DiffTooltip action={incrementTooltipAction}>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={count >= max || incrementDisabled}
          aria-label={incrementAriaLabel}
          title={incrementTitle}
          onClick={onIncrement}
        >
          <PlusIcon className="size-3" />
        </Button>
      </DiffTooltip>
    </>
  );
}
