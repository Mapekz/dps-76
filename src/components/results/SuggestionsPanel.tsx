import * as React from 'react';
import { Loader2Icon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Body, MicroLabel, Readout, SectionLabel } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import { deltaToneClass, formatPercentDelta } from '@/lib/format';
import { useSuggestions } from '@/hooks/useSuggestions';
import { STRUCTURAL_GROUPS, topSuggestions } from '@/lib/suggest/evaluate';
import { useBuildDispatch } from '@/state/BuildProvider';
import type { EvaluatedSuggestion, SuggestionGroup } from '@/lib/suggest/types';
import type { ScenarioKey } from '@/state/build-reducer';

const PANEL_LIMIT = 8;
const CONSUMABLE_LIMIT = 4;
const UPTIME_LIMIT = 4;
const UPTIME_EPSILON = 0.005;

/**
 * DEV SCAFFOLDING — flip to compare how VATS uptime levers (AP regen/cost
 * picks, worth 1–3% each) stay visible against +50% damage upgrades:
 *   'sections' — a dedicated "VATS uptime" section below the main list
 *   'inline'   — one list, each row annotated with its uptime effect
 * Neither changes a percentage. Delete the losing branch and this flag once
 * converged.
 */
const SUGGESTION_LAYOUT: 'sections' | 'inline' = 'sections';

const ALL_SUGGESTION_GROUPS: ReadonlySet<SuggestionGroup> = new Set([
  ...STRUCTURAL_GROUPS,
  'consumable',
]);

function formatUptimePct(ratio: number): string {
  return `${Math.round(ratio * 100)}%`;
}

function SuggestionRow({
  suggestion,
  tied,
  baselineUptime,
  metric,
}: {
  suggestion: EvaluatedSuggestion;
  tied?: boolean;
  baselineUptime?: number;
  metric?: ScenarioKey;
}) {
  const dispatch = useBuildDispatch();

  const uptimeAnnotation =
    SUGGESTION_LAYOUT === 'inline' &&
    metric === 'vats' &&
    baselineUptime !== undefined &&
    Math.abs(suggestion.delta.vats.uptime) >= UPTIME_EPSILON
      ? (() => {
          const after = baselineUptime + suggestion.delta.vats.uptime;
          const arrow = suggestion.delta.vats.uptime > 0 ? '↑' : '↓';
          return `${arrow}uptime ${formatUptimePct(baselineUptime)}→${formatUptimePct(after)}`;
        })()
      : null;

  return (
    <div className="flex items-center gap-2 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate" title={suggestion.detail ?? suggestion.label}>
        {suggestion.label}
      </span>
      {suggestion.group === 'combo' && (
        <Badge
          variant="secondary"
          className="whitespace-nowrap"
          title="Applies two changes at once"
        >
          Combo
        </Badge>
      )}
      <Readout
        size="sm"
        className={cn(
          // Suggestions are always net-positive changes (topSuggestions only
          // ranks gains) — deltaToneClass is reused here for a shared
          // sign→class mapping, not because a negative row is expected.
          tied ? 'text-muted-foreground' : deltaToneClass(suggestion.primaryDeltaPct),
        )}
      >
        {tied ? '≈' : formatPercentDelta(suggestion.primaryDeltaPct)}
      </Readout>
      {uptimeAnnotation && (
        <span className="text-muted-foreground whitespace-nowrap text-3xs">{uptimeAnnotation}</span>
      )}
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
  titleTooltip,
  ranked,
  tied,
  emptyMessage,
  baselineUptime,
  metric,
}: {
  title?: string;
  titleTooltip?: React.ReactNode;
  ranked: EvaluatedSuggestion[];
  tied: EvaluatedSuggestion[];
  emptyMessage: React.ReactNode;
  baselineUptime?: number;
  metric?: ScenarioKey;
}) {
  return (
    <div>
      {title &&
        (titleTooltip ? (
          <Tooltip>
            <TooltipTrigger render={<SectionLabel className="mb-1 cursor-default" />}>
              {title}
            </TooltipTrigger>
            <TooltipContent>{titleTooltip}</TooltipContent>
          </Tooltip>
        ) : (
          <SectionLabel className="mb-1">{title}</SectionLabel>
        ))}

      {ranked.length === 0 && tied.length === 0 ? (
        <Body className="text-muted-foreground py-1">{emptyMessage}</Body>
      ) : (
        <>
          {ranked.length > 0 && (
            <div className="divide-border/50 divide-y">
              {ranked.map((s) => (
                <SuggestionRow
                  key={s.id}
                  suggestion={s}
                  baselineUptime={baselineUptime}
                  metric={metric}
                />
              ))}
            </div>
          )}

          {tied.length > 0 && (
            <>
              <div className="flex items-center gap-2 pt-1">
                <Separator className="flex-1" />
                <Tooltip>
                  <TooltipTrigger
                    render={<MicroLabel className="text-muted-foreground cursor-default" />}
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
                  <SuggestionRow
                    key={s.id}
                    suggestion={s}
                    tied
                    baselineUptime={baselineUptime}
                    metric={metric}
                  />
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
  const uptimeLevers =
    report.metric === 'vats' && SUGGESTION_LAYOUT === 'sections'
      ? topSuggestions(report, UPTIME_LIMIT, undefined, {
          groups: ALL_SUGGESTION_GROUPS,
          filter: (s) => s.delta.vats.uptime > UPTIME_EPSILON,
        })
      : null;
  const metricLabel = report.metric === 'vats' ? 'VATS' : 'Free Aim';
  const rankingLabel = report.metric === 'vats' ? 'VATS achieved DPS' : 'Free Aim sustained';
  const baselineUptime = report.baseline[report.metric].uptime;

  return (
    <div className={cn('space-y-3 transition-opacity', stale && 'opacity-60')}>
      <div>
        <div className="flex items-center justify-between">
          {/* h3, matching HeadlineStrip's "Damage output" — see its comment. */}
          <SectionLabel level={3}>Suggestions</SectionLabel>
          <span className="text-muted-foreground flex items-center gap-1 text-3xs">
            {stale && <Loader2Icon className="size-3 animate-spin" />}
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-default" />}>
                ranked by {rankingLabel}
              </TooltipTrigger>
              <TooltipContent>
                Ranking uses the same blended achieved DPS the headline reports, so a
                suggestion&apos;s percentage is exactly what the headline will move by.
              </TooltipContent>
            </Tooltip>
          </span>
        </div>

        <SuggestionSection
          ranked={ranked}
          tied={tied}
          baselineUptime={baselineUptime}
          metric={report.metric}
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
          baselineUptime={baselineUptime}
          metric={report.metric}
          emptyMessage={<>No consumable currently helps {metricLabel} sustained.</>}
        />
      </div>

      {uptimeLevers && (
        <div>
          <SuggestionSection
            title="VATS uptime"
            titleTooltip={
              <>
                These raise the share of time you can fire in VATS, which pays off indirectly
                through more VATS seconds and therefore more crits. Small individually — which is
                why they get their own section instead of competing in the main ranking.
              </>
            }
            ranked={uptimeLevers.ranked}
            tied={uptimeLevers.tied}
            baselineUptime={baselineUptime}
            metric={report.metric}
            emptyMessage={<>Nothing currently raises VATS uptime.</>}
          />
        </div>
      )}
    </div>
  );
}
