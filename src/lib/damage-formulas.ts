import type { GameMode, PlayerConfig, EnemyConfig, DamageStats, PerkId, PerkLoadout } from '@/types';
import { getWeapons, getPerks } from '@/data';
import { Stat } from '@/data/stats';
import { getBaseDamage } from '@/lib/curve-tables';
import { getFireRate } from '@/lib/fire-rate';
import { createDefaultDamageStats } from '@/types';

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Calculates damage resistance multiplier using Fallout 76's formula.
 * Formula: DamageResistMult = (IncomingDamage × 0.15 / Resist)^0.365
 * Where:   Resist = BaseResistance × (1 - ArmorPenTotal)
 *
 * Currently dormant for MVP (enemy resist = no-op ×1.0).
 * Re-enabled in the enemy-defenses week; see todos/enemy-defenses.md.
 */
export function calculateDamageResistMult(
  outgoingDamage: number,
  baseResistance: number,
  armorPenPercent: number = 0
): number {
  if (outgoingDamage <= 0) return 0;
  const resist = baseResistance * (1 - armorPenPercent / 100);
  if (resist <= 0) return 1.0;
  return Math.min(1.0, Math.pow((outgoingDamage * 0.15) / resist, 0.365));
}

/**
 * Gets the total value of a stat from all equipped perks (regular + legendary).
 * Pass the combined array: `[...perks, ...legendaryPerks]`.
 */
export function getPerkStatTotal(
  mode: GameMode,
  perkLoadouts: PerkLoadout[],
  statName: Stat
): number {
  const perks = getPerks(mode);
  let total = 0;
  for (const loadout of perkLoadouts) {
    const perk = perks[loadout.perkId as PerkId];
    if (!perk) continue;
    const statMod = perk.statsModified.find(s => s.stat === statName);
    if (statMod) {
      total += statMod.value * loadout.rank;
    }
  }
  return total;
}

// ─── Player → Enemy (outgoing) ──────────────────────────────────────────────

/**
 * Calculates player outgoing DPS using the FO76 damage formula:
 *
 *   Damage/hit = BaseWeaponDamage × (1 + DamageBonusMult) × Multipliers
 *
 * DamageBonusMult (ADDITIVE bucket):
 *   - Weapon-class damage perk bonuses (Gun/Melee/Unarmed/Bow/Thrown)
 *   - Damage-type perk bonuses (Energy, Fire, Cryo, Poison, Rad)
 *   - STR melee modifier: +10% × STR (unarmed) or +5% × STR (melee)
 *   - Enemy-conditional bonuses (crippled, glowing) — zero when enemy is dormant
 *   - Stack-based bonuses (Bullet Storm, Onslaught)
 *   - TODO: Crit bonus (+100% base, VATS only) — see todos/vats-crit.md
 *   - TODO: Sneak bonus (+100% base) — see todos/sneak.md
 *   - TODO: Power-attack bonus — see todos/power-attacks.md
 *
 * Multipliers (MULTIPLICATIVE bucket):
 *   - Outgoing damage multiplier perks (e.g. Taking One for the Team)
 *   - Weakpoint multiplier (configurable, default ×2.0)
 *   - TODO: Power-attack multiplier (×1.5 / ×2.0 in PA)
 *   - TODO: Smart Shot perk
 *
 * Enemy resist: no-op ×1.0 for MVP — see todos/enemy-defenses.md.
 */
