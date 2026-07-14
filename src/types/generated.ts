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
  /** Physical explosion damage from the projectile's EXPL main curve (launcher payload chase). */
  | 'explosive'
  | 'unknown';

export interface GeneratedDamageComponent {
  damageType: GeneratedDamageType;
  /** Source damage-type record edid (e.g. "dtEnergy"); null for the base physical component. */
  damageTypeEdid: string | null;
  /** Flat amount from the record (authoritative only when no curve exists — token launcher impact damage). */
  amount: number;
  /** Universal curve tier parsed from curve_path (e.g. 24), null for non-tier curves. */
  tier: number | null;
  /** Inline damage-by-level curve points from the ESM (authoritative). */
  curve: CurvePoint[] | null;
  /**
   * Component came from the projectile's EXPL record, not the WEAP
   * (chaseExplosion, extract-weapons.ts). Explosive-scoped dbm modifiers
   * (Demolition Expert) apply to these components regardless of their
   * elemental damageType (Cremator's fire ball, Gamma Gun's radiation
   * burst) — additive in the dbm parenthesis, June 2026 patch semantics.
   */
  fromExplosion?: boolean;
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
   * EXPL "Base Weapon Damage Mult" (Gauss family: 0.15): fraction of the
   * weapon's own damage dealt again as an explosion — the intrinsic base of
   * the `explosivePayload` twin fold (paper-damage.ts). Absent when 0.
   */
  explosionBaseWeaponDamageMult?: number;
  /**
   * False when reverse-reference derivation (scripts/extract/obtainability.ts)
   * found no player-reachable source. Kept in the data for review/rescue —
   * the app hides it unless corrections.ts force-visibles it. Absent = true
   * (pre-derivation extractions).
   */
  obtainable?: boolean;
  /**
   * Weapon-intrinsic modifiers — chased from the WEAP record's own
   * `Enchantment` field (Contact-delivery on-hit effects: Cremator's built-in
   * fire DoT, bladed melee weapons' innate bleed, Shishkebab's burn+bleed,
   * HarpoonGun's bleed, ...), NOT from an equipped OMOD/perk/buff. Sourced
   * `kind: 'weapon'` (src/types/modifiers.ts) so the engine can tell them
   * apart from player-equipped sources — see paper-damage.ts's
   * `computeDotDps` and docs/assumptions.md "Weapon-intrinsic DoT & OMOD
   * replacement". Always present (empty when the weapon has no chased
   * Enchantment), mirroring GeneratedOmod.modifiers.
   */
  modifiers: Modifier[];
}

import type { Modifier } from './modifiers';

export interface GeneratedPerkRank {
  rank: number;
  modifiers: Modifier[];
}

/**
 * Perk-card metadata from the record's PCRD (join key: any rank's Male/Female
 * Perk formid matching the family's own rank formids — scripts/extract/
 * extract-perks.ts's `toGeneratedPerkCard`). PCRD is a separate record type
 * from PERK; a family only carries `card` when a PCRD actually joined it.
 */
export interface GeneratedPerkCard {
  /** PCRD Unknown.Special.name (e.g. "Charisma") — the SPECIAL stat the card slots under. */
  special: string;
  /** Per-rank point costs, index 0 = rank 1, from Perks[].Perk."Card Rank Cost". */
  costs: number[];
  /** PCRD Unknown."Min Level". */
  minLevel: number;
  /** PCRD Unknown."Race Restriction".name mapped to a stable tag; 'None' → null. */
  raceRestriction: 'human' | 'ghoul' | null;
  /** PCRD "Perk Card Flags".flags includes "Legendary Perk". */
  isLegendaryCard: boolean;
  /**
   * 1-based family rank backing each card rank (index 0 = card rank 1).
   * The card's `Perks[]` list is the LIVE shape of the perk — 28 rebalanced
   * ("compressed") cards record fewer entries than the family has PERK ranks,
   * and the surplus ranks are dead content (their zzz/CUT-era records stay in
   * `ranks` for fidelity but must never be reachable in the app). Almost
   * always [1..n]; the one exception in the 20260710 dump is StarchedGenes,
   * whose single live rank is the family's old rank-2 record → [2].
   */
  rankSources: number[];
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
  /** A PCRD record joined this family by rank formid (see GeneratedPerkCard). */
  hasCard: boolean;
  /** Perk-card metadata (SPECIAL, point costs, level gate, race restriction) — present iff hasCard. */
  card?: GeneratedPerkCard;
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
  /**
   * ≥1 non-repair/non-scrap-stub COBJ's Created Object points at this OMOD —
   * a real crafting recipe exists. Diagnostic only, NEVER an eligibility
   * input: standard mod COBJs carry no CTDA/BNAM naming a weapon (verified
   * live 2026-07-14), so per-weapon association is fully carried by
   * targetKeywords/template membership. Emitted only when true.
   */
  hasGrantingCobj?: boolean;
  /** Extraction caveats for this record (unrouted AVs, unmodeled curves) — powers UI badges. */
  notes?: string[];
}

