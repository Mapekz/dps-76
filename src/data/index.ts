import type { GameMode, Perk, PerkId, Weapon } from '@/types';
import { getDataset } from './dataset';

// Thin projections over the single merged dataset (src/data/dataset.ts), which
// owns the live/pts resolution and applies overrides once.

// Pure Weapon helpers (item-level slider stops + select-time default).
export { DEFAULT_LEVEL_STOPS, maxEligibleLevel, weaponLevelStops } from './live/weapons';

export function getPerks(mode: GameMode): Record<PerkId, Perk> {
  return getDataset(mode).perkRegistry;
}

export function getWeapons(mode: GameMode): Record<string, Weapon> {
  return getDataset(mode).weapons;
}

export { getUniques, getUniqueById, getEquippedUnique, getUniquesForWeapon } from './uniques';

/** ESM-extracted clamp on effective (post-buff) SPECIAL — see GeneratedConstants. */
export function getSpecialClamp(mode: GameMode): { min: number; max: number } {
  return getDataset(mode).constants.special;
}

/** ESM-extracted `fDistanceForCloseDamage` GMST (the "Close" perk-gate threshold) — see GeneratedConstants. */
export function getDistanceConstants(mode: GameMode): { closeThresholdUnits: number } {
  return getDataset(mode).constants.distance;
}

export function getPerkById(mode: GameMode, perkId: PerkId): Perk | undefined {
  return getPerks(mode)[perkId];
}

/** Project an id/name-keyed record into combobox `{ value, label }` options. */
function toOptions(
  record: Record<string, { id: string; name: string }>,
): Array<{ value: string; label: string }> {
  return Object.values(record).map((x) => ({ value: x.id, label: x.name }));
}

export function getWeaponOptions(mode: GameMode) {
  return toOptions(getWeapons(mode));
}

export function getBodyArmorOptions(mode: GameMode) {
  return toOptions(getDataset(mode).bodyArmor);
}

export function getPowerArmorOptions(mode: GameMode) {
  return toOptions(getDataset(mode).powerArmor);
}
