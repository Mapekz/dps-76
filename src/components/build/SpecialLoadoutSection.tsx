import * as React from 'react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { equippedRaceLock } from '@/data/perk-race';
import { legendaryBonusOf } from '@/data/perk-budget';
import { SPECIAL_KEYS } from '@/lib/player-stats';
import { SectionTrigger } from './SectionTrigger';
import { SpecialAllocationEditor } from './SpecialSection';
import { PerkEditor } from './PerkEditorSection';
import { usePerkStatus } from './usePerkStatus';

/**
 * Who the character IS: race (human/ghoul), base SPECIAL allocation, and the
 * perk loadout — the durable build identity, as opposed to the steady-state
 * inputs in ConditionsSection.
 */
export function SpecialLoadoutSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();

  const isGhoul = player.conditions.isGhoul ?? false;

  // Race lock from equipped race-restricted perks (Glowing Criticals → ghoul, ...).
  const raceLock = React.useMemo(
    () => equippedRaceLock(mode, player.perks, player.legendaryPerks),
    [mode, player.perks, player.legendaryPerks]
  );

  const { cardCount, overBudget } = usePerkStatus();
  const legendaryBonus = legendaryBonusOf(player.legendaryPerks);
  const specialSummary = SPECIAL_KEYS.map(k => player.conditions[k] + legendaryBonus[k]).join('·');
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
          <div className="space-y-1.5">
            <Label>Race</Label>
            <div className="flex items-center gap-2">
              <ButtonGroup>
                {(['human', 'ghoul'] as const).map(race => {
                  const selected = (race === 'ghoul') === isGhoul;
                  const lockedOut = raceLock.locked !== null && raceLock.locked !== race;
                  return (
                    <Button
                      key={race}
                      type="button"
                      size="sm"
                      variant={selected ? 'default' : 'outline'}
                      disabled={lockedOut}
                      title={
                        lockedOut
                          ? `Locked to ${raceLock.locked}: ${raceLock.lockedBy.join(', ')}`
                          : race === 'ghoul'
                            ? 'Ghoul: feral meter applies; food/drink meters do not'
                            : 'Human: food/drink meters apply; feral meter does not'
                      }
                      onClick={() => dispatch({ type: 'condition/set', key: 'isGhoul', value: race === 'ghoul' })}
                    >
                      {race === 'human' ? 'Human' : 'Ghoul'}
                    </Button>
                  );
                })}
              </ButtonGroup>
              {raceLock.conflict && (
                <Badge variant="outline" className="border-negative text-negative" title={raceLock.lockedBy.join(', ')}>
                  conflicting race-locked perks
                </Badge>
              )}
            </div>
          </div>

          <SpecialAllocationEditor />

          <Separator />

          <PerkEditor />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
