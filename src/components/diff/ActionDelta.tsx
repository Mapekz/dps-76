import { useHoverDiffs } from '@/hooks/useHoverDiff';
import { useScenarioResults } from '@/state/useScenarioResults';
import type { BuildAction } from '@/state/build-reducer';
import { DeltaText } from './DiffTooltip';

/**
 * Inline "what would this option do" delta — the canonical delta, the same
 * number the headline, DiffTooltip and panel rows show — so a preview can
 * never contradict what the user sees after clicking. Fixes the magazine-capacity
 * bug where Tesla Science 5's ammoFreeChance read ±0% under the old window
 * metric while actually moving the headline +6.7%: a longer magazine cuts reload
 * downtime and therefore AP-regen time, so uptime fell as fast as sustained rose.
 *
 * Rendered directly in option rows so the answer is visible before hovering,
 * and on touch where hover doesn't exist.
 *
 * `action` may be a single `BuildAction` or an ordered sequence — e.g. an
 * effect switch is really "drop the old selection, then set the new one",
 * and previewing only the second half would show the wrong delta.
 */
export function ActionDelta({
  action,
  className,
}: {
  action: BuildAction | readonly BuildAction[];
  className?: string;
}) {
  const { baseline, getDiff } = useHoverDiffs();
  const { emphasized } = useScenarioResults();
  if (!baseline) return null;
  const delta = getDiff(action);
  if (!delta) return null;
  return (
    <DeltaText
      base={baseline[emphasized].totalDps}
      delta={delta[emphasized].totalDps}
      className={className ?? 'ml-2 text-3xs'}
    />
  );
}
