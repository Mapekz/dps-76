import type { ReactElement } from 'react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { deltaToneClass, formatPercentDelta } from '@/lib/format';
import { useHoverDiffs } from '@/hooks/useHoverDiff';
import type { BuildAction } from '@/state/build-reducer';
import type { DpsSnapshot } from '@/lib/suggest/types';

/** One "+4.2%"-style delta, colored by sign, muted when ~zero. */
export function DeltaText({
  base,
  delta,
  className,
}: {
  base: number;
  delta: number;
  className?: string;
}) {
  const pct = base > 0 ? delta / base : 0;
  const tone = deltaToneClass(pct);
  if (tone === 'text-muted-foreground')
    return <span className={cn(tone, 'font-mono tabular-nums', className)}>±0%</span>;
  return (
    <span className={cn(tone, 'font-mono tabular-nums', className)}>{formatPercentDelta(pct)}</span>
  );
}

export function DiffRows({ delta, baseline }: { delta: DpsSnapshot; baseline: DpsSnapshot }) {
  return (
    <div className="grid grid-cols-[auto_auto] gap-x-3 gap-y-0.5 text-xs">
      <span className="text-muted-foreground">Free Aim</span>
      <DeltaText base={baseline.freeAim.sustainedDps} delta={delta.freeAim.sustainedDps} />
      <span className="text-muted-foreground">VATS</span>
      <DeltaText base={baseline.vats.sustainedDps} delta={delta.vats.sustainedDps} />
    </div>
  );
}

interface DiffTooltipProps {
  action: BuildAction;
  children: ReactElement;
}

/**
 * Wraps any control with a what-would-this-do tooltip showing the ΔDPS of
 * dispatching `action`. Opens on hover AND keyboard focus (Base UI handles
 * both); on touch, the suggestions panel is the discovery surface instead.
 */
export function DiffTooltip({ action, children }: DiffTooltipProps) {
  const { baseline, getDiff } = useHoverDiffs();
  if (!baseline) return <>{children}</>;
  const delta = getDiff(action);
  if (!delta) return <>{children}</>;

  return (
    <Tooltip>
      <TooltipTrigger delay={200} render={children} />
      <TooltipContent side="right" className="px-2.5 py-1.5">
        <DiffRows delta={delta} baseline={baseline} />
      </TooltipContent>
    </Tooltip>
  );
}
