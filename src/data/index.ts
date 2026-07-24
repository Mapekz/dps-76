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

export function getBodyArmor(mode: GameMode) {
  return getDataset(mode).bodyArmor;
}

export function getPowerArmor(mode: GameMode) {
  return getDataset(mode).powerArmor;
}

/** ESM-extracted clamp on effective (post-buff) SPECIAL — see GeneratedConstants. */
export function getSpecialClamp(mode: GameMode): { min: number; max: number } {
  return getDataset(mode).constants.special;
}

/** ESM-extracted GMST scalars for the resist-mitigation formula — see GeneratedConstants. */
export function getMitigationConstants(
  mode: GameMode
): { resistExponent: number; damageFactor: number; minReduction: number; maxReduction: number } {
  return getDataset(mode).constants.mitigation;
}

/** ESM-extracted `fVATSCriticalChargeBase` GMST — see GeneratedConstants. */
export function getVatsCritConstants(mode: GameMode): { chargeBase: number } {
  return getDataset(mode).constants.vatsCrit;
}

/** ESM-extracted AP pool/regen-delay GMSTs + RACE regen-rate scalars — see GeneratedConstants. */
export function getActionPointConstants(mode: GameMode): {
  poolBase: number;
  poolPerAgility: number;
  regenDelaySec: number;
  regenRatePct: number;
  regenRatePctPowerArmor: number;
} {
  return getDataset(mode).constants.actionPoints;
}

/** ESM-extracted `uAmmoSpenderAmmoUsePerStack` GMST — see GeneratedConstants. */
export function getBulletStormConstants(mode: GameMode): { ammoPerStack: number } {
  return getDataset(mode).constants.bulletStorm;
}

/** ESM-extracted `fDistanceForCloseDamage` GMST (the "Close" perk-gate threshold) — see GeneratedConstants. */
export function getDistanceConstants(mode: GameMode): { closeThresholdUnits: number } {
  return getDataset(mode).constants.distance;
}

export function getPerkById(mode: GameMode, perkId: PerkId): Perk | undefined {
  return getPerks(mode)[perkId];
}

/** Project an id/name-keyed record into combobox `{ value, label }` options. */
function toOptions(record: Record<string, { id: string; name: string }>): Array<{ value: string; label: string }> {
  return Object.values(record).map(x => ({ value: x.id, label: x.name }));
}

export function getWeaponOptions(mode: GameMode) {
  return toOptions(getWeapons(mode));
}

export function getBodyArmorOptions(mode: GameMode) {
  return toOptions(getBodyArmor(mode));
}

export function getPowerArmorOptions(mode: GameMode) {
  return toOptions(getPowerArmor(mode));
}
