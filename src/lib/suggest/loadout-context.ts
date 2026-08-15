import type { GameMode, Weapon } from '@/types';
import { getDefaultOmodId, getLegendaryOmodSlots, getOmodById, getOmodSlots } from '@/data/omods';
import type { BuildState } from '@/state/build-reducer';
import type { CurveInput, Modifier, StaticLoadoutContext } from '@/types/modifiers';

/**
 * The currently equipped weapon's real keyword/curve-input surface (base
 * weapon + every equipped OMOD, regular and legendary slots — falling back
 * to each slot's default when unset, same as `effectiveWeaponName`), plus
 * armor type and race — gates which perks/effects can possibly matter to
 * THIS build before they ever reach the illegal-candidate carve-out in
 * `topSuggestions` (evaluate.ts), which never actually simulates an
 * unaffordable perk and would otherwise show it regardless of relevance
 * (Master Infiltrator on any weapon but the Blackpowder Pistol, Faulty Spots
 * on a non-Ghoul character, ...). Shared by variants.ts and combos.ts — both
 * enumerate candidates against the same equipped weapon.
 */
export function buildStaticLoadoutContext(
  mode: GameMode,
  player: BuildState['player'],
  weapon: Weapon | undefined,
): StaticLoadoutContext {
  const weaponKeywords = new Set<string>(weapon?.keywords ?? []);
  const consumedCurveInputs = new Set<CurveInput>();
  const collect = (modifiers: Modifier[] | undefined) => {
    for (const m of modifiers ?? []) {
      if (m.curve) consumedCurveInputs.add(m.curve.input);
    }
  };
  if (weapon) {
    collect(weapon.modifiers);
    for (const slot of getOmodSlots(mode, weapon)) {
      const omodId = player.weapon?.mods[slot.slot] ?? getDefaultOmodId(mode, weapon, slot.slot);
      const omod = omodId ? getOmodById(mode, omodId) : undefined;
      if (omod) {
        for (const kw of omod.addedKeywords) weaponKeywords.add(kw);
        collect(omod.modifiers);
      }
    }
    getLegendaryOmodSlots(mode, weapon).forEach((_slot, i) => {
      const omodId = player.weapon?.legendaryEffects[i];
      const omod = omodId ? getOmodById(mode, omodId) : undefined;
      if (omod) {
        for (const kw of omod.addedKeywords) weaponKeywords.add(kw);
        collect(omod.modifiers);
      }
    });
  }
  return {
    weaponKeywords,
    weaponClass: weapon?.weaponClass,
    weaponAnimType: weapon?.animType,
    armorWorn: player.conditions.armorWorn,
    isGhoul: player.conditions.isGhoul ?? false,
    consumedCurveInputs,
  };
}
