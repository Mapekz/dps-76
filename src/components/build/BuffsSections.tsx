import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { getConsumables, getMutations } from '@/data/buffs';
import { deriveStrangeInNumbers } from '@/lib/player-stats';
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

  // Derived, not a toggle: the Strange in Numbers card equipped + a teammate
  // to be mutated with (same rule resolveLoadout feeds the engine).
  const sinEquipped = player.perks.some(p => p.perkId === 'StrangeInNumbers');
  const sinActive = deriveStrangeInNumbers(player.perks, player.conditions);

  return (
    <AccordionItem value="mutations">
      <AccordionTrigger>
        <SectionTrigger
          label="Mutations"
          summary={player.mutations.length > 0 ? `${player.mutations.length} active` : 'none'}
          badge={
            sinEquipped && (
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
            )
          }
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-0.5">
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
