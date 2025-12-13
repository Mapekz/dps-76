import type { GameMode, PlayerConfig, EnemyConfig, DamageStats, PerkLoadout } from '@/types';
import { getEnemyById, getLegendaryRankModifiers, getWeapons, getPerks } from '@/data';

function applyDamageResistance(damage: number, resistance: number): number {
  if (resistance <= 0) return damage;
  const reductionFactor = resistance / (resistance + damage);
  return damage * (1 - reductionFactor);
}

function applyPercentageReduction(damage: number, reductionPercent: number): number {
  return damage * (1 - reductionPercent / 100);
}

function getPerkStatValue(mode: GameMode, perkId: string, rank: number, statName: string): number {
  const perks = getPerks(mode);
  const perk = perks[perkId];
  if (!perk || !perk.statModifiers[statName]) return 0;
  const values = perk.statModifiers[statName];
  const index = Math.min(rank - 1, values.length - 1);
  return values[index] ?? 0;
}

function sumPerkBonuses(mode: GameMode, perks: PerkLoadout[], statName: string): number {
  return perks.reduce((total, perk) => total + getPerkStatValue(mode, perk.perkId, perk.rank, statName), 0);
}

export function calculateIncomingDamage(playerConfig: PlayerConfig, enemyConfig: EnemyConfig, mode: GameMode): DamageStats {
  const enemy = getEnemyById(mode, enemyConfig.enemyId);
  if (!enemy) return { dps: 0, torsoHitDamage: 0, weakpointDamage: 0, vatsCritDamage: 0 };

  const legendaryMods = getLegendaryRankModifiers(mode);
  const rankMod = legendaryMods[enemyConfig.legendaryRank];
  const weapons = getWeapons(mode);
  const enemyWeapon = enemyConfig.weaponId ? weapons[enemyConfig.weaponId] : null;

  const weaponDamage = enemyWeapon?.baseDamage ?? enemy.baseDamage;
  const baseDamage = weaponDamage * rankMod.damageMultiplier;
  const damageType = enemyWeapon?.damageType ?? enemy.damageType;
  const isMelee = damageType === 'melee' || enemy.damageType === 'melee';
  const isEnergy = damageType === 'energy';

  const { perks } = playerConfig;
  const flatDRBonus = sumPerkBonuses(mode, perks, 'damageResist');
  const flatERBonus = sumPerkBonuses(mode, perks, 'energyResist');

  const effectiveDR = flatDRBonus;
  const effectiveER = flatERBonus;
  let resistance = isEnergy ? effectiveER : effectiveDR;

  let damageAfterResist = applyDamageResistance(baseDamage, resistance);

  if (isMelee) {
    const blockerReduction = sumPerkBonuses(mode, perks, 'meleeDamageReduction');
    damageAfterResist = applyPercentageReduction(damageAfterResist, blockerReduction);
  }

  const suppressorReduction = sumPerkBonuses(mode, perks, 'enemyDamageReduction');
  damageAfterResist = applyPercentageReduction(damageAfterResist, suppressorReduction);

  const weakpointMultiplier = 2.0;
  const weakpointDamage = damageAfterResist * weakpointMultiplier;
  const attacksPerSecond = enemyWeapon?.fireRate ? enemyWeapon.fireRate / 60 : 1;
  const dps = damageAfterResist * attacksPerSecond;

  return { dps: Math.max(0, dps), torsoHitDamage: Math.max(0, damageAfterResist), weakpointDamage: Math.max(0, weakpointDamage), vatsCritDamage: 0 };
}

export function calculateOutgoingDamage(_playerConfig: PlayerConfig, _enemyConfig: EnemyConfig, _mode: GameMode): DamageStats {
  return { dps: 0, torsoHitDamage: 0, weakpointDamage: 0, vatsCritDamage: 0 };
}

export function calculateDamage(playerConfig: PlayerConfig, enemyConfig: EnemyConfig, mode: GameMode) {
  return {
    playerToEnemy: calculateOutgoingDamage(playerConfig, enemyConfig, mode),
    enemyToPlayer: calculateIncomingDamage(playerConfig, enemyConfig, mode),
  };
}
