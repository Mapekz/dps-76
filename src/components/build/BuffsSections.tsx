import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Checkbox } from '@/components/ui/checkbox';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { getConsumables, getMutations } from '@/data/buffs';
import { ActionDelta } from '@/components/diff/ActionDelta';
import type { BuildAction } from '@/state/build-reducer';
import { SectionTrigger } from './SectionTrigger';

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

  return (
    <AccordionItem value="mutations">
      <AccordionTrigger>
        <SectionTrigger label="Mutations" summary={player.mutations.length > 0 ? `${player.mutations.length} active` : 'none'} />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-0.5">
          <CheckboxRow
            id="strange-in-numbers"
            label="Strange in Numbers (team, +25% mutation effects)"
            checked={player.conditions.strangeInNumbers}
            onCheckedChange={value => dispatch({ type: 'condition/set', key: 'strangeInNumbers', value })}
          />
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

export function ConsumablesSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();
  const consumables = getConsumables(mode);

  return (
    <AccordionItem value="consumables">
      <AccordionTrigger>
        <SectionTrigger
          label="Consumables"
          summary={player.consumables.length > 0 ? `${player.consumables.length} active` : 'none'}
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-0.5">
          {consumables.map(c => (
            <CheckboxRow
              key={c.id}
              id={`consumable-${c.id}`}
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
