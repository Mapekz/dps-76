import { BanIcon, PillIcon, SkullIcon, WineIcon } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import {
  getAddictions,
  getConsumables,
  getAddictionSuppressors,
  getSuppressedAddictions,
  readsAddictionCount,
} from '@/data/buffs';
import { describeBuffModifiers } from '@/lib/buff-description';
import { byName } from '@/lib/buff-sort';
import { buildLedger, familyLabel, type LedgerGroup } from '@/lib/chem-ledger';
import { ActionDelta } from '@/components/diff/ActionDelta';
import type { GeneratedBuff } from '@/types/generated';
import { hasAnyEngineEffect } from '@/types/modifiers';
import { NoEffectBadge } from '../OptionBadge';
import { SectionTrigger } from '../SectionTrigger';
import { ConsumableRadioRow, NoneRadioRow } from './shared';

/** Sentinel for the picker's "nothing selected" option — Combobox needs a real, non-null value. */
const NONE = '__none__';

/**
 * The collapsed form of a cause list too long to be rows (the brews). Same
 * single-select contract as the radios — `applySelection` evicts the incumbent
 * brew — just folded into one control, with each option's ΔDPS in the popover.
 */
function CausePicker({ items, placeholder }: { items: GeneratedBuff[]; placeholder: string }) {
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const active = items.find((i) => player.consumables.includes(i.id));
  const itemsById = new Map(items.map((i) => [i.id, i]));
  const options: ComboboxOption[] = [
    { value: NONE, label: placeholder },
    ...items.map((i) => ({ value: i.id, label: i.name })),
  ];
  const description = active ? describeBuffModifiers(active) : null;

  const select = (value: string | null) => {
    // Picking a brew evicts the active one on its own (alcohol-vs-alcohol);
    // only clearing needs an explicit toggle-off.
    if (value && value !== NONE) dispatch({ type: 'consumable/toggle', id: value });
    else if (active) dispatch({ type: 'consumable/toggle', id: active.id });
  };

  return (
    <div className="px-2 py-1">
      <Combobox
        options={options}
        value={active?.id ?? NONE}
        onValueChange={select}
        placeholder={placeholder}
        searchPlaceholder="Search brews…"
        emptyText="No brew found."
        className="h-8 text-sm font-normal"
        renderOptionExtra={(option) => {
          if (option.value === NONE) return null;
          const item = itemsById.get(option.value);
          return (
            <>
              {item && !hasAnyEngineEffect(item.modifiers) && <NoEffectBadge />}
              <ActionDelta action={{ type: 'consumable/toggle', id: option.value }} />
            </>
          );
        }}
      />
      {description && <p className="text-muted-foreground px-1 pt-1 text-xs">{description}</p>}
    </div>
  );
}

/**
 * Right-rail cell: the family's one addiction toggle, or why it has none.
 * `showDelta` is gated on an equipped effect that actually reads addictionCount
 * — without one every row would read ±0%, which is true but only noise.
 */
function AddictionCell({
  group,
  suppressedBy,
  showDelta,
}: {
  group: LedgerGroup;
  suppressedBy?: GeneratedBuff;
  showDelta: boolean;
}) {
  const { player } = useBuild();
  const dispatch = useBuildDispatch();

  if (!group.addiction) {
    return <span className="text-muted-foreground/60 px-2 text-xs">Not addictive</span>;
  }
  const { addiction } = group;
  const addicted = player.addictions.includes(addiction.id);
  const id = `addiction-${addiction.id}`;
  // Counted = actually dragging damage down right now; suppressed or
  // unselected addictions still get a preview line, just in the quiet tone.
  const counted = addicted && !suppressedBy;
  const description = addiction.modifiers?.length ? describeBuffModifiers(addiction) : null;

  return (
    <label
      htmlFor={id}
      className={cn(
        'hover:bg-muted/40 flex w-full cursor-pointer gap-2 rounded-none px-2 py-1 text-sm',
        description ? 'items-start' : 'items-center',
      )}
    >
      <div className={description ? 'pt-0.5' : undefined}>
        <Checkbox
          id={id}
          checked={addicted}
          onCheckedChange={() => dispatch({ type: 'addiction/toggle', id: addiction.id })}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              'min-w-0 flex-1 truncate',
              addicted && suppressedBy && 'text-muted-foreground line-through',
            )}
          >
            {familyLabel(addiction.name)}
          </span>
          {suppressedBy ? (
            <Tooltip>
              <TooltipTrigger
                render={
                  <span
                    className={cn(
                      'text-muted-foreground flex shrink-0 items-center gap-1 text-3xs uppercase tracking-wide',
                      !addicted && 'opacity-50',
                    )}
                  />
                }
              >
                <BanIcon className="size-3" />
                {/* Narrow columns can't spare the word — the icon and its tooltip still say it. */}
                <span className="hidden sm:inline">suppressed</span>
              </TooltipTrigger>
              <TooltipContent>
                {suppressedBy.name} is active, so {addiction.name} doesn't count.
              </TooltipContent>
            </Tooltip>
          ) : (
            showDelta && <ActionDelta action={{ type: 'addiction/toggle', id: addiction.id }} />
          )}
        </div>
        {/* Body prose, not a Micro Label — text-xs (12px) is the right voice here. */}
        {description && (
          <p className={cn('text-xs', counted ? 'text-negative' : 'text-muted-foreground')}>
            {description}
          </p>
        )}
      </div>
    </label>
  );
}

