import * as React from 'react';
import { CheckIcon, PlusIcon, XIcon } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import {
  FilterListRoot,
  FilterInput,
  FilterList,
  FilterEmpty,
  FilterGroup,
  FilterItem,
} from '@/components/ui/filter-list';
import { Body } from '@/components/ui/typography';
import { cn } from '@/lib/utils';
import { matchesQuery } from '@/lib/filter-query';
import { useFilterQuery } from '@/hooks/useFilterQuery';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { getConsumables } from '@/data/buffs';
import { applySelection, consumablesById } from '@/lib/consumable-rules';
import { dietVerdict, dietSuppressionLabel, type DietVerdict } from '@/lib/diet-mutations';
import { describeBuffModifiers } from '@/lib/buff-description';
import { byName } from '@/lib/buff-sort';
import { ActionDelta } from '@/components/diff/ActionDelta';
import type { GameMode } from '@/types';
import type { GeneratedBuff } from '@/types/generated';
import { hasAnyEngineEffect } from '@/types/modifiers';
import { NoEffectBadge } from '../OptionBadge';
import { SectionTrigger } from '../SectionTrigger';

function FoodDrinkAddCombobox({
  items,
  active,
  mode,
  open,
  onOpenChange,
  mutations,
}: {
  items: GeneratedBuff[];
  active: readonly string[];
  mode: GameMode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mutations: readonly string[];
}) {
  const dispatch = useBuildDispatch();
  const byId = consumablesById(mode);
  const activeSet = new Set(active);

  const select = (id: string) => {
    if (activeSet.has(id)) return; // removal happens via the active-row remove button, not here
    dispatch({ type: 'consumable/toggle', id });
    // Popover stays open for multi-add.
  };

  const foodItems = items.filter((i) => i.category === 'food');
  const drinkItems = items.filter((i) => i.category === 'drink');

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="w-full justify-start" />}
      >
        <PlusIcon className="mr-1 size-3.5" /> Add food or drink…
      </PopoverTrigger>
      <PopoverContent className="w-[--anchor-width] p-0" align="start">
        <FilterListRoot>
          <FilterInput placeholder="Search food & drink…" />
          <FoodDrinkList
            foodItems={foodItems}
            drinkItems={drinkItems}
            activeSet={activeSet}
            active={active}
            byId={byId}
            mutations={mutations}
            select={select}
          />
        </FilterListRoot>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The filterable food/drink list. Split out from FoodDrinkAddCombobox
 * because useFilterQuery() must be called from a descendant of
 * FilterListRoot, not the component that renders it.
 */
function FoodDrinkList({
  foodItems,
  drinkItems,
  activeSet,
  active,
  byId,
  mutations,
  select,
}: {
  foodItems: GeneratedBuff[];
  drinkItems: GeneratedBuff[];
  activeSet: Set<string>;
  active: readonly string[];
  byId: Map<string, GeneratedBuff>;
  mutations: readonly string[];
  select: (id: string) => void;
}) {
  const { query } = useFilterQuery();

  const renderGroup = (heading: string, groupItems: GeneratedBuff[]) => {
    const filtered = groupItems.filter((item) => matchesQuery([item.name], query));
    if (filtered.length === 0) return null;
    return (
      <FilterGroup key={heading} heading={heading}>
        {filtered.map((item) => {
          const selected = activeSet.has(item.id);
          const replaced = selected ? [] : applySelection(byId, active, item.id).replaced;
          const replacedNames = replaced.map((id) => byId.get(id)?.name ?? id);
          const description = describeBuffModifiers(item);
          const suppression = dietSuppressionLabel(item, mutations);
          return (
            <FilterItem key={item.id} onClick={() => select(item.id)}>
              <CheckIcon className={cn('mr-2 size-4', selected ? 'opacity-100' : 'opacity-0')} />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1">
                  <span className="min-w-0 flex-1 truncate">{item.name}</span>
                  {!suppression && !hasAnyEngineEffect(item.modifiers) && <NoEffectBadge />}
                  {suppression && <DietSuppressionBadge mutation={suppression} />}
                </div>
                {description && (
                  <p
                    className={cn(
                      'text-muted-foreground truncate text-xs',
                      suppression && 'line-through',
                    )}
                  >
                    {description}
                  </p>
                )}
              </div>
              {replacedNames.length > 0 && (
                <span className="text-muted-foreground ml-2 truncate text-xs">
                  replaces {replacedNames.join(', ')}
                </span>
              )}
              {!selected && <ActionDelta action={{ type: 'consumable/toggle', id: item.id }} />}
            </FilterItem>
          );
        })}
      </FilterGroup>
    );
  };

  const groups = [renderGroup('Food', foodItems), renderGroup('Drink', drinkItems)];

  return (
    <FilterList className="max-h-72">
      <FilterEmpty show={groups.every((g) => g === null)}>No match.</FilterEmpty>
      {groups}
    </FilterList>
  );
}

