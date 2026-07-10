import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import type { SpecialKey } from '@/state/build-reducer';
import { SectionTrigger } from './SectionTrigger';

const SPECIAL_KEYS: SpecialKey[] = ['strength', 'perception', 'endurance', 'charisma', 'intelligence', 'agility', 'luck'];

export function SpecialSection() {
  const { player } = useBuild();
  const dispatch = useBuildDispatch();

  const summary = SPECIAL_KEYS.map(k => player.conditions[k]).join('·');

  return (
    <AccordionItem value="special">
      <AccordionTrigger>
        <SectionTrigger label="SPECIAL" summary={summary} />
      </AccordionTrigger>
      <AccordionContent>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {SPECIAL_KEYS.map(key => (
            <div key={key} className="space-y-1">
              <Label htmlFor={`special-${key}`} className="font-condensed text-xs uppercase">
                {key.slice(0, 3)}
              </Label>
              <Input
                id={`special-${key}`}
                type="number"
                min={1}
                max={20}
                value={player.conditions[key]}
                onChange={e => dispatch({ type: 'special/set', stat: key, value: parseInt(e.target.value, 10) || 1 })}
              />
            </div>
          ))}
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          Prefilled from an imported build. STR feeds melee damage; LCK feeds VATS crit cadence; each stat is also its
          perk point budget.
        </p>
      </AccordionContent>
    </AccordionItem>
  );
}
