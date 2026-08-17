import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useScenarioResults } from '@/state/useScenarioResults';
import { SuggestionsPanel } from './SuggestionsPanel';
import { BreakdownPanel } from './BreakdownPanel';

/** The sticky right pane: ranked suggestions → derivation. */
export function ResultsPane() {
  const { scenarios } = useScenarioResults();

  if (!scenarios) {
    return null;
  }

  return (
    <div className="space-y-4 lg:sticky lg:top-[73px] lg:max-h-[calc(100vh-89px)] lg:self-start lg:overflow-y-auto">
      <Card>
        <CardContent className="pt-4">
          <div className="space-y-3">
            <SuggestionsPanel />
            <Separator />
            <BreakdownPanel />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
