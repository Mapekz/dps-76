import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { getArmorEffects, type ArmorEffectEntry } from '@/data/armor-modifiers';
import { SectionTrigger } from './SectionTrigger';

/**
 * Armor section (Phase 3 armor pipeline, UI half) — for now, a slim
 * armor checklist; replaces the old "coming soon" placeholder.
 * Deliberately NOT a per-piece armor picker (user decision,
 * go-through-every-single-silly-whistle.md "Armor: slim effect checklist"):
 * every row is a curated, engine-effective legendary or craftable armor/PA
 * effect (`src/data/armor-modifiers.ts` `getArmorEffects`, filter-derived —
 * nothing here can be badged inert by construction), toggled by worn-piece
 * count rather than by picking specific armor items. Single-slot effects
 * (underarmor styles, PA Misc mods) get a checkbox; multi-piece legendary
 * effects get a 0-5 stepper. Will grow to model the full player armor set.
 */

const STEP_OPTIONS = [0, 1, 2, 3, 4, 5].map(value => ({ value, label: String(value) }));

function EffectDescription({ description }: { description: string | null }) {
  if (!description) return null;
  return <p className="text-muted-foreground text-xs">{description}</p>;
}

function CheckboxEffectRow({ effect }: { effect: ArmorEffectEntry }) {
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const checked = (player.armorEffects[effect.id] ?? 0) > 0;
  const id = `armor-effect-${effect.id}`;
  return (
    <label htmlFor={id} className="flex cursor-pointer items-start gap-2 py-0.5 text-sm">
      <div className="pt-0.5">
        <Checkbox
          id={id}
          checked={checked}
          onCheckedChange={v => dispatch({ type: 'armorEffect/setCount', id: effect.id, count: v === true ? 1 : 0 })}
        />
      </div>
      <div className="min-w-0 flex-1">
        <span className="truncate">{effect.name}</span>
        <EffectDescription description={effect.description} />
      </div>
    </label>
  );
}

function StepperEffectRow({ effect }: { effect: ArmorEffectEntry }) {
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const count = player.armorEffects[effect.id] ?? 0;
  return (
    <div className="space-y-1 py-0.5">
      <div className="flex items-center justify-between gap-2">
        <Label className="text-sm font-normal">{effect.name}</Label>
        <ToggleGroup
          aria-label={`${effect.name} worn pieces`}
          options={STEP_OPTIONS}
          value={count}
          onValueChange={v => dispatch({ type: 'armorEffect/setCount', id: effect.id, count: v })}
        />
      </div>
      <EffectDescription description={effect.description} />
    </div>
  );
}

function EffectRow({ effect }: { effect: ArmorEffectEntry }) {
  return effect.maxCount > 1 ? <StepperEffectRow effect={effect} /> : <CheckboxEffectRow effect={effect} />;
}

function EffectGroup({ title, effects }: { title: string; effects: ArmorEffectEntry[] }) {
  if (effects.length === 0) return null;
  return (
    <div>
      <p className="font-condensed text-muted-foreground pb-1 text-[10px] font-semibold uppercase tracking-[0.1em]">
        {title}
      </p>
      <div className="divide-border/50 divide-y">
        {effects.map(effect => (
          <EffectRow key={effect.id} effect={effect} />
        ))}
      </div>
    </div>
  );
}

export function ArmorSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const effects = getArmorEffects(mode);
  const legendary = effects.filter(e => e.group === 'legendary');
  const misc = effects.filter(e => e.group === 'misc');
  const activeCount = Object.values(player.armorEffects).filter(count => count > 0).length;

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
        <div className="space-y-3">
          <EffectGroup title="Legendary effects" effects={legendary} />
          <EffectGroup title="Misc & PA mods" effects={misc} />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
