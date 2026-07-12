import type { EnemyConditions, PlayerConditions, Weapon } from '@/types';
import { createDefaultEnemyConditions, createDefaultPlayerConditions } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import type { Bucket, ModOp, Modifier } from '@/types/modifiers';
import { effectiveValue, foldOps, type ResolveContext } from './resolve';

/**
 * Applies equipped OMODs to a weapon before the engine runs:
 * - keyword ADDs merge into weapon.keywords (WeaponTypeAutomatic, HasSilencer, …
 *   drive perk conditions ONLY — WeaponTypeAutomatic is not a fire-rate signal,
 *   see the isAutomatic note below)
 * - fireRateSpeed / isAutomatic / animDurationSec buckets rewrite the weapon's
 *   speed/auto state/animation-cycle length (auto receivers SET Speed 0.8248 —
 *   the old hardcoded "physical" multiplier; isAutomatic reflects the real
 *   WEAP Data.Flags "Automatic" bit + OMOD `IsAutomatic` property, never a
 *   keyword — some OMODs add WeaponTypeAutomatic without the weapon actually
 *   being full-auto, e.g. Combat Shotgun's Automatic Receiver)
 * - remaining modifiers (dbm, critDmgBase, sneakBase, …) feed the resolver
 */
export interface EffectiveWeapon {
  weapon: Weapon;
  modifiers: Modifier[];
}

// Weapon-stat OMODs are USUALLY unconditional (receiver stats apply for as
// long as the mod is equipped), but Thrill-Seeker's (Stage C3) proves a
// conditioned case: its fireRateSpeed/reloadSpeed tiers gate on an exact
// killStreakCount, so this fold must evaluate conditions like foldBucket
// does — hence sharing `effectiveValue` (condition scale + curve/plain value)
// rather than reading `m.value`/`m.curve` directly. `ctx` supplies whatever
// player/enemy state those conditions read (itemLevel curves — level-scaled
// Speed on heated melee mods — read `ctx.itemLevel`).
function foldWeaponStat(modifiers: Modifier[], bucket: Bucket, base: number, ctx: ResolveContext): number {
  const entries: Array<{ op: ModOp; value: number }> = [];
  for (const m of modifiers) {
    if (m.bucket !== bucket) continue;
    const value = effectiveValue(m, ctx);
    if (value !== null) entries.push({ op: m.op, value });
  }
  return foldOps(entries, base);
}

export function buildEffectiveWeapon(
  weapon: Weapon,
  equippedOmods: GeneratedOmod[],
  itemLevel = 50,
  player: PlayerConditions = createDefaultPlayerConditions(),
  enemy: EnemyConditions = createDefaultEnemyConditions()
): EffectiveWeapon {
  if (equippedOmods.length === 0) return { weapon, modifiers: [] };

  const allOmodModifiers = equippedOmods.flatMap(o => o.modifiers);
  const weaponStatBuckets = new Set([
    'fireRateSpeed', 'isAutomatic', 'animDurationSec', 'projectileCount', 'ammoCapacity', 'reloadSpeed', 'vatsApCost',
  ]);

  const keywords = [...new Set([...(weapon.keywords ?? []), ...equippedOmods.flatMap(o => o.addedKeywords)])];
  // A neutral scenario (no VATS/sneak/crit/power-attack flags): weapon-stat
  // conditions seen so far (killStreakCount) are scenario-independent, and
  // this fold runs once per resolveLoadout call, before scenario branching.
  const ctx: ResolveContext = {
    weapon: { ...weapon, keywords },
    player,
    enemy,
    scenario: { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false },
    itemLevel,
  };
  const speed = foldWeaponStat(allOmodModifiers, 'fireRateSpeed', weapon.speed ?? 1.0, ctx);
  // NOTE (2026-07-13, user-confirmed): `WeaponTypeAutomatic` is a perk-condition
  // keyword only, not a real fire-mode signal — some OMODs add it without the
  // weapon actually firing full-auto (Combat Shotgun's Automatic Receiver sets
  // `HasRepeatableSingleFire`, not `IsAutomatic`). The `isAutomatic` bucket
  // (folded from the base weapon's real WEAP Data.Flags "Automatic" bit, SET
  // by OMODs that carry an explicit `IsAutomatic` property) is the only
  // correct signal — do not OR in a keyword check here.
  const isAutomatic = foldWeaponStat(allOmodModifiers, 'isAutomatic', weapon.isAutomatic ? 1 : 0, ctx) > 0;
  const animDurationSec = foldWeaponStat(allOmodModifiers, 'animDurationSec', weapon.animDurationSec ?? 0.11, ctx);
  // NOTE: projectileCount folds into the effective weapon but NO damage term
  // consumes it yet — per-projectile/pellet modeling is deferred (with the
  // DoT engine work). Two Shot's damage today is only its extracted dbm.
  const projectileCount = foldWeaponStat(allOmodModifiers, 'projectileCount', weapon.projectileCount ?? 1, ctx);
  const capacity = foldWeaponStat(allOmodModifiers, 'ammoCapacity', weapon.capacity ?? 0, ctx);
  const reloadSpeed = foldWeaponStat(allOmodModifiers, 'reloadSpeed', weapon.reloadSpeed ?? 1.0, ctx);
  // V.A.T.S. Optimized (Stage B): MUL_ADD −0.35 on the weapon's per-shot VATS
  // AP cost, same fold pattern as ammoCapacity/reloadSpeed above.
  const apCost = foldWeaponStat(allOmodModifiers, 'vatsApCost', weapon.apCost ?? 0, ctx);

  return {
    weapon: { ...weapon, keywords, speed, isAutomatic, animDurationSec, projectileCount, capacity, reloadSpeed, apCost },
    modifiers: allOmodModifiers.filter(m => !weaponStatBuckets.has(m.bucket)),
  };
}
