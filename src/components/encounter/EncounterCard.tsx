import type { RefObject } from 'react';
import { SwordsIcon, CrosshairIcon } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { Body } from '@/components/ui/typography';
import { useScenarioResults } from '@/state/useScenarioResults';
import { HeadlineStrip } from '@/components/results/HeadlineStrip';
import { AttackStateGroup } from './AttackStateGroup';
import { TargetPanel } from './TargetPanel';

/**
 * The Player-vs-Target card: the scenario readout plus everything that defines
 * the encounter being simulated (fight-state toggles, target identity/state),
 * mounted full-width above the Build / results columns. BuildColumn stays
 * purely "what your character has"; this card is "what fight you're in".
 */
export function EncounterCard({
  className,
  sentinelRef,
}: {
  className?: string;
  sentinelRef?: RefObject<HTMLDivElement | null>;
}) {
  const { scenarios } = useScenarioResults();
  return (
    <Card className={className}>
      <CardHeader className="pb-2">
        <CardTitle level={2} className="flex items-center gap-2">
          <SwordsIcon className="size-4" />
          Encounter
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {scenarios ? (
            <HeadlineStrip />
          ) : (
            <div className="space-y-2 py-6 text-center">
              <CrosshairIcon className="text-muted-foreground mx-auto size-8" />
              <p className="text-sm font-medium">No weapon equipped</p>
              <Body className="text-muted-foreground">
                Pick a weapon under <span className="text-foreground">Build → Weapon</span>, or
                paste a Nukes &amp; Dragons link in the header to import your perks.
              </Body>
            </div>
          )}
          {/* Scroll sentinel for the collapsing sticky strip (wired by AppShell).
              Must stay OUTSIDE the ternary so the observed node never unmounts. */}
          <div ref={sentinelRef} aria-hidden="true" className="h-px" />
          <Separator />
          {/* The explicit minmax(0,1fr) single-column track matters for the same
              reason as AppShell's main grid: an implicit `auto` track is sized by
              min-content, so one wide unbreakable row inside TargetPanel would
              push the whole card past a narrow viewport instead of wrapping. */}
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-2">
            <AttackStateGroup />
            <TargetPanel />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
