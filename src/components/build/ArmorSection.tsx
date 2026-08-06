import * as React from 'react';
import { CheckIcon, LockIcon, PlusIcon, XIcon } from 'lucide-react';
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
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { ToggleGroup } from '@/components/ui/toggle-group';
import {
  FilterListRoot,
  FilterInput,
  FilterList,
  FilterEmpty,
  FilterGroup,
  FilterItem,
} from '@/components/ui/filter-list';
import { useFilterQuery } from '@/hooks/useFilterQuery';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import {
  getArmorEffectById,
  getArmorEffects,
  getArmorSlotUsage,
  getArmorTierUsage,
  maxFeasibleArmorEffectCount,
  MAX_LEGENDARY_COUNT,
  wrongArmorTypeEffects,
  type ArmorEffectEntry,
  type ArmorPieceClass,
  type ArmorSlotGroup,
  type ArmorSlotUsage,
  type ArmorStarTier,
  type FeasibilityFamilyKey,
} from '@/data/armor-modifiers';
import { matchesQuery } from '@/lib/filter-query';
import { cn } from '@/lib/utils';
import type { ArmorWorn } from '@/types';
import { ActionDelta } from '@/components/diff/ActionDelta';
import { CountStepper } from './CountStepper';
import { NoEffectBadge } from './OptionBadge';
import { SectionTrigger } from './SectionTrigger';

type FilterChip =
  | 'lining'
  | 'material'
  | 'misc'
  | 'legendary-1'
  | 'legendary-2'
  | 'legendary-3'
  | 'legendary-4';

const FILTER_CHIPS: Array<{ key: FilterChip; label: string }> = [
  { key: 'lining', label: 'Underarmor Lining' },
  { key: 'material', label: 'Material' },
  { key: 'misc', label: 'Misc' },
  { key: 'legendary-1', label: '1★' },
  { key: 'legendary-2', label: '2★' },
  { key: 'legendary-3', label: '3★' },
  { key: 'legendary-4', label: '4★' },
];

const PIECE_LABELS: Record<ArmorPieceClass, string> = {
  torso: 'torso',
  arm: 'arms',
  leg: 'legs',
  helmet: 'helmet',
  underarmorStyle: 'style',
  underarmorLining: 'lining',
};

const ARMOR_WORN_LABELS: Record<ArmorWorn, string> = {
  none: 'No Armor',
  body: 'Body Armor',
  power: 'Power Armor',
};

function armorTypeEligible(effect: ArmorEffectEntry, armorWorn: ArmorWorn): boolean {
  if (armorWorn === 'none') return false;
  if (effect.armorType === 'both') return true;
  if (armorWorn === 'power') return effect.armorType === 'powerArmor';
  return effect.armorType === 'bodyArmor';
}

function matchesFilterChip(effect: ArmorEffectEntry, chip: FilterChip | null): boolean {
  if (chip === null) return true;
  if (chip === 'lining') return effect.group === 'lining';
  if (chip === 'material') return effect.group === 'material';
  if (chip === 'misc') return effect.group === 'misc';
  return effect.starTier === Number(chip.split('-')[1]);
}

function familiesForGroup(
  group: ArmorSlotGroup | `legendary-${ArmorStarTier}`,
  armorWorn: ArmorWorn,
): FeasibilityFamilyKey[] {
  if (group === 'material') return ['bodyArmor:material'];
  if (group === 'lining') return ['underarmorStyle', 'underarmorLining'];
  if (group === 'misc') return armorWorn === 'power' ? ['powerArmor:misc'] : ['bodyArmor:misc'];
  return [];
}

function formatSlotUsage(
  slotUsage: ArmorSlotUsage,
  families: FeasibilityFamilyKey[],
): string | undefined {
  const parts: string[] = [];
  for (const family of families) {
    const usage = slotUsage[family];
    if (!usage) continue;
    for (const [cls, entry] of Object.entries(usage) as Array<
      [ArmorPieceClass, { used: number; capacity: number }]
    >) {
      if (entry.capacity <= 0) continue;
      parts.push(`${PIECE_LABELS[cls]} ${entry.used}/${entry.capacity}`);
    }
  }
  return parts.length > 0 ? parts.join(' · ') : undefined;
}

function EffectDescription({ description }: { description: string | null }) {
  if (!description) return null;
  return <p className="text-muted-foreground text-xs">{description}</p>;
}

