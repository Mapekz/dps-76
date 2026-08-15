import { cn } from '@/lib/utils';
import { HelperText } from '@/components/ui/helper-text';
import { Radio } from '@/components/ui/radio';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { getConsumables } from '@/data/buffs';
import { describeBuffModifiers } from '@/lib/buff-description';
import { byName } from '@/lib/buff-sort';
import { ActionDelta } from '@/components/diff/ActionDelta';
import type { GeneratedBuff } from '@/types/generated';
import { hasAnyEngineEffect } from '@/types/modifiers';
import { NoEffectBadge } from '../OptionBadge';
import { SectionTrigger } from '../SectionTrigger';

/**
 * One option of a single-select consumable list. A radio, not a checkbox: only
 * one chem (and one alcohol) can be active, and `applySelection` silently
 * evicts the incumbent — the control should say so before the click, not after.
 *
 * `description`, when given, renders as a small muted line under the name
 * (magazines/bobbleheads — see `describeBuffModifiers`); other callers
 * (chems/alcohol) omit it and keep the original single-line row.
 *
 * Shared by `ChemsSection` (the chem/alcohol radio group) and
 * `SingleSelectBuffSection` below (magazines/bobbleheads) — same "one active,
 * radio, evict-on-pick" contract in both, differing only in what accompanies it.
 */
export function ConsumableRadioRow({
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
        'hover:bg-muted/40 flex cursor-pointer gap-2 rounded-none px-2 py-1 text-sm',
        description ? 'items-start' : 'items-center',
        active && 'bg-muted/50',
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
          {!hasAnyEngineEffect(item.modifiers) && <NoEffectBadge />}
          {/* Only the removal delta means anything here — the currently
              active item's own ΔDPS (toggling itself off) lives on the
              None row below instead, since that's the actual way to
              remove it (a radio can't un-select itself). */}
          {!active && <ActionDelta action={{ type: 'consumable/toggle', id: item.id }} />}
        </div>
        {description && <HelperText>{description}</HelperText>}
      </div>
    </label>
  );
}

/**
 * The deselect option a radio group needs — you can't un-pick a radio.
 * Carries the ΔDPS of leaving the group empty: for the currently-active
 * item, this row (not the item's own row) is the only way to remove it, so
 * the delta belongs here. Shared by `ChemsSection` and
 * `SingleSelectBuffSection`, same reason as `ConsumableRadioRow` above.
 */
export function NoneRadioRow({
  label,
  groupName,
  activeId,
}: {
  label: string;
  groupName: string;
  activeId?: string;
}) {
  const dispatch = useBuildDispatch();
  return (
    <label className="hover:bg-muted/40 flex cursor-pointer items-center gap-2 rounded-none px-2 py-1 text-sm">
      <Radio
        name={groupName}
        checked={activeId === undefined}
        onChange={() => activeId && dispatch({ type: 'consumable/toggle', id: activeId })}
      />
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {activeId && <ActionDelta action={{ type: 'consumable/toggle', id: activeId }} />}
    </label>
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
    .filter((c) => c.category === category)
    .sort(byName);
  const active = items.find((c) => player.consumables.includes(c.id));

  return (
    <AccordionItem value={accordionValue}>
      <AccordionTrigger>
        <SectionTrigger label={label} summary={active?.name ?? 'none'} />
      </AccordionTrigger>
      <AccordionContent>
        {items.length > 0 ? (
          <div className="space-y-0.5">
            <NoneRadioRow label={noneLabel} groupName={groupName} activeId={active?.id} />
            {items.map((item) => (
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
      noneLabel="None"
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
      noneLabel="None"
      emptyText="No modeled bobblehead found."
    />
  );
}
