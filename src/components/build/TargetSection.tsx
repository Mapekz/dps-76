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
import { getDistanceConstants } from '@/data';
import { TENDERIZER_MAX_STACKS } from '@/data/target-debuffs';
import { getNpc } from '@/data/npcs';
import { getEnemyDefenses, resolveTargetLevel, resolveTargetLevelBounds } from '@/lib/enemy-defenses';
import { buildDeltaCount } from '@/lib/build-delta';
import { DEFAULT_DISTANCE_UNITS, FAR_THRESHOLD_UNITS, gameUnitsToPipBoy, pipBoyToGameUnits } from '@/lib/distance';
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
// src/lib/distance.ts). Max clamps to 1.5×the equipped weapon's max range —
// the point where `rangeFalloffMult`'s curve already flattens — floored past
// the Far gate (below) so both slider marks always stay on-track even for a
// short-range weapon. Computed per-render (component body) since it depends
// on the equipped weapon; melee/unarmed weapons have no range at all, so the
// whole control is hidden for them instead (see `weaponRange` below).
const DISTANCE_SLIDER_MAX_MARGIN_PIPBOY = 5;
const FAR_GATE_PIPBOY = gameUnitsToPipBoy(FAR_THRESHOLD_UNITS);

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
}> = [{ key: 'healthPercent', label: 'Health %', min: 1, max: 100 }];

// Encircler's top tier is GetGroupTargetCount ≥5 (buffs-legendary.test.ts) —
// nothing distinguishes larger groups, so the control caps at "5+".
const GROUP_COUNT_OPTIONS = [1, 2, 3, 4, 5].map(value => ({
  value,
  label: value === 5 ? '5+' : String(value),
}));

/** Follow Through's damage-multiplier tiers — the per-rank 10/20/30/40% magnitudes plus off. */
const DAMAGE_MULT_PCT_OPTIONS = [0, 10, 20, 30, 40].map(value => ({ value, label: `${value}%` }));

/**
 * Taking One for the Team's single rank control — consolidates what used to
 * be two separate ToggleGroups (a %-damage-taken multiplier and a flat-DR
 * debuff) into one, since the ESM ranks pair up 1:1: rank 1 = 10%/−6, rank 4
 * = 40%/−50 (esm-walk-confirmed DR magnitudes — src/data/target-debuffs.ts).
 * Picking a rank here sets BOTH `takingOneForTheTeamPct` (rank×10) and
 * `takingOneForTheTeamDrRank` (the rank itself) in one go.
 */
const TAKING_ONE_FOR_THE_TEAM_RANK_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'R1 (10%/−6)' },
  { value: 2, label: 'R2 (20%/−10)' },
  { value: 3, label: 'R3 (30%/−15)' },
  { value: 4, label: 'R4 (40%/−50)' },
];

/**
 * "Epic Levels" rank toggle (Off/★1-3) — the user's estimate of a runtime
 * chance-rolled HP-mult upgrade the ESM can't statically confirm for any
 * given encounter (see `EnemyConditions.epicRank` doc comment). Caps at ★3:
 * every ESM-observed forced rank (SBQ, Storm Goliath) and every curated
 * boss's own random-roll ceiling seen so far is ≤3, and ranks 4-5 have no
 * ESM-proven spawn path despite existing in the multiplier table.
 */
