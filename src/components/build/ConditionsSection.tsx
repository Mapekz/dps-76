import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Slider } from '@/components/ui/slider';
import {
  createDefaultPlayerConditions,
  createDefaultEnemyConditions,
  type EnemyConditions,
  type PlayerConditions,
} from '@/types';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { useScenarioResults } from '@/state/useScenarioResults';
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
  step?: number;
}> = [
  { key: 'healthPercent', label: 'Health % (Bloodied, Adrenal Reaction)', min: 1, max: 100 },
  { key: 'maxHealth', label: "Max HP (Juggernaut's scales with current HP)", min: 1, max: 99999 },
  { key: 'capsOnHand', label: "Caps on hand (Aristocrat's, max at 29k)", min: 0, max: 999999 },
  // Addictions are uncapped in-game; Junkie's bonus curve tops out at 10.
  { key: 'addictionCount', label: "Addictions (Junkie's maxes at 10)", min: 0, max: 99 },
  { key: 'adrenalineStacks', label: 'Kill streak (Adrenal effects, 0–10)', min: 0, max: 10 },
  { key: 'tenderizerStacks', label: 'Tenderizer stacks (0–1000, team-dependent)', min: 0, max: 1000 },
  { key: 'limitBreakingPieces', label: 'Limit Breaking armor pieces (0–5, −10% crit cost each)', min: 0, max: 5 },
  { key: 'hungerThirstTier', label: "Food + drink meter tier (Gourmand's, 0–8)", min: 0, max: 8 },
  { key: 'feralTier', label: "Feral meter tier (Lucid, ghoul builds, 0–8)", min: 0, max: 8 },
  // Teams cap at 4 players = 3 teammates (Fencer's top tier).
  { key: 'teammateCount', label: "Teammates (Fencer's maxes at 3)", min: 0, max: 3 },
  // Polished maxes its curve at 200% (over-repaired); 100% = full condition.
  { key: 'weaponConditionPct', label: 'Weapon condition % (Polished maxes at 200%)', min: 0, max: 200, step: 10 },
  // Manual-aim only — VATS accuracy is assumed 100% (hit-chance modeling out of scope).
  { key: 'hitRatePct', label: 'Free-aim hit rate % (misses waste shots)', min: 10, max: 100, step: 5 },
];

const TARGET_DISTANCE_OPTIONS: Array<{ value: NonNullable<EnemyConditions['targetDistance']>; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'close', label: 'Close' },
  { value: 'far', label: 'Far' },
];

const ENEMY_NUMBER_FIELDS: Array<{
  key: keyof EnemyConditions;
  label: string;
  min: number;
  max: number;
}> = [
  { key: 'healthPercent', label: "Target health % (Executioner's ≤40, Instigating ≥60)", min: 1, max: 100 },
  { key: 'crippledLimbCount', label: "Target crippled limbs (Bully's, Tormentor, 0–6)", min: 0, max: 6 },
  { key: 'groupTargetCount', label: "Enemies in the group (Encircler's maxes at 5)", min: 1, max: 99 },
];

const ENEMY_CHECKBOXES: Array<{ key: keyof EnemyConditions; label: string }> = [
  { key: 'isBurning', label: "Target is burning (Pyromaniac's)" },
  { key: 'isPoisoned', label: "Target is poisoned (Viper's)" },
];

