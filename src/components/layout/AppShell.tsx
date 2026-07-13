import { Header } from './Header';
import { BuildColumn } from '@/components/build/BuildColumn';
import { ResultsPane } from '@/components/results/ResultsPane';
import { HeadlineStrip } from '@/components/results/HeadlineStrip';
import { EnemyTableSection } from '@/components/enemies/EnemyTableSection';

export function AppShell() {
  return (
    <div className="bg-background min-h-screen">
      <Header />

      {/* Mobile: condensed sticky readout keeps the tweak→flash loop visible. */}
      <div className="bg-background/95 sticky top-[57px] z-30 border-b backdrop-blur lg:hidden">
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
        {/* Mobile: damage output first, build config below it. */}
        <div className="lg:hidden">
          <ResultsPane />
        </div>
        <BuildColumn />
        <div className="hidden lg:block">
          <ResultsPane />
        </div>
      </main>

      <EnemyTableSection />
    </div>
  );
}
