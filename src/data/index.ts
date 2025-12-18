import type { GameMode, Perk, PerkId, Enemy, EnemyMutation, Weapon } from '@/types';
import { perks as perksLive } from './live/perks';
import { enemies as enemiesLive, enemyMutations as enemyMutationsLive, legendaryRankModifiers as legendaryRankModifiersLive } from './live/enemies';
import { weapons as weaponsLive } from './live/weapons';
import { bodyArmor as bodyArmorLive } from './live/armor';
import { powerArmor as powerArmorLive } from './live/power-armor';
import { perks as perksPTS } from './pts/perks';
import { enemies as enemiesPTS, enemyMutations as enemyMutationsPTS, legendaryRankModifiers as legendaryRankModifiersPTS } from './pts/enemies';
import { weapons as weaponsPTS } from './pts/weapons';
import { bodyArmor as bodyArmorPTS } from './pts/armor';
import { powerArmor as powerArmorPTS } from './pts/power-armor';

export function getPerks(mode: GameMode): Record<PerkId, Perk> {
  return mode === 'pts' ? perksPTS : perksLive;
}

export function getEnemies(mode: GameMode): Record<string, Enemy> {
  return mode === 'pts' ? enemiesPTS : enemiesLive;
}

export function getEnemyMutations(mode: GameMode): Record<string, EnemyMutation> {
  return mode === 'pts' ? enemyMutationsPTS : enemyMutationsLive;
}

export function getLegendaryRankModifiers(mode: GameMode) {
  return mode === 'pts' ? legendaryRankModifiersPTS : legendaryRankModifiersLive;
}

export function getWeapons(mode: GameMode): Record<string, Weapon> {
  return mode === 'pts' ? weaponsPTS : weaponsLive;
}

export function getBodyArmor(mode: GameMode) {
  return mode === 'pts' ? bodyArmorPTS : bodyArmorLive;
}

export function getPowerArmor(mode: GameMode) {
  return mode === 'pts' ? powerArmorPTS : powerArmorLive;
}

export function getPerkById(mode: GameMode, perkId: PerkId): Perk | undefined {
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

export function getBodyArmorOptions(mode: GameMode): Array<{ value: string; label: string }> {
  return Object.values(getBodyArmor(mode)).map((ba) => ({ value: ba.id, label: ba.name }));
}

export function getPowerArmorOptions(mode: GameMode): Array<{ value: string; label: string }> {
  return Object.values(getPowerArmor(mode)).map((pa) => ({ value: pa.id, label: pa.name }));
}
