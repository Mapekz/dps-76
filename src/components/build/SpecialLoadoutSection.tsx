import * as React from 'react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { wrongRacePerks } from '@/data/perk-race';
import { legendaryBonusOf } from '@/data/perk-budget';
import { SPECIAL_KEYS } from '@/lib/player-stats';
import { SectionTrigger } from './SectionTrigger';
import { SpecialAllocationEditor } from './SpecialSection';
import { PerkEditor } from './PerkEditorSection';
import { usePerkStatus } from './usePerkStatus';

/**
 * Human/Ghoul toggle. Switching is always allowed — perks locked to the race
 * being left behind are pruned by `race/set`, with a confirmation dialog
 * first whenever that would actually remove something equipped.
 */
function RaceControl() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const isGhoul = player.conditions.isGhoul ?? false;

  // Non-null while the removal-confirm dialog is open.
  const [pending, setPending] = React.useState<{ isGhoul: boolean; removing: string[] } | null>(
    null,
  );

  const handleClick = (race: 'human' | 'ghoul') => {
    const target = race === 'ghoul';
    if (target === isGhoul) return;
    const removing = wrongRacePerks(mode, player.perks, player.legendaryPerks, target);
    if (removing.length === 0) dispatch({ type: 'race/set', isGhoul: target });
    else setPending({ isGhoul: target, removing });
  };

  const confirm = () => {
    if (!pending) return;
    dispatch({ type: 'race/set', isGhoul: pending.isGhoul });
    setPending(null);
  };

  return (
    <div className="space-y-1.5">
      <Label>Race</Label>
      <ToggleGroup
        aria-label="Race"
        options={[
          {
            value: 'human',
            label: 'Human',
            title: 'Human: food/drink meters apply; feral meter does not',
          },
          {
            value: 'ghoul',
            label: 'Ghoul',
            title: 'Ghoul: feral meter applies; food/drink meters do not',
          },
        ]}
        value={isGhoul ? 'ghoul' : 'human'}
        onValueChange={handleClick}
      />

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch to {pending?.isGhoul ? 'Ghoul' : 'Human'}?</DialogTitle>
            <DialogDescription>
              These {pending?.isGhoul ? 'human' : 'ghoul'}-only perks will be removed:
            </DialogDescription>
          </DialogHeader>
          <ul className="text-negative list-inside list-disc text-sm">
            {pending?.removing.map((name) => (
              <li key={name}>{name}</li>
            ))}
          </ul>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setPending(null)}>
              Cancel
            </Button>
            <Button type="button" variant="destructive" onClick={confirm}>
              Switch &amp; remove
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Who the character IS: race (human/ghoul), base SPECIAL allocation, and the
 * perk loadout — the durable build identity, as opposed to the steady-state
 * inputs in ConditionsSection.
 */
export function SpecialLoadoutSection() {
  const { player } = useBuild();

  const isGhoul = player.conditions.isGhoul ?? false;
  const { cardCount, overBudget } = usePerkStatus();
  const legendaryBonus = legendaryBonusOf(player.legendaryPerks);
  const specialSummary = SPECIAL_KEYS.map((k) => player.conditions[k] + legendaryBonus[k]).join(
    '·',
  );
  const summary = `${isGhoul ? 'Ghoul' : 'Human'} · ${specialSummary} · ${cardCount > 0 ? `${cardCount} cards` : 'no perks'}`;

  return (
    <AccordionItem value="special-loadout">
      <AccordionTrigger>
        <SectionTrigger
          label="SPECIAL Loadout"
          summary={summary}
          badge={
            overBudget && (
              <Badge variant="outline" className="border-negative text-negative">
                over budget
              </Badge>
            )
          }
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3">
          <RaceControl />

          <SpecialAllocationEditor />

          <Separator />

          <PerkEditor />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
