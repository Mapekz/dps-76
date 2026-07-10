import type { Weapon } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';
import { foldOps } from './resolve';

/**
 * Applies equipped OMODs to a weapon before the engine runs:
 * - keyword ADDs merge into weapon.keywords (WeaponTypeAutomatic, HasSilencer, …
 *   drive perk conditions and the automatic/semi fire-rate path)
 * - fireRateSpeed / isAutomatic buckets rewrite the weapon's speed/auto state
 *   (auto receivers SET Speed 0.8248 — the old hardcoded "physical" multiplier)
 * - remaining modifiers (dbm, critDmgBase, sneakBase, …) feed the resolver
 */
export interface EffectiveWeapon {
  weapon: Weapon;
  modifiers: Modifier[];
}

// Weapon-stat OMODs carry no runtime conditions, so their raw values fold
// through the shared foldOps primitive (same SET/MUL_ADD/ADD rule as foldBucket).
function foldWeaponStat(modifiers: Modifier[], bucket: string, base: number): number {
  const entries = modifiers
    .filter(m => m.bucket === bucket)
    .map(m => ({ op: m.op, value: m.curve ? m.curveScale : m.value }));
  return foldOps(entries, base);
}

export function buildEffectiveWeapon(weapon: Weapon, equippedOmods: GeneratedOmod[]): EffectiveWeapon {
  if (equippedOmods.length === 0) return { weapon, modifiers: [] };

  const allOmodModifiers = equippedOmods.flatMap(o => o.modifiers);
  const weaponStatBuckets = new Set(['fireRateSpeed', 'isAutomatic', 'projectileCount', 'ammoCapacity', 'reloadSpeed']);

  const keywords = [...new Set([...(weapon.keywords ?? []), ...equippedOmods.flatMap(o => o.addedKeywords)])];
  const speed = foldWeaponStat(allOmodModifiers, 'fireRateSpeed', weapon.speed ?? 1.0);
  const isAutomatic =
    foldWeaponStat(allOmodModifiers, 'isAutomatic', weapon.isAutomatic ? 1 : 0) > 0 ||
    keywords.includes('WeaponTypeAutomatic');
  const projectileCount = foldWeaponStat(allOmodModifiers, 'projectileCount', weapon.projectileCount ?? 1);
  const capacity = foldWeaponStat(allOmodModifiers, 'ammoCapacity', weapon.capacity ?? 0);
  const reloadSpeed = foldWeaponStat(allOmodModifiers, 'reloadSpeed', weapon.reloadSpeed ?? 1.0);

  return {
    weapon: { ...weapon, keywords, speed, isAutomatic, projectileCount, capacity, reloadSpeed },
    modifiers: allOmodModifiers.filter(m => !weaponStatBuckets.has(m.bucket)),
  };
}
