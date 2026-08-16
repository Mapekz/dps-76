import type * as React from 'react';
import { Button } from '@/components/ui/button';
import { HelperText } from '@/components/ui/helper-text';
import { Readout, SectionLabel } from '@/components/ui/typography';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { legendaryBonusOf } from '@/data/perk-budget';
import { SPECIAL_ALLOCATION_POOL, SPECIAL_KEYS, SPECIAL_POINTS_CAP } from '@/lib/player-stats';
import { cn } from '@/lib/utils';
import { MinusIcon, PlusIcon } from 'lucide-react';

/**
 * Base SPECIAL allocation: 1–15 per stat from the 56-point pool (7 base +
 * 49 level-ups). Legendary SPECIAL cards add +1/+2/+3/+5 on top (shown as
 * +N); consumable/gear buffs fold in later and appear in the stat summary.
 *
 * Content-only editor — rendered inside the SPECIAL Loadout section
 * (SpecialLoadoutSection.tsx), not its own accordion item.
 */
export function SpecialAllocationEditor() {
  const { player } = useBuild();
  const dispatch = useBuildDispatch();

  const total = SPECIAL_KEYS.reduce((sum, k) => sum + player.conditions[k], 0);
  const poolLeft = SPECIAL_ALLOCATION_POOL - total;
  const legendaryBonus = legendaryBonusOf(player.legendaryPerks);

  return (
    <div>
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
        {SPECIAL_KEYS.map((key) => {
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
              <SectionLabel>{key.slice(0, 3)}</SectionLabel>
              <Readout as="p" size="md">
                {base}
                {leggo > 0 && (
                  <Readout size="sm" className="text-positive">
                    +{leggo}
                  </Readout>
                )}
              </Readout>
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
      <Readout
        as="p"
        size="sm"
        className={cn('mt-2', poolLeft < 0 ? 'text-negative' : 'text-muted-foreground')}
      >
        Points allocated: {total}/{SPECIAL_ALLOCATION_POOL}
      </Readout>
      <HelperText className="mt-1">
        Base allocation caps at 15 per stat; Legendary SPECIAL cards add up to +5 on top (green) and
        raise that stat's perk-point budget (still capped at 15). Buffs from consumables and gear
        show in the stat summary above.
      </HelperText>
    </div>
  );
}
