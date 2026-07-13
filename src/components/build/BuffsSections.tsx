import * as React from 'react';
import { BanIcon, CheckIcon, PlusIcon, XIcon } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { getAddictions, getConsumables, getMutations, getSuppressedAddictions } from '@/data/buffs';
import { applySelection, consumablesById } from '@/lib/consumable-rules';
import { dietVerdict, type DietVerdict } from '@/lib/diet-mutations';
import { deriveStrangeInNumbers } from '@/lib/player-stats';
import { ActionDelta } from '@/components/diff/ActionDelta';
import type { BuildAction } from '@/state/build-reducer';
import type { GameMode } from '@/types';
import type { GeneratedAddiction, GeneratedBuff } from '@/types/generated';
import { SectionTrigger } from './SectionTrigger';

const byName = (a: GeneratedBuff, b: GeneratedBuff): number => a.name.localeCompare(b.name);

function CheckboxRow({
  id,
  label,
  checked,
  onCheckedChange,
  action,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** When set, the row shows the ΔDPS of toggling it. */
  action?: BuildAction;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center gap-2 py-0.5 text-sm">
      <Checkbox id={id} checked={checked} onCheckedChange={v => onCheckedChange(v === true)} />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {action && <ActionDelta action={action} />}
    </label>
  );
}