export function ConditionsSection() {
  const { player, enemy } = useBuild();
  const dispatch = useBuildDispatch();
  const { scenarios } = useScenarioResults();

  // Onslaught stacks (shared engine counter — Guerrilla/Gunslinger
  // Expert+Master, Furious, Pounder's, Splinter's, Whacker Smacker): the max
  // is computed from equipped sources (ScenarioSet.onslaughtMaxStacks), not
  // stored player state. Sentinel -1 = follow max (default); an explicit
  // selection is clamped to the current max for display (the engine clamps
  // the same way at read time).
  const onslaughtMax = scenarios?.onslaughtMaxStacks ?? 0;
  const onslaughtStored = player.conditions.onslaughtStacks;
  const onslaughtValue = onslaughtStored === -1 ? onslaughtMax : Math.min(onslaughtStored, onslaughtMax);
  const onslaughtActive = onslaughtStored !== -1;

  const playerDefaults = createDefaultPlayerConditions();
  const enemyDefaults = createDefaultEnemyConditions();
  const activeCount =
    NUMBER_FIELDS.filter(f => (player.conditions[f.key] ?? playerDefaults[f.key]) !== playerDefaults[f.key]).length +
    ENEMY_NUMBER_FIELDS.filter(f => (enemy.conditions[f.key] ?? enemyDefaults[f.key]) !== enemyDefaults[f.key]).length +
    ENEMY_CHECKBOXES.filter(f => (enemy.conditions[f.key] ?? false) !== (enemyDefaults[f.key] ?? false)).length +
    (player.conditions.isPowerAttacking !== playerDefaults.isPowerAttacking ? 1 : 0) +
    ((player.conditions.isLastShot ?? false) !== (playerDefaults.isLastShot ?? false) ? 1 : 0) +
    ((player.conditions.isGhoul ?? false) !== (playerDefaults.isGhoul ?? false) ? 1 : 0) +
    (onslaughtActive ? 1 : 0) +
    ((enemy.conditions.targetDistance ?? enemyDefaults.targetDistance) !== enemyDefaults.targetDistance ? 1 : 0);

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
                step={field.step}
                value={(player.conditions[field.key] as number | undefined) ?? (playerDefaults[field.key] as number)}
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

          <div className="space-y-1.5">
            <Label htmlFor="cond-onslaught">
              Onslaught stacks ({onslaughtValue} / max {onslaughtMax})
            </Label>
            <Slider
              id="cond-onslaught"
              min={0}
              max={onslaughtMax}
              step={1}
              disabled={onslaughtMax === 0}
              value={[onslaughtValue]}
              onValueChange={([v]) => dispatch({ type: 'condition/set', key: 'onslaughtStacks', value: v })}
            />
            {onslaughtMax === 0 && (
              <p className="text-xs text-muted-foreground">No Onslaught sources equipped</p>
            )}
          </div>

          <label htmlFor="cond-power-attack" className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              id="cond-power-attack"
              checked={player.conditions.isPowerAttacking}
              onCheckedChange={v => dispatch({ type: 'condition/set', key: 'isPowerAttacking', value: v === true })}
            />
            <span>Power attacking (melee)</span>
          </label>

          <label htmlFor="cond-last-shot" className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              id="cond-last-shot"
              checked={player.conditions.isLastShot ?? false}
              onCheckedChange={v => dispatch({ type: 'condition/set', key: 'isLastShot', value: v === true })}
            />
            <span>Firing the magazine's last round (Last Shot)</span>
          </label>

          <label htmlFor="cond-ghoul" className="flex cursor-pointer items-center gap-2 text-sm">
            <Checkbox
              id="cond-ghoul"
              checked={player.conditions.isGhoul ?? false}
              onCheckedChange={v => dispatch({ type: 'condition/set', key: 'isGhoul', value: v === true })}
            />
            <span>Ghoul character (feral meter applies; Gourmand's is human-only)</span>
          </label>

          <Separator />
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Target</p>

          <div className="space-y-1.5">
            <Label>Target distance (Close ≈12m: Guerrilla · Far: Down Ranger, Sniper's)</Label>
            <ButtonGroup>
              {TARGET_DISTANCE_OPTIONS.map(opt => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={(enemy.conditions.targetDistance ?? enemyDefaults.targetDistance) === opt.value ? 'default' : 'outline'}
                  onClick={() => dispatch({ type: 'enemy/condition', key: 'targetDistance', value: opt.value })}
                >
                  {opt.label}
                </Button>
              ))}
            </ButtonGroup>
          </div>

          {ENEMY_NUMBER_FIELDS.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`cond-enemy-${field.key}`}>{field.label}</Label>
              <Input
                id={`cond-enemy-${field.key}`}
                type="number"
                min={field.min}
                max={field.max}
                value={(enemy.conditions[field.key] as number | undefined) ?? (enemyDefaults[field.key] as number)}
                onChange={e =>
                  dispatch({
                    type: 'enemy/condition',
                    key: field.key,
                    value: Math.max(field.min, Math.min(field.max, parseInt(e.target.value, 10) || field.min)),
                  })
                }
              />
            </div>
          ))}

          {ENEMY_CHECKBOXES.map(field => (
            <label
              key={field.key}
              htmlFor={`cond-enemy-${field.key}`}
              className="flex cursor-pointer items-center gap-2 text-sm"
            >
              <Checkbox
                id={`cond-enemy-${field.key}`}
                checked={(enemy.conditions[field.key] as boolean | undefined) ?? false}
                onCheckedChange={v => dispatch({ type: 'enemy/condition', key: field.key, value: v === true })}
              />
              <span>{field.label}</span>
            </label>
          ))}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
