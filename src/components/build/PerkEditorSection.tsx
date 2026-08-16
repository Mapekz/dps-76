import * as React from 'react';
import { CheckIcon, LockIcon, PlusIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { HelperText } from '@/components/ui/helper-text';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Readout, SectionLabel } from '@/components/ui/typography';
import { readoutVariants } from '@/components/ui/typography-variants';
import {
  FilterListRoot,
  FilterInput,
  FilterList,
  FilterEmpty,
  FilterGroup,
  FilterItem,
} from '@/components/ui/filter-list';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { matchesQuery } from '@/lib/filter-query';
import { useFilterQuery } from '@/hooks/useFilterQuery';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { getPerks } from '@/data';
import { getLoadoutModifiers, perkHasEngineEffect } from '@/data/perk-modifiers';
import { describeBuffModifiers } from '@/lib/buff-description';
import { usePerkStatus } from './usePerkStatus';
import { Row } from './Row';
import { Special } from '@/data/special';
import { legendaryPerkIds } from '@/lib/nukes-dragons';
import { canSlotCardPoints, perkCardCostAtRank, type PerkBudget } from '@/lib/player-stats';
import { isPerkPickerBlocked, isPerkRaceBlocked } from '@/lib/build-rules';
import type { GameMode, Perk, PerkLoadout } from '@/types';
import { LEGENDARY_PERK_SLOTS as LEGENDARY_SLOTS, type SpecialKey } from '@/state/build-reducer';
import { ActionDelta } from '@/components/diff/ActionDelta';
import { NoEffectBadge } from './OptionBadge';
import { CountStepper } from './CountStepper';

const SPECIAL_ORDER: Array<{ key: SpecialKey; special: Special; letter: string }> = [
  { key: 'strength', special: Special.Strength, letter: 'S' },
  { key: 'perception', special: Special.Perception, letter: 'P' },
  { key: 'endurance', special: Special.Endurance, letter: 'E' },
  { key: 'charisma', special: Special.Charisma, letter: 'C' },
  { key: 'intelligence', special: Special.Intelligence, letter: 'I' },
  { key: 'agility', special: Special.Agility, letter: 'A' },
  { key: 'luck', special: Special.Luck, letter: 'L' },
];

interface PerkEntry {
  perkId: string;
  perk: Perk;
  rank: number;
}

/** Perk-point cost delta for moving `perk` from `fromRank` to `toRank` (0 = unequipped). */
function costDelta(perk: Perk, fromRank: number, toRank: number): number {
  return perkCardCostAtRank(perk, toRank) - perkCardCostAtRank(perk, fromRank);
}

function usePerkRegistry() {
  const { mode } = useGameMode();
  return React.useMemo(() => {
    const registry = getPerks(mode);
    const regular: Array<{ perkId: string; perk: Perk }> = [];
    const legendary: Array<{ perkId: string; perk: Perk }> = [];
    // Same 'no effect yet' predicate as the OMOD/legendary-effect picker
    // (modifierHasEngineEffect, @/types/modifiers) — most FO76 perks don't
    // move paper DPS (utility/defensive cards) or extract into a bucket the
    // engine doesn't fold yet; this flags both honestly instead of silently.
    const noEffect = new Set<string>();
    for (const [perkId, perk] of Object.entries(registry)) {
      (legendaryPerkIds.has(perkId) ? legendary : regular).push({ perkId, perk });
      if (!perkHasEngineEffect(mode, perkId)) noEffect.add(perkId);
    }
    // Pickers list by display name, not registry (edid) order.
    const byName = (a: { perk: Perk }, b: { perk: Perk }) => a.perk.name.localeCompare(b.perk.name);
    regular.sort(byName);
    legendary.sort(byName);
    return { registry, regular, legendary, noEffect };
  }, [mode]);
}

