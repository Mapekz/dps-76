import * as React from 'react';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Combobox } from '@/components/ui/combobox';
import { WeaponCombobox } from '@/components/build/WeaponCombobox';
import { Label } from '@/components/ui/label';
import { Slider, type SliderMark } from '@/components/ui/slider';
import { firstSliderValue } from '@/lib/slider-value';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { useScenarioResults } from '@/state/useScenarioResults';
import { resolveLoadout } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';
import { getWeapons, weaponLevelStops, getUniques, getEquippedUnique } from '@/data';
import {
  classifyOmodDisplay,
  effectiveWeaponName,
  getDefaultOmodId,
  getOmodById,
  getOmodSlots,
  getLegendaryOmodSlots,
  type OmodBadge,
  type OmodSlot,
} from '@/data/omods';
import { describeBuffModifiers } from '@/lib/buff-description';
import type { GameMode, Weapon } from '@/types';
import { ActionDelta } from '@/components/diff/ActionDelta';
import { DeltaText } from '@/components/diff/DiffTooltip';
import { OptionBadge } from './OptionBadge';
import { SectionTrigger } from './SectionTrigger';

/**
 * Slider stops come from the selected weapon's real Eligible Levels
 * (`weaponLevelStops` — Enclave Plasma [25,35,45]; full 1..50 grid fallback).
 */
function nearestItemLevelIndex(stops: readonly number[], level: number): number {
  let best = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i] - level) < Math.abs(stops[best] - level)) best = i;
  }
  return best;
}

/** Quarter-charge tick marks (25/50/75/100% of full power), dropping any point below the weapon's min-charge floor. */
function chargeQuarterMarks(fullPowerSeconds: number, minimumChargeTime: number): SliderMark[] {
  return [0.25, 0.5, 0.75, 1].flatMap((frac) => {
    const seconds = fullPowerSeconds * frac;
    return seconds >= minimumChargeTime
      ? [{ value: seconds, label: `${Math.round(frac * 100)}%` }]
      : [];
  });
}

const BADGE_LABELS: Record<OmodBadge, string> = {
  inert: 'no effect yet',
  pendingMechanic: 'pending rework',
};

function OmodBadgeTag({ slot, omodId }: { slot: OmodSlot; omodId: string }) {
  const badge = slot.options.find((o) => o.id === omodId)?.badge;
  if (!badge) return null;
  return <OptionBadge>{BADGE_LABELS[badge]}</OptionBadge>;
}

function OmodDescription({
  omodId,
  weapon,
  mode,
}: {
  omodId: string | null;
  weapon: Weapon;
  mode: GameMode;
}) {
  if (!omodId || omodId === '__standard__') return null;
  const omod = getOmodById(mode, omodId);
  if (!omod || classifyOmodDisplay(omod, weapon, mode).badge === 'inert') return null;
  const description = describeBuffModifiers(omod);
  if (!description) return null;
  return <p className="text-muted-foreground text-xs">{description}</p>;
}

