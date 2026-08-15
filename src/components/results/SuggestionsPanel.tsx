import * as React from 'react';
import { Loader2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
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
const CONSUMABLE_LIMIT = 4;

function SuggestionRow({ suggestion, tied }: { suggestion: EvaluatedSuggestion; tied?: boolean }) {
  const dispatch = useBuildDispatch();
  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate" title={suggestion.label}>
        {suggestion.label}
      </span>
      {!suggestion.budget.legal && (
        <span
          className="text-negative whitespace-nowrap text-micro"
          title="Would exceed the perk point budget"
        >
          {suggestion.budget.special
            ? `+${suggestion.budget.deficit} ${suggestion.budget.special.slice(0, 3).toUpperCase()}`
            : 'no free slot'}
        </span>
      )}
      {suggestion.group === 'combo' && (
        <Badge
          variant="secondary"
          className="whitespace-nowrap"
          title="Applies two changes at once"
        >
          Combo
        </Badge>
      )}
      <span
        className={cn(
          'font-mono text-xs tabular-nums',
          tied ? 'text-muted-foreground' : 'text-positive',
        )}
      >
        {tied ? '≈' : formatPercentDelta(suggestion.primaryDeltaPct)}
      </span>
      <Button
        variant="ghost"
        size="sm"
        className="h-6 px-2 text-xs"
        onClick={() => suggestion.action.forEach((a) => dispatch(a))}
      >
        Apply
      </Button>
    </div>
  );
}

/**
 * One ranked/tied/empty block. Reused for the structural-suggestions section
 * and the consumable-boosts section below it — same row markup, same "tied"
 * (<1%) treatment, different scope of candidates and empty-state copy.
 *
 * Every ranked row renders at equal visual weight, on purpose: a min-maxer
 * picks the change that fits their own build/playstyle, not necessarily the
 * single highest-delta one, so the list doesn't editorialize with a "top
 * pick" treatment.
 */
function SuggestionSection({
  title,
  ranked,
  tied,
  emptyMessage,
}: {
  title?: string;
  ranked: EvaluatedSuggestion[];
  tied: EvaluatedSuggestion[];
  emptyMessage: React.ReactNode;
}) {
  return (
    <div>
      {title && (
        <p className="font-condensed text-muted-foreground mb-1 text-section font-semibold uppercase tracking-[0.12em]">
          {title}
        </p>
      )}

      {ranked.length === 0 && tied.length === 0 ? (
        <p className="text-muted-foreground py-1 text-sm">{emptyMessage}</p>
      ) : (
        <>
          {ranked.length > 0 && (
            <div className="divide-border/50 divide-y">
              {ranked.map((s) => (
                <SuggestionRow key={s.id} suggestion={s} />
              ))}
            </div>
          )}

          {tied.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-1">
                <Separator className="flex-1" />
                <Tooltip>
                  <TooltipTrigger
                    render={
                      <span className="text-muted-foreground cursor-default text-micro uppercase tracking-wide" />
                    }
                  >
                    effectively tied
                  </TooltipTrigger>
                  <TooltipContent>
                    Gains under 1% — within the noise of the fire-rate approximation.
                  </TooltipContent>
                </Tooltip>
                <Separator className="flex-1" />
              </div>
              <div className="divide-border/50 divide-y">
                {tied.map((s) => (
                  <SuggestionRow key={s.id} suggestion={s} tied />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

/**
 * Ranked single-change what-ifs, re-simmed on every build change (debounced;
 * the whole sweep is ~2ms). Apply feedback is the headline flash — the
 * numbers the user is already watching move. Split into a structural
 * section (mods/legendaries/perks/mutations/armor — the default
 * `topSuggestions` scope) and a consumable-boosts section, since consumables
 * are transient buffs rather than build changes and would otherwise crowd
 * out the structural ranking.
 */
export function SuggestionsPanel() {
  const { report, stale } = useSuggestions();
  if (!report || !report.baseline) return null;

  const { ranked, tied } = topSuggestions(report, PANEL_LIMIT);
  const consumables = topSuggestions(report, CONSUMABLE_LIMIT, undefined, {
    groups: new Set(['consumable']),
  });
  const metricLabel = report.metric === 'vats' ? 'VATS' : 'Free Aim';
  const rankingLabel = report.metric === 'vats' ? 'VATS-window DPS' : 'Free Aim sustained';

  return (
    <div className={cn('space-y-3 transition-opacity', stale && 'opacity-60')}>
      <div>
        <div className="flex items-center justify-between">
          <p className="font-condensed text-muted-foreground text-xs font-semibold uppercase tracking-[0.14em]">
            Suggestions
          </p>
          <span className="text-muted-foreground flex items-center gap-1 text-micro">
            {stale && <Loader2Icon className="size-3 animate-spin" />}
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-default" />}>
                ranked by {rankingLabel}
              </TooltipTrigger>
              <TooltipContent>
                Counts only the AP-funded firing window, so VATS gains aren't diluted by the
                free-aim pause. The headline above still reports blended achieved DPS.
              </TooltipContent>
            </Tooltip>
          </span>
        </div>

        <SuggestionSection
          ranked={ranked}
          tied={tied}
          emptyMessage={
            <>Nothing beats the current setup — this build is locally optimal for {metricLabel}.</>
          }
        />
      </div>

      <div>
        <SuggestionSection
          title="Consumable boosts"
          ranked={consumables.ranked}
          tied={consumables.tied}
          emptyMessage={<>No consumable currently helps {metricLabel} sustained.</>}
        />
      </div>
    </div>
  );
}
