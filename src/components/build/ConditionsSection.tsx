import * as React from 'react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { NumberField } from '@/components/ui/number-field';
import { Slider } from '@/components/ui/slider';
import { firstSliderValue } from '@/lib/slider-value';
import { Switch } from '@/components/ui/switch';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { useScenarioResults } from '@/state/useScenarioResults';
import { resolveStats } from '@/lib/loadout';
import {
  KINGFISHER_LOCAL_LEGEND_CHALLENGE_IDS,
  PIPE_WEAPON_CRAFTING_CHALLENGE_ID,
  isBulletStormStacksActive,
  isOnslaughtStacksActive,
} from '@/lib/engine/affordances';
import { buildDeltaCount } from '@/lib/build-delta';
import { healthPercentIndex, PLAYER_HEALTH_PERCENT_STOPS } from '@/lib/health-percent';
import { cn } from '@/lib/utils';
import { createDefaultPlayerInput, type PlayerInput } from '@/types';
import { knobActiveBadgeObjects } from '@/types/knob-registry';
import { SectionTrigger } from './SectionTrigger';

/**
 * The character's steady state: health, meters, caps, streak/stack counters,
 * and weapon upkeep. Race lives in the SPECIAL Loadout section
 * (SpecialLoadoutSection.tsx); team size/public-team type in TeamSection;
 * target state AND the three accuracy sliders (hitRatePct/vatsHitRatePct/
 * bodyPartHitRatePct — they only make sense next to the body-part picker)
 * live in TargetSection; sneak/weakpoint stay on the headline chips.
 */

/** In-game meter state names — SURV_NewHungerThreshold_Msg_* / SURV_NewThirstThreshold_Msg_* (tier 4 = fullest). */
const FOOD_TIER_NAMES = ['Hungry', 'Partially Fed', 'Fed', 'Well Fed', 'Fully Fed'] as const;
const DRINK_TIER_NAMES = [
  'Thirsty',
  'Partially Hydrated',
  'Hydrated',
  'Well Hydrated',
  'Fully Hydrated',
] as const;

/**
 * GHL_SURV_FeralThreshold_Msg_* names banded over the 0–8 GHL_FeralTier AV
 * (5 states over 9 tiers — the exact cutoffs are an inference, tier 8 =
 * "Wonderful" is proven; docs/assumptions.md "Feral meter").
 */
function feralStateName(tier: number): string {
  if (tier >= 8) return 'Wonderful';
  if (tier >= 6) return 'Normal';
  if (tier >= 4) return 'Odd';
  if (tier >= 2) return 'Losing it';
  return 'Feral';
}

