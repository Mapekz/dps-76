import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useScenarioResults } from '@/state/useScenarioResults';
import { SuggestionsPanel } from './SuggestionsPanel';
import { BreakdownPanel } from './BreakdownPanel';

/** The sticky right pane: ranked suggestions → derivation. */
export function ResultsPane({ isStripVisible = false }: { isStripVisible?: boolean }) {
  const { scenarios } = useScenarioResults();

  if (!scenarios) {
    return null;
  }

  return (
    <div
      className={cn(
        'space-y-4 lg:self-start lg:overflow-y-auto',
        isStripVisible
          ? 'lg:sticky lg:top-[118px] lg:max-h-[calc(100vh-134px)]' /* 118 = 73 + the condensed strip's measured 45px — keep in sync with AppShell's strip */
          : 'lg:sticky lg:top-[73px] lg:max-h-[calc(100vh-89px)]',
      )}
    >
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
