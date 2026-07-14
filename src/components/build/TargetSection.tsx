import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ButtonGroup } from '@/components/ui/button-group';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { getBodyPartRaces, getBodyPartRace, getCrippablePartCount } from '@/data/bodyparts';
import { createDefaultEnemyConditions, type EnemyConditions } from '@/types';
import type { BodyPartRaceCategory } from '@/types/generated';
import { SectionTrigger } from './SectionTrigger';

/**
 * What's being shot: which enemy and body part (BPTD damage mult), its state
 * (health, distance, statuses, crippled parts) and team-applied debuffs
 * (Tenderizer). Player steady state lives in ConditionsSection.
 */

const TARGET_DISTANCE_OPTIONS: Array<{ value: NonNullable<EnemyConditions['targetDistance']>; label: string }> = [
  { value: 'none', label: 'None' },
  { value: 'close', label: 'Close' },
  { value: 'far', label: 'Far' },
];

const STATUS_TOGGLES: Array<{ key: keyof EnemyConditions; label: string; title: string }> = [
  { key: 'isBleeding', label: 'Bleeding', title: "Active bleed effect (Severing's 4★)" },
  { key: 'isBurning', label: 'Burning', title: "Active fire effect (Pyromaniac's)" },
  { key: 'isPoisoned', label: 'Poisoned', title: "Active poison effect (Viper's)" },
  { key: 'isFrozen', label: 'Frozen', title: 'Active cryo effect — no equipped effect consumes this yet' },
];

const ENEMY_NUMBER_FIELDS: Array<{
  key: keyof EnemyConditions;
  label: string;
  min: number;
  max: number;
}> = [
  { key: 'healthPercent', label: 'Target health %', min: 1, max: 100 },
  { key: 'groupTargetCount', label: 'Enemies in the group', min: 1, max: 99 },
];

const TARGET_CATEGORY_LABELS: Record<BodyPartRaceCategory, string> = {
  raid: 'Raid Enemies',
  infestation: 'Infestation Bosses',
  headhunt: 'Head Hunt Bosses',
  standard: 'Enemies',
};
const TARGET_CATEGORY_ORDER: BodyPartRaceCategory[] = ['raid', 'infestation', 'headhunt', 'standard'];

