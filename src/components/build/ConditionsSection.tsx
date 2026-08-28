import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { HelperText } from '@/components/ui/helper-text';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/ui/number-field';
import { Slider } from '@/components/ui/slider';
import { firstSliderValue } from '@/lib/slider-value';
import { SwitchRow } from '@/components/ui/switch-row';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { useScenarioResults } from '@/state/useScenarioResults';
import { useResolvedStats } from '@/hooks/useResolvedStats';
import {
  KINGFISHER_LOCAL_LEGEND_CHALLENGE_IDS,
  PIPE_WEAPON_CRAFTING_CHALLENGE_ID,
  isBulletStormStacksActive,
  isOnslaughtStacksActive,
} from '@/lib/engine/affordances';
import { buildDeltaCount } from '@/lib/build-delta';
import { healthPercentIndex, PLAYER_HEALTH_PERCENT_STOPS } from '@/lib/health-percent';
import { createDefaultPlayerInput, type PlayerInput } from '@/types';
import { knobActiveBadgeObjects } from '@/types/knob-registry';
import { DRINK_TIER_NAMES, FOOD_TIER_NAMES, feralStateName } from '@/data/meter-names';
import { GroupHeading } from '@/components/ui/group-heading';
import { Readout } from '@/components/ui/typography';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { SectionTrigger } from './SectionTrigger';

/**
 * The character's steady state: health, meters, caps, streak/stack counters,
 * and weapon upkeep. Race lives in the SPECIAL Loadout section
 * (SpecialLoadoutSection.tsx); team size/public-team type in TeamSection;
 * target state AND the three accuracy sliders (hitRatePct/vatsHitRatePct/
 * bodyPartHitRatePct — they only make sense next to the body-part picker)
 * live in the Encounter card's TargetPanel; attack-state toggles (sneaking /
 * power attack / ADS) live in AttackStateGroup there too;
 * weakpoint stays on the headline chips. There is no separate "hydrated" /
 * "well fed" toggle anywhere: the Drink/Food meter sliders below are each
 * ladder's sole input — AP regen and max HP respectively, both ESM-PROVEN
 * graduated (not all-or-nothing) — see player-baseline.ts. No UI control
 * shadows them.
 */

/** Hydration AP-regen ladder by drinkTier (0 Thirsty .. 4 Fully Hydrated) — mirrors player-baseline.ts's ESM-proven magnitudes; tier 4 gets +10/+25% more with Rejuvenated ranks 1/2. */
const DRINK_TIER_AP_REGEN_PCT = [0, 15, 15, 25, 35] as const;
/** Satiation max-HP ladder by foodTier (0 Hungry .. 4 Fully Fed) — Hunger-side twin of DRINK_TIER_AP_REGEN_PCT; tier 4 gets +10/+25 more with Rejuvenated ranks 1/2. */
const FOOD_TIER_MAX_HEALTH = [0, 15, 15, 25, 35] as const;

const VATS_TARGET_INDEX_OPTIONS = [
  { value: 1 as const, label: '1st' },
  { value: 2 as const, label: '2nd' },
  { value: 3 as const, label: '3rd' },
  { value: 4 as const, label: '4th+' },
];