export function MutationsSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const mutations = getMutations(mode);

  // Derived, not a toggle: the Strange in Numbers card equipped + a teammate
  // to be mutated with (same rule resolveLoadout feeds the engine).
  const sinEquipped = player.perks.some(p => p.perkId === 'StrangeInNumbers');
  const sinActive = deriveStrangeInNumbers(player.perks, player.conditions);

  return (
    <AccordionItem value="mutations">
      <AccordionTrigger>
        <SectionTrigger
          label="Mutations"
          summary={player.mutations.length > 0 ? `${player.mutations.length} active` : 'none'}
          badge={
            sinEquipped && (
              <Badge
                variant={sinActive ? 'default' : 'outline'}
                title={
                  sinActive
                    ? 'Strange in Numbers: mutation effects +25%'
                    : 'Strange in Numbers equipped but inactive — needs at least 1 teammate (Character section)'
                }
              >
                {sinActive ? 'SiN +25%' : 'SiN inactive'}
              </Badge>
            )
          }
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-0.5">
          {mutations.map(m => (
            <CheckboxRow
              key={m.id}
              id={`mutation-${m.id}`}
              label={m.name}
              checked={player.mutations.includes(m.id)}
              onCheckedChange={() => dispatch({ type: 'mutation/toggle', id: m.id })}
              action={{ type: 'mutation/toggle', id: m.id }}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

/** Strips the SPEL's " Addiction" suffix ("Psycho Addiction" → "Psycho") for compact chip labels. */
function addictionChipLabel(name: string): string {
  return name.replace(/ Addiction$/, '');
}

function AddictionChip({
  addiction,
  selected,
  suppressed,
  onToggle,
}: {
  addiction: GeneratedAddiction;
  selected: boolean;
  suppressed: boolean;
  onToggle: () => void;
}) {
  const dimmed = selected && suppressed;
  const button = (
    <Button
      type="button"
      variant={selected && !suppressed ? 'default' : 'outline'}
      size="sm"
      className={cn('h-7 px-2 text-xs', dimmed && 'opacity-60')}
      aria-pressed={selected}
      onClick={onToggle}
    >
      {dimmed && <BanIcon className="size-3" />}
      {addictionChipLabel(addiction.name)}
    </Button>
  );
  if (!dimmed) return button;
  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent>{addiction.name}: suppressed while its chem is active</TooltipContent>
    </Tooltip>
  );
}

export function ChemsSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const chems = getConsumables(mode)
    .filter(c => c.category === 'chem')
    .sort(byName);
  const addictions = [...getAddictions(mode)].sort((a, b) => a.name.localeCompare(b.name));
  const suppressed = getSuppressedAddictions(mode, player.consumables);

  const activeChem = chems.find(c => player.consumables.includes(c.id));
  const addictionCount = player.addictions.length;
  const countedAddictions = player.addictions.filter(id => !suppressed.has(id)).length;
  const summary =
    addictionCount > 0
      ? `${activeChem?.name ?? 'none'} · ${addictionCount} addiction${addictionCount === 1 ? '' : 's'} (${countedAddictions} counted)`
      : (activeChem?.name ?? 'none');

  return (
    <AccordionItem value="chems">
      <AccordionTrigger>
        <SectionTrigger label="Chems & Addictions" summary={summary} />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3">
          <div className="space-y-0.5">
            {chems.map(c => (
              <CheckboxRow
                key={c.id}
                id={`chem-${c.id}`}
                label={c.name}
                checked={player.consumables.includes(c.id)}
                onCheckedChange={() => dispatch({ type: 'consumable/toggle', id: c.id })}
                action={{ type: 'consumable/toggle', id: c.id }}
              />
            ))}
          </div>

          <div className="space-y-1.5">
            <p className="font-condensed text-muted-foreground text-xs font-semibold uppercase tracking-[0.1em]">
              Addictions
            </p>
            <div className="flex flex-wrap gap-1.5">
              {addictions.map(a => (
                <AddictionChip
                  key={a.id}
                  addiction={a}
                  selected={player.addictions.includes(a.id)}
                  suppressed={suppressed.has(a.id)}
                  onToggle={() => dispatch({ type: 'addiction/toggle', id: a.id })}
                />
              ))}
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

export function AlcoholSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const alcohols = getConsumables(mode)
    .filter(c => c.category === 'alcohol')
    .sort(byName);
  const activeAlcohol = alcohols.find(c => player.consumables.includes(c.id));

  return (
    <AccordionItem value="alcohol">
      <AccordionTrigger>
        <SectionTrigger label="Alcohol" summary={activeAlcohol?.name ?? 'none'} />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-0.5">
          {alcohols.map(c => (
            <CheckboxRow
              key={c.id}
              id={`alcohol-${c.id}`}
              label={c.name}
              checked={player.consumables.includes(c.id)}
              onCheckedChange={() => dispatch({ type: 'consumable/toggle', id: c.id })}
              action={{ type: 'consumable/toggle', id: c.id }}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

function FoodDrinkAddCombobox({
  items,
  active,
  mode,
  open,
  onOpenChange,
}: {
  items: GeneratedBuff[];
  active: readonly string[];
  mode: GameMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const dispatch = useBuildDispatch();
  const byId = consumablesById(mode);
  const activeSet = new Set(active);

  const select = (id: string) => {
    if (activeSet.has(id)) return; // removal happens via the active-row remove button, not here
    dispatch({ type: 'consumable/toggle', id });
    // Popover stays open for multi-add.
  };

  const renderGroup = (heading: string, groupItems: GeneratedBuff[]) => (
    <CommandGroup heading={heading}>
      {groupItems.map(item => {
        const selected = activeSet.has(item.id);
        const replaced = selected ? [] : applySelection(byId, active, item.id).replaced;
        const replacedNames = replaced.map(id => byId.get(id)?.name ?? id);
        return (
          <CommandItem key={item.id} value={item.id} keywords={[item.name]} onSelect={() => select(item.id)}>
            <CheckIcon className={cn('mr-2 size-4', selected ? 'opacity-100' : 'opacity-0')} />
            <span className="min-w-0 flex-1 truncate">{item.name}</span>
            {replacedNames.length > 0 && (
              <span className="text-muted-foreground ml-2 truncate text-xs">replaces {replacedNames.join(', ')}</span>
            )}
            {!selected && <ActionDelta action={{ type: 'consumable/toggle', id: item.id }} />}
          </CommandItem>
        );
      })}
    </CommandGroup>
  );

  const foodItems = items.filter(i => i.category === 'food');
  const drinkItems = items.filter(i => i.category === 'drink');

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="w-full justify-start">
          <PlusIcon className="mr-1 size-3.5" /> Add food or drink…
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search food & drink…" />
          <CommandList className="max-h-72">
            <CommandEmpty>No match.</CommandEmpty>
            {renderGroup('Food', foodItems)}
            {renderGroup('Drink', drinkItems)}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

function FoodDrinkRow({ item, diet }: { item: GeneratedBuff; diet: DietVerdict }) {
  const dispatch = useBuildDispatch();
  return (
    <div className="bg-muted/40 flex items-center gap-1 rounded px-2 py-1 text-sm">
      <span className="min-w-0 flex-1 truncate">{item.name}</span>
      {diet === 'doubled' && <span className="text-emerald-500 shrink-0 text-xs">×2 diet</span>}
      {diet === 'zeroed' && <span className="text-muted-foreground shrink-0 text-xs line-through">no effect</span>}
      <ActionDelta action={{ type: 'consumable/toggle', id: item.id }} />
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground size-6"
        aria-label={`Remove ${item.name}`}
        onClick={() => dispatch({ type: 'consumable/toggle', id: item.id })}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}

export function FoodDrinkSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const [open, setOpen] = React.useState(false);

  const items = getConsumables(mode)
    .filter(c => c.category === 'food' || c.category === 'drink')
    .sort(byName);
  const byId = consumablesById(mode);
  const activeItems = player.consumables
    .map(id => byId.get(id))
    .filter((c): c is GeneratedBuff => c !== undefined && (c.category === 'food' || c.category === 'drink'))
    .sort(byName);

  return (
    <AccordionItem value="food-drink">
      <AccordionTrigger>
        <SectionTrigger label="Food & Drink" summary={activeItems.length > 0 ? `${activeItems.length} active` : 'none'} />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-2">
          <FoodDrinkAddCombobox items={items} active={player.consumables} mode={mode} open={open} onOpenChange={setOpen} />
          {activeItems.length > 0 ? (
            <div className="grid gap-1">
              {activeItems.map(item => (
                // Carnivore's/Herbivore's verdict badge: ×2 (doubled) or
                // struck-through (zeroed) — src/lib/diet-mutations.ts.
                <FoodDrinkRow key={item.id} item={item} diet={dietVerdict(item, player.mutations)} />
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground text-sm">No food or drink active.</p>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
