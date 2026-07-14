import * as React from 'react';
import { BanIcon, CheckIcon, PlusIcon, XIcon } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { Radio } from '@/components/ui/radio';
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
import { getOmodById } from '@/data/omods';
import { applySelection, consumablesById } from '@/lib/consumable-rules';
import { dietVerdict, type DietVerdict } from '@/lib/diet-mutations';
import { deriveClassFreakRank, deriveStrangeInNumbers } from '@/lib/player-stats';
import { describeBuffModifiers } from '@/lib/buff-description';
import { CLASS_FREAK_TIER_FACTORS } from '@/lib/class-freak-mutations';
import { byName } from '@/lib/buff-sort';
import { ActionDelta } from '@/components/diff/ActionDelta';
import type { BuildAction } from '@/state/build-reducer';
import type { GameMode } from '@/types';
import type { GeneratedAddiction, GeneratedBuff } from '@/types/generated';
import { SectionTrigger } from './SectionTrigger';

function CheckboxRow({
  id,
  label,
  checked,
  onCheckedChange,
  action,
  description,
  penaltyDescription,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** When set, the row shows the ΔDPS of toggling it. */
  action?: BuildAction;
  /** Muted "what this does" line under the label (see describeBuffModifiers). */
  description?: string | null;
  /** Same, styled as a penalty — a mutation's Class-Freak-scaled downside. */
  penaltyDescription?: string | null;
}) {
  const hasDescription = Boolean(description) || Boolean(penaltyDescription);
  return (
    <label
      htmlFor={id}
      className={cn('flex cursor-pointer gap-2 py-0.5 text-sm', hasDescription ? 'items-start' : 'items-center')}
    >
      <div className={hasDescription ? 'pt-0.5' : undefined}>
        <Checkbox id={id} checked={checked} onCheckedChange={v => onCheckedChange(v === true)} />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{label}</span>
          {action && <ActionDelta action={action} />}
        </div>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
        {penaltyDescription && <p className="text-negative text-xs">{penaltyDescription}</p>}
      </div>
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
  const classFreakRank = deriveClassFreakRank(player.perks);
  const classFreakReductionPct = Math.round((1 - CLASS_FREAK_TIER_FACTORS[classFreakRank]) * 100);

  return (
    <AccordionItem value="mutations">
      <AccordionTrigger>
        <SectionTrigger
          label="Mutations"
          summary={player.mutations.length > 0 ? `${player.mutations.length} active` : 'none'}
          badge={
            <>
              {sinEquipped && (
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
              )}
              {classFreakRank > 0 && (
                <Badge title={`Class Freak: mutation penalties reduced by ${classFreakReductionPct}%`}>
                  CF −{classFreakReductionPct}%
                </Badge>
              )}
            </>
          }
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-0.5">
          {mutations.map(m => {
            const penaltySet = new Set(m.penaltyModifierIds ?? []);
            const positives = m.modifiers.filter(mod => !penaltySet.has(mod.id));
            const penalties = m.modifiers.filter(mod => penaltySet.has(mod.id));
            const description = describeBuffModifiers({ modifiers: positives }, { strangeInNumbers: sinActive, classFreakRank });
            const penaltyDescription = describeBuffModifiers(
              { modifiers: penalties },
              { strangeInNumbers: sinActive, classFreakRank, penaltyScale: CLASS_FREAK_TIER_FACTORS[classFreakRank] }
            );
            return (
              <CheckboxRow
                key={m.id}
                id={`mutation-${m.id}`}
                label={m.name}
                checked={player.mutations.includes(m.id)}
                onCheckedChange={() => dispatch({ type: 'mutation/toggle', id: m.id })}
                action={{ type: 'mutation/toggle', id: m.id }}
                description={description}
                penaltyDescription={penaltyDescription}
              />
            );
          })}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}

/** Strips the SPEL's " Addiction" suffix ("Psycho Addiction" → "Psycho"). */
function familyLabel(name: string): string {
  return name.replace(/ Addiction$/, '');
}

/**
 * One row of the ledger: an addiction FAMILY plus the consumables that cause it.
 * This is the ESM's own shape — Psycho, Psychobuff and Psychotats all carry
 * `addiction: AbAddictionPsycho`, so "addicted" is a family-level fact that
 * cannot be set per chem. Chems that cause no addiction each get a family-less
 * group of their own.
 *
 * Causes split by how many there are, not by category. A family's chems (1–4)
 * are radio rows, so their ΔDPS is visible without a click. All 40-odd brews
 * cause the single Alcohol addiction and nearly none of them move damage — as
 * rows they'd be a wall of ±0%, so that family's causes collapse into one
 * combobox (`picker`) on its row instead. Med-X has neither: no modeled chem
 * causes it, but the family still gets a row so the Junkie's count is complete.
 */
interface LedgerGroup {
  addiction: GeneratedAddiction | null;
  chems: GeneratedBuff[];
  picker: GeneratedBuff[];
  sortKey: string;
}

function buildLedger(
  chems: GeneratedBuff[],
  alcohols: GeneratedBuff[],
  addictions: readonly GeneratedAddiction[]
): LedgerGroup[] {
  const chemsByFamily = new Map<string, GeneratedBuff[]>();
  const alcoholsByFamily = new Map<string, GeneratedBuff[]>();
  const unaddictive: LedgerGroup[] = [];

  const push = (map: Map<string, GeneratedBuff[]>, key: string, item: GeneratedBuff) => {
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  };

  for (const chem of chems) {
    if (!chem.addiction) unaddictive.push({ addiction: null, chems: [chem], picker: [], sortKey: chem.name });
    else push(chemsByFamily, chem.addiction.id, chem);
  }
  for (const alcohol of alcohols) {
    if (alcohol.addiction) push(alcoholsByFamily, alcohol.addiction.id, alcohol);
  }

  const families = addictions.map(a => ({
    addiction: a,
    chems: (chemsByFamily.get(a.id) ?? []).sort(byName),
    picker: (alcoholsByFamily.get(a.id) ?? []).sort(byName),
    sortKey: familyLabel(a.name),
  }));
  return [...families, ...unaddictive].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}

/**
 * One option of a single-select consumable list. A radio, not a checkbox: only
 * one chem (and one alcohol) can be active, and `applySelection` silently
 * evicts the incumbent — the control should say so before the click, not after.
 *
 * `description`, when given, renders as a small muted line under the name
 * (magazines/bobbleheads — see `describeBuffModifiers`); other callers
 * (chems/alcohol) omit it and keep the original single-line row.
 */
function ConsumableRadioRow({
  item,
  groupName,
  description,
}: {
  item: GeneratedBuff;
  groupName: string;
  description?: string | null;
}) {
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const active = player.consumables.includes(item.id);
  return (
    <label
      className={cn(
        'hover:bg-muted/40 flex cursor-pointer gap-2 rounded-sm px-2 py-1 text-sm',
        description ? 'items-start' : 'items-center',
        active && 'bg-muted/50'
      )}
    >
      <div className={description ? 'pt-0.5' : undefined}>
        <Radio
          name={groupName}
          checked={active}
          onChange={() => dispatch({ type: 'consumable/toggle', id: item.id })}
        />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          <ActionDelta action={{ type: 'consumable/toggle', id: item.id }} />
        </div>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
    </label>
  );
}

/** Sentinel for the picker's "nothing selected" option — cmdk needs a real value. */
const NONE = '__none__';

/**
 * The collapsed form of a cause list too long to be rows (the brews). Same
 * single-select contract as the radios — `applySelection` evicts the incumbent
 * brew — just folded into one control, with each option's ΔDPS in the popover.
 */
function CausePicker({ items, placeholder }: { items: GeneratedBuff[]; placeholder: string }) {
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const active = items.find(i => player.consumables.includes(i.id));
  const options: ComboboxOption[] = [
    { value: NONE, label: placeholder },
    ...items.map(i => ({ value: i.id, label: i.name })),
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
        renderOptionExtra={option =>
          option.value !== NONE && <ActionDelta action={{ type: 'consumable/toggle', id: option.value }} />
        }
      />
      {description && <p className="text-muted-foreground px-1 pt-1 text-xs">{description}</p>}
    </div>
  );
}

/** The deselect option a radio group needs — you can't un-pick a radio. */
function NoneRadioRow({ label, groupName, activeId }: { label: string; groupName: string; activeId?: string }) {
  const dispatch = useBuildDispatch();
  return (
    <label className="hover:bg-muted/40 text-muted-foreground flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1 text-sm">
      <Radio
        name={groupName}
        checked={activeId === undefined}
        onChange={() => activeId && dispatch({ type: 'consumable/toggle', id: activeId })}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </label>
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
  // Counted = actually dragging Junkie's/damage down right now; suppressed or
  // unselected addictions still get a preview line, just in the quiet tone.
  const counted = addicted && !suppressedBy;
  const description = addiction.modifiers?.length ? describeBuffModifiers(addiction) : null;

  return (
    <label
      htmlFor={id}
      className={cn(
        'hover:bg-muted/40 flex w-full cursor-pointer gap-2 rounded-sm px-2 py-1 text-sm',
        description ? 'items-start' : 'items-center'
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
            className={cn('min-w-0 flex-1 truncate', addicted && suppressedBy && 'text-muted-foreground line-through')}
          >
            {familyLabel(addiction.name)}
          </span>
          {suppressedBy ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <span
                  className={cn(
                    'text-muted-foreground flex shrink-0 items-center gap-1 text-[10px] uppercase tracking-wide',
                    !addicted && 'opacity-50'
                  )}
                >
                  <BanIcon className="size-3" />
                  {/* Narrow columns can't spare the word — the icon and its tooltip still say it. */}
                  <span className="hidden sm:inline">suppressed</span>
                </span>
              </TooltipTrigger>
              <TooltipContent>
                {suppressedBy.name} is active, so {addiction.name} doesn't count toward Junkie's.
              </TooltipContent>
            </Tooltip>
          ) : (
            showDelta && <ActionDelta action={{ type: 'addiction/toggle', id: addiction.id }} />
          )}
        </div>
        {description && (
          <p className={cn('text-[10px]', counted ? 'text-negative' : 'text-muted-foreground')}>{description}</p>
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
        {group.chems.map(c => (
          <ConsumableRadioRow key={c.id} item={c} groupName="active-chem" description={describeBuffModifiers(c)} />
        ))}
        {group.picker.length > 0 && <CausePicker items={group.picker} placeholder="No alcohol" />}
        {group.chems.length === 0 && group.picker.length === 0 && (
          <p className="text-muted-foreground/60 px-2 py-1 text-sm italic">No modeled chem causes it</p>
        )}
      </div>
      <div className={cn(RAIL, 'flex items-center py-0.5 pl-2')}>
        <AddictionCell group={group} suppressedBy={suppressorOf.get(group.addiction?.id ?? '')} showDelta={showDelta} />
      </div>
    </div>
  );
}

/**
 * A category with a hard "one active at a time" rule and no addiction ledger
 * (magazines, bobbleheads) — the chem/alcohol radio contract from
 * `ChemsSection`, minus the addiction rail those two don't have. One shared
 * component parameterized by category avoids duplicating the section twice.
 */
function SingleSelectBuffSection({
  accordionValue,
  label,
  category,
  groupName,
  noneLabel,
  emptyText,
}: {
  accordionValue: string;
  label: string;
  category: GeneratedBuff['category'];
  groupName: string;
  noneLabel: string;
  emptyText: string;
}) {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const items = getConsumables(mode)
    .filter(c => c.category === category)
    .sort(byName);
  const active = items.find(c => player.consumables.includes(c.id));

  return (
    <AccordionItem value={accordionValue}>
      <AccordionTrigger>
        <SectionTrigger label={label} summary={active?.name ?? 'none'} />
      </AccordionTrigger>
      <AccordionContent>
        {items.length > 0 ? (
          <div className="space-y-0.5">
            <NoneRadioRow label={noneLabel} groupName={groupName} activeId={active?.id} />
            {items.map(item => (
              <ConsumableRadioRow
                key={item.id}
                item={item}
                groupName={groupName}
                description={describeBuffModifiers(item)}
              />
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">{emptyText}</p>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export function MagazinesSection() {
  return (
    <SingleSelectBuffSection
      accordionValue="magazines"
      label="Magazines"
      category="magazine"
      groupName="active-magazine"
      noneLabel="No magazine"
      emptyText="No modeled magazine issue found."
    />
  );
}

export function BobbleheadsSection() {
  return (
    <SingleSelectBuffSection
      accordionValue="bobbleheads"
      label="Bobbleheads"
      category="bobblehead"
      groupName="active-bobblehead"
      noneLabel="No bobblehead"
      emptyText="No modeled bobblehead found."
    />
  );
}

export function ChemsSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const consumables = getConsumables(mode);
  const chems = consumables.filter(c => c.category === 'chem').sort(byName);
  const alcohols = consumables.filter(c => c.category === 'alcohol').sort(byName);
  const ledger = buildLedger(chems, alcohols, getAddictions(mode));
  const suppressed = getSuppressedAddictions(mode, player.consumables);

  // Families whose causes collapse to a picker (alcohol) sit above the chem
  // radio group; everything the radios cover — plus cause-less families like
  // Med-X — sits below it, under the "No chem" deselect.
  const alcoholGroups = ledger.filter(g => g.picker.length > 0);
  const chemGroups = ledger.filter(g => g.picker.length === 0);

  // What suppresses each addiction — any active item that causes it, chem or brew.
  const suppressorOf = new Map<string, GeneratedBuff>();
  for (const c of consumables) {
    if (c.addiction && player.consumables.includes(c.id)) suppressorOf.set(c.addiction.id, c);
  }

  // Junkie's reads addictionCount off a curve — find it in the data rather than
  // by name, so any future effect on the same axis lights the badge too.
  const junkies = (player.weapon?.legendaryEffects ?? []).some(id =>
    getOmodById(mode, id)?.modifiers.some(m => m.curve?.input === 'addictionCount')
  );

  const activeChem = chems.find(c => player.consumables.includes(c.id));
  const activeAlcohol = alcohols.find(c => player.consumables.includes(c.id));
  const counted = player.addictions.filter(id => !suppressed.has(id)).length;

  const taking = [activeChem?.name, activeAlcohol?.name].filter(Boolean).join(' + ');
  const summary =
    player.addictions.length > 0
      ? `${taking || 'nothing'} · ${counted} of ${player.addictions.length} addictions counted`
      : taking || 'none';

  return (
    <AccordionItem value="chems">
      <AccordionTrigger>
        <SectionTrigger
          label="Chems & Alcohol"
          summary={summary}
          badge={
            junkies ? (
              <Badge title={`Junkie's is scaling off ${counted} counted addiction${counted === 1 ? '' : 's'}`}>
                Junkie's ×{counted}
              </Badge>
            ) : (
              player.addictions.length > 0 && (
                <Badge variant="outline" title="Nothing equipped reads your addiction count, so these addictions change no damage">
                  no Junkie's
                </Badge>
              )
            )
          }
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="font-condensed text-muted-foreground flex items-stretch pb-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
          <span className="flex-1 px-2">Active — one alcohol, one chem</span>
          <span className={cn(RAIL, 'px-2 pl-3')}>Addicted — Junkie's stacks</span>
        </div>

        {/* Alcohol first: it's one control, and it's the only row whose chem cell
            isn't part of the chem radio group. The gap below keeps it from reading
            as the first option of that group. */}
        <div className="divide-border/50 divide-y">
          {alcoholGroups.map(group => (
            <LedgerRow key={group.addiction!.id} group={group} suppressorOf={suppressorOf} showDelta={junkies} />
          ))}
        </div>

        <div className="mt-4 divide-border/50 divide-y">
          <div className="flex items-stretch">
            <div className="min-w-0 flex-1 py-0.5">
              <NoneRadioRow label="No chem" groupName="active-chem" activeId={activeChem?.id} />
            </div>
            <div className={RAIL} />
          </div>

          {chemGroups.map(group => (
            <LedgerRow
              key={group.addiction?.id ?? group.chems[0].id}
              group={group}
              suppressorOf={suppressorOf}
              showDelta={junkies}
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
        const description = describeBuffModifiers(item);
        return (
          <CommandItem key={item.id} value={item.id} keywords={[item.name]} onSelect={() => select(item.id)}>
            <CheckIcon className={cn('mr-2 size-4', selected ? 'opacity-100' : 'opacity-0')} />
            <div className="min-w-0 flex-1">
              <span className="block truncate">{item.name}</span>
              {description && <p className="text-muted-foreground truncate text-xs">{description}</p>}
            </div>
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
  const description = describeBuffModifiers(item);
  return (
    <div className={cn('bg-muted/40 flex gap-1 rounded px-2 py-1 text-sm', description ? 'items-start' : 'items-center')}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate">{item.name}</span>
          {diet === 'doubled' && <span className="text-emerald-500 shrink-0 text-xs">×2 diet</span>}
          {diet === 'zeroed' && <span className="text-muted-foreground shrink-0 text-xs line-through">no effect</span>}
        </div>
        {description && <p className="text-muted-foreground text-xs">{description}</p>}
      </div>
      <div className={cn('flex items-center gap-1', description && 'pt-0.5')}>
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
