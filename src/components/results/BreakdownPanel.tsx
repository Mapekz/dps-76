import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { useScenarioResults } from '@/state/useScenarioResults';
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
      onValueChange={value => dispatch({ type: 'view/set', view: { breakdownOpen: value.includes('breakdown') } })}
    >
      <AccordionItem value="breakdown" className="border-b-0">
        <AccordionTrigger className="py-2">
          <span className="font-condensed text-muted-foreground text-xs font-semibold uppercase tracking-[0.14em]">
            Why these numbers
          </span>
        </AccordionTrigger>
        <AccordionContent>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="font-condensed text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
                Free Aim
              </p>
              <MultiplierChainTable result={scenarios.freeAim} />
            </div>
            <div>
              <p className="font-condensed text-muted-foreground mb-1 text-[11px] font-semibold uppercase tracking-[0.12em]">
                VATS
              </p>
              <MultiplierChainTable result={scenarios.vats} />
            </div>
          </div>
        </AccordionContent>
      </AccordionItem>
    </Accordion>
  );
}
