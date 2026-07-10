import { useHoverDiffs } from '@/hooks/useHoverDiff';
import { useScenarioResults } from '@/state/useScenarioResults';
import type { BuildAction } from '@/state/build-reducer';
import { DeltaText } from './DiffTooltip';

/**
 * Inline "what would this option do" delta (emphasized scenario, sustained
 * DPS) — rendered directly in option rows so the answer is visible before
 * hovering, and on touch where hover doesn't exist.
 */
export function ActionDelta({ action, className }: { action: BuildAction; className?: string }) {
  const { baseline, getDiff } = useHoverDiffs();
  const { emphasized } = useScenarioResults();
  if (!baseline) return null;
  const delta = getDiff(action);
  if (!delta) return null;
  return (
    <DeltaText
      base={baseline[emphasized].sustainedDps}
      delta={delta[emphasized].sustainedDps}
      className={className ?? 'ml-2 text-[10px]'}
    />
  );
}
