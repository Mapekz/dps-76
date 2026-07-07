/**
 * Shapes of the ESM-extracted data files in src/data/<mode>/generated/.
 * Produced by scripts/extract/; consumed by the src/data adapters.
 * Every entry carries its source formId + editor_id so the overrides layer
 * (src/data/overrides/) can target it.
 */

export interface CurvePoint {
  x: number;
  y: number;
}

export type GeneratedDamageType =
  | 'ballistic'
  | 'energy'
  | 'fire'
  | 'cryo'
  | 'poison'
  | 'radiation'
  | 'unknown';

export interface GeneratedDamageComponent {
  damageType: GeneratedDamageType;
  /** Source damage-type record edid (e.g. "dtEnergy"); null for the base physical component. */
  damageTypeEdid: string | null;
  /** Flat amount from the record (display/debug; the curve is authoritative when present). */
  amount: number;
  /** Universal curve tier parsed from curve_path (e.g. 24), null for non-tier curves. */
  tier: number | null;
  /** Inline damage-by-level curve points from the ESM (authoritative). */
  curve: CurvePoint[] | null;
}

export interface GeneratedWeapon {
  /** Stable id = ESM editor_id. */
  id: string;
  formId: string;
  name: string;
  /** Raw "Weapon Type" name from WEAP Data (e.g. "Gun", "Two Hand Axe"). */
  weaponTypeName: string;
  /** Resolved keyword editor_ids (WeaponTypeRifle, WeaponTypeAutomatic, ...). */
  keywords: string[];
  components: GeneratedDamageComponent[];

  // Crit / sneak
  critDamageMult: number;
  critChargeBonus: number;
  sneakAttackMult: number;

  // Fire-rate & handling (approximate until animation-derived timing lands)
  speed: number;
  attackDelaySec: number;
  animationAttackSec: number;
  animationFireSec: number;
  reloadSpeed: number;
  capacity: number;
  ammoPerShot: number;
  actionPointCost: number;
  projectileCount: number;
  reach: number;
  /** Bash / secondary damage. */
  secondaryDamage: number;
  /** RGW3 Damage Bonus Multiplier (baseline 1.0). */
  damageBonusMult: number;

  eligibleLevels: number[];
  /** OMOD formids from the default Object Template combination (phase 5). */
  templateModFormIds: string[];
  /** Attach point slot formids (phase 5: which mod slots exist). */
  attachParentSlots: string[];
}

import type { Modifier } from './modifiers';

export interface GeneratedPerkRank {
  rank: number;
  modifiers: Modifier[];
}

export interface GeneratedPerk {
  /** Family key = ESM editor_id minus the rank suffix (Commando01..03 → "Commando"). */
  family: string;
  /** Display name from the rank-1 record (post-overhaul card name, e.g. "Center Masochist"). */
  name: string;
  /** Rank-record formids in rank order. */
  formIds: string[];
  maxRank: number;
  /** Per-rank card descriptions (index = rank − 1). */
  descriptions: string[];
  /** Effective modifiers when owning rank N (index by rank − 1 via ranks[i].modifiers). */
  ranks: GeneratedPerkRank[];
  /** Rank-1 record has an SWF sprite (a proper perk card). Some real perks lack it (Nerd Rage!). */
  hasCard: boolean;
  /** Extraction caveats for this perk (unresolved conditions, script magnitudes, timed buffs). */
  notes: string[];
}

export interface GeneratedOmod {
  /** ESM editor_id (e.g. mod_CombatRifle_Receiver_Damage-Auto). */
  id: string;
  formId: string;
  name: string;
  description: string;
  /** Slot this mod occupies; a weapon accepts it when the formid ∈ weapon.attachParentSlots. */
  attachPointFormId: string;
  /** Resolved slot edid (e.g. ap_gun_Receiver) — used for UI slot grouping. */
  attachPointEdid: string;
  /** Weapon-family gate (edids, usually ma_*): every entry must be in weapon.keywords. */
  targetKeywords: string[];
  /** Damage-relevant properties from the flattened include chain. */
  modifiers: Modifier[];
  /** Keywords the mod ADDs to the weapon (WeaponTypeAutomatic, HasSilencer, ...). */
  addedKeywords: string[];
  /** Mod carries an Enchantments property (legendary-effect chain — phase 7). */
  hasEnchantments: boolean;
}

export interface GeneratedBuff {
  /** ESM editor_id (SPEL for mutations, ALCH for consumables). */
  id: string;
  formId: string;
  name: string;
  kind: 'mutation' | 'consumable';
  modifiers: Modifier[];
  /** Extraction caveats (script magnitudes, timed buffs — override candidates). */
  notes: string[];
}

export interface GeneratedMeta {
  esmPath: string;
  esmDate: string | null;
  mode: string;
  extractedAt: string;
  counts: Record<string, number>;
  /** Records excluded by the playable filter, grouped by reason (for iteration). */
  excluded: Record<string, string[]>;
  /** Things the normalizer could not resolve — review after each run. */
  unresolved: string[];
}
