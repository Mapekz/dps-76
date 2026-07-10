import { CrosshairIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useScenarioResults } from '@/state/useScenarioResults';
import { HeadlineStrip } from './HeadlineStrip';
import { SuggestionsPanel } from './SuggestionsPanel';
import { BreakdownPanel } from './BreakdownPanel';

/** The sticky right pane: headline strip → ranked suggestions → derivation. */
export function ResultsPane() {
  const { scenarios } = useScenarioResults();

  return (
    <div className="space-y-4 lg:sticky lg:top-[73px] lg:max-h-[calc(100vh-89px)] lg:self-start lg:overflow-y-auto">
      <Card>
        <CardContent className="pt-4">
          {scenarios ? (
            <div className="space-y-3">
              <HeadlineStrip />
              <Separator />
              <SuggestionsPanel />
              <Separator />
              <BreakdownPanel />
            </div>
          ) : (
            <div className="space-y-2 py-6 text-center">
              <CrosshairIcon className="text-muted-foreground mx-auto size-8" />
              <p className="text-sm font-medium">No weapon equipped</p>
              <p className="text-muted-foreground text-sm">
                Pick a weapon under <span className="text-foreground">Build → Weapon</span>, or paste a Nukes &amp;
                Dragons link in the header to import your perks.
              </p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
