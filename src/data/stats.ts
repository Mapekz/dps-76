// Stats that can be modified by perks, armor, mutations, etc.
export const Stat = {
  BodyPartDamageMultiplier: 'BodyPartDamageMultiplier',
  DamageResist: 'DamageResist',
  EnergyResist: 'EnergyResist',
  ColdResist: 'ColdResist',
  FireResist: 'FireResist',
  PoisonResist: 'PoisonResist',
  RadResist: 'RadResist',
  ArmorPenetration: 'ArmorPenetration',
  LimbDamageReduction: 'LimbDamageReduction',
  IncomingDamageMultiplier: 'IncomingDamageMultiplier',
  OutgoingDamageMultiplier: 'OutgoingDamageMultiplier',
  IncomingExplosionDamageMultiplier: 'IncomingExplosionDamageMultiplier',
  OutgoingExplosionDamageMultiplier: 'OutgoingExplosionDamageMultiplier',
  IncomingEnergySpellDamageMultiplier: 'IncomingEnergySpellDamageMultiplier',
  IncomingColdSpellDamageMultiplier: 'IncomingColdSpellDamageMultiplier',
  IncomingFireSpellDamageMultiplier: 'IncomingFireSpellDamageMultiplier',
  IncomingPoisonSpellDamageMultiplier: 'IncomingPoisonSpellDamageMultiplier',
  IncomingRadSpellDamageMultiplier: 'IncomingRadSpellDamageMultiplier',
  EvadeChance: 'EvadeChance',
  DeflectChance: 'DeflectChance',
  DeflectDamageMultiplier: 'DeflectDamageMultiplier',
  DamageBonusMultiplier: 'DamageBonusMultiplier',
  CriticalDamageBonus: 'CriticalDamageBonus',
  LimbDamageBonus: 'LimbDamageBonus',
  MeleeLimbDamageBonus: 'MeleeLimbDamageBonus',
  SneakDamageBonus: 'SneakDamageBonus',
  PowerAttackDamageBonus: 'PowerAttackDamageBonus',
  BashDamageBonus: 'BashDamageBonus',
  MeleeDamageBonus: 'MeleeDamageBonus',
  EnergyDamageBonus: 'EnergyDamageBonus',
  ColdDamageBonus: 'ColdDamageBonus',
  FireDamageBonus: 'FireDamageBonus',
  PoisonDamageBonus: 'PoisonDamageBonus',
  RadDamageBonus: 'RadDamageBonus',

  // Conditional damage bonuses
  DamageToCrippledBonus: 'DamageToCrippledBonus',
  DamagePerCrippledLimb: 'DamagePerCrippledLimb',
  DamagePerStatusEffect: 'DamagePerStatusEffect',
  DamageToGlowingEnemiesBonus: 'DamageToGlowingEnemiesBonus',

  // Stacking mechanic stats
  BulletStormDamagePerStack: 'BulletStormDamagePerStack',
  OnslaughtDamageBonus: 'OnslaughtDamageBonus',
  OnslaughtWeakspotPerStack: 'OnslaughtWeakspotPerStack',
  BulletStormBashPerStack: 'BulletStormBashPerStack',

  // Weapon category stats
  UnarmedDamageBonus: 'UnarmedDamageBonus',
  BowDamageBonus: 'BowDamageBonus',
  GunDamageBonus: 'GunDamageBonus',
  RangedDamageBonus: 'RangedDamageBonus',
  ThrownWeaponDamageBonus: 'ThrownWeaponDamageBonus',

  // Weakspot/limb/torso stats
  WeakspotDamageBonus: 'WeakspotDamageBonus',
  TorsoDamageBonus: 'TorsoDamageBonus',

  // Enemy armor stats
  ArmorPenetrationVsInsects: 'ArmorPenetrationVsInsects',
} as const;

export type Stat = (typeof Stat)[keyof typeof Stat];