/**
 * Card cost = the PCRD's per-rank "Card Rank Cost" (perk.costs[rank-1], NOT
 * necessarily equal to rank — e.g. Tenderizer's single rank costs 2).
 * Budget per stat = min(15, base allocation + Legendary SPECIAL card bonus)
 * — src/lib/player-stats.ts. Base allocation is set in the SPECIAL section
 * above.
 */
function SpecialBudgetBar({
  budget,
  onSelectSpecial,
}: {
  budget: PerkBudget;
  onSelectSpecial?: (s: Special) => void;
}) {
  return (
    <div className="grid grid-cols-7 gap-1">
      {SPECIAL_ORDER.map(({ key, special, letter }) => {
        const used = budget.cardPoints[key];
        const cap = budget.budgetPerStat[key];
        const over = used > cap;
        const leggo = budget.legendaryBonus[key];
        return (
          <Tooltip key={key}>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  className={cn(
                    readoutVariants({ size: 'sm' }),
                    'hover:bg-muted/60 cursor-pointer rounded-none border px-1 py-0.5 text-center',
                    over ? 'border-negative text-negative' : 'text-muted-foreground',
                  )}
                  onClick={() => onSelectSpecial?.(special)}
                />
              }
            >
              <span className="font-condensed font-semibold">{letter}</span> {used}/{cap}
            </TooltipTrigger>
            <TooltipContent>
              {special}: {used} of {cap} card points ({budget.allocation[key]} allocated
              {leggo > 0 ? ` + ${leggo} from Legendary ${special}` : ''})
              {over ? ' — over budget' : ''} — click to browse {special} perks
            </TooltipContent>
          </Tooltip>
        );
      })}
    </div>
  );
}

function PerkRow({
  entry,
  maxRank,
  raiseBlocked,
  noEffect,
  mode,
}: {
  entry: PerkEntry;
  maxRank: number;
  raiseBlocked?: boolean;
  noEffect?: boolean;
  mode: GameMode;
}) {
  const dispatch = useBuildDispatch();
  // Legendary cards (no `special`) never consume SPECIAL perk points.
  const cost = entry.perk.special ? perkCardCostAtRank(entry.perk, entry.rank) : null;
  const modifiers = getLoadoutModifiers(mode, [{ perkId: entry.perkId, rank: entry.rank }]);
  const description = !noEffect ? describeBuffModifiers({ modifiers }) : null;
  return (
    <Row label={entry.perk.name} noEffect={noEffect} description={description}>
      {cost !== null && (
        <span
          className="text-muted-foreground font-mono text-3xs tabular-nums"
          title={`Costs ${cost} perk point${cost === 1 ? '' : 's'} at rank ${entry.rank}`}
        >
          {cost} pt
        </span>
      )}
      <CountStepper
        count={entry.rank}
        min={1}
        max={maxRank}
        onDecrement={() =>
          dispatch({ type: 'perk/setRank', perkId: entry.perkId, rank: entry.rank - 1 })
        }
        onIncrement={() =>
          dispatch({ type: 'perk/setRank', perkId: entry.perkId, rank: entry.rank + 1 })
        }
        incrementDisabled={raiseBlocked}
        incrementTitle={
          raiseBlocked && entry.rank < maxRank
            ? 'SPECIAL budget exhausted (15/stat, 56 total)'
            : undefined
        }
        decrementTooltipAction={{
          type: 'perk/setRank',
          perkId: entry.perkId,
          rank: entry.rank - 1,
        }}
        incrementTooltipAction={{
          type: 'perk/setRank',
          perkId: entry.perkId,
          rank: entry.rank + 1,
        }}
        decrementAriaLabel={`Lower ${entry.perk.name} rank`}
        incrementAriaLabel={`Raise ${entry.perk.name} rank`}
      />
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground size-6"
        aria-label={`Remove ${entry.perk.name}`}
        onClick={() => dispatch({ type: 'perk/remove', perkId: entry.perkId })}
      >
        <XIcon className="size-3" />
      </Button>
    </Row>
  );
}