function DietSuppressionBadge({ mutation }: { mutation: 'Herbivore' | 'Carnivore' }) {
  return (
    <span
      className="text-muted-foreground shrink-0 text-xs"
      title={`${mutation} zeros this food's scalable buffs`}
    >
      suppressed by {mutation}
    </span>
  );
}

function FoodDrinkRow({
  item,
  diet,
  mutations,
}: {
  item: GeneratedBuff;
  diet: DietVerdict;
  mutations: readonly string[];
}) {
  const dispatch = useBuildDispatch();
  const description = describeBuffModifiers(item);
  const suppression = dietSuppressionLabel(item, mutations);
  return (
    <div
      className={cn(
        'bg-muted/40 rounded-none flex gap-1 px-2 py-1 text-sm',
        description ? 'items-start' : 'items-center',
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          {!suppression && !hasAnyEngineEffect(item.modifiers) && <NoEffectBadge />}
          {diet === 'doubled' && <span className="text-positive shrink-0 text-xs">×2 diet</span>}
          {suppression && <DietSuppressionBadge mutation={suppression} />}
        </div>
        {description && (
          <p className={cn('text-muted-foreground text-xs', suppression && 'line-through')}>
            {description}
          </p>
        )}
      </div>
      {/* No ΔDPS here — food/drink is multi-select with no single "None" row
          to carry a removal delta the way bobblehead/magazine/chem do; the
          add-picker's gain deltas are the only ones shown. */}
      <div className={cn('flex items-center gap-1', description && 'pt-0.5')}>
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
    </div>
  );
}

export function FoodDrinkSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const [open, setOpen] = React.useState(false);

  const items = getConsumables(mode)
    .filter((c) => c.category === 'food' || c.category === 'drink')
    .sort(byName);
  const byId = consumablesById(mode);
  const activeItems = player.consumables
    .map((id) => byId.get(id))
    .filter(
      (c): c is GeneratedBuff =>
        c !== undefined && (c.category === 'food' || c.category === 'drink'),
    )
    .sort(byName);

  return (
    <AccordionItem value="food-drink">
      <AccordionTrigger>
        <SectionTrigger
          label="Food & Drink"
          summary={activeItems.length === 0 ? 'none' : undefined}
          badge={
            activeItems.length > 0 && <Badge variant="secondary">{activeItems.length} active</Badge>
          }
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-2">
          <FoodDrinkAddCombobox
            items={items}
            active={player.consumables}
            mode={mode}
            open={open}
            onOpenChange={setOpen}
            mutations={player.mutations}
          />
          {activeItems.length > 0 ? (
            <div className="grid gap-1">
              {activeItems.map((item) => (
                <FoodDrinkRow
                  key={item.id}
                  item={item}
                  diet={dietVerdict(item, player.mutations)}
                  mutations={player.mutations}
                />
              ))}
            </div>
          ) : (
            <Body className="text-muted-foreground">No food or drink active.</Body>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