/** One decimal for sustained-stack averages; whole numbers omit the fraction. */
function formatStackAvg(value: number): string {
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

function SwitchRow({
  id,
  label,
  checked,
  onCheckedChange,
  disabled,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <label
      htmlFor={id}
      className={cn(
        'flex items-center justify-between gap-2 text-sm',
        disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer',
      )}
    >
      <span>{label}</span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
    </label>
  );
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

  const stats = React.useMemo(() => resolveStats(player, enemy, mode), [player, enemy, mode]);

  // Onslaught: max from equipped sources (ScenarioSet.onslaughtMaxStacks); −1 =
  // auto (Sustained Stacks — engine-simulated forward avg or max fallback).
  // Drag the slider to pin; "Auto" resets to −1. GSM reverse is always auto.
  const onslaughtMax = scenarios?.onslaughtMaxStacks ?? 0;
  const onslaughtReverse = scenarios?.onslaughtReverse ?? false;
  const onslaughtStored = conditions.onslaughtStacks;
  const onslaughtValue = scenarios?.onslaughtEffectiveStacks ?? 0;
  const hasKillStreak = affordances?.hasKillStreakSources ?? false;

  // Concentrated Fire: manual 0–20 stacks slider standing in for the game's
  // hidden native per-target consecutive-shots-fired counter (see the
  // PlayerConditions.concentratedFireStacks doc comment and
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
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="char-health">Health: {conditions.healthPercent}%</Label>
            <Slider
              id="char-health"
              min={0}
              max={PLAYER_HEALTH_PERCENT_STOPS.length - 1}
              step={1}
              value={[healthPercentIndex(conditions.healthPercent, PLAYER_HEALTH_PERCENT_STOPS)]}
              onValueChange={(v) =>
                set('healthPercent', PLAYER_HEALTH_PERCENT_STOPS[firstSliderValue(v)])
              }
              marks={PLAYER_HEALTH_PERCENT_STOPS.map((pct, i) => ({ value: i, label: `${pct}` }))}
            />
          </div>

          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Max HP</span>
            <span className="font-mono tabular-nums">{stats.maxHealth}</span>
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
            {!hasKillStreak && (
              <p className="text-muted-foreground text-xs">No kill-streak sources equipped</p>
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
              <p className="text-muted-foreground text-xs">
                Engine-computed average during sustained fire (Gunslinger Master). Consumption
                scales with fire rate, projectiles, and targets hit below.
              </p>
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
            {onslaughtMax === 0 && (
              <p className="text-muted-foreground text-xs">No Onslaught sources equipped</p>
            )}
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
            {bulletStormMax === 0 && (
              <p className="text-muted-foreground text-xs">No Bullet Storm sources equipped</p>
            )}
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
            <p className="text-muted-foreground text-xs">
              Stacks build per VATS shot landed on the same body part and reset when you switch body
              part or target — a manual stand-in for the game's hidden counter (each rank adds
              +1/2/3% VATS damage per stack).
            </p>
            {!hasConcentratedFire && (
              <p className="text-muted-foreground text-xs">No Concentrated Fire sources equipped</p>
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

          {hasKingfisherLocalLegend && (
            <div className="space-y-1.5">
              <Label htmlFor="char-kingfisher-local-legend">
                Completed Local Legend fishing challenges ({localLegendFishingChallengesCompleted} /{' '}
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
            <p className="text-muted-foreground text-xs">
              Seconds spent on the bash swing that triggers Battle-Loader's instant reload, used in
              place of a real reload. The 0.75s default is an unmeasured placeholder pending in-game
              stopwatch testing — actual timing likely depends on the weapon's bash animation.
            </p>
            {!hasBattleLoaders && (
              <p className="text-muted-foreground text-xs">No Battle-Loader's sources equipped</p>
            )}
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
            <p className="text-muted-foreground text-xs">
              No armor model exists yet — this is a manual stand-in for Berserker's-style effects
              that scale off your OWN damage resist (0 = naked, the curve's max-bonus end).
            </p>
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
            <p className="text-muted-foreground text-xs">
              No armor model exists yet — this is a manual stand-in for Daisy Cutter's +20%
              damage-per-1000-Rad-Resistance ladder, which caps at +160% (8000+).
            </p>
          </div>

          {!isGhoul && (
            <div className="space-y-1.5">
              <SwitchRow
                id="char-hydrated"
                label="Fully hydrated"
                checked={conditions.hydrated ?? true}
                onCheckedChange={(v) => set('hydrated', v)}
              />
              <p className="text-muted-foreground text-xs">
                Fully hydrated grants +35% AP regen (45/60% with Rejuvenated). Ghouls have no
                hydration.
              </p>
            </div>
          )}

          <SwitchRow
            id="char-power-attack"
            label="Power attacking (melee)"
            checked={conditions.isPowerAttacking}
            onCheckedChange={(v) => set('isPowerAttacking', v)}
          />

          <SwitchRow
            id="char-last-shot"
            label="Firing the magazine's last round"
            checked={conditions.isLastShot ?? false}
            onCheckedChange={(v) => set('isLastShot', v)}
          />

          <SwitchRow
            id="char-ads"
            label="Aiming down sights"
            checked={conditions.isAimingDownSights ?? false}
            onCheckedChange={(v) => set('isAimingDownSights', v)}
          />
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
