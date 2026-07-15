import * as React from 'react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { ToggleGroup } from '@/components/ui/toggle-group';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { useScenarioResults } from '@/state/useScenarioResults';
import { resolveStats } from '@/lib/loadout';
import { createDefaultPlayerConditions, type PlayerConditions } from '@/types';
import { SectionTrigger } from './SectionTrigger';

/**
 * The character's steady state: health, meters, caps, streak/stack counters,
 * weapon upkeep, and aim rates. Race lives in the SPECIAL Loadout section
 * (SpecialLoadoutSection.tsx); team size/public-team type in TeamSection;
 * target state in TargetSection; sneak/weakpoint stay on the headline chips.
 */

/** In-game meter state names — SURV_NewHungerThreshold_Msg_* / SURV_NewThirstThreshold_Msg_* (tier 4 = fullest). */
const FOOD_TIER_NAMES = ['Hungry', 'Partially Fed', 'Fed', 'Well Fed', 'Fully Fed'] as const;
const DRINK_TIER_NAMES = ['Thirsty', 'Partially Hydrated', 'Hydrated', 'Well Hydrated', 'Fully Hydrated'] as const;

/** Limit Breaking is a 1★ armor mod — at most one per equipped armor piece. */
const LIMIT_BREAKING_OPTIONS = [0, 1, 2, 3, 4, 5].map(value => ({ value, label: String(value) }));

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

function NumberField({
  id,
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={e => onChange(Math.max(min, Math.min(max, parseInt(e.target.value, 10) || min)))}
      />
    </div>
  );
}

function SwitchRow({
  id,
  label,
  checked,
  onCheckedChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <label htmlFor={id} className="flex cursor-pointer items-center justify-between gap-2 text-sm">
      <span>{label}</span>
      <Switch id={id} checked={checked} onCheckedChange={onCheckedChange} />
    </label>
  );
}

