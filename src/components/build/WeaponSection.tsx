import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Combobox } from '@/components/ui/combobox';
import { Label } from '@/components/ui/label';
import { Slider } from '@/components/ui/slider';
import { useGameMode } from '@/hooks/useGameMode';
import { useBuild, useBuildDispatch } from '@/state/BuildProvider';
import { getWeapons, weaponLevelStops } from '@/data';
import {
  effectiveWeaponName,
  getDefaultOmodId,
  getOmodSlots,
  getLegendaryOmodSlots,
  type OmodBadge,
  type OmodSlot,
} from '@/data/omods';
import { ActionDelta } from '@/components/diff/ActionDelta';
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

const BADGE_LABELS: Record<OmodBadge, string> = {
  inert: 'no effect yet',
  pendingMechanic: 'pending rework',
  needsEnemyDefenses: 'needs enemy DR',
};

function OmodBadgeTag({ slot, omodId }: { slot: OmodSlot; omodId: string }) {
  const badge = slot.options.find(o => o.id === omodId)?.badge;
  if (!badge) return null;
  return (
    <Badge variant="outline" className="text-muted-foreground ml-1 px-1 py-0 text-[10px] font-normal">
      {BADGE_LABELS[badge]}
    </Badge>
  );
}

export function WeaponSection() {
  const { mode } = useGameMode();
  const { player } = useBuild();
  const dispatch = useBuildDispatch();

  const weapons = getWeapons(mode);
  const weaponOptions = Object.values(weapons).map(w => ({ value: w.id, label: w.name }));
  const selectedWeapon = player.weapon ? weapons[player.weapon.weaponId] : undefined;
  const omodSlots = selectedWeapon ? getOmodSlots(mode, selectedWeapon) : [];
  const legendarySlots = selectedWeapon ? getLegendaryOmodSlots(mode, selectedWeapon) : [];
  const levelStops = weaponLevelStops(selectedWeapon);

  // A slot showing its standard part isn't a "mod" — count only deviations.
  const defaultOmodIds = new Map(
    selectedWeapon ? omodSlots.map(slot => [slot.slot, getDefaultOmodId(mode, selectedWeapon, slot.slot)]) : []
  );
  const equippedModCount =
    Object.entries(player.weapon?.mods ?? {}).filter(([slot, id]) => id && id !== defaultOmodIds.get(slot)).length +
    (player.weapon?.legendaryEffects.length ?? 0);
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
            <Combobox
              options={weaponOptions}
              value={player.weapon?.weaponId ?? null}
              onValueChange={weaponId => dispatch({ type: 'weapon/select', weaponId })}
              placeholder="Pick a weapon…"
              searchPlaceholder="Search weapons…"
              emptyText="No weapon matches."
            />
          </div>

          {omodSlots.map(slot => {
            const defaultOmodId = defaultOmodIds.get(slot.slot);
            const chosen = player.weapon?.mods[slot.slot];
            // An undecided slot carries its real standard part (folded into the
            // damage engine by assemble()) — show it as genuinely selected.
            const displayValue = typeof chosen === 'string' ? chosen : (defaultOmodId ?? null);
            return (
              <div key={slot.slot} className="space-y-1.5">
                <Label>{slot.label}</Label>
                <Combobox
                  options={slot.options.map(o => ({ value: o.id, label: o.name }))}
                  value={displayValue}
                  onValueChange={omodId => dispatch({ type: 'weapon/mod', slot: slot.slot, omodId })}
                  placeholder="Standard"
                  searchPlaceholder="Search mods…"
                  emptyText="No mod matches."
                  renderOptionExtra={o => (
                    <>
                      {o.value === defaultOmodId && (
                        <Badge variant="outline" className="text-muted-foreground ml-1 px-1 py-0 text-[10px] font-normal">
                          standard
                        </Badge>
                      )}
                      <OmodBadgeTag slot={slot} omodId={o.value} />
                      {/* No ±% on the already-selected option — the delta of a no-op is 0. */}
                      {o.value !== displayValue && (
                        <ActionDelta action={{ type: 'weapon/mod', slot: slot.slot, omodId: o.value }} />
                      )}
                    </>
                  )}
                />
              </div>
            );
          })}

          {legendarySlots.map((slot, i) => (
            <div key={slot.slot} className="space-y-1.5">
              <Label>Legendary ★{i + 1}</Label>
              <Combobox
                options={slot.options.map(o => ({ value: o.id, label: o.name }))}
                value={player.weapon?.legendaryEffects[i] ?? null}
                onValueChange={omodId => dispatch({ type: 'weapon/legendary', slotIndex: i, omodId })}
                placeholder="None"
                searchPlaceholder="Search effects…"
                emptyText="No effect matches."
                renderOptionExtra={o => (
                  <>
                    <OmodBadgeTag slot={slot} omodId={o.value} />
                    {o.value !== (player.weapon?.legendaryEffects[i] ?? null) && (
                      <ActionDelta action={{ type: 'weapon/legendary', slotIndex: i, omodId: o.value }} />
                    )}
                  </>
                )}
              />
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
              onValueChange={([i]) => dispatch({ type: 'weapon/itemLevel', value: levelStops[i] })}
              marks={levelStops.map((level, i) => ({ value: i, label: String(level) }))}
            />
            <p className="text-muted-foreground text-xs">
              Only the weapon's real drop levels are offered. Base damage comes from the level curve.
            </p>
          </div>
        </div>
      </AccordionContent>
    </AccordionItem>
  );
}
