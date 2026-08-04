import * as React from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { NumberField } from '@/components/ui/number-field';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import {
  getArmorEffectById,
  getArmorEffects,
  getArmorTierUsage,
  MAX_LEGENDARY_COUNT,
  type ArmorEffectEntry,
  type ArmorSlotGroup,
  type ArmorStarTier,
} from '@/data/armor-modifiers';
import { ActionDelta } from '@/components/diff/ActionDelta';
import { NoEffectBadge } from './OptionBadge';
import { SectionTrigger } from './SectionTrigger';

/**
 * Armor section (Phase 3 armor pipeline, UI half) — a per-slot-style
 * picker+count UI, matching WeaponSection's mod-selector convention
 * (a `Combobox` per row) rather than a flat checklist. Armor has no fixed
 * named slots the way weapon OMODs do, so rows are dynamic: the user ADDs a
 * row (`+ Add legendary/normal mod`), picks which effect it represents via
 * the row's own Combobox, and sets a worn-piece count (`NumberField`,
 * 0-5 for legendary, 1-`effect.maxCount` for misc — that cap varies per
 * effect since not every mod can mount on every armor piece). Every row is
 * an obtainable armor/PA mod on an admitted workbench attach point
 * (`src/data/armor-modifiers.ts` `getArmorEffects`, allow-list derived —
 * zero-modifier choices show a "no effect yet" badge instead of vanishing,
 * same convention as the weapon OMOD picker in `src/data/omods.ts`).
 *
 * `PlayerConfig.armorEffects` (effect id → worn-piece count) already
 * supports arbitrary independent effects with independent counts
 * simultaneously — this UI is just a dynamic view over that map, one row per
 * currently-nonzero entry, entirely through the existing
 * `armorEffect/setCount` action (count > 0 sets, count <= 0 deletes).
 * `selfScaling` effects (Battle-Loader's, Limit-Breaking) dispatch the exact
 * same action; the tiered-modifier derivation lives entirely in
 * `armor-modifiers.ts` and needs no special-casing here.
 */

function EffectDescription({ description }: { description: string | null }) {
  if (!description) return null;
  return <p className="text-muted-foreground text-xs">{description}</p>;
}

