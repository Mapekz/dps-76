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
  /**
   * WEAP Data.Flags "Automatic" bit — the real fire-mode signal (2026-07-13,
   * user-confirmed). `WeaponTypeAutomatic` is a perk-condition keyword only
   * and must NOT be used to derive fire rate; some OMODs add it without
   * making the weapon truly automatic (e.g. Combat Shotgun's Automatic
   * Receiver, which sets `HasRepeatableSingleFire`, not `IsAutomatic`).
   */
  isAutomaticFlag: boolean;

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
  /** RGW3 Animation Reload Seconds (optional: absent from pre-reload extractions). */
  animationReloadSec?: number;
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
  /** OMOD formids flattened from ALL Object Template combinations (phase 5). */
  templateModFormIds: string[];
  /**
   * OMOD formids from the Default=True Object Template combination (or the
   * sole combination when only one exists — unique weapons leave the flag
   * unset) — the weapon's real in-game standard parts. Empty when no
   * combination qualifies (logged to unresolved).
   */
  defaultModFormIds: string[];
  /** Attach point slot formids (phase 5: which mod slots exist). */
  attachParentSlots: string[];
  /**
   * False when reverse-reference derivation (scripts/extract/obtainability.ts)
   * found no player-reachable source. Kept in the data for review/rescue —
   * the app hides it unless corrections.ts force-visibles it. Absent = true
   * (pre-derivation extractions).
   */
  obtainable?: boolean;
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
  /** See GeneratedWeapon.obtainable — false = no player-reachable reference found. */
  obtainable?: boolean;
  /** Extraction caveats for this record (unrouted AVs, unmodeled curves) — powers UI badges. */
  notes?: string[];
}

/** Consumable classification from ALCH ObjectType* / DrinkTypeAlcohol keywords. */
export type BuffCategory = 'chem' | 'alcohol' | 'drink' | 'food';

/** The addiction SPEL an ALCH record's "Effect Data"."Addiction" field points at. */
export interface GeneratedAddictionRef {
  /** Addiction SPEL editor_id (e.g. "AbAddictionBuffout") — stable, data-driven id. */
  id: string;
  formId: string;
  /** SPEL "Name" field (e.g. "Buffout Addiction"). */
  name: string;
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
  /** Consumable-only: chem/alcohol/drink/food (priority chem > alcohol > drink > food). */
  category?: BuffCategory;
  /**
   * Consumable-only: one key per dispel-flagged effect — the MGEF's resolved KYWD
   * edids, sorted and joined with '|'. Two buffs carry the same bonus iff they share
   * a key (exact keyword-set equality; any-keyword intersection is wrong because all
   * foods share broad keywords like FoodEffect). See src/lib/consumable-rules.ts.
   */
  dispelKeys?: string[];
  /** Consumable-only: the addiction this item causes (and suppresses while active). */
  addiction?: GeneratedAddictionRef;
  /** See GeneratedWeapon.obtainable — false = no player-reachable reference found. */
  obtainable?: boolean;
  /**
   * Consumable-only: resolved IngredientType* / MealType* KYWD edids — captured for
   * the deferred Carnivore/Herbivore food-scaling follow-up (no consumer yet).
   */
  ingredientKeywords?: string[];
}

/** One entry of the mode-wide addiction catalog (addictions.json). */
export interface GeneratedAddiction {
  id: string;
  formId: string;
  name: string;
  /** consumables.json ids whose activation suppresses this addiction. */
  causedBy: string[];
}

export interface GeneratedBodyPart {
  /** BPTD "Part Name" (e.g. "Head", "Belly", "Combat Inhibitor"). */
  name: string;
  /** BPTD Part Type name (Head1, Torso, LeftArm1, Brain, ...). */
  partType: string;
  /** BPTD Data."Damage Mult" — the engine's body-part damage multiplier for hits on this part. */
  dmgMult: number;
  /** Part carries the "On Cripple" or "Explodable" flag — counts toward crippled-limb effects. */
  crippable: boolean;
}

/** Target-picker grouping for a curated body-part entry. */
export type BodyPartRaceCategory = 'standard' | 'raid' | 'infestation' | 'headhunt';

export interface GeneratedBodyPartRace {
  /**
   * Stable id — the curated editor_id: a RACE edid for standard entries
   * ("HumanRace"), an NPC_ edid for boss entries ("RD01_Enc01_GuardianBot",
   * unique per boss even when several share a RACE). Persisted as
   * EnemyConditions.targetRace, so existing ids must not change.
   */
  id: string;
  /** formId of the RACE record whose BPTD was used (for NPC_ entries, the resolved race). */
  formId: string;
  /** Curated display label (RACE names collide — three "Human" races). */
  name: string;
  /** BPTD record the parts came from. */
  bodyPartDataFormId: string;
  parts: GeneratedBodyPart[];
  category: BodyPartRaceCategory;
}

export interface ExcludedRecordDetail {
  id: string;
  name?: string;
  /** Obtainability evidence from scripts/extract/obtainability.ts. */
  signals?: string[];
}

export interface GeneratedMeta {
  esmPath: string;
  esmDate: string | null;
  mode: string;
  extractedAt: string;
  counts: Record<string, number>;
  /** Records excluded by the playable filter, grouped by reason (for iteration). */
  excluded: Record<string, string[]>;
  /**
   * Named records excluded or marked unobtainable, with evidence — the
   * post-extraction review artifact. Rescue false negatives via
   * src/data/overrides/corrections.ts (forceVisible*Ids).
   */
  excludedDetailed?: Record<string, ExcludedRecordDetail[]>;
  /** Things the normalizer could not resolve — review after each run. */
  unresolved: string[];
}
