import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/ui/number-field';
import { Slider } from '@/components/ui/slider';
import { firstSliderValue } from '@/lib/slider-value';
import { ToggleChips } from '@/components/ui/toggle-chips';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { useScenarioResults } from '@/state/useScenarioResults';
import {
  getBodyPartRaces,
  getBodyPartRace,
  getCrippablePartCount,
  getDefaultBodyPart,
  resolveTargetBodyPart,
} from '@/data/bodyparts';
import { TENDERIZER_MAX_STACKS } from '@/data/target-debuffs';
import { getNpc } from '@/data/npcs';
import { getEnemyDefenses, resolveTargetLevel, resolveTargetLevelBounds } from '@/lib/enemy-defenses';
import {
  CLOSE_THRESHOLD_UNITS,
  DEFAULT_DISTANCE_UNITS,
  FAR_THRESHOLD_UNITS,
  gameUnitsToPipBoy,
  pipBoyToGameUnits,
} from '@/lib/distance';
import { createDefaultEnemyConditions, createDefaultPlayerConditions, type EnemyConditions } from '@/types';
import type { BodyPartRaceCategory } from '@/types/generated';
import { SectionTrigger } from './SectionTrigger';

/**
 * What's being shot: which enemy and body part (BPTD damage mult), its state
 * (health, distance, statuses, crippled parts) and target debuffs applied by
 * any player, not just this one (Tenderizer, Follow Through, Taking One for
 * the Team). Player steady state lives in ConditionsSection.
 */

// Distance slider (Phase 1 — Range + falloff): displayed in Pip-Boy units,
// storage stays raw game units (EnemyConditions.targetDistance,
// src/lib/distance.ts). Max is a round 300 Pip-Boy (≈6400 raw units) —
// comfortably beyond 1.5×maxRange for every sampled ranged weapon (the point
// past which the falloff curve is already flat), so the slider always covers
// the full falloff shape.
const DISTANCE_SLIDER_MAX_PIPBOY = 300;
const CLOSE_GATE_PIPBOY = gameUnitsToPipBoy(CLOSE_THRESHOLD_UNITS);
const FAR_GATE_PIPBOY = gameUnitsToPipBoy(FAR_THRESHOLD_UNITS);
const DISTANCE_SLIDER_MARKS = [
  { value: 0, label: '0' },
  { value: CLOSE_GATE_PIPBOY, label: 'Close' },
  { value: FAR_GATE_PIPBOY, label: 'Far' },
  { value: DISTANCE_SLIDER_MAX_PIPBOY, label: String(DISTANCE_SLIDER_MAX_PIPBOY) },
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
}> = [{ key: 'healthPercent', label: 'Target health %', min: 1, max: 100 }];

// Encircler's top tier is GetGroupTargetCount ≥5 (buffs-legendary.test.ts) —
// nothing distinguishes larger groups, so the control caps at "5+".
const GROUP_COUNT_OPTIONS = [1, 2, 3, 4, 5].map(value => ({
  value,
  label: value === 5 ? '5+' : String(value),
}));

/** Follow Through / TOftT damage-multiplier tiers — the per-rank 10/20/30/40% magnitudes plus off. */
const DAMAGE_MULT_PCT_OPTIONS = [0, 10, 20, 30, 40].map(value => ({ value, label: `${value}%` }));

/**
 * Taking One for the Team's flat DR-debuff ranks (esm-walk-confirmed
 * magnitudes 6/10/15/50 — src/data/target-debuffs.ts). Separate control from
 * the damage-taken-% ToggleGroup above: two different ESM effects bundled on
 * the same hidden companion perk.
 */
const TAKING_ONE_FOR_THE_TEAM_DR_RANK_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'R1 (−6)' },
  { value: 2, label: 'R2 (−10)' },
  { value: 3, label: 'R3 (−15)' },
  { value: 4, label: 'R4 (−50)' },
];