export const StatDisplayNames: Record<Stat, string> = {
  [Stat.BodyPartDamageMultiplier]: 'Body Part Damage Multiplier',
  [Stat.DamageResist]: 'Damage Resist',
  [Stat.EnergyResist]: 'Energy Resist',
  [Stat.ColdResist]: 'Cold Resist',
  [Stat.FireResist]: 'Fire Resist',
  [Stat.PoisonResist]: 'Poison Resist',
  [Stat.RadResist]: 'Rad Resist',
  [Stat.ArmorPenetration]: 'Armor Penetration',
  [Stat.LimbDamageReduction]: 'Limb Damage Reduction',
  [Stat.IncomingDamageMultiplier]: 'Incoming Damage Multiplier',
  [Stat.OutgoingDamageMultiplier]: 'Outgoing Damage Multiplier',
  [Stat.IncomingExplosionDamageMultiplier]: 'Incoming Explosion Damage Multiplier',
  [Stat.OutgoingExplosionDamageMultiplier]: 'Outgoing Explosion Damage Multiplier',
  [Stat.IncomingEnergySpellDamageMultiplier]: 'Incoming Energy Spell Damage Multiplier',
  [Stat.IncomingColdSpellDamageMultiplier]: 'Incoming Cold Spell Damage Multiplier',
  [Stat.IncomingFireSpellDamageMultiplier]: 'Incoming Fire Spell Damage Multiplier',
  [Stat.IncomingPoisonSpellDamageMultiplier]: 'Incoming Poison Spell Damage Multiplier',
  [Stat.IncomingRadSpellDamageMultiplier]: 'Incoming Rad Spell Damage Multiplier',
  [Stat.EvadeChance]: 'Evade Chance',
  [Stat.DeflectChance]: 'Deflect Chance',
  [Stat.DeflectDamageMultiplier]: 'Deflect Damage Multiplier',
  [Stat.DamageBonusMultiplier]: 'Damage Bonus Multiplier',
  [Stat.CriticalDamageBonus]: 'Critical Damage Bonus',
  [Stat.LimbDamageBonus]: 'Limb Damage Bonus',
  [Stat.MeleeLimbDamageBonus]: 'Melee Limb Damage Bonus',
  [Stat.SneakDamageBonus]: 'Sneak Damage Bonus',
  [Stat.PowerAttackDamageBonus]: 'Power Attack Damage Bonus',
  [Stat.BashDamageBonus]: 'Bash Damage Bonus',
  [Stat.MeleeDamageBonus]: 'Melee Damage Bonus',
  [Stat.EnergyDamageBonus]: 'Energy Damage Bonus',
  [Stat.ColdDamageBonus]: 'Cold Damage Bonus',
  [Stat.FireDamageBonus]: 'Fire Damage Bonus',
  [Stat.PoisonDamageBonus]: 'Poison Damage Bonus',
  [Stat.RadDamageBonus]: 'Rad Damage Bonus',

  // Conditional damage bonuses
  [Stat.DamageToCrippledBonus]: 'Damage to Crippled Bonus',
  [Stat.DamagePerCrippledLimb]: 'Damage per Crippled Limb',
  [Stat.DamagePerStatusEffect]: 'Damage per Status Effect',
  [Stat.DamageToGlowingEnemiesBonus]: 'Damage to Glowing Enemies',

  // Stacking mechanic stats
  [Stat.BulletStormDamagePerStack]: 'Bullet Storm Damage per Stack',
  [Stat.OnslaughtDamageBonus]: 'Onslaught Damage Bonus',
  [Stat.OnslaughtWeakspotPerStack]: 'Onslaught Weakspot per Stack',
  [Stat.BulletStormBashPerStack]: 'Bullet Storm Bash per Stack',

  // Weapon category stats
  [Stat.UnarmedDamageBonus]: 'Unarmed Damage Bonus',
  [Stat.BowDamageBonus]: 'Bow Damage Bonus',
  [Stat.GunDamageBonus]: 'Gun Damage Bonus',
  [Stat.RangedDamageBonus]: 'Ranged Damage Bonus',
  [Stat.ThrownWeaponDamageBonus]: 'Thrown Weapon Damage Bonus',

  // Weakspot/limb/torso stats
  [Stat.WeakspotDamageBonus]: 'Weakspot Damage Bonus',
  [Stat.TorsoDamageBonus]: 'Torso Damage Bonus',

  // Enemy armor stats
  [Stat.ArmorPenetrationVsInsects]: 'Armor Penetration vs Insects',
};