export function WeaponSection() {
  const { mode } = useGameMode();
  const { player, enemy } = useBuild();
  const dispatch = useBuildDispatch();
  const { scenarios } = useScenarioResults();

  const weapons = getWeapons(mode);
  const uniques = getUniques(mode);
  const uniquesById = React.useMemo(() => new Map(uniques.map((u) => [u.id, u])), [uniques]);
  const equippedUnique = player.weapon ? getEquippedUnique(mode, player.weapon) : undefined;
  const equippedIdentitySlot = equippedUnique
    ? (Object.entries(equippedUnique.mods).find(
        ([, omodId]) => omodId === equippedUnique.id,
      )?.[0] ??
      getOmodById(mode, equippedUnique.id)?.attachPointEdid ??
      'ap_customName')
    : undefined;
  const weaponOptions = [
    ...uniques.map((u) => ({
      value: u.id,
      // Prefer the preset's own name over the identity mod's raw name: it's
      // derived from the omod name with the " Custom Mod"/" Custom Name"
      // suffix already stripped (resolveUniquePresetName), and for a
      // variant-container preset (Camden Whacker, Relic Reaper) the default
      // variant's own omod name carries a "(Bleed)"-style suffix that must
      // NOT leak into the weapon-picker row — that suffix belongs only to
      // the Unique mod slot's own options.
      label: u.name || (getOmodById(mode, u.id)?.name ?? u.name),
      group: 'Unique weapons' as const,
      subtitle: weapons[u.baseWeaponId]?.name,
    })),
    ...Object.values(weapons).map((w) => ({ value: w.id, label: w.name })),
  ];
  const selectedWeapon = player.weapon ? weapons[player.weapon.weaponId] : undefined;
  const omodSlots = selectedWeapon ? getOmodSlots(mode, selectedWeapon) : [];
  const legendarySlots = selectedWeapon ? getLegendaryOmodSlots(mode, selectedWeapon) : [];
  const levelStops = weaponLevelStops(selectedWeapon);

  // Charging weapons (Gauss family, bows, tesla/gamma/laser via charging-barrel
  // OMODs) — null when the effective weapon (base + equipped OMODs) doesn't
  // charge, per ScenarioSet.charging (src/lib/engine/scenarios.ts). Clamp the
  // stored hold time defensively: an OMOD swap (not just a weapon/select,
  // which already resets it) can shrink the effective charge window, and a
  // carried-over value could otherwise overshoot the new bounds — mirrors
  // resolvedChargeTimeSec's own clamp (src/lib/charge.ts).
  const charging = scenarios?.charging ?? null;
  const chargeTimeSec = charging
    ? Math.min(
        Math.max(player.chargeTimeSec ?? charging.fullPowerSeconds, charging.minimumChargeTime),
        charging.fullPowerSeconds,
      )
    : 0;
  const chargePercent = charging
    ? Math.round((chargeTimeSec / charging.fullPowerSeconds) * 100)
    : 0;
  const isFullCharge = charging ? charging.fullPowerSeconds - chargeTimeSec < 1e-6 : true;

  // Free Aim burst DPS at full charge, for the "vs full" delta label —
  // re-runs the engine once more on the SAME resolved input with
  // chargeTimeSec forced to fullPowerSeconds (both per-hit damage AND fire
  // rate shift with hold time, src/lib/fire-rate.ts's charging branch, so a
  // linear estimate from the multiplier alone wouldn't be exact). Burst DPS
  // (not sustained) is the metric ScenarioCard renders as the headline number.
  const fullChargeBurstDps = React.useMemo(() => {
    if (!charging) return null;
    const input = resolveLoadout(player, enemy, mode);
    if (!input) return null;
    return computeScenarios({ ...input, chargeTimeSec: charging.fullPowerSeconds }).freeAim
      .burstDps;
  }, [player, enemy, mode, charging]);

  // A slot showing its standard part isn't a "mod" — count only deviations.
  const defaultOmodIds = new Map(
    selectedWeapon
      ? omodSlots.map((slot) => [slot.slot, getDefaultOmodId(mode, selectedWeapon, slot.slot)])
      : [],
  );
  const equippedModCount =
    Object.entries(player.weapon?.mods ?? {}).filter(
      ([slot, id]) => id && id !== defaultOmodIds.get(slot),
    ).length + (player.weapon?.legendaryEffects.length ?? 0);
  const summary = selectedWeapon
    ? `${effectiveWeaponName(mode, selectedWeapon, player.weapon?.mods ?? {})}${equippedModCount > 0 ? ` · ${equippedModCount} mods` : ''}`
    : 'none equipped';

  return (
    <AccordionItem value="weapon">
      <AccordionTrigger>
        <SectionTrigger label="Weapon" summary={summary} />
      </AccordionTrigger>
      <AccordionContent>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Weapon</Label>
            <WeaponCombobox
              options={weaponOptions}
              value={equippedUnique?.id ?? player.weapon?.weaponId ?? null}
              onValueChange={(next) => {
                if (next === null) {
                  if (equippedUnique) return;
                  dispatch({ type: 'weapon/select', weaponId: null });
                  return;
                }
                if (uniquesById.has(next))
                  dispatch({ type: 'weapon/selectUnique', uniqueId: next });
                else dispatch({ type: 'weapon/select', weaponId: next });
              }}
              placeholder="Pick a weapon…"
              searchPlaceholder="Search weapons…"
              emptyText="No weapon matches."
              collapsibleGroup="Unique weapons"
            />
          </div>

          {omodSlots.map((slot) => {
            const defaultOmodId = defaultOmodIds.get(slot.slot);
            const chosen = player.weapon?.mods[slot.slot];
            // An undecided slot carries its real standard part (folded into the
            // damage engine by assemble()) — show it as genuinely selected.
            const displayValue = typeof chosen === 'string' ? chosen : (defaultOmodId ?? null);
            const showUniqueStandard = slot.slot === equippedIdentitySlot && !!equippedUnique;
            const modOptions = [
              ...(showUniqueStandard ? [{ value: '__standard__', label: 'Standard' }] : []),
              ...slot.options.map((o) => ({ value: o.id, label: o.name })),
            ];
            return (
              <div key={slot.slot} className="space-y-1.5">
                <Label>{slot.label}</Label>
                <Combobox
                  options={modOptions}
                  value={displayValue}
                  onValueChange={(omodId) => {
                    if (omodId === '__standard__') {
                      dispatch({ type: 'weapon/mod', slot: slot.slot, omodId: null });
                      return;
                    }
                    dispatch({ type: 'weapon/mod', slot: slot.slot, omodId });
                  }}
                  placeholder="Standard"
                  searchPlaceholder="Search mods…"
                  emptyText="No mod matches."
                  renderOptionExtra={(o) => (
                    <>
                      {o.value === defaultOmodId && <OptionBadge>standard</OptionBadge>}
                      {o.value !== '__standard__' && <OmodBadgeTag slot={slot} omodId={o.value} />}
                      {/* No ±% on the already-selected option — the delta of a no-op is 0. */}
                      {o.value !== displayValue && (
                        <ActionDelta
                          action={{
                            type: 'weapon/mod',
                            slot: slot.slot,
                            omodId: o.value === '__standard__' ? null : o.value,
                          }}
                        />
                      )}
                    </>
                  )}
                />
                {selectedWeapon && (
                  <OmodDescription omodId={displayValue} weapon={selectedWeapon} mode={mode} />
                )}
              </div>
            );
          })}

          {legendarySlots.map((slot, i) => (
            <div key={slot.slot} className="space-y-1.5">
              <Label>Legendary ★{i + 1}</Label>
              <Combobox
                options={slot.options.map((o) => ({ value: o.id, label: o.name }))}
                value={player.weapon?.legendaryEffects[i] ?? null}
                onValueChange={(omodId) =>
                  dispatch({ type: 'weapon/legendary', slotIndex: i, omodId })
                }
                placeholder="None"
                searchPlaceholder="Search effects…"
                emptyText="No effect matches."
                renderOptionExtra={(o) => (
                  <>
                    <OmodBadgeTag slot={slot} omodId={o.value} />
                    {o.value !== (player.weapon?.legendaryEffects[i] ?? null) && (
                      <ActionDelta
                        action={{ type: 'weapon/legendary', slotIndex: i, omodId: o.value }}
                      />
                    )}
                  </>
                )}
              />
              {selectedWeapon && (
                <OmodDescription
                  omodId={player.weapon?.legendaryEffects[i] ?? null}
                  weapon={selectedWeapon}
                  mode={mode}
                />
              )}
            </div>
          ))}

          <div className="space-y-1.5">
            <Label htmlFor="item-level">Item level: {player.itemLevel}</Label>
            <Slider
              id="item-level"
              min={0}
              max={levelStops.length - 1}
              step={1}
              value={[nearestItemLevelIndex(levelStops, player.itemLevel)]}
              onValueChange={(v) =>
                dispatch({ type: 'weapon/itemLevel', value: levelStops[firstSliderValue(v)] })
              }
              marks={levelStops.map((level, i) => ({ value: i, label: String(level) }))}
            />
            <p className="text-muted-foreground text-xs">
              Only the weapon's real drop levels are offered. Base damage comes from the level
              curve.
            </p>
          </div>

          {charging && scenarios && (
            <div className="space-y-1.5">
              <Label
                htmlFor="charge-time"
                className="flex flex-wrap items-baseline justify-between gap-x-2"
              >
                <span>
                  Charge time: {chargeTimeSec.toFixed(2)}s — {chargePercent}% charge
                </span>
                {isFullCharge ? (
                  <span className="text-muted-foreground text-xs font-normal">full charge</span>
                ) : (
                  fullChargeBurstDps !== null && (
                    <span className="text-xs font-normal">
                      <DeltaText
                        base={fullChargeBurstDps}
                        delta={scenarios.freeAim.burstDps - fullChargeBurstDps}
                      />{' '}
                      DPS vs full
                    </span>
                  )
                )}
              </Label>
              <Slider
                id="charge-time"
                min={charging.minimumChargeTime}
                max={charging.fullPowerSeconds}
                step={charging.fullPowerSeconds / 100}
                value={[chargeTimeSec]}
                onValueChange={(v) =>
                  dispatch({ type: 'weapon/chargeTime', value: firstSliderValue(v) })
                }
                marks={chargeQuarterMarks(charging.fullPowerSeconds, charging.minimumChargeTime)}
              />
              <p className="text-muted-foreground text-xs">
                Hold time before the shot fires. Defaults to a full charge (optimal play) — shorter
                holds fire faster but hit softer.
              </p>
            </div>
          )}
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
