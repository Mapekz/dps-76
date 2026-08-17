import { Header } from './Header';
import { BuildColumn } from '@/components/build/BuildColumn';
import { EncounterCard } from '@/components/encounter/EncounterCard';
import { ResultsPane } from '@/components/results/ResultsPane';

export function AppShell() {
  return (
    <div className="bg-background min-h-screen">
      <Header />

      {/* The single-column mobile track needs minmax(0,1fr) for the same reason the
          lg: tracks do: an implicit `auto` track is sized by its content's
          min-content, so one long unbreakable row (a section header, a wide table)
          widens the column past the viewport and the whole page scrolls sideways
          instead of the inner `truncate` rules doing their job. */}
      <main className="container mx-auto grid grid-cols-[minmax(0,1fr)] gap-6 px-4 py-6 lg:grid-cols-[minmax(0,1fr)_clamp(340px,32vw,420px)]">
        <EncounterCard className="lg:col-span-2" />
        {/* Mobile: Encounter first, then suggestions/breakdown, then build config. */}
        <div className="lg:hidden">
          <ResultsPane />
        </div>
        <BuildColumn />
        <div className="hidden lg:block">
          <ResultsPane />
        </div>
      </main>
    </div>
  );
}
