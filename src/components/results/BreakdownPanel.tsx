import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { SectionLabel } from '@/components/ui/typography';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { useScenarioResults } from '@/state/useScenarioResults';
import { ApEconomyPanel } from './ApEconomyPanel';
import { MultiplierChainTable } from './MultiplierChainTable';

/**
 * "Why these numbers" — the expandable derivation behind each scenario.
 * Open state persists (part of the shared view state → URL/localStorage).
 */
export function BreakdownPanel() {
  const { scenarios } = useScenarioResults();
  const { view } = useBuild();
  const dispatch = useBuildDispatch();
  if (!scenarios) return null;

  return (
    <Accordion
      value={view.breakdownOpen ? ['breakdown'] : []}
      onValueChange={(value) =>
        dispatch({ type: 'view/set', view: { breakdownOpen: value.includes('breakdown') } })
      }
    >
      <AccordionItem value="breakdown" className="border-b-0">
        <AccordionTrigger className="py-2">
          <SectionLabel as="span">Why these numbers</SectionLabel>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <SectionLabel className="mb-1">Free Aim</SectionLabel>
              <MultiplierChainTable result={scenarios.freeAim} />
            </div>
            <div>
              <SectionLabel className="mb-1">VATS</SectionLabel>
              <MultiplierChainTable result={scenarios.vats} />
              <ApEconomyPanel result={scenarios.vats} />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