const EPIC_RANK_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: '★1' },
  { value: 2, label: '★2' },
  { value: 3, label: '★3' },
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
  // ESM-extracted (fDistanceForCloseDamage) — mode-aware so the slider marks
  // and gate badges track ESM changes on re-extraction, same as the engine's
  // own `ScenarioInput.engineConstants.distance` (src/lib/loadout.ts).
  const closeThresholdUnits = getDistanceConstants(mode).closeThresholdUnits;
  const closeGatePipBoy = gameUnitsToPipBoy(closeThresholdUnits);
  const distanceSliderMaxPipBoy = weaponRange
    ? Math.max(gameUnitsToPipBoy(weaponRange.maxRange) * 1.5, FAR_GATE_PIPBOY + DISTANCE_SLIDER_MAX_MARGIN_PIPBOY)
    : FAR_GATE_PIPBOY + DISTANCE_SLIDER_MAX_MARGIN_PIPBOY;
  const distanceSliderMarks = [
    { value: 0, label: '0' },
    { value: closeGatePipBoy, label: 'Close' },
    { value: FAR_GATE_PIPBOY, label: 'Far' },
    { value: distanceSliderMaxPipBoy, label: distanceSliderMaxPipBoy.toFixed(0) },
  ];
  const isCloseRange = targetDistanceUnits <= closeThresholdUnits;
  const isFarRange = targetDistanceUnits >= FAR_THRESHOLD_UNITS;

  // Target level (Phase 2 — Enemy defenses): bounds from the race's Renorm
  // window, default = max (endgame assumption — docs/assumptions.md); HP/DR/ER
  // summary reads the same accessor `resolveLoadout` uses, so the number
  // shown here always matches what the engine actually computes.
  const targetNpc = conditions.targetRace ? getNpc(mode, conditions.targetRace) : undefined;
  const levelBounds = resolveTargetLevelBounds(targetNpc);
  const targetLevel = resolveTargetLevel(targetNpc, conditions.targetLevel);
  // Epic Levels rank (Phase A cont'd): a forced rank (SBQ/Storm) always wins
  // over the user's toggle — resolved inside getEnemyDefenses itself, this
  // is just what the toggle DISPLAYS. Hidden entirely for a non-epicAllowed
  // race; locked to the forced rank when the race carries one.
  const epicAllowed = targetNpc?.epicAllowed ?? false;
  const forcedEpicRank = targetNpc?.epicRank;
  const userEpicRank = conditions.epicRank ?? 0;
  const displayedEpicRank = forcedEpicRank ?? userEpicRank;
  const targetDefenses = selectedRace ? getEnemyDefenses(mode, conditions.targetRace, targetLevel, userEpicRank) : null;

  const tenderizer = player.conditions.tenderizerStacks;
  const playerDefaults = createDefaultPlayerConditions();
  const followThroughPct = player.conditions.followThroughPct ?? 0;
  const takingOneForTheTeamDrRank = player.conditions.takingOneForTheTeamDrRank ?? 0;

  const setPlayerCondition = (key: 'followThroughPct', value: number) => dispatch({ type: 'condition/set', key, value });

  const setTakingOneForTheTeamRank = (rank: number) => {
    dispatch({ type: 'condition/set', key: 'takingOneForTheTeamPct', value: rank * 10 });
    dispatch({ type: 'condition/set', key: 'takingOneForTheTeamDrRank', value: rank as 0 | 1 | 2 | 3 | 4 });
  };

  const activeCount =
    buildDeltaCount(
      {
        targetRace: conditions.targetRace,
        isAimingAtWeakpoint: isAiming ?? false,
        healthPercent: conditions.healthPercent ?? 100,
        crippledLimbCount: conditions.crippledLimbCount,
        groupTargetCount: conditions.groupTargetCount ?? 1,
        targetDistance: conditions.targetDistance ?? DEFAULT_DISTANCE_UNITS,
        tenderizerStacks: tenderizer,
        followThroughPct,
        takingOneForTheTeamDrRank,
        isBleeding: conditions.isBleeding ?? false,
        isBurning: conditions.isBurning ?? false,
        isPoisoned: conditions.isPoisoned ?? false,
        isFrozen: conditions.isFrozen ?? false,
      },
      {
        targetRace: defaults.targetRace,
        isAimingAtWeakpoint: playerDefaults.isAimingAtWeakpoint,
        healthPercent: defaults.healthPercent ?? 100,
        crippledLimbCount: defaults.crippledLimbCount,
        groupTargetCount: defaults.groupTargetCount ?? 1,
        targetDistance: defaults.targetDistance ?? DEFAULT_DISTANCE_UNITS,
        tenderizerStacks: playerDefaults.tenderizerStacks,
        followThroughPct: playerDefaults.followThroughPct ?? 0,
        takingOneForTheTeamDrRank: playerDefaults.takingOneForTheTeamDrRank ?? 0,
        isBleeding: defaults.isBleeding ?? false,
        isBurning: defaults.isBurning ?? false,
        isPoisoned: defaults.isPoisoned ?? false,
        isFrozen: defaults.isFrozen ?? false,
      }
    ) +
    (conditions.targetLevel != null ? 1 : 0) +
    (forcedEpicRank == null && userEpicRank !== 0 ? 1 : 0);

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
            <Label>Enemy</Label>
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
              <Label>Body part (×{effectiveMult.toFixed(2)})</Label>
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

          {selectedRace && epicAllowed && (
            <div className="space-y-1.5">
              <Label>Legendary</Label>
              <ToggleGroup
                aria-label="Legendary rank"
                options={EPIC_RANK_OPTIONS}
                value={displayedEpicRank}
                disabled={forcedEpicRank != null}
                onValueChange={v => setEnemy('epicRank', v)}
              />
              {forcedEpicRank != null && (
                <p className="text-muted-foreground text-xs">
                  Locked — this boss's summon quest forces ★{forcedEpicRank} every spawn.
                </p>
              )}
            </div>
          )}

          {selectedRace && (
            <div className="space-y-1.5">
              <Label htmlFor="target-level">Level: {targetLevel}</Label>
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
                <p className="text-muted-foreground font-mono text-xs tabular-nums">
                  HP {Math.round(targetDefenses.hp).toLocaleString()} · DR{' '}
                  {Math.round(targetDefenses.resists.physical ?? 0).toLocaleString()} · ER{' '}
                  {Math.round(targetDefenses.resists.energy ?? 0).toLocaleString()}
                </p>
              )}
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Status effects</Label>
            <ToggleChips
              aria-label="Status effects"
              options={STATUS_TOGGLES.map(s => ({
                value: s.key,
                label: s.label,
                title: s.title,
                active: (conditions[s.key] as boolean | undefined) ?? false,
              }))}
              onToggle={(key, wasActive) => setEnemy(key, !wasActive)}
            />
          </div>

          {weaponRange && (
            <div className="space-y-1.5">
              <Label htmlFor="target-distance">Distance: {distancePipBoy.toFixed(1)} Pip-Boy units</Label>
              <div className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  <Slider
                    id="target-distance"
                    min={0}
                    max={distanceSliderMaxPipBoy}
                    step={0.1}
                    value={[distancePipBoy]}
                    onValueChange={v => setEnemy('targetDistance', Math.round(pipBoyToGameUnits(firstSliderValue(v))))}
                    marks={distanceSliderMarks}
                  />
                </div>
                {/* Fixed-size slot regardless of content — Close/Far toggling on and off
                    must never change this row's height (the badge used to live inline in
                    the flex-wrap label above, where its appearance/disappearance shifted
                    the label onto/off a second line and jumped the whole page). */}
                <div className="flex h-5 w-14 shrink-0 items-center justify-center">
                  {isCloseRange && <Badge variant="default">Close</Badge>}
                  {isFarRange && <Badge variant="default">Far</Badge>}
                </div>
              </div>
              <p className="text-muted-foreground text-xs">
                Close (≤{closeGatePipBoy.toFixed(1)}) gates Guerrilla; Far (≥{FAR_GATE_PIPBOY.toFixed(1)}) gates Down
                Ranger/Rifleman and Sniper's — both independent of range falloff. Falloff: ×1.00 out to the weapon's
                own min range ({gameUnitsToPipBoy(weaponRange.minRange).toFixed(1)}), linear down to ×
                {weaponRange.outOfRangeMult} by its max range ({gameUnitsToPipBoy(weaponRange.maxRange).toFixed(1)}),
                then curving further to ×{(weaponRange.outOfRangeMult * 0.2).toFixed(2)} by roughly 1.5× max range
                (exact point depends on the weapon's min/max ratio), flat beyond. All units above are Pip-Boy.
              </p>
            </div>
          )}

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
            <Label htmlFor="target-tenderizer">Tenderizer stacks</Label>
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
            <Label>Taking One for the Team</Label>
            <ToggleGroup
              aria-label="Taking One for the Team rank"
              options={TAKING_ONE_FOR_THE_TEAM_RANK_OPTIONS}
              value={takingOneForTheTeamDrRank}
              onValueChange={setTakingOneForTheTeamRank}
            />
            <p className="text-muted-foreground text-xs">
              Any player's Taking One for the Team can proc both a %-damage-taken multiplier and a flat Damage
              Resist reduction (physical only) on the target — you don't need the card equipped yourself. Rank 4's
              jump to −50 DR (vs. the ~−20 an even progression would predict) is a possible ESM data-entry anomaly,
              modeled as-is.
            </p>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
