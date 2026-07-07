import type { Weapon } from '@/types';

/**
 * Hand-maintained corrections layered over ESM-generated data.
 * This file survives regeneration (`pnpm extract`) — put anything here that
 * the ESM can't express or gets wrong. Key by generated id (= ESM editor_id).
 *
 * Every entry should carry a source comment (in-game test, wiki, community).
 */

/**
 * Generated weapons to hide from the picker: records that pass the playable
 * filter but aren't obtainable player weapons.
 */
export const hiddenWeaponIds: ReadonlySet<string> = new Set<string>([
  // Placeholder records whose localized name is literally "Default".
  'CharGen_GolfClub_NoName',
  'DoubleBarrelShotgun_WL005',
]);

/**
 * Per-weapon field patches applied after adaptation.
 *
 * Fire-rate note: extracted `attackDelaySec` / automatic-keyword data is
 * approximate until animation-derived timing lands (dps-todos/fire-rate.md).
 * Verified timings belong here.
 */
export const weaponCorrections: Readonly<Record<string, Partial<Weapon>>> = {};