/** One decimal for sustained-stack averages; whole numbers omit the fraction. */
function formatStackAvg(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function ConditionsSection() {
  const { mode } = useGameMode();
  const { player, enemy } = useBuild();
  const dispatch = useBuildDispatch();
  const { scenarios, affordances } = useScenarioResults();

  const set = (key: keyof PlayerInput, value: PlayerInput[keyof PlayerInput]) =>
    dispatch({ type: 'condition/set', key, value });

  const conditions = player.conditions;
  const defaults = createDefaultPlayerInput();
  const isGhoul = conditions.isGhoul ?? false;

  const stats = useResolvedStats(player, enemy, mode);

  // Onslaught: max from equipped sources (ScenarioSet.onslaughtMaxStacks); −1 =
  // auto (Sustained Stacks — engine-simulated forward avg or max fallback).
  // Drag the slider to pin; "Auto" resets to −1. GSM reverse is always auto.
  const onslaughtMax = scenarios?.onslaughtMaxStacks ?? 0;
  const onslaughtReverse = scenarios?.onslaughtReverse ?? false;
  const onslaughtStored = conditions.onslaughtStacks;
  const onslaughtValue = scenarios?.onslaughtEffectiveStacks ?? 0;
  const hasKillStreak = affordances?.hasKillStreakSources ?? false;

  // Proc-triggered on-cripple damage (issue #42, PROC_DAMAGE_PLAN.md,
  // ADR-0009): no crippling-frequency model exists, so cripples/minute is a
  // manual knob feeding Fracturer's — same existence-gate pattern as
  // hasKillStreak/hasBattleLoaders above.
  const hasOnCrippleProcSource = affordances?.hasOnCrippleProcSource ?? false;
  const procCripplesPerMin = conditions.procCripplesPerMin ?? 0;

  // Bash-triggered timed-buff uptime (Love Tap — issue #80/#42 follow-up,
  // ADR-0009, user-directed 2026-08-20): no bash-frequency model exists, so
  // the player states the uptime they intend to sustain directly — same
  // existence-gate pattern as hasOnCrippleProcSource above. Reuses the
  // Battle-Loader's bash-time slider (below) as the per-bash time cost.
  const hasBashBuffUptimeSource = affordances?.hasBashBuffUptimeSource ?? false;
  const onBashBuffUptime = conditions.onBashBuffUptime ?? 0;
  const hasWellTunedSource = affordances?.hasWellTunedSource ?? false;
  const wellTuned = conditions.wellTuned ?? false;
  const hasEyeOfRaSource = affordances?.hasEyeOfRaSource ?? false;
  const eyeOfRaWorn = conditions.eyeOfRaWorn ?? false;
  const standingStill = conditions.standingStill ?? false;
  const hasVatsTargetIndex = affordances?.hasVatsTargetIndexSources ?? false;
  const vatsTargetIndex = conditions.vatsTargetIndex ?? 1;

  // Concentrated Fire: manual 0–20 stacks slider standing in for the game's
  // hidden native per-target consecutive-shots-fired counter (see the
  // PlayerInput.concentratedFireStacks doc comment and
  // docs/assumptions.md "Concentrated Fire stacks"). Unlike Onslaught/Bullet
  // Storm there is no equipped-source-derived max: the cap is the fixed GMST
  // 20, so this only needs an existence gate, not a fold.
  const hasConcentratedFire = affordances?.hasConcentratedFireSources ?? false;
  const concentratedFireStacks = conditions.concentratedFireStacks;

  const hasPipeCraftingChallenge = affordances?.hasPipeCraftingChallengeSource ?? false;
  const pipeCraftingChallengeCompleted = (conditions.completedChallengeIds ?? []).includes(
    PIPE_WEAPON_CRAFTING_CHALLENGE_ID,
  );

  const hasKingfisherLocalLegend = affordances?.hasKingfisherLocalLegendSource ?? false;
  const localLegendFishingChallengesCompleted =
    conditions.localLegendFishingChallengesCompleted ?? 0;

  // Battle-Loader's bash time (Phase C — go-through-every-single-silly-
  // whistle.md): a manual slider standing in for the time cost of a bash
  // swing that triggers Battle-Loader's instant reload, gated on whether the
  // effective weapon actually carries a reloadSkipChanceBash source
  // (mirrors the kill-streak/Concentrated Fire existence-gate pattern).
  const hasBattleLoaders = affordances?.hasBattleLoadersSource ?? false;
  const battleLoadersBashSec =
    conditions.battleLoadersBashSec ?? defaults.battleLoadersBashSec ?? 0;

  // Bullet Storm: max/min from equipped sources; −1 = auto (Sustained Stacks —
  // ScenarioSet.bulletStormAvgStacks). Pin by dragging; "Auto" resets to −1.
  const bulletStormMax = scenarios?.bulletStormMaxStacks ?? 0;
  const bulletStormMin = scenarios?.bulletStormMinStacks ?? 0;
  const bulletStormStored = conditions.bulletStormStacks;
  const bulletStormValue = scenarios?.bulletStormEffectiveStacks ?? 0;

  const foodTier = conditions.foodTier ?? 0;
  const drinkTier = conditions.drinkTier ?? 0;
  const feralTier = conditions.feralTier ?? 0;
  // Clamp the displayed value only — the engine already clamps glow to
  // maxHealth in resolveLoadout; don't dispatch a correction on render.
  const glow = Math.min(conditions.glow ?? 0, stats.maxHealth);

  const { value: badgeValues, defaults: badgeDefaults } = knobActiveBadgeObjects(
    'conditions',
    conditions,
    enemy.conditions,
    { maxHealth: stats.maxHealth },
  );

  const activeCount =
    buildDeltaCount(badgeValues, badgeDefaults) +
    (isOnslaughtStacksActive(onslaughtStored, onslaughtReverse) ? 1 : 0) +
    (isBulletStormStacksActive(bulletStormStored) ? 1 : 0);

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
        <div className="space-y-4">
          <div>
            <GroupHeading title="Combat state" />
            <div className="space-y-3">
              <SwitchRow
                id="char-standing-still"
                label="Standing still"
                checked={standingStill}
                onCheckedChange={(checked) => set('standingStill', checked)}
              />
              <HelperText>
                Off by default (moving). Gates Rooted, Steady, Chameleon DR, and other IsMoving()=0
                bonuses.
              </HelperText>

              {hasVatsTargetIndex && (
                <div className="space-y-1.5">
                  <Label>VATS target position</Label>
                  <ToggleGroup
                    aria-label="VATS target position"
                    options={VATS_TARGET_INDEX_OPTIONS}
                    value={vatsTargetIndex}
                    onValueChange={(v) => set('vatsTargetIndex', v)}
                  />
                  <HelperText>
                    Gun Fu bonus applies from the 2nd target onward (+30/60/90% at ranks 1/2/3).
                    Default 1st target — no bonus.
                  </HelperText>
                </div>
              )}
            </div>
          </div>

          <div>
            <GroupHeading title="Vitals" />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="char-health">Health: {conditions.healthPercent}%</Label>
                <Slider
                  id="char-health"
                  min={0}
                  max={PLAYER_HEALTH_PERCENT_STOPS.length - 1}
                  step={1}
                  value={[
                    healthPercentIndex(conditions.healthPercent, PLAYER_HEALTH_PERCENT_STOPS),
                  ]}
                  onValueChange={(v) =>
                    set('healthPercent', PLAYER_HEALTH_PERCENT_STOPS[firstSliderValue(v)])
                  }
                  marks={PLAYER_HEALTH_PERCENT_STOPS.map((pct, i) => ({
                    value: i,
                    label: `${pct}`,
                  }))}
                />
              </div>

              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Max HP</span>
                <Readout size="md">{stats.maxHealth}</Readout>
              </div>

              {!isGhoul && (
                <>
                  <div className="space-y-1.5">
                    <Label htmlFor="char-food">Food meter: {FOOD_TIER_NAMES[foodTier]}</Label>
                    <Slider
                      id="char-food"
                      min={0}
                      max={4}
                      step={1}
                      value={[foodTier]}
                      onValueChange={(v) => set('foodTier', firstSliderValue(v))}
                      marks={FOOD_TIER_NAMES.map((_, i) => ({ value: i }))}
                    />
                    <HelperText>
                      Max HP at this tier: +{FOOD_TIER_MAX_HEALTH[foodTier]}
                      {foodTier === 4 && ' (also +10/+25 more with Rejuvenated)'}. Ghouls have no
                      hunger or thirst.
                    </HelperText>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="char-drink">Drink meter: {DRINK_TIER_NAMES[drinkTier]}</Label>
                    <Slider
                      id="char-drink"
                      min={0}
                      max={4}
                      step={1}
                      value={[drinkTier]}
                      onValueChange={(v) => set('drinkTier', firstSliderValue(v))}
                      marks={DRINK_TIER_NAMES.map((_, i) => ({ value: i }))}
                    />
                    <HelperText>
                      AP regen at this tier: +{DRINK_TIER_AP_REGEN_PCT[drinkTier]}%
                      {drinkTier === 4 && ' (also +10/+25% more with Rejuvenated)'}.
                    </HelperText>
                  </div>
                </>
              )}

              {isGhoul && (
                <div className="space-y-1.5">
                  <Label htmlFor="char-feral">Feral meter: {feralStateName(feralTier)}</Label>
                  <Slider
                    id="char-feral"
                    min={0}
                    max={8}
                    step={1}
                    value={[feralTier]}
                    onValueChange={(v) => set('feralTier', firstSliderValue(v))}
                    marks={Array.from({ length: 9 }, (_, i) => ({
                      value: i,
                      label: i % 2 === 0 ? String(i) : undefined,
                    }))}
                  />
                </div>
              )}

              {isGhoul && (
                <div className="space-y-1.5">
                  <Label htmlFor="char-glow">
                    Glow: {glow} / {stats.maxHealth}
                  </Label>
                  <Slider
                    id="char-glow"
                    min={0}
                    max={stats.maxHealth}
                    step={5}
                    value={[glow]}
                    onValueChange={(v) => set('glow', firstSliderValue(v))}
                    marks={[
                      { value: 0, label: '0' },
                      { value: 180, label: '180' },
                      { value: stats.maxHealth, label: String(stats.maxHealth) },
                    ]}
                  />
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="char-caps">
                  Caps on hand: {conditions.capsOnHand.toLocaleString()}
                </Label>
                <Slider
                  id="char-caps"
                  min={0}
                  max={40000}
                  step={1000}
                  value={[Math.min(conditions.capsOnHand, 40000)]}
                  onValueChange={(v) => set('capsOnHand', firstSliderValue(v))}
                  marks={[0, 10000, 20000, 29000, 40000].map((v) => ({
                    value: v,
                    label: v === 0 ? '0' : `${v / 1000}k`,
                  }))}
                />
              </div>
            </div>
          </div>

          <div>
            <GroupHeading title="Stacks & streaks" />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="char-killstreak">Kill streak: {conditions.killStreak}</Label>
                <Slider
                  id="char-killstreak"
                  min={0}
                  max={10}
                  step={1}
                  disabled={!hasKillStreak}
                  value={[conditions.killStreak]}
                  onValueChange={(v) => set('killStreak', firstSliderValue(v))}
                  marks={Array.from({ length: 11 }, (_, i) => ({
                    value: i,
                    label: i % 2 === 0 ? String(i) : undefined,
                  }))}
                />
                {!hasKillStreak && <HelperText>No kill-streak sources equipped</HelperText>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="char-proc-cripples">
                  Cripples per minute: {procCripplesPerMin}
                </Label>
                <Slider
                  id="char-proc-cripples"
                  min={0}
                  max={60}
                  step={1}
                  disabled={!hasOnCrippleProcSource}
                  value={[procCripplesPerMin]}
                  onValueChange={(v) => set('procCripplesPerMin', firstSliderValue(v))}
                  marks={[0, 15, 30, 45, 60].map((v) => ({ value: v, label: String(v) }))}
                />
                <HelperText>
                  No crippling-frequency model exists — this is a manual stand-in for how often you
                  land a limb-crippling hit, feeding Fracturer's on-cripple detonation. 0 = honest
                  zero, not a hidden average.
                </HelperText>
                {!hasOnCrippleProcSource && (
                  <HelperText>No on-cripple proc sources equipped</HelperText>
                )}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="char-bash-buff-uptime">Bash-buff uptime: {onBashBuffUptime}%</Label>
                <Slider
                  id="char-bash-buff-uptime"
                  min={0}
                  max={100}
                  step={5}
                  disabled={!hasBashBuffUptimeSource}
                  value={[onBashBuffUptime]}
                  onValueChange={(v) => set('onBashBuffUptime', firstSliderValue(v))}
                  marks={[0, 25, 50, 75, 100].map((v) => ({ value: v, label: String(v) }))}
                />
                <HelperText>
                  No bash-frequency model exists — this is a manual stand-in for how consistently
                  you keep a bash-triggered buff (Love Tap) refreshed. Bashes/minute and the
                  resulting attack-time cost are derived from this and the bash-time slider below. 0
                  = honest zero, not a hidden average.
                </HelperText>
                {!hasBashBuffUptimeSource && (
                  <HelperText>No bash-triggered buff sources equipped</HelperText>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="char-onslaught">
                    {onslaughtReverse
                      ? `Reverse Onslaught — avg ~${Math.round(onslaughtValue)} / max ${onslaughtMax}`
                      : onslaughtStored === -1
                        ? `Onslaught — auto ~${formatStackAvg(onslaughtValue)} avg / max ${onslaughtMax}`
                        : `Onslaught stacks (${onslaughtValue} / max ${onslaughtMax})`}
                  </Label>
                  {!onslaughtReverse && onslaughtStored !== -1 && onslaughtMax > 0 && (
                    <button
                      type="button"
                      className="text-muted-foreground shrink-0 text-xs underline"
                      onClick={() => set('onslaughtStacks', -1)}
                    >
                      Auto
                    </button>
                  )}
                </div>
                {onslaughtReverse ? (
                  <HelperText>
                    Engine-computed average during sustained fire (Gunslinger Master). Consumption
                    scales with fire rate, projectiles, and targets hit below.
                  </HelperText>
                ) : (
                  <Slider
                    id="char-onslaught"
                    min={0}
                    max={Math.max(onslaughtMax, 1)}
                    step={1}
                    disabled={onslaughtMax === 0}
                    value={[onslaughtValue]}
                    onValueChange={(v) => set('onslaughtStacks', firstSliderValue(v))}
                    marks={
                      onslaughtMax > 0
                        ? Array.from({ length: onslaughtMax + 1 }, (_, i) => ({
                            value: i,
                            label: i % 5 === 0 || i === onslaughtMax ? String(i) : undefined,
                          }))
                        : undefined
                    }
                  />
                )}
                {onslaughtMax === 0 && <HelperText>No Onslaught sources equipped</HelperText>}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="char-bulletstorm">
                    {bulletStormStored === -1
                      ? `Bullet Storm — auto ~${formatStackAvg(bulletStormValue)} avg / max ${bulletStormMax}`
                      : `Bullet Storm stacks (${bulletStormValue} / max ${bulletStormMax})`}
                  </Label>
                  {bulletStormStored !== -1 && bulletStormMax > 0 && (
                    <button
                      type="button"
                      className="text-muted-foreground shrink-0 text-xs underline"
                      onClick={() => set('bulletStormStacks', -1)}
                    >
                      Auto
                    </button>
                  )}
                </div>
                <Slider
                  id="char-bulletstorm"
                  min={bulletStormMin}
                  max={Math.max(bulletStormMax, bulletStormMin, 1)}
                  step={1}
                  disabled={bulletStormMax === 0}
                  value={[bulletStormValue]}
                  onValueChange={(v) => set('bulletStormStacks', firstSliderValue(v))}
                  marks={
                    bulletStormMax > 0
                      ? Array.from({ length: bulletStormMax - bulletStormMin + 1 }, (_, i) => {
                          const v = bulletStormMin + i;
                          return {
                            value: v,
                            label: v % 5 === 0 || v === bulletStormMax ? String(v) : undefined,
                          };
                        })
                      : undefined
                  }
                />
                {bulletStormMax === 0 && <HelperText>No Bullet Storm sources equipped</HelperText>}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="char-concentrated-fire">
                  Concentrated Fire stacks ({concentratedFireStacks} / max 20)
                </Label>
                <Slider
                  id="char-concentrated-fire"
                  min={0}
                  max={20}
                  step={1}
                  disabled={!hasConcentratedFire}
                  value={[concentratedFireStacks]}
                  onValueChange={(v) => set('concentratedFireStacks', firstSliderValue(v))}
                  marks={Array.from({ length: 21 }, (_, i) => ({
                    value: i,
                    label: i % 5 === 0 ? String(i) : undefined,
                  }))}
                />
                <HelperText>
                  Stacks build per VATS shot landed on the same body part and reset when you switch
                  body part or target — a manual stand-in for the game's hidden counter (each rank
                  adds +1/2/3% VATS damage per stack).
                </HelperText>
                {!hasConcentratedFire && (
                  <HelperText>No Concentrated Fire sources equipped</HelperText>
                )}
              </div>

              {hasPipeCraftingChallenge && (
                <SwitchRow
                  id="char-pipe-crafting-challenge"
                  label="Completed pipe-weapon crafting challenge"
                  checked={pipeCraftingChallengeCompleted}
                  onCheckedChange={(checked) => {
                    const ids = conditions.completedChallengeIds ?? [];
                    set(
                      'completedChallengeIds',
                      checked
                        ? [...ids, PIPE_WEAPON_CRAFTING_CHALLENGE_ID]
                        : ids.filter((id) => id !== PIPE_WEAPON_CRAFTING_CHALLENGE_ID),
                    );
                  }}
                />
              )}

              {hasWellTunedSource && (
                <div className="space-y-1.5">
                  <SwitchRow
                    id="char-well-tuned"
                    label="Well Tuned"
                    checked={wellTuned}
                    onCheckedChange={(checked) => set('wellTuned', checked)}
                  />
                  <HelperText>
                    Playing an instrument grants this 1-hour buff. Tone Death's +20% melee only
                    applies while it is active. Off by default (honest zero).
                  </HelperText>
                </div>
              )}

              {hasEyeOfRaSource && (
                <div className="space-y-1.5">
                  <SwitchRow
                    id="char-eye-of-ra"
                    label="Eye of Ra equipped"
                    checked={eyeOfRaWorn}
                    onCheckedChange={(checked) => set('eyeOfRaWorn', checked)}
                  />
                  <HelperText>
                    Wearing the Eye of Ra headwear upgrades Voice of Set's robot shock proc from 35
                    to 70 energy damage. Off by default (honest zero).
                  </HelperText>
                </div>
              )}

              {hasKingfisherLocalLegend && (
                <div className="space-y-1.5">
                  <Label htmlFor="char-kingfisher-local-legend">
                    Completed Local Legend fishing challenges (
                    {localLegendFishingChallengesCompleted} /{' '}
                    {KINGFISHER_LOCAL_LEGEND_CHALLENGE_IDS.length})
                  </Label>
                  <Slider
                    id="char-kingfisher-local-legend"
                    min={0}
                    max={KINGFISHER_LOCAL_LEGEND_CHALLENGE_IDS.length}
                    step={1}
                    value={[localLegendFishingChallengesCompleted]}
                    onValueChange={(v) =>
                      set('localLegendFishingChallengesCompleted', firstSliderValue(v))
                    }
                    marks={Array.from(
                      { length: KINGFISHER_LOCAL_LEGEND_CHALLENGE_IDS.length + 1 },
                      (_, i) => ({
                        value: i,
                        label: i % 2 === 0 ? String(i) : undefined,
                      }),
                    )}
                  />
                </div>
              )}
            </div>
          </div>

          <div>
            <GroupHeading title="Weapon upkeep" />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="char-battle-loaders-bash">
                  Bash time (Battle-Loader's): {battleLoadersBashSec.toFixed(2)}s
                </Label>
                <Slider
                  id="char-battle-loaders-bash"
                  min={0}
                  max={2}
                  step={0.25}
                  disabled={!hasBattleLoaders}
                  value={[battleLoadersBashSec]}
                  onValueChange={(v) => set('battleLoadersBashSec', firstSliderValue(v))}
                  marks={[
                    { value: 0, label: '0s' },
                    { value: 0.75, label: '0.75s' },
                    { value: 2, label: '2s' },
                  ]}
                />
                <HelperText>
                  Seconds spent on the bash swing that triggers Battle-Loader's instant reload, used
                  in place of a real reload. The 0.75s default is an unmeasured placeholder pending
                  in-game stopwatch testing — actual timing likely depends on the weapon's bash
                  animation.
                </HelperText>
                {!hasBattleLoaders && <HelperText>No Battle-Loader's sources equipped</HelperText>}
              </div>

              {onslaughtReverse && (
                <NumberField
                  id="char-targets-hit"
                  label="Targets hit per attack"
                  value={conditions.targetsHit ?? 1}
                  min={1}
                  max={20}
                  onChange={(v) => set('targetsHit', v)}
                />
              )}

              <NumberField
                id="char-weapon-condition"
                label="Weapon condition %"
                value={conditions.weaponConditionPct ?? 100}
                min={0}
                max={200}
                step={10}
                onChange={(v) => set('weaponConditionPct', v)}
              />
            </div>
          </div>

          <div>
            <GroupHeading title="Your defenses" />
            <div className="space-y-3">
              <div className="space-y-1.5">
                <NumberField
                  id="char-player-dr"
                  label="Your damage resist"
                  value={conditions.playerDamageResist ?? 0}
                  min={0}
                  max={2000}
                  step={10}
                  onChange={(v) => set('playerDamageResist', v)}
                />
                <HelperText>
                  No armor model exists yet — this is a manual stand-in for Berserker's-style
                  effects that scale off your OWN damage resist (0 = naked, the curve's max-bonus
                  end).
                </HelperText>
              </div>

              <div className="space-y-1.5">
                <NumberField
                  id="char-player-rad-resist"
                  label="Your radiation resist"
                  value={conditions.playerRadResist ?? 0}
                  min={0}
                  max={10000}
                  step={100}
                  onChange={(v) => set('playerRadResist', v)}
                />
                <HelperText>
                  No armor model exists yet — this is a manual stand-in for Daisy Cutter's +20%
                  damage-per-1000-Rad-Resistance ladder, which caps at +160% (8000+).
                </HelperText>
              </div>
            </div>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
