import type { GameMode, Perk, PerkId, Weapon } from '@/types';
import { getDataset } from './dataset';

// Thin projections over the single merged dataset (src/data/dataset.ts), which
// owns the live/pts resolution and applies overrides once.

// Pure Weapon helpers (item-level slider stops + select-time default).
export { DEFAULT_LEVEL_STOPS, maxEligibleLevel, weaponLevelStops } from './pts/weapons';

export function getPerks(mode: GameMode): Record<PerkId, Perk> {
  return getDataset(mode).perkRegistry;
}

export function getWeapons(mode: GameMode): Record<string, Weapon> {
  return getDataset(mode).weapons;
}

export {
  getUniques,
  getUniqueById,
  getEquippedUnique,
  getUniquesForWeapon,
  resolveUniqueIdentitySlot,
} from './uniques';

/** ESM-extracted clamp on effective (post-buff) SPECIAL — see GeneratedConstants. */
export function getSpecialClamp(mode: GameMode): { min: number; max: number } {
  return getDataset(mode).constants.special;
}

/** ESM-extracted `fDistanceForCloseDamage` GMST (the "Close" perk-gate threshold) — see GeneratedConstants. */
export function getDistanceConstants(mode: GameMode): { closeThresholdUnits: number } {
  return getDataset(mode).constants.distance;
}
