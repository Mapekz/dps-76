import type { Weapon, WeaponComponent } from '@/types';
import type { GeneratedWeapon, GeneratedDamageType } from '@/types/generated';
import { hiddenWeaponIds, weaponCorrections } from '../overrides/corrections';
import generatedWeapons from './generated/weapons.json';

/**
 * Live weapons — adapted from ESM-extracted data (src/data/live/generated/,
 * produced by `pnpm extract`), with hand-maintained overrides from
 * src/data/overrides/corrections.ts layered on top.
 */

const DAMAGE_TYPE_MAP: Record<GeneratedDamageType, WeaponComponent['damageType']> = {
  ballistic: 'ballistic',
  energy: 'energy',
  fire: 'fire',
  cryo: 'cryo',
  poison: 'poison',
  radiation: 'radiation',
  // No dedicated bucket yet — treat as ballistic until one exists.
  unknown: 'ballistic',
};

function classifyWeaponClass(gw: GeneratedWeapon): Weapon['weaponClass'] {
  const kw = new Set(gw.keywords);
  if (kw.has('WeaponTypeHeavyGun')) return 'heavy';
  if (kw.has('WeaponTypeShotgun')) return 'shotgun';
  if (kw.has('WeaponTypePistol')) return 'pistol';
  if (kw.has('WeaponTypeBow') || kw.has('WeaponTypeCrossbow')) return 'bow';
  if (kw.has('WeaponTypeThrown') || gw.weaponTypeName === 'Grenade') return 'thrown';
  if (kw.has('WeaponTypeUnarmed') || gw.weaponTypeName === 'HandToHandMelee') return 'unarmed';
  if (kw.has('WeaponTypeRifle')) return 'rifle';
  if (gw.weaponTypeName === 'OneHandSword' || gw.weaponTypeName === 'TwoHandSword' || kw.has('WeaponTypeMeleeGeneral')) {
    return 'melee';
  }
  // Remaining guns without a class keyword (e.g. some uniques) — treat as rifle.
  return 'rifle';
}

function adaptWeapon(gw: GeneratedWeapon): Weapon {
  const levelCap = gw.eligibleLevels.length > 0 ? Math.min(50, Math.max(...gw.eligibleLevels)) : 50;
  const components: WeaponComponent[] = gw.components.map(c => ({
    damageType: DAMAGE_TYPE_MAP[c.damageType],
    tier: c.tier ?? -1,
    levelCap,
    curvePoints: c.curve ?? undefined,
  }));
  // Legacy single-type routing field; the ballistic component (when present)
  // is always first, so this is phys for mixed weapons, elemental for pure.
  const primary = components[0]?.damageType ?? 'ballistic';

  return {
    id: gw.id,
    name: gw.name,
    components,
    damageType: primary,
    weaponClass: classifyWeaponClass(gw),
    speed: gw.speed,
    isAutomatic: gw.keywords.includes('WeaponTypeAutomatic'),
    isPhysical: components[0]?.damageType === 'ballistic',
    animDelaySec: gw.attackDelaySec > 0 ? gw.attackDelaySec : undefined,
    formId: gw.formId,
    keywords: gw.keywords,
    attachParentSlots: gw.attachParentSlots,
    critDamageMult: gw.critDamageMult,
    critChargeBonus: gw.critChargeBonus,
    sneakAttackMult: gw.sneakAttackMult,
    projectileCount: gw.projectileCount,
    damageBonusMult: gw.damageBonusMult,
    ...weaponCorrections[gw.id],
  };
}

export const weapons: Record<string, Weapon> = Object.fromEntries(
  (generatedWeapons as GeneratedWeapon[])
    .filter(gw => !hiddenWeaponIds.has(gw.id))
    .map(gw => [gw.id, adaptWeapon(gw)])
);