export function ConditionsSection() {
  const { mode } = useGameMode();
  const { player, enemy } = useBuild();
  const dispatch = useBuildDispatch();
  const { scenarios } = useScenarioResults();

  const set = (key: keyof PlayerConditions, value: PlayerConditions[keyof PlayerConditions]) =>
    dispatch({ type: 'condition/set', key, value });

  const conditions = player.conditions;
  const defaults = createDefaultPlayerConditions();
  const isGhoul = conditions.isGhoul ?? false;

  const stats = React.useMemo(() => resolveStats(player, enemy, mode), [player, enemy, mode]);

  // Onslaught: the max folds from equipped sources (ScenarioSet.onslaughtMaxStacks);
  // sentinel -1 = follow max (see the PlayerConditions.onslaughtStacks comment).
  const onslaughtMax = scenarios?.onslaughtMaxStacks ?? 0;
  const onslaughtStored = conditions.onslaughtStacks;
  const onslaughtValue = onslaughtStored === -1 ? onslaughtMax : Math.min(onslaughtStored, onslaughtMax);
  const hasKillStreak = scenarios?.hasKillStreakSources ?? false;

  const foodTier = conditions.foodTier ?? 0;
  const drinkTier = conditions.drinkTier ?? 0;
  const feralTier = conditions.feralTier ?? 0;
  // Clamp the displayed value only — the engine already clamps glow to
  // maxHealth in resolveLoadout; don't dispatch a correction on render.
  const glow = Math.min(conditions.glow ?? 0, stats.maxHealth);

  const activeCount =
    (conditions.healthPercent !== defaults.healthPercent ? 1 : 0) +
    (foodTier !== (defaults.foodTier ?? 0) ? 1 : 0) +
    (drinkTier !== (defaults.drinkTier ?? 0) ? 1 : 0) +
    (feralTier !== (defaults.feralTier ?? 0) ? 1 : 0) +
    (glow !== (defaults.glow ?? 0) ? 1 : 0) +
    (conditions.capsOnHand !== defaults.capsOnHand ? 1 : 0) +
    (conditions.adrenalineStacks !== defaults.adrenalineStacks ? 1 : 0) +
    (onslaughtStored !== -1 ? 1 : 0) +
    ((conditions.weaponConditionPct ?? 100) !== (defaults.weaponConditionPct ?? 100) ? 1 : 0) +
    ((conditions.hitRatePct ?? 100) !== (defaults.hitRatePct ?? 100) ? 1 : 0) +
    ((conditions.bodyPartHitRatePct ?? 100) !== (defaults.bodyPartHitRatePct ?? 100) ? 1 : 0) +
    (conditions.isPowerAttacking !== defaults.isPowerAttacking ? 1 : 0) +
    ((conditions.isLastShot ?? false) !== (defaults.isLastShot ?? false) ? 1 : 0) +
    ((conditions.hydrated ?? true) !== (defaults.hydrated ?? true) ? 1 : 0) +
    (conditions.limitBreakingPieces !== defaults.limitBreakingPieces ? 1 : 0);

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
          <NumberField
            id="char-health"
            label="Health %"
            value={conditions.healthPercent}
            min={1}
            max={100}
            onChange={v => set('healthPercent', v)}
          />

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
                  onValueChange={([v]) => set('foodTier', v)}
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
                  onValueChange={([v]) => set('drinkTier', v)}
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
                onValueChange={([v]) => set('feralTier', v)}
                marks={Array.from({ length: 9 }, (_, i) => ({ value: i, label: i % 2 === 0 ? String(i) : undefined }))}
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
                onValueChange={([v]) => set('glow', v)}
                marks={[
                  { value: 0, label: '0' },
                  { value: 180, label: '180' },
                  { value: stats.maxHealth, label: String(stats.maxHealth) },
                ]}
              />
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="char-caps">Caps on hand: {conditions.capsOnHand.toLocaleString()}</Label>
            <Slider
              id="char-caps"
              min={0}
              max={40000}
              step={1000}
              value={[Math.min(conditions.capsOnHand, 40000)]}
              onValueChange={([v]) => set('capsOnHand', v)}
              marks={[0, 10000, 20000, 29000, 40000].map(v => ({ value: v, label: v === 0 ? '0' : `${v / 1000}k` }))}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="char-killstreak">Kill streak: {conditions.adrenalineStacks}</Label>
            <Slider
              id="char-killstreak"
              min={0}
              max={10}
              step={1}
              disabled={!hasKillStreak}
              value={[conditions.adrenalineStacks]}
              onValueChange={([v]) => set('adrenalineStacks', v)}
              marks={Array.from({ length: 11 }, (_, i) => ({ value: i, label: i % 2 === 0 ? String(i) : undefined }))}
            />
            {!hasKillStreak && <p className="text-muted-foreground text-xs">No kill-streak sources equipped</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="char-onslaught">
              Onslaught stacks ({onslaughtValue} / max {onslaughtMax})
            </Label>
            <Slider
              id="char-onslaught"
              min={0}
              max={Math.max(onslaughtMax, 1)}
              step={1}
              disabled={onslaughtMax === 0}
              value={[onslaughtValue]}
              onValueChange={([v]) => set('onslaughtStacks', v)}
              marks={
                onslaughtMax > 0
                  ? Array.from({ length: onslaughtMax + 1 }, (_, i) => ({
                      value: i,
                      label: i % 5 === 0 || i === onslaughtMax ? String(i) : undefined,
                    }))
                  : undefined
              }
            />
            {onslaughtMax === 0 && <p className="text-muted-foreground text-xs">No Onslaught sources equipped</p>}
          </div>

          <NumberField
            id="char-weapon-condition"
            label="Weapon condition %"
            value={conditions.weaponConditionPct ?? 100}
            min={0}
            max={200}
            step={10}
            onChange={v => set('weaponConditionPct', v)}
          />

          <NumberField
            id="char-hit-rate"
            label="Free-aim hit rate %"
            value={conditions.hitRatePct ?? 100}
            min={10}
            max={100}
            step={5}
            onChange={v => set('hitRatePct', v)}
          />

          <div className="space-y-1.5">
            <NumberField
              id="char-bodypart-rate"
              label="Body part hit rate %"
              value={conditions.bodyPartHitRatePct ?? 100}
              min={10}
              max={100}
              step={5}
              onChange={v => set('bodyPartHitRatePct', v)}
            />
            <p className="text-muted-foreground text-xs">
              Once the Target section has a non-torso body part selected: this share of hits lands on it, the rest
              hit the torso.
            </p>
          </div>

          {!isGhoul && (
            <div className="space-y-1.5">
              <SwitchRow
                id="char-hydrated"
                label="Fully hydrated"
                checked={conditions.hydrated ?? true}
                onCheckedChange={v => set('hydrated', v)}
              />
              <p className="text-muted-foreground text-xs">
                Fully hydrated grants +35% AP regen (45/60% with Rejuvenated). Ghouls have no hydration.
              </p>
            </div>
          )}

          <SwitchRow
            id="char-power-attack"
            label="Power attacking (melee)"
            checked={conditions.isPowerAttacking}
            onCheckedChange={v => set('isPowerAttacking', v)}
          />

          <SwitchRow
            id="char-last-shot"
            label="Firing the magazine's last round"
            checked={conditions.isLastShot ?? false}
            onCheckedChange={v => set('isLastShot', v)}
          />

          <div className="space-y-1.5">
            <Label>Limit Breaking armor pieces</Label>
            <ToggleGroup
              aria-label="Limit Breaking armor pieces"
              options={LIMIT_BREAKING_OPTIONS}
              value={conditions.limitBreakingPieces}
              onValueChange={v => set('limitBreakingPieces', v)}
            />
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