const SPECIAL_TO_KEY = Object.fromEntries(
  SPECIAL_ORDER.map(({ special, key }) => [special, key]),
) as Record<Special, SpecialKey>;

function PerkAddCombobox({
  budget,
  scope = 'all',
  triggerLabel = 'Add perk…',
  open: openProp,
  onOpenChange,
  filterSpecial: filterSpecialProp,
  onFilterSpecialChange,
}: {
  budget: PerkBudget;
  /** 'legendary' renders only legendary cards (one flat alphabetized list — no SPECIAL grouping/filter). */
  scope?: 'all' | 'legendary';
  triggerLabel?: string;
  /** Controlled open state (the SpecialBudgetBar opens the main picker); uncontrolled when omitted. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Controlled SPECIAL filter; uncontrolled when omitted. */
  filterSpecial?: Special | null;
  onFilterSpecialChange?: (s: Special | null) => void;
}) {
  const [openState, setOpenState] = React.useState(false);
  const [filterState, setFilterState] = React.useState<Special | null>(null);
  const open = openProp ?? openState;
  const filterSpecial = filterSpecialProp !== undefined ? filterSpecialProp : filterState;
  const setFilterSpecial = onFilterSpecialChange ?? setFilterState;
  const setOpen = (next: boolean) => {
    (onOpenChange ?? setOpenState)(next);
    if (!next) setFilterSpecial(null); // a fresh open starts unfiltered
  };
  const { regular, legendary, noEffect } = usePerkRegistry();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();

  const equipped = new Map(
    [...player.perks, ...player.legendaryPerks].map((p) => [p.perkId, p.rank]),
  );
  const legendarySlotsFull = player.legendaryPerks.length >= LEGENDARY_SLOTS;

  // A card locked to the other race can't be added — the picker greys it out with a lock.
  const raceBlocked = (perk: Perk): boolean =>
    isPerkRaceBlocked(perk, player.conditions.isGhoul ?? false);

  const slotBlocked = (perkId: string, isLegendary: boolean, perk: Perk): boolean =>
    isPerkPickerBlocked(budget, perk, equipped.get(perkId), isLegendary, legendarySlotsFull);

  const select = (perkId: string, isLegendary: boolean, perk: Perk) => {
    if (slotBlocked(perkId, isLegendary, perk) || raceBlocked(perk)) return;
    const currentRank = equipped.get(perkId);
    if (currentRank === undefined) {
      dispatch({ type: 'perk/add', perkId, rank: 1, legendary: isLegendary });
    } else if (currentRank < perk.maxRank) {
      // Re-selecting an equipped perk bumps its rank — the fast path while browsing.
      dispatch({ type: 'perk/setRank', perkId, rank: currentRank + 1 });
    }
    // Popover stays open for multi-add.
  };

  // Right-click mirrors `select` in reverse: lower a rank, or drop the card
  // entirely from rank 1. `perk/setRank` clamps at rank 1 (it can never reach
  // 0), so zeroing out means dispatching `perk/remove` instead.
  const decrement = (perkId: string) => {
    const currentRank = equipped.get(perkId);
    if (currentRank === undefined) return; // not equipped — nothing to lower
    if (currentRank > 1) {
      dispatch({ type: 'perk/setRank', perkId, rank: currentRank - 1 });
    } else {
      dispatch({ type: 'perk/remove', perkId });
    }
    // Popover stays open for multi-adjust.
  };

  const bySpecial = (special: Special) => regular.filter((r) => r.perk.special === special);
  const visibleSpecials = SPECIAL_ORDER.filter(
    ({ special }) => filterSpecial === null || special === filterSpecial,
  );

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={<Button variant="outline" size="sm" className="w-full justify-start" />}
      >
        <PlusIcon className="mr-1 size-3.5" /> {triggerLabel}
      </PopoverTrigger>
      <PopoverContent className="w-[--anchor-width] p-0" align="start">
        <FilterListRoot>
          <FilterInput
            placeholder={scope === 'legendary' ? 'Search legendary perks…' : 'Search perks…'}
          />
          {scope !== 'legendary' && (
            <div className="flex items-center gap-0.5 border-b px-2 py-1">
              {SPECIAL_ORDER.map(({ special, letter }) => (
                <Tooltip key={special}>
                  <TooltipTrigger
                    render={
                      <Button
                        type="button"
                        variant={filterSpecial === special ? 'default' : 'ghost'}
                        size="sm"
                        className="h-6 flex-1 px-0 font-mono text-xs"
                        onClick={() => setFilterSpecial(filterSpecial === special ? null : special)}
                      />
                    }
                  >
                    {letter}
                  </TooltipTrigger>
                  <TooltipContent>Show only {special} perks</TooltipContent>
                </Tooltip>
              ))}
              {filterSpecial !== null && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="size-6"
                  aria-label="Clear SPECIAL filter"
                  onClick={() => setFilterSpecial(null)}
                >
                  <XIcon className="size-3" />
                </Button>
              )}
            </div>
          )}
          <PerkList
            scope={scope}
            visibleSpecials={visibleSpecials}
            bySpecial={bySpecial}
            legendary={legendary}
            equipped={equipped}
            noEffect={noEffect}
            raceBlocked={raceBlocked}
            slotBlocked={slotBlocked}
            select={select}
            decrement={decrement}
          />
          <HelperText className="border-t px-2 py-1">
            Left-click to add or raise a rank · right-click to lower or remove.
          </HelperText>
        </FilterListRoot>
      </PopoverContent>
    </Popover>
  );
}