/**
 * Consumable classification from ALCH ObjectType* / DrinkTypeAlcohol
 * keywords (chem/alcohol/drink/food), or the dedicated MagazineKeyword /
 * BobbleheadKeyword (magazine/bobblehead) — see classifyConsumableCategory
 * in extract-buffs.ts.
 */
export type BuffCategory = 'chem' | 'alcohol' | 'drink' | 'food' | 'magazine' | 'bobblehead';

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
   * Consumable-only: resolved IngredientType* / MealType* KYWD edids — the
   * Carnivore's/Herbivore's classification input (src/lib/diet-mutations.ts):
   * IngredientTypeMeat ⇒ meat; IngredientTypeVegetable/Herb/Fruit ⇒ herbivore
   * fare (the perk-condition keyword sets — docs/assumptions.md "Carnivore's
   * / Herbivore's food scaling").
   */
  ingredientKeywords?: string[];
  /**
   * Consumable-only: ids of this buff's modifiers whose source MGEF carries a
   * SURV_EffectTypeFood{Buff,Hunger,Healing} keyword — the effect-level gate
   * on the Mutation_EatAllTheMeat / Mutation_EatNoVeggies (& veggie twins)
   * perks' Mod Spell Magnitude entry points. Only these modifiers are
   * doubled/zeroed by
   * Carnivore's/Herbivore's (Rudy's Pozole's plain FortifyCharisma/Luck
   * effects lack the keyword and are exempt). Absent when none qualify.
   */
  foodScalableModifierIds?: string[];
  /**
   * Mutation-only: ids of this buff's modifiers whose source MGEF carries the
   * AbilityTypeMutation_NegativeEffect keyword (0x00391F0F) + Detrimental
   * flag — the effect-level gate on Class Freak's "Mod Spell Magnitude"
   * ×0.75/×0.5/×0.25 rank scaling. Only these modifiers are reduced by Class
   * Freak (src/lib/class-freak-mutations.ts); the UI styles them as
   * penalties. Absent when none qualify.
   */
  penaltyModifierIds?: string[];
}

/** One entry of the mode-wide addiction catalog (addictions.json). */
export interface GeneratedAddiction {
  id: string;
  formId: string;
  name: string;
  /** consumables.json ids whose activation suppresses this addiction. */
  causedBy: string[];
  /**
   * Withdrawal penalty modifiers from the addiction SPEL's own effects
   * (abReduce<SPECIAL><Family>Addiction — flat negative SPECIAL adds).
   * Applied by resolveLoadout for every selected-and-unsuppressed addiction
   * (src/data/buffs.ts getAddictionModifiers). The SPEL's abAddictionCount /
   * CA_AddictionEffect bookkeeping effects are skipped at extraction.
   */
  modifiers: Modifier[];
  /** Extraction caveats (unrouted AVs — e.g. Med-X/Psycho's DamageResist debuff). */
  notes: string[];
}

export interface GeneratedBodyPart {
  /** BPTD "Part Name" (e.g. "Head", "Belly", "Combat Inhibitor"). */
  name: string;
  /** BPTD Part Type name (Head1, Torso, LeftArm1, Brain, ...). */
  partType: string;
  /** BPTD Data."Damage Mult" — the engine's body-part damage multiplier for hits on this part. */
  dmgMult: number;
  /**
   * Part has a limb condition (non-null BPTD Data."Actor Value") and isn't
   * the torso core — counts toward crippled-limb effects (Bully's/Tormentor).
   * Always false when the race is `noCripple`.
   */
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
  /** Distinct crippable Actor Values across `parts` — the crippled-limbs input's max (0 when `noCripple`). */
  crippableLimbCount: number;
  /** Actor holds NoCripplePerk/NoCripple (takes zero limb damage) — every part is non-crippable. */
  noCripple: boolean;
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
  /**
   * Kept (obtainable:true) records whose only evidence was weak/inherited —
   * e.g. an OMOD riding along on its weapon's obtainability with no
   * recipe/drop of its own and no seat in the weapon's default parts. A
   * self-reporting review queue (user decision 2026-07-14: never auto-hide);
   * confirmed cut content gets hand-hidden via hiddenOmodIds.
   */
  reviewFlagged?: Record<string, ExcludedRecordDetail[]>;
  /** Things the normalizer could not resolve — review after each run. */
  unresolved: string[];
}
