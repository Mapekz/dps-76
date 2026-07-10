import * as React from 'react';
import { CheckIcon, MinusIcon, PlusIcon, XIcon } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Separator } from '@/components/ui/separator';
import { cn } from '@/lib/utils';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { getPerks } from '@/data';
import { Special } from '@/data/special';
import { legendaryPerkIds } from '@/lib/nukes-dragons';
import type { Perk, PerkLoadout } from '@/types';
import type { SpecialKey } from '@/state/build-reducer';
import { ActionDelta } from '@/components/diff/ActionDelta';
import { DiffTooltip } from '@/components/diff/DiffTooltip';
import { SectionTrigger } from './SectionTrigger';

const SPECIAL_ORDER: Array<{ key: SpecialKey; special: Special; letter: string }> = [
  { key: 'strength', special: Special.Strength, letter: 'S' },
  { key: 'perception', special: Special.Perception, letter: 'P' },
  { key: 'endurance', special: Special.Endurance, letter: 'E' },
  { key: 'charisma', special: Special.Charisma, letter: 'C' },
  { key: 'intelligence', special: Special.Intelligence, letter: 'I' },
  { key: 'agility', special: Special.Agility, letter: 'A' },
  { key: 'luck', special: Special.Luck, letter: 'L' },
];

const LEGENDARY_SLOTS = 4;

interface PerkEntry {
  perkId: string;
  perk: Perk;
  rank: number;
}

function usePerkRegistry() {
  const { mode } = useGameMode();
  return React.useMemo(() => {
    const registry = getPerks(mode);
    const regular: Array<{ perkId: string; perk: Perk }> = [];
    const legendary: Array<{ perkId: string; perk: Perk }> = [];
    for (const [perkId, perk] of Object.entries(registry)) {
      (legendaryPerkIds.has(perkId) ? legendary : regular).push({ perkId, perk });
    }
    return { registry, regular, legendary };
  }, [mode]);
}

/** Card cost = rank (FO76 rule); budget per SPECIAL = the stat value. */
function spentPerSpecial(perks: PerkEntry[]): Map<Special, number> {
  const spent = new Map<Special, number>();
  for (const { perk, rank } of perks) {
    spent.set(perk.special, (spent.get(perk.special) ?? 0) + rank);
  }
  return spent;
}

function SpecialBudgetBar({ spent }: { spent: Map<Special, number> }) {
  const { player } = useBuild();
  return (
    <div className="grid grid-cols-7 gap-1">
      {SPECIAL_ORDER.map(({ key, special, letter }) => {
        const used = spent.get(special) ?? 0;
        const budget = player.conditions[key];
        const over = used > budget;
        return (
          <div
            key={key}
            className={cn(
              'rounded border px-1 py-0.5 text-center text-[11px] font-mono tabular-nums',
              over ? 'border-negative text-negative' : 'text-muted-foreground'
            )}
            title={`${special}: ${used} of ${budget} points used${over ? ' — over budget' : ''}`}
          >
            <span className="font-condensed font-semibold">{letter}</span> {used}/{budget}
          </div>
        );
      })}
    </div>
  );
}

