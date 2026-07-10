import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { createDefaultPlayerConditions, createDefaultEnemyConditions, type PlayerConditions } from '@/types';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { SectionTrigger } from './SectionTrigger';

/**
 * In-combat state: stacks, health, crit economy, target state. Sneak and
 * weakpoint targeting are NOT here — they're the chips on the headline strip,
 * because they re-frame the output rather than describe the build.
 */

const NUMBER_FIELDS: Array<{
  key: keyof PlayerConditions;
  label: string;
  min: number;
  max: number;
}> = [
  { key: 'healthPercent', label: 'Health % (Bloodied, Adrenal Reaction)', min: 1, max: 100 },
  { key: 'maxHealth', label: "Max HP (Juggernaut's scales with current HP)", min: 1, max: 99999 },
  { key: 'capsOnHand', label: "Caps on hand (Aristocrat's, max at 29k)", min: 0, max: 999999 },
  // Addictions are uncapped in-game; Junkie's bonus curve tops out at 10.
  { key: 'addictionCount', label: "Addictions (Junkie's maxes at 10)", min: 0, max: 99 },
  { key: 'adrenalineStacks', label: 'Kill streak (Adrenal effects, 0–10)', min: 0, max: 10 },
  { key: 'furiousStacks', label: 'Furious consecutive hits (0–9)', min: 0, max: 9 },
  { key: 'tenderizerStacks', label: 'Tenderizer stacks (0–1000, team-dependent)', min: 0, max: 1000 },
  { key: 'limitBreakingPieces', label: 'Limit Breaking armor pieces (0–5, −10% crit cost each)', min: 0, max: 5 },
];

export function ConditionsSection() {
  const { player, enemy } = useBuild();
  const dispatch = useBuildDispatch();

  const playerDefaults = createDefaultPlayerConditions();
  const enemyDefaults = createDefaultEnemyConditions();
  const activeCount =
    NUMBER_FIELDS.filter(f => player.conditions[f.key] !== playerDefaults[f.key]).length +
    (player.conditions.isPowerAttacking !== playerDefaults.isPowerAttacking ? 1 : 0) +
    (enemy.conditions.isFullHealth !== enemyDefaults.isFullHealth ? 1 : 0);

  return (
    <AccordionItem value="conditions">
      <AccordionTrigger>
        <SectionTrigger
          label="Conditions"
          summary={activeCount === 0 ? 'defaults' : undefined}
          badge={activeCount > 0 && <Badge variant="secondary">{activeCount} active</Badge>}
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3">
          {NUMBER_FIELDS.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`cond-${field.key}`}>{field.label}</Label>
              <Input
                id={`cond-${field.key}`}
                type="number"
                min={field.min}
                max={field.max}
                value={player.conditions[field.key] as number}
                onChange={e =>
                  dispatch({
                    type: 'condition/set',
                    key: field.key,
                    value: Math.max(field.min, Math.min(field.max, parseInt(e.target.value, 10) || field.min)),
                  })
                }
              />
            </div>
          ))}

          <label htmlFor="cond-power-attack" className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              id="cond-power-attack"
              checked={player.conditions.isPowerAttacking}
              onCheckedChange={v => dispatch({ type: 'condition/set', key: 'isPowerAttacking', value: v === true })}
            />
            <span>Power attacking (melee)</span>
          </label>

          <label htmlFor="cond-enemy-full" className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              id="cond-enemy-full"
              checked={enemy.conditions.isFullHealth}
              onCheckedChange={v => dispatch({ type: 'enemy/condition', key: 'isFullHealth', value: v === true })}
            />
            <span>Target at full health (Instigating)</span>
          </label>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
