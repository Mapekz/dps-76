import type { Weapon } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';

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

// Same semantics as resolve.ts foldBucket: (last SET ?? base) + ΣMUL_ADD×base + ΣADD
// (MUL_ADD reads the ORIGINAL base even when a SET replaced it — user-confirmed).
function foldWeaponStat(modifiers: Modifier[], bucket: string, base: number): number {
  let setValue: number | null = null;
  let mulAdd = 0;
  let add = 0;
  for (const m of modifiers) {
    if (m.bucket !== bucket) continue;
    if (m.op === 'SET') setValue = m.value;
    else if (m.op === 'MUL_ADD') mulAdd += m.value;
    else add += m.value;
  }
  return (setValue ?? base) + mulAdd * base + add;
}

export function buildEffectiveWeapon(weapon: Weapon, equippedOmods: GeneratedOmod[]): EffectiveWeapon {
  if (equippedOmods.length === 0) return { weapon, modifiers: [] };

  const allOmodModifiers = equippedOmods.flatMap(o => o.modifiers);
  const weaponStatBuckets = new Set(['fireRateSpeed', 'isAutomatic']);

  const keywords = [...new Set([...(weapon.keywords ?? []), ...equippedOmods.flatMap(o => o.addedKeywords)])];
  const speed = foldWeaponStat(allOmodModifiers, 'fireRateSpeed', weapon.speed ?? 1.0);
  const isAutomatic =
    foldWeaponStat(allOmodModifiers, 'isAutomatic', weapon.isAutomatic ? 1 : 0) > 0 ||
    keywords.includes('WeaponTypeAutomatic');
  const projectileCount = foldWeaponStat(allOmodModifiers, 'projectileCount', weapon.projectileCount ?? 1);

  return {
    weapon: { ...weapon, keywords, speed, isAutomatic, projectileCount },
    modifiers: allOmodModifiers.filter(m => !weaponStatBuckets.has(m.bucket) && m.bucket !== 'projectileCount'),
  };
}
