import type { GameMode, Perk, Enemy, EnemyMutation, Weapon } from '@/types';
import { perksLive } from './live/perks';
import { enemiesLive, enemyMutationsLive, legendaryRankModifiersLive } from './live/enemies';
import { weaponsLive } from './live/weapons';
import { powerArmorLive } from './live/armor';
import { perksPTS } from './pts/perks';
import { enemiesPTS, enemyMutationsPTS, legendaryRankModifiersPTS } from './pts/enemies';
import { weaponsPTS } from './pts/weapons';
import { powerArmorPTS } from './pts/armor';

export { nukesDragonsPerks } from './nukesdragons';

export function getPerks(mode: GameMode): Record<string, Perk> {
  return mode === 'live' ? perksLive : perksPTS;
}

export function getEnemies(mode: GameMode): Record<string, Enemy> {
  return mode === 'live' ? enemiesLive : enemiesPTS;
}

export function getEnemyMutations(mode: GameMode): Record<string, EnemyMutation> {
  return mode === 'live' ? enemyMutationsLive : enemyMutationsPTS;
}

export function getLegendaryRankModifiers(mode: GameMode) {
  return mode === 'live' ? legendaryRankModifiersLive : legendaryRankModifiersPTS;
}

export function getWeapons(mode: GameMode): Record<string, Weapon> {
  return mode === 'live' ? weaponsLive : weaponsPTS;
}

export function getPowerArmor(mode: GameMode) {
  return mode === 'live' ? powerArmorLive : powerArmorPTS;
}

export function getPerkById(mode: GameMode, perkId: string): Perk | undefined {
  return getPerks(mode)[perkId];
}

export function getEnemyById(mode: GameMode, enemyId: string): Enemy | undefined {
  return getEnemies(mode)[enemyId];
}

export function getEnemyOptions(mode: GameMode): Array<{ value: string; label: string }> {
  return Object.values(getEnemies(mode)).map((e) => ({ value: e.id, label: e.name }));
}

export function getMutationOptions(mode: GameMode): Array<{ value: string; label: string }> {
  return Object.values(getEnemyMutations(mode)).map((m) => ({ value: m.id, label: m.name }));
}

export function getWeaponOptions(mode: GameMode): Array<{ value: string; label: string }> {
  return Object.values(getWeapons(mode)).map((w) => ({ value: w.id, label: w.name }));
}

export function getPowerArmorOptions(mode: GameMode): Array<{ value: string; label: string }> {
  return Object.values(getPowerArmor(mode)).map((pa) => ({ value: pa.id, label: pa.name }));
}
