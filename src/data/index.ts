import type { GameMode, Perk, PerkId, Enemy, EnemyMutation, Weapon } from '@/types';
import { getDataset } from './dataset';

// Thin projections over the single merged dataset (src/data/dataset.ts), which
// owns the live/pts resolution and applies overrides once.

// Pure Weapon helpers (item-level slider stops + select-time default).
export { DEFAULT_LEVEL_STOPS, maxEligibleLevel, weaponLevelStops } from './live/weapons';

export function getPerks(mode: GameMode): Record<PerkId, Perk> {
  return getDataset(mode).perkRegistry;
}

export function getEnemies(mode: GameMode): Record<string, Enemy> {
  return getDataset(mode).enemies;
}

export function getEnemyMutations(mode: GameMode): Record<string, EnemyMutation> {
  return getDataset(mode).enemyMutations;
}

export function getLegendaryRankModifiers(mode: GameMode) {
  return getDataset(mode).legendaryRankModifiers;
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

export function getPerkById(mode: GameMode, perkId: PerkId): Perk | undefined {
  return getPerks(mode)[perkId];
}

export function getEnemyById(mode: GameMode, enemyId: string): Enemy | undefined {
  return getEnemies(mode)[enemyId];
}

/** Project an id/name-keyed record into combobox `{ value, label }` options. */
function toOptions(record: Record<string, { id: string; name: string }>): Array<{ value: string; label: string }> {
  return Object.values(record).map(x => ({ value: x.id, label: x.name }));
}

export function getEnemyOptions(mode: GameMode) {
  return toOptions(getEnemies(mode));
}

export function getMutationOptions(mode: GameMode) {
  return toOptions(getEnemyMutations(mode));
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