/**
 * The ledger's spine: one vertical rule splitting the transient axis (which
 * chem is active) from the persistent one (what you're addicted to). It reads
 * heavier than the row rules on purpose — it's the primary structural split.
 *
 * Proportional, not fixed: a hard `w-56` is wider than a phone can spare and
 * pushes the whole page into a horizontal scroll. 40% caps out at the same 224px
 * on desktop and shrinks with the column below that, so the two axes stay lined
 * up at every width.
 */
const RAIL = 'w-2/5 max-w-56 min-w-0 shrink-0 border-l border-border pl-1';

/** One ledger row: a family's causes on the left, its single addiction toggle in the rail. */
function LedgerRow({
  group,
  suppressorOf,
  showDelta,
}: {
  group: LedgerGroup;
  suppressorOf: ReadonlyMap<string, GeneratedBuff>;
  showDelta: boolean;
}) {
  return (
    <div className="flex items-stretch">
      <div className="min-w-0 flex-1 py-0.5">
        {group.chems.map((c) => (
          <ConsumableRadioRow
            key={c.id}
            item={c}
            groupName="active-chem"
            description={describeBuffModifiers(c)}
          />
        ))}
        {group.picker.length > 0 && <CausePicker items={group.picker} placeholder="No alcohol" />}
        {group.chems.length === 0 && group.picker.length === 0 && (
          <p className="text-muted-foreground/60 px-2 py-1 text-sm italic">
            No modeled chem causes it
          </p>
        )}
      </div>
      <div className={cn(RAIL, 'flex items-center py-0.5 pl-2')}>
        <AddictionCell
          group={group}
          suppressedBy={suppressorOf.get(group.addiction?.id ?? '')}
          showDelta={showDelta}
        />
      </div>
    </div>
  );
}

export function ChemsSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const consumables = getConsumables(mode);
  const chems = consumables.filter((c) => c.category === 'chem').sort(byName);
  const alcohols = consumables.filter((c) => c.category === 'alcohol').sort(byName);
  const ledger = buildLedger(chems, alcohols, getAddictions(mode));
  const suppressed = getSuppressedAddictions(mode, player.consumables);
  const suppressorOf = getAddictionSuppressors(mode, player.consumables);

  // Families whose causes collapse to a picker (alcohol) sit above the chem
  // radio group; everything the radios cover — plus cause-less families like
  // Med-X — sits below it, under the "None" deselect.
  const alcoholGroups = ledger.filter((g) => g.picker.length > 0);
  const chemGroups = ledger.filter((g) => g.picker.length === 0);

  const readsAddiction = readsAddictionCount(mode, player.weapon?.legendaryEffects ?? []);

  const activeChem = chems.find((c) => player.consumables.includes(c.id));
  const activeAlcohol = alcohols.find((c) => player.consumables.includes(c.id));
  const counted = player.addictions.filter((id) => !suppressed.has(id)).length;
  const nothingActive = !activeChem && !activeAlcohol && counted === 0;

  return (
    <AccordionItem value="chems">
      <AccordionTrigger>
        <SectionTrigger
          label="Chems & Alcohol"
          summary={nothingActive ? 'none' : undefined}
          badge={
            <>
              {activeChem && (
                <Badge variant="default" title={activeChem.name}>
                  <PillIcon /> Chem
                </Badge>
              )}
              {activeAlcohol && (
                <Badge variant="default" title={activeAlcohol.name}>
                  <WineIcon /> Alcohol
                </Badge>
              )}
              {counted > 0 && (
                <Badge
                  variant="destructive"
                  title={`${counted} addiction${counted === 1 ? '' : 's'} counted against DPS`}
                >
                  <SkullIcon /> {counted} addiction{counted === 1 ? '' : 's'}
                </Badge>
              )}
            </>
          }
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="font-condensed text-muted-foreground flex items-stretch pb-1 text-3xs font-semibold uppercase tracking-[0.1em]">
          <span className="flex-1 px-2">Active — one alcohol, one chem</span>
          <span className={cn(RAIL, 'px-2 pl-3')}>Addicted</span>
        </div>

        {/* Alcohol first: it's one control, and it's the only row whose chem cell
            isn't part of the chem radio group. The gap below keeps it from reading
            as the first option of that group. */}
        <div className="divide-border/50 divide-y">
          {alcoholGroups.map((group) => (
            <LedgerRow
              key={group.addiction!.id}
              group={group}
              suppressorOf={suppressorOf}
              showDelta={readsAddiction}
            />
          ))}
        </div>

        <div className="mt-4 divide-border/50 divide-y">
          <div className="flex items-stretch">
            <div className="min-w-0 flex-1 py-0.5">
              <NoneRadioRow label="None" groupName="active-chem" activeId={activeChem?.id} />
            </div>
            <div className={RAIL} />
          </div>

          {chemGroups.map((group) => (
            <LedgerRow
              key={group.addiction?.id ?? group.chems[0].id}
              group={group}
              suppressorOf={suppressorOf}
              showDelta={readsAddiction}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