function PerkRow({ entry, maxRank }: { entry: PerkEntry; maxRank: number }) {
  const dispatch = useBuildDispatch();
  return (
    <div className="bg-muted/40 flex items-center gap-1 rounded px-2 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate">{entry.perk.name}</span>
      <DiffTooltip action={{ type: 'perk/setRank', perkId: entry.perkId, rank: entry.rank - 1 }}>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={entry.rank <= 1}
          aria-label={`Lower ${entry.perk.name} rank`}
          onClick={() => dispatch({ type: 'perk/setRank', perkId: entry.perkId, rank: entry.rank - 1 })}
        >
          <MinusIcon className="size-3" />
        </Button>
      </DiffTooltip>
      <span className="w-4 text-center font-mono text-xs tabular-nums">{entry.rank}</span>
      <DiffTooltip action={{ type: 'perk/setRank', perkId: entry.perkId, rank: entry.rank + 1 }}>
        <Button
          variant="ghost"
          size="icon"
          className="size-6"
          disabled={entry.rank >= maxRank}
          aria-label={`Raise ${entry.perk.name} rank`}
          onClick={() => dispatch({ type: 'perk/setRank', perkId: entry.perkId, rank: entry.rank + 1 })}
        >
          <PlusIcon className="size-3" />
        </Button>
      </DiffTooltip>
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground size-6"
        aria-label={`Remove ${entry.perk.name}`}
        onClick={() => dispatch({ type: 'perk/remove', perkId: entry.perkId })}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}

function PerkAddCombobox() {
  const [open, setOpen] = React.useState(false);
  const { regular, legendary } = usePerkRegistry();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();

  const equipped = new Map([...player.perks, ...player.legendaryPerks].map(p => [p.perkId, p.rank]));

  const select = (perkId: string, isLegendary: boolean, perk: Perk) => {
    const currentRank = equipped.get(perkId);
    if (currentRank === undefined) {
      dispatch({ type: 'perk/add', perkId, rank: 1, legendary: isLegendary });
    } else if (currentRank < perk.maxRank) {
      // Re-selecting an equipped perk bumps its rank — the fast path while browsing.
      dispatch({ type: 'perk/setRank', perkId, rank: currentRank + 1 });
    }
    // Popover stays open for multi-add.
  };

  const renderGroup = (heading: string, items: Array<{ perkId: string; perk: Perk }>, isLegendary: boolean) => (
    <CommandGroup heading={heading}>
      {items.map(({ perkId, perk }) => {
        const rank = equipped.get(perkId);
        const previewAction =
          rank === undefined
            ? ({ type: 'perk/add', perkId, rank: 1, legendary: isLegendary } as const)
            : rank < perk.maxRank
              ? ({ type: 'perk/setRank', perkId, rank: rank + 1 } as const)
              : null;
        return (
          <CommandItem key={perkId} value={perkId} keywords={[perk.name]} onSelect={() => select(perkId, isLegendary, perk)}>
            <CheckIcon className={cn('mr-2 size-4', rank !== undefined ? 'opacity-100' : 'opacity-0')} />
            <span className="min-w-0 flex-1 truncate">{perk.name}</span>
            {previewAction && <ActionDelta action={previewAction} />}
            <span className="text-muted-foreground ml-2 text-xs">
              {rank !== undefined ? `rank ${rank}/${perk.maxRank}` : `max ${perk.maxRank}`}
            </span>
          </CommandItem>
        );
      })}
    </CommandGroup>
  );

  const bySpecial = (special: Special) => regular.filter(r => r.perk.special === special);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start">
          <PlusIcon className="mr-1 size-3.5" /> Add perk…
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search perks…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No perk matches.</CommandEmpty>
            {SPECIAL_ORDER.map(({ special }) => {
              const items = bySpecial(special);
              return items.length > 0 ? (
                <React.Fragment key={special}>{renderGroup(special, items, false)}</React.Fragment>
              ) : null;
            })}
            {legendary.length > 0 && renderGroup('Legendary', legendary, true)}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

export function PerkEditorSection() {
  const { registry } = usePerkRegistry();
  const { player } = useBuild();

  const resolve = (loadout: PerkLoadout[]): PerkEntry[] =>
    loadout
      .map(p => ({ perkId: p.perkId, rank: p.rank, perk: registry[p.perkId as keyof typeof registry] }))
      .filter((e): e is PerkEntry => e.perk !== undefined);

  const regularEntries = resolve(player.perks);
  const legendaryEntries = resolve(player.legendaryPerks);
  const spent = spentPerSpecial(regularEntries);

  const overBudget = SPECIAL_ORDER.some(({ key, special }) => (spent.get(special) ?? 0) > player.conditions[key]);
  const legendaryOver = legendaryEntries.length > LEGENDARY_SLOTS;
  const cardCount = regularEntries.length + legendaryEntries.length;

  return (
    <AccordionItem value="perks">
      <AccordionTrigger>
        <SectionTrigger
          label="Perks"
          summary={cardCount > 0 ? `${cardCount} cards` : 'none — import or add'}
          badge={
            (overBudget || legendaryOver) && (
              <Badge variant="outline" className="border-negative text-negative">
                over budget
              </Badge>
            )
          }
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3">
          <SpecialBudgetBar spent={spent} />

          <PerkAddCombobox />

          {regularEntries.length > 0 ? (
            <div className="grid gap-1">
              {regularEntries.map(entry => (
                <PerkRow key={entry.perkId} entry={entry} maxRank={entry.perk.maxRank} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">
              No perks equipped. Import a Nukes &amp; Dragons build or add perks above. Importing replaces this list.
            </p>
          )}

          <Separator />
          <div className="flex items-center justify-between">
            <p className="font-condensed text-muted-foreground text-xs font-semibold uppercase tracking-[0.1em]">
              Legendary perks
            </p>
            <span className={cn('text-xs font-mono', legendaryOver ? 'text-negative' : 'text-muted-foreground')}>
              {legendaryEntries.length}/{LEGENDARY_SLOTS} slots
            </span>
          </div>
          {legendaryEntries.length > 0 ? (
            <div className="grid gap-1">
              {legendaryEntries.map(entry => (
                <PerkRow key={entry.perkId} entry={entry} maxRank={entry.perk.maxRank} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No legendary perks equipped.</p>
          )}

          <p className="text-muted-foreground text-xs">
            Card cost equals rank; each SPECIAL's budget is its stat value. Going over budget is flagged, not blocked —
            experiments are allowed here even when the game would say no.
          </p>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