export function calculateOutgoingDamage(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode
): DamageStats {
  const { weapon: weaponConfig, perks, legendaryPerks, conditions, itemLevel, weakpointMult } = playerConfig;

  if (!weaponConfig) return createDefaultDamageStats();

  const weapons = getWeapons(mode);
  const weaponData = weapons[weaponConfig.weaponId];
  if (!weaponData) return createDefaultDamageStats();

  // ── Step 1: Base damage from universal curve components ──────────────────
  const clampedLevel = Math.max(1, Math.min(itemLevel, 50));
  const baseDamage = (weaponData.components ?? []).reduce((sum, comp) => {
    const compLevel = Math.min(clampedLevel, comp.levelCap);
    return sum + getBaseDamage(mode, comp.tier, compLevel);
  }, 0);

  if (baseDamage <= 0) return createDefaultDamageStats();

  // ── Step 2: Additive DamageBonusMult (dbm) ───────────────────────────────
  // Combine regular and legendary perks — both contribute to stat totals.
  const allPerks: PerkLoadout[] = [...perks, ...legendaryPerks];
  let dbm = 0;

  const { weaponClass, damageType } = weaponData;

  // Weapon-class damage bonuses
  if (weaponClass === 'melee' || weaponClass === 'unarmed') {
    dbm += getPerkStatTotal(mode, allPerks, Stat.MeleeDamageBonus) / 100;
    if (weaponClass === 'unarmed') {
      dbm += getPerkStatTotal(mode, allPerks, Stat.UnarmedDamageBonus) / 100;
    }
    // STR melee modifier: +10% of total STR for unarmed/gauntlet, +5% for 1h/2h melee
    // STR is flat 15 for MVP; real parsing tracked in todos/special-parsing.md
    const str = conditions.strength;
    dbm += weaponClass === 'unarmed' ? str * 0.10 : str * 0.05;
  } else if (weaponClass === 'bow') {
    dbm += getPerkStatTotal(mode, allPerks, Stat.BowDamageBonus) / 100;
    dbm += getPerkStatTotal(mode, allPerks, Stat.RangedDamageBonus) / 100;
  } else if (weaponClass === 'thrown') {
    dbm += getPerkStatTotal(mode, allPerks, Stat.ThrownWeaponDamageBonus) / 100;
  } else {
    // All guns (rifle, pistol, shotgun, heavy)
    dbm += getPerkStatTotal(mode, allPerks, Stat.GunDamageBonus) / 100;
    dbm += getPerkStatTotal(mode, allPerks, Stat.RangedDamageBonus) / 100;
  }

  // Damage-type bonuses
  if (damageType === 'energy') {
    dbm += getPerkStatTotal(mode, allPerks, Stat.EnergyDamageBonus) / 100;
  } else if (damageType === 'fire') {
    dbm += getPerkStatTotal(mode, allPerks, Stat.FireDamageBonus) / 100;
  } else if (damageType === 'cryo') {
    dbm += getPerkStatTotal(mode, allPerks, Stat.ColdDamageBonus) / 100;
  } else if (damageType === 'poison') {
    dbm += getPerkStatTotal(mode, allPerks, Stat.PoisonDamageBonus) / 100;
  } else if (damageType === 'radiation') {
    dbm += getPerkStatTotal(mode, allPerks, Stat.RadDamageBonus) / 100;
  }

  // Enemy-conditional bonuses — kept as hooks; evaluate to 0 while enemy is dormant.
  // These activate once the enemy column is re-enabled (todos/enemy-defenses.md).
  const { conditions: enemyConditions } = enemyConfig;
  if (enemyConditions.isCrippled) {
    dbm += getPerkStatTotal(mode, allPerks, Stat.DamageToCrippledBonus) / 100;
  }
  if (enemyConditions.isGlowing) {
    dbm += getPerkStatTotal(mode, allPerks, Stat.DamageToGlowingEnemiesBonus) / 100;
  }
  dbm += (getPerkStatTotal(mode, allPerks, Stat.DamagePerCrippledLimb) * enemyConditions.crippledLimbCount) / 100;
  dbm += (getPerkStatTotal(mode, allPerks, Stat.DamagePerStatusEffect) * enemyConditions.statusEffectCount) / 100;

  // Stack-based bonuses
  dbm += (getPerkStatTotal(mode, allPerks, Stat.BulletStormDamagePerStack) * conditions.bulletStormStacks) / 100;
  dbm += (getPerkStatTotal(mode, allPerks, Stat.OnslaughtDamageBonus) * conditions.onslaughtStacks) / 100;

  // TODO (Week 2): VATS crit bonus — additive, +100% base on crit shots
  //   dbm += critDamageBonus + getPerkStatTotal(...CriticalDamageBonus) / 100;
  // TODO (Week 3): Sneak damage bonus — additive, +100% base while sneaking
  //   if (conditions.isSneaking) dbm += sneakBonus + getPerkStatTotal(...SneakDamageBonus) / 100;
  // TODO (Week 4): Power-attack damage bonus
  //   if (conditions.isPowerAttacking) dbm += getPerkStatTotal(...PowerAttackDamageBonus) / 100;

  // ── Step 3: Multiplicative modifiers ─────────────────────────────────────
  let mult = 1.0;

  // Outgoing damage multiplier perks (e.g. Taking One for the Team, Follow Through)
  const outgoingMultBonus = getPerkStatTotal(mode, allPerks, Stat.OutgoingDamageMultiplier);
  if (outgoingMultBonus !== 0) {
    mult *= (1 + outgoingMultBonus / 100);
  }

  // TODO (Week 2+): Smart Shot perk (weakpoint while scoped)
  // TODO (Week 4): Power attack multiplier (×1.5 or ×2.0 in PA)

  // ── Step 4: Per-hit damage (enemy resist = no-op ×1.0 for MVP) ───────────
  const perHitNonWeak = baseDamage * (1 + dbm) * mult;
  const perHitWeak = perHitNonWeak * weakpointMult;

  // ── Step 5: Fire rate (shots/sec — do NOT divide by 60) ──────────────────
  const fr = getFireRate(weaponData);

  return {
    normalPerHit: Math.max(0, perHitNonWeak),
    normalDps:    Math.max(0, perHitNonWeak * fr),
    weakpointPerHit:    Math.max(0, perHitWeak),
    weakpointDps:       Math.max(0, perHitWeak * fr),
    fireRate:           fr,
  };
}

// ─── Enemy → Player (incoming) ──────────────────────────────────────────────
// Kept as dormant scaffolding for MVP — see todos/enemy-defenses.md.

/**
 * Calculates enemy outgoing damage to the player.
 * Dormant for MVP; calculateDamage() returns createDefaultDamageStats() for this direction.
 */
export function calculateIncomingDamage(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode
): DamageStats {
  // Not used in MVP; kept as scaffolding.
  // Enemy resist, body-part mults, and incoming damage perks re-activated in
  // the enemy-defenses week (todos/enemy-defenses.md).
  void playerConfig;
  void enemyConfig;
  void mode;
  return createDefaultDamageStats();
}

// ─── Combined entry point ────────────────────────────────────────────────────

export function calculateDamage(
  playerConfig: PlayerConfig,
  enemyConfig: EnemyConfig,
  mode: GameMode
) {
  return {
    playerToEnemy: calculateOutgoingDamage(playerConfig, enemyConfig, mode),
    // Enemy → Player is dormant for MVP (see todos/enemy-defenses.md)
    enemyToPlayer: createDefaultDamageStats(),
  };
}
