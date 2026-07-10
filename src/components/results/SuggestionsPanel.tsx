import { Loader2Icon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { formatPercentDelta } from '@/lib/format';
import { useSuggestions } from '@/hooks/useSuggestions';
import { topSuggestions } from '@/lib/suggest/evaluate';
import { useBuildDispatch } from '@/state/BuildProvider';
import type { EvaluatedSuggestion } from '@/lib/suggest/types';

const PANEL_LIMIT = 8;

function SuggestionRow({ suggestion, tied }: { suggestion: EvaluatedSuggestion; tied?: boolean }) {
  const dispatch = useBuildDispatch();
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate" title={suggestion.label}>
        {suggestion.label}
      </span>
      {!suggestion.budget.legal && (
        <span className="text-negative whitespace-nowrap text-[10px]" title="Would exceed the perk point budget">
          {suggestion.budget.special
            ? `needs ${suggestion.budget.deficit} pt in ${suggestion.budget.special.slice(0, 3).toUpperCase()}`
            : 'no free slot'}
        </span>
      )}
      <span className={cn('font-mono text-xs tabular-nums', tied ? 'text-muted-foreground' : 'text-positive')}>
        {tied ? '≈' : formatPercentDelta(suggestion.primaryDeltaPct)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => dispatch(suggestion.action)}
      >
        Apply
      </Button>
    </div>
  );
}

/**
 * Ranked single-change what-ifs, re-simmed on every build change (debounced;
 * the whole sweep is ~2ms). Apply feedback is the headline flash — the
 * numbers the user is already watching move.
 */
export function SuggestionsPanel() {
  const { report, stale } = useSuggestions();
  if (!report || !report.baseline) return null;

  const { ranked, tied } = topSuggestions(report, PANEL_LIMIT);
  const metricLabel = report.metric === 'vats' ? 'VATS' : 'Free Aim';

  return (
    <div className={cn('space-y-1 transition-opacity', stale && 'opacity-60')}>
      <div className="flex items-center justify-between">
        <p className="font-condensed text-muted-foreground text-xs font-semibold uppercase tracking-[0.14em]">
          Suggestions
        </p>
        <span className="text-muted-foreground flex items-center gap-1 text-[10px]">
          {stale && <Loader2Icon className="size-3 animate-spin" />}
          ranked by {metricLabel} sustained
        </span>
      </div>

      {ranked.length === 0 && tied.length === 0 ? (
        <p className="text-muted-foreground py-1 text-sm">
          Nothing beats the current setup — this build is locally optimal for {metricLabel}.
        </p>
      ) : (
        <div className="divide-border/50 divide-y">
          {ranked.map(s => (
            <SuggestionRow key={s.id} suggestion={s} />
          ))}
        </div>
      )}

      {tied.length > 0 && (
        <>
          <div className="flex items-center gap-2 pt-1">
            <Separator className="flex-1" />
            <Tooltip>
              <TooltipTrigger asChild>
                <span className="text-muted-foreground cursor-default text-[10px] uppercase tracking-wide">
                  effectively tied
                </span>
              </TooltipTrigger>
              <TooltipContent>Gains under 1% — within the noise of the fire-rate approximation.</TooltipContent>
            </Tooltip>
            <Separator className="flex-1" />
          </div>
          <div className="divide-border/50 divide-y">
            {tied.map(s => (
              <SuggestionRow key={s.id} suggestion={s} tied />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