export function TargetSection() {
  const { mode } = useGameMode();
  const { player, enemy } = useBuild();
  const dispatch = useBuildDispatch();

  const conditions = enemy.conditions;
  const defaults = createDefaultEnemyConditions();
  const setEnemy = (key: keyof EnemyConditions, value: EnemyConditions[keyof EnemyConditions]) =>
    dispatch({ type: 'enemy/condition', key, value });

  const races = getBodyPartRaces(mode);
  // Category groups in a fixed order, alphabetized within each.
  const raceOptions = TARGET_CATEGORY_ORDER.flatMap(category =>
    races
      .filter(r => r.category === category)
      .map(r => ({ value: r.id, label: r.name, group: TARGET_CATEGORY_LABELS[category] }))
      .sort((a, b) => a.label.localeCompare(b.label))
  );
  const selectedRace = conditions.targetRace ? getBodyPartRace(mode, conditions.targetRace) : undefined;
  const selectedPart = selectedRace?.parts.find(p => p.name === conditions.targetBodyPart);
  const effectiveMult = selectedPart?.dmgMult ?? player.weakpointMult;
  const crippableMax = getCrippablePartCount(mode, conditions.targetRace);

  const selectRace = (raceId: string | null) => {
    setEnemy('targetRace', raceId);
    // Default to the race's juiciest part — the weakpoint people aim for.
    const race = raceId ? getBodyPartRace(mode, raceId) : undefined;
    const best = race ? [...race.parts].sort((a, b) => b.dmgMult - a.dmgMult)[0] : undefined;
    setEnemy('targetBodyPart', best?.name ?? null);
  };

  const tenderizer = player.conditions.tenderizerStacks;

  const activeCount =
    (conditions.targetRace ? 1 : 0) +
    ((conditions.healthPercent ?? 100) !== (defaults.healthPercent ?? 100) ? 1 : 0) +
    (conditions.crippledLimbCount !== defaults.crippledLimbCount ? 1 : 0) +
    ((conditions.groupTargetCount ?? 1) !== (defaults.groupTargetCount ?? 1) ? 1 : 0) +
    ((conditions.targetDistance ?? 'none') !== (defaults.targetDistance ?? 'none') ? 1 : 0) +
    (tenderizer !== 0 ? 1 : 0) +
    STATUS_TOGGLES.filter(s => (conditions[s.key] as boolean | undefined) ?? false).length;

  return (
    <AccordionItem value="target">
      <AccordionTrigger>
        <SectionTrigger
          label="Target"
          summary={activeCount === 0 ? 'defaults' : undefined}
          badge={activeCount > 0 && <Badge variant="secondary">{activeCount} active</Badge>}
        />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Target enemy</Label>
            <Combobox
              options={raceOptions}
              value={conditions.targetRace ?? null}
              onValueChange={selectRace}
              placeholder="Custom multiplier…"
              searchPlaceholder="Search enemies…"
              emptyText="No enemy matches."
            />
          </div>

          {selectedRace ? (
            <div className="space-y-1.5">
              <Label>Body part aimed at (×{effectiveMult.toFixed(2)})</Label>
              <Combobox
                options={selectedRace.parts.map(p => ({
                  value: p.name,
                  label: `${p.name} — ×${p.dmgMult.toFixed(2)}`,
                }))}
                value={conditions.targetBodyPart ?? null}
                onValueChange={part => setEnemy('targetBodyPart', part)}
                placeholder="Pick a body part…"
                searchPlaceholder="Search body parts…"
                emptyText="No part matches."
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="target-mult">Enemy body part mult</Label>
              <Input
                id="target-mult"
                type="number"
                min={0.1}
                step={0.05}
                value={player.weakpointMult}
                onChange={e => dispatch({ type: 'weapon/weakpointMult', value: parseFloat(e.target.value) || 1.5 })}
              />
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            Applied when "Weakpoints" is on. 1.5 is a standard humanoid headshot (Super Mutants take 1.25); below
            1.0 models armored parts like the Mirelurk shell.
          </p>

          <div className="space-y-1.5">
            <Label>Target status effects</Label>
            <ButtonGroup>
              {STATUS_TOGGLES.map(s => {
                const active = (conditions[s.key] as boolean | undefined) ?? false;
                return (
                  <Button
                    key={s.key}
                    type="button"
                    size="sm"
                    variant={active ? 'default' : 'outline'}
                    title={s.title}
                    onClick={() => setEnemy(s.key, !active)}
                  >
                    {s.label}
                  </Button>
                );
              })}
            </ButtonGroup>
          </div>

          <div className="space-y-1.5">
            <Label>Target distance</Label>
            <ButtonGroup>
              {TARGET_DISTANCE_OPTIONS.map(opt => (
                <Button
                  key={opt.value}
                  type="button"
                  size="sm"
                  variant={(conditions.targetDistance ?? defaults.targetDistance) === opt.value ? 'default' : 'outline'}
                  onClick={() => setEnemy('targetDistance', opt.value)}
                >
                  {opt.label}
                </Button>
              ))}
            </ButtonGroup>
          </div>

          {ENEMY_NUMBER_FIELDS.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`target-${field.key}`}>{field.label}</Label>
              <Input
                id={`target-${field.key}`}
                type="number"
                min={field.min}
                max={field.max}
                value={(conditions[field.key] as number | undefined) ?? (defaults[field.key] as number)}
                onChange={e =>
                  setEnemy(field.key, Math.max(field.min, Math.min(field.max, parseInt(e.target.value, 10) || field.min)))
                }
              />
            </div>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="target-crippled">
              Crippled limbs (
              {crippableMax === 0
                ? selectedRace
                  ? `${selectedRace.name} cannot be crippled`
                  : '0 crippable'
                : `${crippableMax} crippable${selectedRace ? ` on ${selectedRace.name}` : ' max'}`}
              )
            </Label>
            <Input
              id="target-crippled"
              type="number"
              min={0}
              max={crippableMax}
              value={conditions.crippledLimbCount}
              disabled={crippableMax === 0}
              onChange={e =>
                setEnemy('crippledLimbCount', Math.max(0, Math.min(crippableMax, parseInt(e.target.value, 10) || 0)))
              }
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="target-tenderizer">Tenderizer stacks on the target</Label>
            <Input
              id="target-tenderizer"
              type="number"
              min={0}
              max={1000}
              value={tenderizer}
              onChange={e =>
                dispatch({
                  type: 'condition/set',
                  key: 'tenderizerStacks',
                  value: Math.max(0, Math.min(1000, parseInt(e.target.value, 10) || 0)),
                })
              }
            />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