export const StatDefaultValues: Record<Stat, number> = {
  [Stat.BodyPartDamageMultiplier]: 1.0,
  [Stat.DamageResist]: 0.0,
  [Stat.EnergyResist]: 0.0,
  [Stat.ColdResist]: 0.0,
  [Stat.FireResist]: 0.0,
  [Stat.PoisonResist]: 0.0,
  [Stat.RadResist]: 0.0,
  [Stat.ArmorPenetration]: 0.0,
  [Stat.LimbDamageReduction]: 0.0,
  [Stat.IncomingDamageMultiplier]: 1.0,
  [Stat.OutgoingDamageMultiplier]: 1.0,
  [Stat.IncomingExplosionDamageMultiplier]: 1.0,
  [Stat.OutgoingExplosionDamageMultiplier]: 1.0,
  [Stat.IncomingEnergySpellDamageMultiplier]: 1.0,
  [Stat.IncomingColdSpellDamageMultiplier]: 1.0,
  [Stat.IncomingFireSpellDamageMultiplier]: 1.0,
  [Stat.IncomingPoisonSpellDamageMultiplier]: 1.0,
  [Stat.IncomingRadSpellDamageMultiplier]: 1.0,
  [Stat.EvadeChance]: 0.0,
  [Stat.DeflectChance]: 0.0,
  [Stat.DeflectDamageMultiplier]: 1.0,
  [Stat.DamageBonusMultiplier]: 1.0,
  [Stat.CriticalDamageBonus]: 0.0,
  [Stat.LimbDamageBonus]: 0.0,
  [Stat.MeleeLimbDamageBonus]: 0.0,
  [Stat.SneakDamageBonus]: 0.0,
  [Stat.PowerAttackDamageBonus]: 0.0,
  [Stat.BashDamageBonus]: 0.0,
  [Stat.MeleeDamageBonus]: 0.0,
  [Stat.EnergyDamageBonus]: 0.0,
  [Stat.ColdDamageBonus]: 0.0,
  [Stat.FireDamageBonus]: 0.0,
  [Stat.PoisonDamageBonus]: 0.0,
  [Stat.RadDamageBonus]: 0.0,

  // Conditional damage bonuses
  [Stat.DamageToCrippledBonus]: 0.0,
  [Stat.DamagePerCrippledLimb]: 0.0,
  [Stat.DamagePerStatusEffect]: 0.0,
  [Stat.DamageToGlowingEnemiesBonus]: 0.0,

  // Stacking mechanic stats
  [Stat.BulletStormDamagePerStack]: 0.0,
  [Stat.OnslaughtDamageBonus]: 0.0,
  [Stat.OnslaughtWeakspotPerStack]: 0.0,
  [Stat.BulletStormBashPerStack]: 0.0,

  // Weapon category stats
  [Stat.UnarmedDamageBonus]: 0.0,
  [Stat.BowDamageBonus]: 0.0,
  [Stat.GunDamageBonus]: 0.0,
  [Stat.RangedDamageBonus]: 0.0,
  [Stat.ThrownWeaponDamageBonus]: 0.0,

  // Weakspot/limb/torso stats
  [Stat.WeakspotDamageBonus]: 0.0,
  [Stat.TorsoDamageBonus]: 0.0,

  // Enemy armor stats
  [Stat.ArmorPenetrationVsInsects]: 0.0,
};

export interface StatModification {
  stat: Stat;
  value: number;
}