function ArmorTypeControl() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const armorWorn = player.conditions.armorWorn;

  const [pending, setPending] = React.useState<{
    armorWorn: ArmorWorn;
    removing: string[];
  } | null>(null);

  const handleClick = (target: ArmorWorn) => {
    if (target === armorWorn) return;
    const removing = wrongArmorTypeEffects(mode, player.armorEffects, target);
    if (removing.length === 0) dispatch({ type: 'armorType/set', armorWorn: target });
    else setPending({ armorWorn: target, removing });
  };

  const confirm = () => {
    if (!pending) return;
    dispatch({ type: 'armorType/set', armorWorn: pending.armorWorn });
    setPending(null);
  };

  return (
    <div className="space-y-1.5">
      <Label>Armor type</Label>
      <ToggleGroup
        aria-label="Armor type"
        options={[
          { value: 'none', label: 'No Armor' },
          { value: 'body', label: 'Body Armor' },
          { value: 'power', label: 'Power Armor' },
        ]}
        value={armorWorn}
        onValueChange={handleClick}
      />

      <Dialog open={pending !== null} onOpenChange={(open) => !open && setPending(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Switch to {pending ? ARMOR_WORN_LABELS[pending.armorWorn] : ''}?
            </DialogTitle>
            <DialogDescription>
              {pending?.armorWorn === 'none'
                ? 'All armor effects will be removed:'
                : `These ${
                    pending?.armorWorn === 'power' ? 'body armor' : 'power armor'
                  }-only effects will be removed:`}
            </DialogDescription>
          </DialogHeader>
          <ul className="text-negative list-inside list-disc text-sm">
            {pending?.removing.map((id) => (
              <li key={id}>{getArmorEffectById(mode, id)?.name ?? id}</li>
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

function ArmorEffectRow({ effect }: { effect: ArmorEffectEntry }) {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const count = player.armorEffects[effect.id] ?? 0;
  const tierUsage = getArmorTierUsage(mode, player.armorEffects);

  const withoutSelf = { ...player.armorEffects };
  delete withoutSelf[effect.id];
  const maxFeasible = maxFeasibleArmorEffectCount(mode, effect.id, withoutSelf);

  const max =
    effect.starTier !== undefined
      ? Math.min(maxFeasible, count + Math.max(0, MAX_LEGENDARY_COUNT - tierUsage[effect.starTier]))
      : maxFeasible;

  if (effect.maxCount === 1) {
    return (
      <div className="bg-muted/40 space-y-1 rounded px-2 py-1 text-sm">
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate">{effect.name}</span>
          {effect.badge === 'inert' && <NoEffectBadge />}
          <Badge variant="secondary" className="text-[10px]">
            on
          </Badge>
          <Button
            variant="ghost"
            size="icon"
            className="text-muted-foreground size-6"
            aria-label={`Remove ${effect.name}`}
            onClick={() => dispatch({ type: 'armorEffect/setCount', id: effect.id, count: 0 })}
          >
            <XIcon className="size-3" />
          </Button>
        </div>
        <EffectDescription description={effect.description} />
      </div>
    );
  }

  return (
    <div className="bg-muted/40 space-y-1 rounded px-2 py-1 text-sm">
      <div className="flex items-center gap-1">
        <span className="min-w-0 flex-1 truncate">{effect.name}</span>
        {effect.badge === 'inert' && <NoEffectBadge />}
        <CountStepper
          count={count}
          min={1}
          max={max}
          onDecrement={() =>
            dispatch({ type: 'armorEffect/setCount', id: effect.id, count: count - 1 })
          }
          onIncrement={() =>
            dispatch({ type: 'armorEffect/setCount', id: effect.id, count: count + 1 })
          }
          decrementTooltipAction={{
            type: 'armorEffect/setCount',
            id: effect.id,
            count: count - 1,
          }}
          incrementTooltipAction={{
            type: 'armorEffect/setCount',
            id: effect.id,
            count: count + 1,
          }}
          decrementAriaLabel={`Lower ${effect.name} count`}
          incrementAriaLabel={`Raise ${effect.name} count`}
        />
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-6"
          aria-label={`Remove ${effect.name}`}
          onClick={() => dispatch({ type: 'armorEffect/setCount', id: effect.id, count: 0 })}
        >
          <XIcon className="size-3" />
        </Button>
      </div>
      <EffectDescription description={effect.description} />
    </div>
  );
}

function ArmorEffectList({
  filterChip,
  armorWorn,
  onEmpty,
}: {
  filterChip: FilterChip | null;
  armorWorn: ArmorWorn;
  onEmpty: (empty: boolean) => void;
}) {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const { query } = useFilterQuery();
  const dispatch = useBuildDispatch();
  const effects = getArmorEffects(mode);
  const tierUsage = getArmorTierUsage(mode, player.armorEffects);

  const equipped = new Map(Object.entries(player.armorEffects).filter(([, c]) => c > 0));

  const incrementBlocked = (effect: ArmorEffectEntry): boolean => {
    const current = equipped.get(effect.id) ?? 0;
    const withoutSelf = { ...player.armorEffects };
    delete withoutSelf[effect.id];
    const maxFeasible = maxFeasibleArmorEffectCount(mode, effect.id, withoutSelf);
    if (current >= maxFeasible) return true;
    if (effect.starTier !== undefined && tierUsage[effect.starTier] >= MAX_LEGENDARY_COUNT)
      return true;
    return false;
  };

  const select = (effect: ArmorEffectEntry) => {
    if (!armorTypeEligible(effect, armorWorn) || incrementBlocked(effect)) return;
    const current = equipped.get(effect.id) ?? 0;
    dispatch({ type: 'armorEffect/setCount', id: effect.id, count: current + 1 });
  };

  const decrement = (effect: ArmorEffectEntry) => {
    const current = equipped.get(effect.id);
    if (current === undefined) return;
    dispatch({
      type: 'armorEffect/setCount',
      id: effect.id,
      count: current > 1 ? current - 1 : 0,
    });
  };

  const filtered = effects.filter(
    (e) => matchesFilterChip(e, filterChip) && matchesQuery([e.name], query),
  );

  React.useEffect(() => {
    onEmpty(filtered.length === 0);
  }, [filtered.length, onEmpty]);

  if (filtered.length === 0) return null;

  return (
    <FilterGroup>
      {filtered.map((effect) => {
        const count = equipped.get(effect.id);
        const typeLocked = !armorTypeEligible(effect, armorWorn);
        const blocked = typeLocked || incrementBlocked(effect);
        return (
          <FilterItem
            key={effect.id}
            disabled={blocked}
            onClick={() => select(effect)}
            onContextMenu={(e) => {
              e.preventDefault();
              decrement(effect);
            }}
            title={
              count === undefined
                ? undefined
                : count > 1
                  ? 'Right-click to lower'
                  : 'Right-click to remove'
            }
          >
            <CheckIcon
              className={cn('mr-2 size-4', count !== undefined ? 'opacity-100' : 'opacity-0')}
            />
            {typeLocked && <LockIcon className="text-muted-foreground mr-1 size-3 shrink-0" />}
            <span className="min-w-0 flex-1 truncate">{effect.name}</span>
            {effect.badge === 'inert' && <NoEffectBadge />}
            {!blocked &&
              (count === undefined ? (
                <ActionDelta action={{ type: 'armorEffect/setCount', id: effect.id, count: 1 }} />
              ) : count <
                maxFeasibleArmorEffectCount(mode, effect.id, {
                  ...player.armorEffects,
                  [effect.id]: 0,
                }) ? (
                <ActionDelta
                  action={{
                    type: 'armorEffect/setCount',
                    id: effect.id,
                    count: count + 1,
                  }}
                />
              ) : null)}
            <span className="text-muted-foreground ml-2 text-xs">
              {typeLocked
                ? armorWorn === 'none'
                  ? 'no armor worn'
                  : `${effect.armorType === 'powerArmor' ? 'power armor' : 'body armor'} only`
                : blocked
                  ? 'slot full'
                  : count !== undefined
                    ? `×${count}/${effect.maxCount}`
                    : `max ${effect.maxCount}`}
            </span>
          </FilterItem>
        );
      })}
    </FilterGroup>
  );
}

function ArmorEffectAddPopover() {
  const { player } = useBuild();
  const [open, setOpen] = React.useState(false);
  const [filterChip, setFilterChip] = React.useState<FilterChip | null>(null);
  const [listEmpty, setListEmpty] = React.useState(false);
  const armorWorn = player.conditions.armorWorn;

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setFilterChip(null);
      }}
    >
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="w-full justify-start" />}
      >
        <PlusIcon className="mr-1 size-3.5" /> Add armor effect…
      </PopoverTrigger>
      <PopoverContent className="w-[--anchor-width] p-0" align="start">
        <FilterListRoot>
          <FilterInput placeholder="Search armor effects…" />
          <div className="flex flex-wrap items-center gap-0.5 border-b px-2 py-1">
            {FILTER_CHIPS.map(({ key, label }) => (
              <Button
                key={key}
                type="button"
                variant={filterChip === key ? 'default' : 'ghost'}
                size="sm"
                className="h-6 px-2 text-xs"
                onClick={() => setFilterChip(filterChip === key ? null : key)}
              >
                {label}
              </Button>
            ))}
            {filterChip !== null && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-6"
                aria-label="Clear filter"
                onClick={() => setFilterChip(null)}
              >
                <XIcon className="size-3" />
              </Button>
            )}
          </div>
          <FilterList className="max-h-72">
            <FilterEmpty show={listEmpty}>No effect matches.</FilterEmpty>
            <ArmorEffectList filterChip={filterChip} armorWorn={armorWorn} onEmpty={setListEmpty} />
          </FilterList>
          <p className="text-muted-foreground border-t px-2 py-1 text-[11px]">
            Left-click to add or raise a count · right-click to lower or remove.
          </p>
        </FilterListRoot>
      </PopoverContent>
    </Popover>
  );
}

const GROUP_DESCRIPTORS: Array<{
  key: ArmorSlotGroup | `legendary-${ArmorStarTier}`;
  title: string;
  predicate: (e: ArmorEffectEntry) => boolean;
}> = [
  {
    key: 'lining',
    title: 'Underarmor Lining',
    predicate: (e) => e.group === 'lining',
  },
  {
    key: 'material',
    title: 'Material',
    predicate: (e) => e.group === 'material',
  },
  {
    key: 'misc',
    title: 'Misc',
    predicate: (e) => e.group === 'misc',
  },
  {
    key: 'legendary-1',
    title: '1★ Legendary',
    predicate: (e) => e.starTier === 1,
  },
  {
    key: 'legendary-2',
    title: '2★ Legendary',
    predicate: (e) => e.starTier === 2,
  },
  {
    key: 'legendary-3',
    title: '3★ Legendary',
    predicate: (e) => e.starTier === 3,
  },
  {
    key: 'legendary-4',
    title: '4★ Legendary',
    predicate: (e) => e.starTier === 4,
  },
];

function EffectGroup({
  title,
  effects,
  tierUsage,
  slotUsageText,
  starTier,
}: {
  title: string;
  effects: ArmorEffectEntry[];
  tierUsage?: Record<ArmorStarTier, number>;
  slotUsageText?: string;
  starTier?: ArmorStarTier;
}) {
  const { player } = useBuild();
  const activeEffects = effects.filter((e) => (player.armorEffects[e.id] ?? 0) > 0);

  if (activeEffects.length === 0) return null;

  const headerRight =
    starTier !== undefined && tierUsage
      ? `${starTier}★ ${tierUsage[starTier]}/${MAX_LEGENDARY_COUNT}`
      : slotUsageText;

  return (
    <div>
      <div className="flex items-baseline justify-between pb-1">
        <p className="font-condensed text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.1em]">
          {title}
        </p>
        {headerRight && <p className="text-muted-foreground text-xs">{headerRight}</p>}
      </div>
      <div className="grid gap-1">
        {activeEffects.map((effect) => (
          <ArmorEffectRow key={effect.id} effect={effect} />
        ))}
      </div>
    </div>
  );
}

export function ArmorSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const effects = getArmorEffects(mode);
  const armorWorn = player.conditions.armorWorn;
  const activeCount = Object.values(player.armorEffects).filter((count) => count > 0).length;
  const tierUsage = getArmorTierUsage(mode, player.armorEffects);
  const slotUsage = getArmorSlotUsage(mode, player.armorEffects);

  const summary =
    activeCount === 0
      ? armorWorn === 'power'
        ? 'Power Armor'
        : armorWorn === 'none'
          ? 'No Armor'
          : undefined
      : armorWorn === 'power'
        ? `Power Armor · ${activeCount} active`
        : undefined;

  return (
    <AccordionItem value="armor">
      <AccordionTrigger>
        <SectionTrigger
          label="Armor"
          summary={summary}
          badge={
            activeCount > 0 && armorWorn === 'body' ? (
              <Badge variant="secondary">{activeCount} active</Badge>
            ) : undefined
          }
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4">
          <ArmorTypeControl />
          <ArmorEffectAddPopover />
          {GROUP_DESCRIPTORS.map((d) => {
            const groupEffects = effects.filter(d.predicate);
            const families = familiesForGroup(d.key, armorWorn);
            const slotUsageText = formatSlotUsage(slotUsage, families);
            const starTier = d.key.startsWith('legendary-')
              ? (Number(d.key.split('-')[1]) as ArmorStarTier)
              : undefined;
            return (
              <EffectGroup
                key={d.key}
                title={d.title}
                effects={groupEffects}
                tierUsage={tierUsage}
                slotUsageText={slotUsageText}
                starTier={starTier}
              />
            );
          })}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