/**
 * The filterable perk list. Split out from PerkAddCombobox because
 * useFilterQuery() must be called from a descendant of FilterListRoot, not
 * the component that renders it.
 */
function PerkList({
  scope,
  visibleSpecials,
  bySpecial,
  legendary,
  equipped,
  noEffect,
  raceBlocked,
  slotBlocked,
  select,
  decrement,
}: {
  scope: 'all' | 'legendary';
  visibleSpecials: typeof SPECIAL_ORDER;
  bySpecial: (special: Special) => Array<{ perkId: string; perk: Perk }>;
  legendary: Array<{ perkId: string; perk: Perk }>;
  equipped: Map<string, number>;
  noEffect: Set<string>;
  raceBlocked: (perk: Perk) => boolean;
  slotBlocked: (perkId: string, isLegendary: boolean, perk: Perk) => boolean;
  select: (perkId: string, isLegendary: boolean, perk: Perk) => void;
  decrement: (perkId: string) => void;
}) {
  const { query } = useFilterQuery();

  const renderGroup = (
    heading: string | undefined,
    items: Array<{ perkId: string; perk: Perk }>,
    isLegendary: boolean,
  ) => {
    const filtered = items.filter(({ perk }) => matchesQuery([perk.name], query));
    if (filtered.length === 0) return null;
    return (
      <FilterGroup key={heading ?? '__flat__'} heading={heading}>
        {filtered.map(({ perkId, perk }) => {
          const rank = equipped.get(perkId);
          // An equipped perk always matches the current race (the reducer keeps
          // that invariant), so raceLocked only ever fires for unequipped cards.
          const raceLocked = rank === undefined && raceBlocked(perk);
          const blocked = raceLocked || slotBlocked(perkId, isLegendary, perk);
          const rowContent = (
            <>
              <CheckIcon
                className={cn('mr-2 size-4', rank !== undefined ? 'opacity-100' : 'opacity-0')}
              />
              {raceLocked && <LockIcon className="text-muted-foreground mr-1 size-3 shrink-0" />}
              <span className="min-w-0 flex-1 truncate">{perk.name}</span>
              {noEffect.has(perkId) && <NoEffectBadge />}
              {!blocked &&
                (rank === undefined ? (
                  <ActionDelta
                    action={{ type: 'perk/add', perkId, rank: 1, legendary: isLegendary }}
                  />
                ) : rank < perk.maxRank ? (
                  <ActionDelta action={{ type: 'perk/setRank', perkId, rank: rank + 1 }} />
                ) : null)}
              <span className="text-muted-foreground ml-2 text-xs">
                {raceLocked
                  ? `${perk.raceRestriction} only`
                  : blocked
                    ? isLegendary
                      ? 'slots full'
                      : 'budget full'
                    : rank !== undefined
                      ? rank < perk.maxRank && perk.special
                        ? `rank ${rank}/${perk.maxRank} · +${costDelta(perk, rank, rank + 1)} pt`
                        : `rank ${rank}/${perk.maxRank}`
                      : perk.special
                        ? `max ${perk.maxRank} · ${perkCardCostAtRank(perk, 1)} pt`
                        : `max ${perk.maxRank}`}
              </span>
            </>
          );
          const itemProps = {
            disabled: blocked,
            onClick: () => select(perkId, isLegendary, perk),
            onContextMenu: (e: React.MouseEvent) => {
              e.preventDefault();
              decrement(perkId);
            },
          };
          // Only equipped perks (rank !== undefined) have a right-click
          // action to explain — everyone else gets the plain row, no tooltip.
          return rank === undefined ? (
            <FilterItem key={perkId} {...itemProps}>
              {rowContent}
            </FilterItem>
          ) : (
            <Tooltip key={perkId}>
              <TooltipTrigger render={<FilterItem {...itemProps} />}>{rowContent}</TooltipTrigger>
              <TooltipContent>
                {rank > 1 ? 'Right-click to lower' : 'Right-click to remove'}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </FilterGroup>
    );
  };

  const groups =
    scope === 'legendary'
      ? [renderGroup(undefined, legendary, true)]
      : visibleSpecials.map(({ special }) => renderGroup(special, bySpecial(special), false));

  return (
    <FilterList className="max-h-72">
      <FilterEmpty show={groups.every((g) => g === null)}>No perk matches.</FilterEmpty>
      {groups}
    </FilterList>
  );
}

/**
 * Content-only perk editor — rendered inside the SPECIAL Loadout section
 * (SpecialLoadoutSection.tsx), not its own accordion item.
 */
export function PerkEditor() {
  const { mode } = useGameMode();
  const { registry, noEffect } = usePerkRegistry();
  const { player } = useBuild();
  // Main picker state lives here so the SpecialBudgetBar can open it pre-filtered.
  const [pickerOpen, setPickerOpen] = React.useState(false);
  const [pickerFilter, setPickerFilter] = React.useState<Special | null>(null);

  const resolve = (loadout: PerkLoadout[]): PerkEntry[] =>
    loadout
      .map((p) => ({
        perkId: p.perkId,
        rank: p.rank,
        perk: registry[p.perkId as keyof typeof registry],
      }))
      .filter((e): e is PerkEntry => e.perk !== undefined);

  // Equipped perks list/group by display name, not raw loadout/import order.
  const byName = (a: PerkEntry, b: PerkEntry) => a.perk.name.localeCompare(b.perk.name);
  const regularEntries = resolve(player.perks);
  const legendaryEntries = resolve(player.legendaryPerks).sort(byName);
  const { budget } = usePerkStatus();

  const legendaryOver = legendaryEntries.length > LEGENDARY_SLOTS;

  const raiseBlockedFor = (entry: PerkEntry) =>
    entry.perk.special
      ? !canSlotCardPoints(
          budget,
          SPECIAL_TO_KEY[entry.perk.special],
          costDelta(entry.perk, entry.rank, entry.rank + 1),
        )
      : false;

  // Regular perks grouped by SPECIAL (SPECIAL order, alpha within) so the
  // list mirrors the budget bar's taxonomy instead of raw loadout/import order.
  const regularGroups = SPECIAL_ORDER.map(({ key, special, letter }) => ({
    key,
    special,
    letter,
    entries: regularEntries.filter((e) => e.perk.special === special).sort(byName),
  })).filter((g) => g.entries.length > 0);
  // Safety net: a perk with no (or unrecognized) `.special` would otherwise vanish silently.
  const claimed = new Set(regularGroups.flatMap((g) => g.entries.map((e) => e.perkId)));
  const ungroupedEntries = regularEntries.filter((e) => !claimed.has(e.perkId)).sort(byName);

  return (
    <div className="space-y-3">
      <SpecialBudgetBar
        budget={budget}
        onSelectSpecial={(special) => {
          setPickerFilter(special);
          setPickerOpen(true);
        }}
      />

      <PerkAddCombobox
        budget={budget}
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        filterSpecial={pickerFilter}
        onFilterSpecialChange={setPickerFilter}
      />

      {/*
       * Previously lived only in the empty-perks branch below — shown
       * exactly when there's nothing to lose, hidden whenever it would
       * actually matter. Now always visible while perks are equipped, the
       * one case an import is destructive. (BuildUrlInput's post-import
       * Undo affordance is the actual safety net; this is the warning.)
       */}
      {regularEntries.length > 0 && (
        <HelperText>Importing a Nukes &amp; Dragons build replaces this list.</HelperText>
      )}

      {regularEntries.length > 0 ? (
        <div className="space-y-2">
          {regularGroups.map((group) => {
            const used = budget.cardPoints[group.key];
            const cap = budget.budgetPerStat[group.key];
            return (
              <div key={group.key} className="space-y-1">
                <div className="flex items-center justify-between">
                  <SectionLabel>
                    {group.letter} · {group.special}
                  </SectionLabel>
                  <Readout
                    size="sm"
                    className={used > cap ? 'text-negative' : 'text-muted-foreground'}
                  >
                    {used}/{cap} pt
                  </Readout>
                </div>
                <div className="grid gap-1">
                  {group.entries.map((entry) => (
                    <PerkRow
                      key={entry.perkId}
                      entry={entry}
                      maxRank={entry.perk.maxRank}
                      raiseBlocked={raiseBlockedFor(entry)}
                      noEffect={noEffect.has(entry.perkId)}
                      mode={mode}
                    />
                  ))}
                </div>
              </div>
            );
          })}
          {ungroupedEntries.length > 0 && (
            <div className="space-y-1">
              <SectionLabel>Other</SectionLabel>
              <div className="grid gap-1">
                {ungroupedEntries.map((entry) => (
                  <PerkRow
                    key={entry.perkId}
                    entry={entry}
                    maxRank={entry.perk.maxRank}
                    raiseBlocked={raiseBlockedFor(entry)}
                    noEffect={noEffect.has(entry.perkId)}
                    mode={mode}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          No perks equipped. Import a Nukes &amp; Dragons build or add perks above.
        </p>
      )}

      <Separator />
      <div className="flex items-center justify-between">
        <SectionLabel>Legendary perks</SectionLabel>
        <Readout size="sm" className={legendaryOver ? 'text-negative' : 'text-muted-foreground'}>
          {legendaryEntries.length}/{LEGENDARY_SLOTS} slots
        </Readout>
      </div>
      <PerkAddCombobox budget={budget} scope="legendary" triggerLabel="Add legendary perk…" />
      {legendaryEntries.length > 0 ? (
        <div className="grid gap-1">
          {legendaryEntries.map((entry) => (
            <PerkRow
              key={entry.perkId}
              entry={entry}
              maxRank={entry.perk.maxRank}
              noEffect={noEffect.has(entry.perkId)}
              mode={mode}
            />
          ))}
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">No legendary perks equipped.</p>
      )}

      <HelperText>
        Card cost is the card's own per-rank point cost (not always equal to rank). Each stat's
        budget is its base allocation (SPECIAL section) plus Legendary SPECIAL card bonuses, capped
        at 15. Adding past the budget is blocked — imported or re-allocated builds that exceed it
        are flagged instead.
      </HelperText>
    </div>
  );
}
