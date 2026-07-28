import * as React from 'react';
import { PlusIcon, XIcon } from 'lucide-react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Combobox, type ComboboxOption } from '@/components/ui/combobox';
import { NumberField } from '@/components/ui/number-field';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { getArmorEffectById, getArmorEffects, type ArmorEffectEntry } from '@/data/armor-modifiers';
import { SectionTrigger } from './SectionTrigger';

/**
 * Armor section (Phase 3 armor pipeline, UI half) — a per-slot-style
 * picker+count UI, matching WeaponSection's mod-selector convention
 * (a `Combobox` per row) rather than a flat checklist. Armor has no fixed
 * named slots the way weapon OMODs do, so rows are dynamic: the user ADDs a
 * row (`+ Add legendary/normal mod`), picks which effect it represents via
 * the row's own Combobox, and sets a worn-piece count (`NumberField`,
 * 0-5 for legendary, 1-`effect.maxCount` for misc — that cap varies per
 * effect since not every mod can mount on every armor piece). Every row is a
 * curated, engine-effective legendary or craftable armor/PA effect
 * (`src/data/armor-modifiers.ts` `getArmorEffects`, filter-derived — nothing
 * here can be badged inert by construction).
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
}: {
  effect: ArmorEffectEntry;
  /** Every effect in this group not used by another active row, plus this row's own current effect. */
  options: ArmorEffectEntry[];
}) {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const count = player.armorEffects[effect.id] ?? 0;
  const min = effect.group === 'legendary' ? 0 : 1;
  const countFieldId = `armor-effect-count-${effect.id}`;

  const comboOptions: ComboboxOption[] = options.map((e) => ({ value: e.id, label: e.name }));

  return (
    <div className="space-y-1 py-1.5">
      <div className="flex items-center gap-2">
        <Combobox
          options={comboOptions}
          value={effect.id}
          onValueChange={(nextId) => {
            if (!nextId || nextId === effect.id) return;
            const nextEffect = getArmorEffectById(mode, nextId);
            const nextCount = Math.max(1, Math.min(nextEffect?.maxCount ?? 5, count));
            dispatch({ type: 'armorEffect/setCount', id: effect.id, count: 0 });
            dispatch({ type: 'armorEffect/setCount', id: nextId, count: nextCount });
          }}
          placeholder="Pick an effect…"
          searchPlaceholder="Search effects…"
          emptyText="No effect matches."
          className="flex-1"
        />
        <label htmlFor={countFieldId} className="sr-only">
          {effect.name} worn-piece count
        </label>
        <NumberField
          id={countFieldId}
          value={count}
          min={min}
          max={effect.maxCount}
          onChange={(v) => dispatch({ type: 'armorEffect/setCount', id: effect.id, count: v })}
          className="w-16 shrink-0"
        />
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
}: {
  title: string;
  effects: ArmorEffectEntry[];
  addLabel: string;
  addPlaceholder: string;
}) {
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const [drafts, setDrafts] = React.useState<number[]>([]);
  const nextDraftKey = React.useRef(0);

  if (effects.length === 0) return null;

  const activeEffects = effects.filter((e) => (player.armorEffects[e.id] ?? 0) > 0);
  const activeIds = new Set(activeEffects.map((e) => e.id));
  const availableEffects = effects.filter((e) => !activeIds.has(e.id));
  const everyEffectActive = effects.every((e) => (player.armorEffects[e.id] ?? 0) > 0);

  const addDraft = () => {
    nextDraftKey.current += 1;
    setDrafts((prev) => [...prev, nextDraftKey.current]);
  };
  const removeDraft = (key: number) => setDrafts((prev) => prev.filter((k) => k !== key));

  return (
    <div>
      <p className="font-condensed text-muted-foreground pb-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
        {title}
      </p>
      <div className="divide-border/50 divide-y">
        {activeEffects.map((effect) => (
          <ActiveEffectRow
            key={effect.id}
            effect={effect}
            options={effects.filter((e) => e.id === effect.id || !activeIds.has(e.id))}
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

export function ArmorSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const effects = getArmorEffects(mode);
  const legendary = effects.filter((e) => e.group === 'legendary');
  const misc = effects.filter((e) => e.group === 'misc');
  const activeCount = Object.values(player.armorEffects).filter((count) => count > 0).length;

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
          <EffectGroup
            title="Legendary effects"
            effects={legendary}
            addLabel="Add legendary mod"
            addPlaceholder="Pick a legendary effect…"
          />
          <EffectGroup
            title="Misc & PA mods"
            effects={misc}
            addLabel="Add normal mod"
            addPlaceholder="Pick a normal mod…"
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