const TARGET_CATEGORY_LABELS: Record<BodyPartRaceCategory, string> = {
  raid: 'Raid Enemies',
  infestation: 'Infestation Bosses',
  headhunt: 'Head Hunt Bosses',
  standard: 'Enemies',
};
const TARGET_CATEGORY_ORDER: BodyPartRaceCategory[] = ['raid', 'infestation', 'headhunt', 'standard'];

// Sentinel picker value for "no part picked" — disarms aiming, falls back to
// the race's neutral ×1.00 default part. Distinct from any real BPTD part name
// (verified against the live extraction — see docs/assumptions.md if that ever changes).
const DEFAULT_OPTION = '__default_body_part__';

export function TargetSection() {
  const { mode } = useGameMode();
  const { player, enemy } = useBuild();
  const dispatch = useBuildDispatch();
  // Effective weapon's range fields (Phase 1 — Range + falloff), for the
  // distance slider's "weapon range" context — computed once in
  // computeScenarios (ScenarioSet.range), same precedent as WeaponSection's
  // charge-time slider reading ScenarioSet.charging. Null for melee weapons
  // or weapons with no usable range span.
  const { scenarios } = useScenarioResults();
  const weaponRange = scenarios?.range ?? null;

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
  const defaultPart = getDefaultBodyPart(mode, conditions.targetRace);
  const isAiming = player.conditions.isAimingAtWeakpoint;
  // The mult that WOULD apply if aiming (single source of truth, shared with
  // the engine input and the results pill) — the picker label shows what's
  // actually applied right now, which is torso ×1.00 whenever disarmed.
  const resolvedTarget = resolveTargetBodyPart(mode, conditions.targetRace, conditions.targetBodyPart, player.weakpointMult);
  const effectiveMult = isAiming ? resolvedTarget.mult : 1.0;
  const crippableMax = getCrippablePartCount(mode, conditions.targetRace);

  // Duplicate part names (Mirelurk Queen's two same-mult "Spouts" records,
  // differing only by partType) render duplicate options + duplicate React
  // keys — collapse by name. The only same-name group across all 79 races IS
  // the Spouts pair (verified 2026-07-15), so nothing lossy happens; L/R
  // limbs have distinct names and stay separate. Fold out the neutral default
  // part (prefer torso when ×1.00, else alphabetically-first ×1.00) so it
  // isn't listed twice — guard so a stale share-URL aimed at that exact part
  // still shows in the combobox.
  const uniqueParts = selectedRace
    ? [...new Map(selectedRace.parts.map(p => [p.name, p])).values()]
        .filter(
          p =>
            p.name !== defaultPart?.name || (isAiming && conditions.targetBodyPart === p.name)
        )
        .sort((a, b) => a.name.localeCompare(b.name))
    : [];
  const partOptions = [
    { value: DEFAULT_OPTION, label: `${defaultPart?.name ?? 'Neutral'} — ×1.00 (default)` },
    ...uniqueParts.map(p => ({ value: p.name, label: `${p.name} — ×${p.dmgMult.toFixed(2)}` })),
  ];
  const pickerValue = isAiming ? (conditions.targetBodyPart ?? DEFAULT_OPTION) : DEFAULT_OPTION;

  const setAiming = (value: boolean) => dispatch({ type: 'condition/set', key: 'isAimingAtWeakpoint', value });

  // Picking a real part arms aiming immediately — no separate step to
  // remember. Picking Torso (or re-clicking the current selection, which the
  // combobox reports as null) disarms it but keeps targetBodyPart as memory,
  // so re-arming (via this picker or the results pill) restores the same part.
  const selectBodyPart = (part: string | null) => {
    if (!part || part === DEFAULT_OPTION) {
      setAiming(false);
      return;
    }
    setEnemy('targetBodyPart', part);
    setAiming(true);
  };

  const selectRace = (raceId: string | null) => {
    setEnemy('targetRace', raceId);
    // Default to the race's juiciest part — the weakpoint people aim for.
    const race = raceId ? getBodyPartRace(mode, raceId) : undefined;
    const best = race ? [...race.parts].sort((a, b) => b.dmgMult - a.dmgMult)[0] : undefined;
    setEnemy('targetBodyPart', best?.name ?? null);
    // Only auto-arm when the best part is an actual weak point (>1.00) — for
    // an all-armored race (no part above torso's ×1.00) default to Torso
    // rather than silently applying a damage-reducing strongpoint.
    setAiming((best?.dmgMult ?? 1.0) > 1.0);
    // A stale high crippled count silently over-counts on a smaller enemy:
    // the engine's perCrippledLimb clamps to each modifier's own cap (Bully's
    // 6), never the enemy's real limb count — clamp it here on switch.
    const newMax = getCrippablePartCount(mode, raceId);
    if (conditions.crippledLimbCount > newMax) setEnemy('crippledLimbCount', newMax);
  };

  const targetDistanceUnits = conditions.targetDistance ?? DEFAULT_DISTANCE_UNITS;
  const distancePipBoy = gameUnitsToPipBoy(targetDistanceUnits);
  const isCloseRange = targetDistanceUnits <= CLOSE_THRESHOLD_UNITS;
  const isFarRange = targetDistanceUnits >= FAR_THRESHOLD_UNITS;

  // Target level (Phase 2 — Enemy defenses): bounds from the race's Renorm
  // window, default = max (endgame assumption — docs/assumptions.md); HP/DR/ER
  // summary reads the same accessor `resolveLoadout` uses, so the number
  // shown here always matches what the engine actually computes.
  const targetNpc = conditions.targetRace ? getNpc(mode, conditions.targetRace) : undefined;
  const levelBounds = resolveTargetLevelBounds(targetNpc);
  const targetLevel = resolveTargetLevel(targetNpc, conditions.targetLevel);
  const targetDefenses = selectedRace ? getEnemyDefenses(mode, conditions.targetRace, targetLevel) : null;

  const tenderizer = player.conditions.tenderizerStacks;
  const playerDefaults = createDefaultPlayerConditions();
  const followThroughPct = player.conditions.followThroughPct ?? 0;
  const takingOneForTheTeamPct = player.conditions.takingOneForTheTeamPct ?? 0;
  const takingOneForTheTeamDrRank = player.conditions.takingOneForTheTeamDrRank ?? 0;

  const setPlayerCondition = (
    key: 'followThroughPct' | 'takingOneForTheTeamPct' | 'takingOneForTheTeamDrRank',
    value: number
  ) => dispatch({ type: 'condition/set', key, value });

  const activeCount =
    (conditions.targetRace ? 1 : 0) +
    (isAiming ? 1 : 0) +
    ((conditions.healthPercent ?? 100) !== (defaults.healthPercent ?? 100) ? 1 : 0) +
    (conditions.crippledLimbCount !== defaults.crippledLimbCount ? 1 : 0) +
    ((conditions.groupTargetCount ?? 1) !== (defaults.groupTargetCount ?? 1) ? 1 : 0) +
    ((conditions.targetDistance ?? DEFAULT_DISTANCE_UNITS) !== (defaults.targetDistance ?? DEFAULT_DISTANCE_UNITS) ? 1 : 0) +
    (conditions.targetLevel != null ? 1 : 0) +
    (tenderizer !== 0 ? 1 : 0) +
    (followThroughPct !== (playerDefaults.followThroughPct ?? 0) ? 1 : 0) +
    (takingOneForTheTeamPct !== (playerDefaults.takingOneForTheTeamPct ?? 0) ? 1 : 0) +
    (takingOneForTheTeamDrRank !== (playerDefaults.takingOneForTheTeamDrRank ?? 0) ? 1 : 0) +
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
              <Label>Target body part (×{effectiveMult.toFixed(2)})</Label>
              <Combobox
                options={partOptions}
                value={pickerValue}
                onValueChange={selectBodyPart}
                placeholder="Pick a body part…"
                searchPlaceholder="Search body parts…"
                emptyText="No part matches."
              />
            </div>
          ) : (
            <div className="space-y-1.5">
              <Label htmlFor="target-mult">Custom body-part multiplier (×{effectiveMult.toFixed(2)})</Label>
              <Input
                id="target-mult"
                type="number"
                min={0.1}
                step={0.05}
                value={player.weakpointMult}
                onChange={e => {
                  const value = parseFloat(e.target.value) || 1.5;
                  dispatch({ type: 'weapon/weakpointMult', value });
                  setAiming(value !== 1.0);
                }}
              />
            </div>
          )}
          <p className="text-muted-foreground text-xs">
            The neutral default is the race's ×1.00 part (torso when it's ×1.00, otherwise the first alphabetically);
            picking a body part applies its multiplier immediately — no need to flip a separate switch. 1.5 is a
            standard humanoid headshot (Super Mutants take 1.25); below 1.0 models armored parts like the Mirelurk
            shell.
          </p>

          {selectedRace && (
            <div className="space-y-1.5">
              <Label htmlFor="target-level">Target level: {targetLevel}</Label>
              <Slider
                id="target-level"
                min={levelBounds.min}
                max={levelBounds.max}
                step={1}
                value={[targetLevel]}
                onValueChange={v => setEnemy('targetLevel', firstSliderValue(v))}
                marks={[
                  { value: levelBounds.min, label: String(levelBounds.min) },
                  { value: levelBounds.max, label: String(levelBounds.max) },
                ]}
              />
              {targetDefenses && (
                <p className="text-muted-foreground flex flex-wrap items-center gap-1.5 font-mono text-xs tabular-nums">
                  <span>
                    HP {Math.round(targetDefenses.hp).toLocaleString()} · DR{' '}
                    {Math.round(targetDefenses.resists.physical ?? 0).toLocaleString()} · ER{' '}
                    {Math.round(targetDefenses.resists.energy ?? 0).toLocaleString()}
                  </span>
                  {targetNpc?.epicRank != null && (
                    <Badge variant="secondary" className="font-sans" title="Epic boss — ESM-forced rank on this encounter's summon quest">
                      ★{targetNpc.epicRank} epic
                    </Badge>
                  )}
                </p>
              )}
              <p className="text-muted-foreground text-xs">
                Defaults to the race's max level (endgame assumption) — HP and resists scale with level via the
                creature curve tables.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Target status effects</Label>
            <ToggleChips
              aria-label="Target status effects"
              options={STATUS_TOGGLES.map(s => ({
                value: s.key,
                label: s.label,
                title: s.title,
                active: (conditions[s.key] as boolean | undefined) ?? false,
              }))}
              onToggle={(key, wasActive) => setEnemy(key, !wasActive)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="target-distance" className="flex flex-wrap items-center gap-1.5">
              <span>Target distance: {distancePipBoy.toFixed(1)} Pip-Boy units</span>
              {isCloseRange && <Badge variant="secondary">Close</Badge>}
              {isFarRange && <Badge variant="secondary">Far</Badge>}
            </Label>
            <Slider
              id="target-distance"
              min={0}
              max={DISTANCE_SLIDER_MAX_PIPBOY}
              step={0.1}
              value={[distancePipBoy]}
              onValueChange={v => setEnemy('targetDistance', Math.round(pipBoyToGameUnits(firstSliderValue(v))))}
              marks={DISTANCE_SLIDER_MARKS}
            />
            <p className="text-muted-foreground text-xs">
              Close (≤{CLOSE_GATE_PIPBOY.toFixed(1)}) and Far (≥{FAR_GATE_PIPBOY.toFixed(1)}) gate Guerrilla/Down
              Ranger/Sniper's-style perks; damage also falls off gradually past the equipped weapon's max range.
              {weaponRange
                ? ` Equipped weapon range: ${gameUnitsToPipBoy(weaponRange.minRange).toFixed(1)}–${gameUnitsToPipBoy(weaponRange.maxRange).toFixed(1)} Pip-Boy units (×${weaponRange.outOfRangeMult} beyond max).`
                : ''}
            </p>
          </div>

          {ENEMY_NUMBER_FIELDS.map(field => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`target-${field.key}`}>{field.label}</Label>
              <NumberField
                id={`target-${field.key}`}
                min={field.min}
                max={field.max}
                value={(conditions[field.key] as number | undefined) ?? (defaults[field.key] as number)}
                onChange={v => setEnemy(field.key, v)}
              />
            </div>
          ))}

          <div className="space-y-1.5">
            <Label>Enemies in the group (incl. target)</Label>
            <ToggleGroup
              aria-label="Enemies in the group"
              options={GROUP_COUNT_OPTIONS}
              value={Math.min(conditions.groupTargetCount ?? 1, 5)}
              onValueChange={v => setEnemy('groupTargetCount', v)}
            />
          </div>

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
            <Slider
              id="target-crippled"
              min={0}
              max={Math.max(crippableMax, 1)}
              step={1}
              disabled={crippableMax === 0}
              value={[Math.min(conditions.crippledLimbCount, crippableMax)]}
              onValueChange={v => setEnemy('crippledLimbCount', firstSliderValue(v))}
              marks={Array.from({ length: Math.max(crippableMax, 1) + 1 }, (_, i) => ({
                value: i,
                label: String(i),
              }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="target-tenderizer">Tenderizer stacks on the target</Label>
            <NumberField
              id="target-tenderizer"
              min={0}
              max={TENDERIZER_MAX_STACKS}
              value={tenderizer}
              onChange={v => dispatch({ type: 'condition/set', key: 'tenderizerStacks', value: v })}
            />
            <p className="text-muted-foreground text-xs">
              +0.1% damage taken per stack, up to +100% at {TENDERIZER_MAX_STACKS} stacks. Applied by any player's
              Tenderizer — you don't need the card equipped.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Follow Through damage multiplier</Label>
            <ToggleGroup
              aria-label="Follow Through damage multiplier"
              options={DAMAGE_MULT_PCT_OPTIONS}
              value={followThroughPct}
              onValueChange={v => setPlayerCondition('followThroughPct', v)}
            />
            <p className="text-muted-foreground text-xs">
              Manual estimate of the 10s ranged-sneak damage-taken debuff's active multiplier. Applied by any
              player's Follow Through — you don't need the card equipped.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Taking One for the Team damage multiplier</Label>
            <ToggleGroup
              aria-label="Taking One for the Team damage multiplier"
              options={DAMAGE_MULT_PCT_OPTIONS}
              value={takingOneForTheTeamPct}
              onValueChange={v => setPlayerCondition('takingOneForTheTeamPct', v)}
            />
            <p className="text-muted-foreground text-xs">
              Manual estimate of the teamed-attacker damage-taken debuff's active multiplier. Applied by any
              player's Taking One for the Team — you don't need the card equipped.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label>Taking One for the Team flat DR debuff</Label>
            <ToggleGroup
              aria-label="Taking One for the Team flat DR debuff"
              options={TAKING_ONE_FOR_THE_TEAM_DR_RANK_OPTIONS}
              value={takingOneForTheTeamDrRank}
              onValueChange={v => setPlayerCondition('takingOneForTheTeamDrRank', v)}
            />
            <p className="text-muted-foreground text-xs">
              Separate ESM effect bundled on the same hidden perk: a flat Damage Resist reduction (physical only —
              no Energy Resist component), not the %-damage-taken multiplier above. Rank 4's jump to −50 (vs. the
              ~−20 an even progression would predict) is a possible ESM data-entry anomaly, modeled as-is.
            </p>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
