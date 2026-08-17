import { Header } from './Header';
import { BuildColumn } from '@/components/build/BuildColumn';
import { EncounterCard } from '@/components/encounter/EncounterCard';
import { HeadlineStrip } from '@/components/results/HeadlineStrip';
import { ResultsPane } from '@/components/results/ResultsPane';
import { useScrollPastSentinel } from '@/hooks/useScrollPastSentinel';
import { cn } from '@/lib/utils';

export function AppShell() {
  const { sentinelRef, isPast } = useScrollPastSentinel<HTMLDivElement>(57);

  return (
    <div className="bg-background min-h-screen">
      <Header />

      {/* Collapsing readout: appears only once the Encounter card's scenario band
          scrolls under the header, so the tweak→flash loop survives deep scrolls
          on every viewport (DESIGN.md's Numbers-Stay-Visible Rule). */}
      <div
        className={cn(
          'bg-background/95 sticky top-[57px] z-30 border-b backdrop-blur',
          !isPast && 'hidden',
        )}
      >
        <div className="container mx-auto px-4 py-2">
          <HeadlineStrip variant="condensed" />
        </div>
      </div>

      {/* The single-column mobile track needs minmax(0,1fr) for the same reason the
          lg: tracks do: an implicit `auto` track is sized by its content's
          min-content, so one long unbreakable row (a section header, a wide table)
          widens the column past the viewport and the whole page scrolls sideways
          instead of the inner `truncate` rules doing their job. */}
      <main className="container mx-auto grid grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_clamp(340px,32vw,420px)]">
        <EncounterCard className="lg:col-span-2" sentinelRef={sentinelRef} />
        {/* Mobile: Encounter first, then suggestions/breakdown, then build config. */}
        <div className="lg:hidden">
          <ResultsPane isStripVisible={isPast} />
        </div>
        <BuildColumn />
        <div className="hidden lg:block">
          <ResultsPane isStripVisible={isPast} />
        </div>
      </main>
    </div>
  );
}
