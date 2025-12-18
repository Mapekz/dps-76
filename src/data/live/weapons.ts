import type { Weapon } from '@/types';

export const weapons: Record<string, Weapon> = {
  unarmed_melee: { id: 'unarmed_melee', name: 'Unarmed (Melee)', baseDamage: 50, fireRate: 1.0, accuracy: 100, range: 5, damageType: 'ballistic', weaponClass: 'unarmed' },
  claws: { id: 'claws', name: 'Claws', baseDamage: 100, fireRate: 1.5, accuracy: 100, range: 5, damageType: 'ballistic', weaponClass: 'unarmed' },
  hunting_rifle: { id: 'hunting_rifle', name: 'Hunting Rifle', baseDamage: 75, fireRate: 3.0, accuracy: 85, range: 200, damageType: 'ballistic', weaponClass: 'rifle' },
  pipe_pistol: { id: 'pipe_pistol', name: 'Pipe Pistol', baseDamage: 30, fireRate: 5.0, accuracy: 70, range: 100, damageType: 'ballistic', weaponClass: 'pistol' },
  laser_rifle: { id: 'laser_rifle', name: 'Laser Rifle', baseDamage: 45, fireRate: 6.0, accuracy: 80, range: 150, damageType: 'energy', weaponClass: 'rifle' },
  minigun: { id: 'minigun', name: 'Minigun', baseDamage: 15, fireRate: 200.0, accuracy: 50, range: 100, damageType: 'ballistic', weaponClass: 'heavy' },
  assaultron_head_laser: { id: 'assaultron_head_laser', name: 'Assaultron Head Laser', baseDamage: 250, fireRate: 0.5, accuracy: 95, range: 300, damageType: 'energy', weaponClass: 'heavy' },
  scorchbeast_sonic: { id: 'scorchbeast_sonic', name: 'Scorchbeast Sonic Attack', baseDamage: 100, fireRate: 1.0, accuracy: 80, range: 50, damageType: 'energy', weaponClass: 'heavy' },
};
