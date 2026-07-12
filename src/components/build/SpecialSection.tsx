import type * as React from 'react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { legendaryBonusOf } from '@/data/perk-budget';
import { SPECIAL_ALLOCATION_POOL, SPECIAL_KEYS, SPECIAL_POINTS_CAP } from '@/lib/player-stats';
import { cn } from '@/lib/utils';
import { MinusIcon, PlusIcon } from 'lucide-react';
import { SectionTrigger } from './SectionTrigger';

/**
 * Base SPECIAL allocation: 1–15 per stat from the 56-point pool (7 base +
 * 49 level-ups). Legendary SPECIAL cards add +1/+2/+3/+5 on top (shown as
 * +N); consumable/gear buffs fold in later and appear in the stat summary.
 */
export function SpecialSection() {
  const { player } = useBuild();
  const dispatch = useBuildDispatch();

  const legendaryBonus = legendaryBonusOf(player.legendaryPerks);
  const total = SPECIAL_KEYS.reduce((sum, k) => sum + player.conditions[k], 0);
  const poolLeft = SPECIAL_ALLOCATION_POOL - total;

  const summary = `${SPECIAL_KEYS.map(k => player.conditions[k] + legendaryBonus[k]).join('·')} — ${total}/${SPECIAL_ALLOCATION_POOL} pts`;

  return (
    <AccordionItem value="special">
      <AccordionTrigger>
        <SectionTrigger label="SPECIAL" summary={summary} />
      </AccordionTrigger>
      <AccordionContent>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {SPECIAL_KEYS.map(key => {
            const base = player.conditions[key];
            const leggo = legendaryBonus[key];
            // Shift-click steps by 2; the delta is pre-clamped because the
            // reducer refuses an over-pool raise outright (no partial credit).
            const lower = (e: React.MouseEvent) => {
              const delta = Math.min(e.shiftKey ? 2 : 1, base - 1);
              if (delta > 0) dispatch({ type: 'special/set', stat: key, value: base - delta });
            };
            const raise = (e: React.MouseEvent) => {
              const delta = Math.min(e.shiftKey ? 2 : 1, SPECIAL_POINTS_CAP - base, poolLeft);
              if (delta > 0) dispatch({ type: 'special/set', stat: key, value: base + delta });
            };
            return (
              <div key={key} className="space-y-1 text-center">
                <p className="font-condensed text-muted-foreground text-xs font-semibold uppercase">
                  {key.slice(0, 3)}
                </p>
                <p className="font-mono text-sm tabular-nums">
                  {base}
                  {leggo > 0 && <span className="text-positive text-xs">+{leggo}</span>}
                </p>
                <div className="flex justify-center gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5"
                    disabled={base <= 1}
                    aria-label={`Lower ${key}`}
                    onClick={lower}
                  >
                    <MinusIcon className="size-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-5"
                    disabled={base >= SPECIAL_POINTS_CAP || poolLeft <= 0}
                    aria-label={`Raise ${key}`}
                    onClick={raise}
                  >
                    <PlusIcon className="size-3" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
        <p className={cn('mt-2 font-mono text-[11px] tabular-nums', poolLeft < 0 ? 'text-negative' : 'text-muted-foreground')}>
          Points allocated: {total}/{SPECIAL_ALLOCATION_POOL}
        </p>
        <p className="text-muted-foreground mt-1 text-xs">
          Base allocation caps at 15 per stat; Legendary SPECIAL cards add up to +5 on top (green) and raise that
          stat's perk-point budget (still capped at 15). Buffs from consumables and gear show in the stat summary
          above.
        </p>
      </AccordionContent>
    </AccordionItem>
  );
}