/** A currently-active effect row: switch-effect combobox, worn-piece count, remove button. */
function ActiveEffectRow({
  effect,
  options,
  tierUsage,
}: {
  effect: ArmorEffectEntry;
  /** Every effect in this group not used by another active row, plus this row's own current effect. */
  options: ArmorEffectEntry[];
  /** Summed worn-piece counts per legendary star tier across the whole checklist (includes this row's own count). */
  tierUsage: Record<ArmorStarTier, number>;
}) {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const count = player.armorEffects[effect.id] ?? 0;
  const min = effect.group === 'legendary' ? 0 : 1;
  const countFieldId = `armor-effect-count-${effect.id}`;
  // For legendary effects, the field's own tier budget headroom (this row's
  // count is already included in tierUsage, so the free space it can still
  // absorb is MAX_LEGENDARY_COUNT minus the tier total) additionally caps
  // the field — mirrors the reducer's own `armorEffect/setCount` clamp so
  // the field refuses over-tier input rather than silently snapping back.
  const max =
    effect.starTier !== undefined
      ? Math.min(
          effect.maxCount,
          count + Math.max(0, MAX_LEGENDARY_COUNT - tierUsage[effect.starTier]),
        )
      : effect.maxCount;

  const comboOptions: ComboboxOption[] = options.map((e) => ({ value: e.id, label: e.name }));

  const switchTargetCount = (opt: ArmorEffectEntry | undefined): number => {
    const desiredCount = Math.max(1, Math.min(opt?.maxCount ?? 5, count));
    if (opt?.starTier === undefined) return desiredCount;
    const usageExcludingSwitch =
      tierUsage[opt.starTier] - (effect.starTier === opt.starTier ? count : 0);
    const freeSpace = Math.max(0, MAX_LEGENDARY_COUNT - usageExcludingSwitch);
    return Math.min(desiredCount, freeSpace);
  };

  return (
    <div className="space-y-1 py-1.5">
      <div className="flex items-center gap-2">
        <Combobox
          options={comboOptions}
          value={effect.id}
          onValueChange={(nextId) => {
            if (!nextId || nextId === effect.id) return;
            const nextEffect = getArmorEffectById(mode, nextId);
            const nextCount = switchTargetCount(nextEffect);
            dispatch({ type: 'armorEffect/setCount', id: effect.id, count: 0 });
            dispatch({ type: 'armorEffect/setCount', id: nextId, count: nextCount });
          }}
          placeholder="Pick an effect…"
          searchPlaceholder="Search effects…"
          emptyText="No effect matches."
          className="flex-1"
          renderOptionExtra={(o) => {
            const opt = options.find((e) => e.id === o.value);
            const isCurrent = o.value === effect.id;
            return (
              <>
                {opt?.badge === 'inert' && <NoEffectBadge />}
                {!isCurrent && (
                  <ActionDelta
                    action={[
                      { type: 'armorEffect/setCount', id: effect.id, count: 0 },
                      { type: 'armorEffect/setCount', id: o.value, count: switchTargetCount(opt) },
                    ]}
                  />
                )}
              </>
            );
          }}
        />
        <label htmlFor={countFieldId} className="sr-only">
          {effect.name} worn-piece count
        </label>
        <NumberField
          id={countFieldId}
          value={count}
          min={min}
          max={max}
          onChange={(v) => dispatch({ type: 'armorEffect/setCount', id: effect.id, count: v })}
          className="w-16 shrink-0"
        />
        {effect.badge === 'inert' && <NoEffectBadge />}
        {count < max && (
          <ActionDelta action={{ type: 'armorEffect/setCount', id: effect.id, count: count + 1 }} />
        )}
        <Button
          variant="ghost"
          size="icon"
          className="text-muted-foreground size-6 shrink-0"
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

/** An empty draft row — added locally, not yet backed by any dispatched state, until an effect is picked. */
function DraftEffectRow({
  options,
  placeholder,
  onPick,
  onCancel,
}: {
  options: ArmorEffectEntry[];
  placeholder: string;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const comboOptions: ComboboxOption[] = options.map((e) => ({ value: e.id, label: e.name }));
  return (
    <div className="flex items-center gap-2 py-1.5">
      <Combobox
        options={comboOptions}
        value={null}
        onValueChange={(id) => {
          if (id) onPick(id);
        }}
        placeholder={placeholder}
        searchPlaceholder="Search effects…"
        emptyText="No effect matches."
        className="flex-1"
        renderOptionExtra={(o) => {
          const opt = options.find((e) => e.id === o.value);
          return (
            <>
              {opt?.badge === 'inert' && <NoEffectBadge />}
              <ActionDelta action={{ type: 'armorEffect/setCount', id: o.value, count: 1 }} />
            </>
          );
        }}
      />
      <Button
        variant="ghost"
        size="icon"
        className="text-muted-foreground size-6 shrink-0"
        aria-label="Cancel"
        onClick={onCancel}
      >
        <XIcon className="size-3" />
      </Button>
    </div>
  );
}

function EffectGroup({
  title,
  effects,
  addLabel,
  addPlaceholder,
  tierUsage,
}: {
  title: string;
  effects: ArmorEffectEntry[];
  addLabel: string;
  addPlaceholder: string;
  tierUsage: Record<ArmorStarTier, number>;
}) {
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const [drafts, setDrafts] = React.useState<number[]>([]);
  const nextDraftKey = React.useRef(0);

  if (effects.length === 0) return null;

  const activeEffects = effects.filter((e) => (player.armorEffects[e.id] ?? 0) > 0);
  const activeIds = new Set(activeEffects.map((e) => e.id));
  // Legendary effects whose tier is already at budget would no-op on add —
  // exclude them from the draft-row picker. Misc effects (no starTier) are
  // never affected by the tier budget, so they pass through unfiltered.
  const availableEffects = effects.filter(
    (e) =>
      !activeIds.has(e.id) &&
      (e.starTier === undefined || tierUsage[e.starTier] < MAX_LEGENDARY_COUNT),
  );
  const everyEffectActive = effects.every((e) => (player.armorEffects[e.id] ?? 0) > 0);
  const starTier = effects[0]?.starTier;

  const addDraft = () => {
    nextDraftKey.current += 1;
    setDrafts((prev) => [...prev, nextDraftKey.current]);
  };
  const removeDraft = (key: number) => setDrafts((prev) => prev.filter((k) => k !== key));

  return (
    <div>
      <div className="flex items-baseline justify-between pb-1">
        <p className="font-condensed text-muted-foreground text-[10px] font-semibold uppercase tracking-[0.1em]">
          {title}
        </p>
        {starTier !== undefined && (
          <p className="text-muted-foreground text-xs">
            {starTier}★ {tierUsage[starTier]}/{MAX_LEGENDARY_COUNT}
          </p>
        )}
      </div>
      <div className="divide-border/50 divide-y">
        {activeEffects.map((effect) => (
          <ActiveEffectRow
            key={effect.id}
            effect={effect}
            options={effects.filter((e) => e.id === effect.id || !activeIds.has(e.id))}
            tierUsage={tierUsage}
          />
        ))}
        {drafts.map((key) => (
          <DraftEffectRow
            key={key}
            options={availableEffects}
            placeholder={addPlaceholder}
            onPick={(id) => {
              dispatch({ type: 'armorEffect/setCount', id, count: 1 });
              removeDraft(key);
            }}
            onCancel={() => removeDraft(key)}
          />
        ))}
      </div>
      {!everyEffectActive && (
        <Button
          variant="outline"
          size="sm"
          className="mt-2 w-full justify-start"
          onClick={addDraft}
        >
          <PlusIcon className="mr-1 size-3.5" /> {addLabel}
        </Button>
      )}
    </div>
  );
}

const GROUP_DESCRIPTORS: Array<{
  key: ArmorSlotGroup | `legendary-${ArmorStarTier}`;
  title: string;
  addLabel: string;
  addPlaceholder: string;
  predicate: (e: ArmorEffectEntry) => boolean;
}> = [
  {
    key: 'material',
    title: 'Material',
    addLabel: 'Add material',
    addPlaceholder: 'Pick a material…',
    predicate: (e) => e.group === 'material',
  },
  {
    key: 'lining',
    title: 'Lining',
    addLabel: 'Add lining',
    addPlaceholder: 'Pick a lining…',
    predicate: (e) => e.group === 'lining',
  },
  {
    key: 'misc',
    title: 'Misc',
    addLabel: 'Add misc mod',
    addPlaceholder: 'Pick a misc mod…',
    predicate: (e) => e.group === 'misc',
  },
  {
    key: 'legendary-1',
    title: '1★ Legendary',
    addLabel: 'Add 1★ effect',
    addPlaceholder: 'Pick a 1★ effect…',
    predicate: (e) => e.starTier === 1,
  },
  {
    key: 'legendary-2',
    title: '2★ Legendary',
    addLabel: 'Add 2★ effect',
    addPlaceholder: 'Pick a 2★ effect…',
    predicate: (e) => e.starTier === 2,
  },
  {
    key: 'legendary-3',
    title: '3★ Legendary',
    addLabel: 'Add 3★ effect',
    addPlaceholder: 'Pick a 3★ effect…',
    predicate: (e) => e.starTier === 3,
  },
  {
    key: 'legendary-4',
    title: '4★ Legendary',
    addLabel: 'Add 4★ effect',
    addPlaceholder: 'Pick a 4★ effect…',
    predicate: (e) => e.starTier === 4,
  },
];

export function ArmorSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const effects = getArmorEffects(mode);
  const activeCount = Object.values(player.armorEffects).filter((count) => count > 0).length;
  const tierUsage = getArmorTierUsage(mode, player.armorEffects);

  return (
    <AccordionItem value="armor">
      <AccordionTrigger>
        <SectionTrigger
          label="Armor"
          summary={activeCount === 0 ? 'none' : undefined}
          badge={activeCount > 0 && <Badge variant="secondary">{activeCount} active</Badge>}
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4">
          {GROUP_DESCRIPTORS.map((d) => (
            <EffectGroup
              key={d.key}
              title={d.title}
              effects={effects.filter(d.predicate)}
              addLabel={d.addLabel}
              addPlaceholder={d.addPlaceholder}
              tierUsage={tierUsage}
            />
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
