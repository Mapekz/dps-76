import { HeartIcon } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Readout, SectionLabel } from '@/components/ui/typography';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild } from '@/state/BuildProvider';
import { useResolvedStats } from '@/hooks/useResolvedStats';
import { SPECIAL_KEYS } from '@/lib/player-stats';

const LETTERS: Record<(typeof SPECIAL_KEYS)[number], string> = {
  strength: 'S',
  perception: 'P',
  endurance: 'E',
  charisma: 'C',
  intelligence: 'I',
  agility: 'A',
  luck: 'L',
};

/**
 * Derived character stats headline: effective SPECIAL (perk allocation +
 * Legendary SPECIAL cards + gear/consumable buffs) and max HP (245 + 5×END +
 * Lifegiver &c.). Nothing here is user-editable — slot perks and buffs to
 * move the numbers. Resists and other headline stats join this strip later.
 */
export function StatSummary() {
  const { mode } = useGameMode();
  const { player, enemy } = useBuild();

  const stats = useResolvedStats(player, enemy, mode);

  return (
    <div className="mb-3 flex flex-wrap items-center gap-1.5">
      {SPECIAL_KEYS.map((key) => {
        const value = stats.special[key];
        const base = player.conditions[key];
        const buffed = value !== base;
        return (
          <Tooltip key={key}>
            <TooltipTrigger
              render={<div className="bg-muted/40 rounded-none border px-1.5 py-0.5 text-center" />}
            >
              <SectionLabel as="span">{LETTERS[key]}</SectionLabel>{' '}
              <Readout size="sm" className={buffed ? 'text-positive' : undefined}>
                {value}
              </Readout>
            </TooltipTrigger>
            <TooltipContent>
              {key[0].toUpperCase()}
              {key.slice(1)}: {value}
              {buffed ? ` (base ${base} + buffs)` : ''} — derived from perks, legendary SPECIAL
              cards, and buffs
            </TooltipContent>
          </Tooltip>
        );
      })}
      <Tooltip>
        <TooltipTrigger
          render={
            <div className="bg-muted/40 rounded-none ml-auto flex items-center gap-1 border px-1.5 py-0.5" />
          }
        >
          <HeartIcon className="text-muted-foreground size-3" />
          <Readout size="sm">{stats.maxHealth}</Readout>
          <SectionLabel as="span">HP</SectionLabel>
        </TooltipTrigger>
        <TooltipContent>Max HP = 245 + 5×END + max-HP buffs</TooltipContent>
      </Tooltip>
    </div>
  );
}
