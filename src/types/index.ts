import type { Special } from '@/data/special';
import type { Modifier } from '@/types/modifiers';

// Re-export for convenience
export type { Special } from '@/data/special';
export type { PerkId } from '@/data/perk-ids';
export type { Stat, StatModification } from '@/data/stats';

// Player conditions for conditional perks and calculations
export interface PlayerConditions {
  // Combat state
  isSneaking: boolean;
  isAimingAtWeakpoint: boolean; // weakpoint (head) targeting; applies to both scenarios
  isInPowerArmor: boolean;
  isSolo: boolean;
  isPowerAttacking: boolean; // melee power attacks (toggle; applies across scenarios)
  isLastShot?: boolean; // firing the magazine's last round (Last Shot legendary; default false)
  isAimingDownSights?: boolean; // iron sights / ADS (gates scoped-damage buffs; default false)
  isGhoul?: boolean; // playing a ghoul character (gates Gourmand's off, feral-meter effects on; default false)
  healthPercent: number; // 0-100 for perks like Nerd Rage, Serendipity

  // Stack counts
  /**
   * Bullet Storm stacks (shared engine counter, AV 0x0000039B — Bullet
   * Storm, Bringing Out the Big Guns, Foundation's Vengeance). Sentinel `-1`
   * = "follow the computed max" (assume full stacks, the app's existing
   * assume-max convention for adrenaline/onslaught); non-negative = an
   * explicit user selection, clamped to `[min, max]` at read time
   * (`resolve.ts`'s `effectiveBulletStormStacks`). The computed max/min
   * themselves come from equipped Bullet Storm sources, not from this field
   * — see `ScenarioSet.bulletStormMaxStacks`/`bulletStormMinStacks`
   * (docs/assumptions.md "Bullet Storm").
   */
  bulletStormStacks: number;
  /**
   * Engine-computed sustained-fire average stack count instead of the manual
   * `bulletStormStacks` value (mirrors the read-only Onslaught-reverse
   * average — `bulletstorm.ts` `bulletStormAvgStacks`). Default false (user
   * manual slider).
   */
  bulletStormAverageMode?: boolean;
  /**
   * Onslaught stacks (shared engine counter, AV 0x00000395 — Guerrilla/
   * Gunslinger Expert+Master, Furious, Pounder's, Splinter's, Whacker
   * Smacker). Sentinel `-1` = "follow max" (assume full stacks, the app's
   * existing assume-max convention for adrenaline/bulletStorm); non-negative
   * = an explicit user selection from the Onslaught slider, clamped to the
   * computed max at read time (`resolve.ts`'s `onslaught` reader). The
   * computed max itself comes from equipped Onslaught sources, not from this
   * field — see `ScenarioSet.onslaughtMaxStacks` (docs/assumptions.md
   * "Onslaught").
   */
  onslaughtStacks: number;
  /**
   * Enemies hit per attack event (primary target + AoE/cleave fan-out).
   * Feeds reverse-onslaught per-shot consumption when Gunslinger Master is
   * equipped (docs/assumptions.md "Onslaught"); default 1 (single target).
   */
  targetsHit?: number;
  adrenalineStacks: number; // 0-10 (default 0 per user preference)
  tenderizerStacks: number; // 0–1000, +0.001 dbm (0.1%) per stack, cap +100%; target state, works without the card equipped

  // Other steady-state inputs for conditional sources
  /**
   * For Junkie's legendary. DERIVED in resolveLoadout — selected
   * PlayerConfig.addictions minus those suppressed by an active addictive
   * consumable (src/lib/player-stats.ts deriveAddictionCount); not
   * user-editable. The stored default only feeds synthetic engine tests.
   */
  addictionCount: number;
  capsOnHand: number; // for Aristocrat's legendary
  /**
   * Absolute max HP (Juggernaut's health curve, health-fraction thresholds).
   * DERIVED in resolveLoadout — 245 + 5×effective END + maxHealth-bucket
   * folds (Lifegiver &c., src/lib/player-stats.ts) — not user-editable; the
   * stored default only feeds synthetic engine tests (docs/assumptions.md
   * "Max HP").
   */
  maxHealth?: number;
  mutationCount?: number; // for Mutant's curve — derived from the selected mutations in resolveLoadout
  /**
   * HungerThirstTier AV (0x006D37DC, 0–8) for Gourmand's curve. DERIVED in
   * resolveLoadout as foodTier + drinkTier (each meter contributes its 0–4
   * threshold tier — docs/assumptions.md "Hunger & thirst tiers"); the stored
   * value only feeds synthetic engine tests.
   */
  hungerThirstTier?: number;
  /** Food meter threshold tier, 0–4: Hungry → Fully Fed (SURV_NewHungerThreshold_Msg_*; default 0). */
  foodTier?: number;
  /** Drink meter threshold tier, 0–4: Thirsty → Fully Hydrated (SURV_NewThirstThreshold_Msg_*; default 0). */
  drinkTier?: number;
  feralTier?: number; // ghoul feral meter tier for Lucid/Feral's curves (default 0; GHL_FeralTier AV 0–8, 8 = "Wonderful")
  /**
   * Ghoul Glow meter (the Rads AV, 0x000002E1) — absolute value, 0..maxHealth
   * (max Glow = max HP). Gates threshold conditions like Glowing Criticals'
   * ≥180 (glowAtLeast). DERIVED-clamped in resolveLoadout (min(glow, maxHealth))
   * so the engine never sees a value above the character's current max HP;
   * the stored default only feeds synthetic engine tests.
   */
  glow?: number;
  limitBreakingPieces: number; // 0-5 armor pieces with Limit Breaking (−10% crit cost each)
  /**
   * True when any active consumable is category alcohol (Live & Love 5's
   * HasMagicEffectKeyword(AlcoholEffect) gate). DERIVED in resolveLoadout;
   * the stored default only feeds synthetic engine tests.
   */
  underAlcoholEffect?: boolean;
  /**
   * Strange in Numbers gate → mutation values ×1.25. DERIVED in resolveLoadout
   * (StrangeInNumbers perk equipped AND teammateCount ≥ 1 — the card needs a
   * mutated teammate, docs/assumptions.md); the stored value only feeds
   * synthetic engine tests.
   */
  strangeInNumbers: boolean;
  /**
   * Class Freak perk rank 0–3 → mutation penalties ×1/×0.75/×0.5/×0.25.
   * DERIVED in resolveLoadout/resolveStats (src/lib/player-stats.ts
   * deriveClassFreakRank — the equipped ClassFreak card's rank); the stored
   * value only feeds synthetic engine tests. Gates `classFreakRank`
   * conditions (mutation penalty tiers, Grounded's energy-damage tiers).
   */
  classFreakRank?: number;
  /**
   * Perk family editor-id (perks.json `family`) → highest owned rank, across
   * BOTH the regular and legendary perk loadouts (legendary families are
   * `Legendary*`-namespaced, so one merged map is collision-free). DERIVED in
   * resolveLoadout/resolveStats (src/data/perk-modifiers.ts
   * getEquippedPerkFamilyRanks); the stored value only feeds synthetic engine
   * tests. Gates `perkFamilyRank` conditions — the cross-family HasPerk gates
   * (Lock and Load → Bullet Storm's reload speed).
   */
  equippedPerkRanks?: Record<string, number>;
  weaponConditionPct?: number; // 0-200: equipped weapon condition, 100 = full, 200 = over-repaired max (Polished; default 100)
  /**
   * Manual-aim (free-aim) hit rate %, 10-100, default 100. Models realistic
   * misses (movement, target size) by scaling free-aim SUSTAINED dps only
   * (not per-hit, not burst, not VATS — VATS accuracy is assumed 100%,
   * hit-chance modeling permanently out of scope, see docs/assumptions.md
   * "Manual-aim hit rate").
   */
  hitRatePct?: number;
  /**
   * Chance (10–100, default 100) that an aimed shot actually lands on the
   * targeted body part instead of the torso. Only applies while
   * isAimingAtWeakpoint: each hit blends bodyPartMult and torso damage by this
   * rate (scenarios.ts bodyPartBlendedHit).
   */
  bodyPartHitRatePct?: number;
  /**
   * Manual damage-multiplier toggle (0-40, default 0) for the Follow Through
   * legendary perk's ranged-sneak damage-taken debuff (10/20/30/40 s window
   * per rank). Not steady-state-computable, so this represents the player's
   * own estimate of the debuff's active magnitude; folds to one `wholeDamage`
   * ADD modifier (value/100) UNCONDITIONALLY — any player's Follow Through
   * can have placed it, not just this build's. See docs/assumptions.md.
   */
  followThroughPct?: number;
  /**
   * Manual damage-multiplier toggle (0-40, default 0) for Taking One for the
   * Team's enemies-take-more-damage-while-teamed proc. Same simplification
   * and unconditional fold as followThroughPct. See docs/assumptions.md.
   */
  takingOneForTheTeamPct?: number;

  // SPECIAL stats
  strength: number; // 1-15 (can exceed with legendary perks)
  perception: number;
  endurance: number;
  charisma: number;
  intelligence: number;
  agility: number;
  luck: number;

  // Other
  junkItemCount: number; // for Junk Shield perk
  teammateCount: number; // for Bodyguards perk
  /**
   * Public team type, gating the team-size-scaled SPECIAL fortify granted by
   * PT_PublicTeamBonuses_Perk (0x005B7584): 'casual' → +Intelligence
   * (PT_CasualTeamBonus), 'exploration' → +Endurance
   * (PT_ExplorationTeamBonus). 'none' (default) = not in a public team of
   * that type. See @/data/public-teams.
   */
  publicTeamType?: 'none' | 'casual' | 'exploration';
  /**
   * Player is fully hydrated (SURV_Thirst below the WellHydrated threshold
   * 720). Default true (optimal play). Gates the hidden Thirst ability's
   * +35% AP regen baseline and Rejuvenated's boosts — non-ghoul only; lower
   * hydration tiers are not modeled (docs/assumptions.md "Hydration AP
   * regen").
   */
  hydrated?: boolean;
}

// Enemy conditions for conditional damage calculations
export interface EnemyConditions {
  isCrippled: boolean; // at least one limb crippled
  crippledLimbCount: number; // 0-10 limbs (Storm Goliath has 8 crippable of 9 damageable parts; Bully's/Tormentor scaling caps at 6 per ESM)
  statusEffectCount: number; // number of debuffs/impairments
  isGlowing: boolean; // glowing enemy variant
  isInsect: boolean; // insect creature type
  healthPercent?: number; // 0-100: Executioner's ≤40% / Instigating ≥60% gates (default 100 = full)
  groupTargetCount?: number; // enemies in the engaged group incl. the target (Encircler's; default 1)
  isBurning?: boolean; // active fire effect on the target (Pyromaniac's; default false)
  isPoisoned?: boolean; // active poison effect on the target (Viper's; default false)
  isBleeding?: boolean; // active bleed effect on the target (Severing's 4★; default false)
  isFrozen?: boolean; // active cryo effect on the target (no data consumers yet — forward-looking; default false)
  /** Target range bucket for Close/Far damage perks (Guerrilla, Down Ranger, Sniper's; default 'none'). */
  targetDistance?: 'close' | 'none' | 'far';
  /** Selected target race id (bodyparts.json `id`) driving the body-part mult picker; null = custom multiplier. */
  targetRace?: string | null;
  /** Selected body part name on targetRace; null = custom multiplier. */
  targetBodyPart?: string | null;
}

// Game mode types
export type GameMode = 'live' | 'pts';

// Perk definition
export interface Perk {
  name: string;
  /** SPECIAL the card slots into; absent on legendary perks (not SPECIAL-tied). */
  special?: Special;
  maxRank: number;
  /** Per-rank perk-point cost from the PCRD card; index 0 = rank 1 cost. */
  costs: number[];
  /** PCRD "Race Restriction" — 'None' → null. From src/data/perk-cards.ts's card join. */
  raceRestriction: 'human' | 'ghoul' | null;
}

export interface PerkLoadout {
  perkId: string;
  rank: number;
}

export interface ParsedPerk {
  key: string;
  name: string;
  rank: number;
}

// Weapon types
export interface WeaponMod {
  id: string;
  name: string;
  slot: 'receiver' | 'barrel' | 'grip' | 'magazine' | 'sights' | 'muzzle';
  statModifiers: Record<string, number>;
}

/**
 * One damage component of a weapon (a weapon can have multiple, e.g. phys + energy).
 * Base damage = Σ getBaseDamage(mode, comp.tier, min(itemLevel, comp.levelCap))
 * The split is preserved for future enemy ER/DR and damage-type perk routing.
 */
export interface WeaponComponent {
  /**
   * 'explosive' names extracted launcher-payload components (the projectile
   * EXPL's main physical damage, `fromExplosion`) — NOT the engine-synthesized
   * explosive-twin damage type (Explosive 2★ `explosivePayload`,
   * paper-damage.ts): twins inherit their parent component's `damageType`
   * (2026-07-13 user-confirmed) and are distinguished by `componentIsExplosion`
   * on the resolve context instead. `DamageType` (types/modifiers.ts) is
   * aliased from this union.
   */
  damageType: 'ballistic' | 'energy' | 'radiation' | 'poison' | 'cryo' | 'fire' | 'explosive';
  /** Universal damage curve tier (e.g. 24 for The Fixer). -1 when only inline points exist. */
  tier: number;
  /** Item level cap for this component — damage is clamped to this level. */
  levelCap: number;
  /**
   * Inline damage-by-level points from ESM extraction (authoritative when
   * present; the tier-file lookup is the fallback for hand-authored data).
   */
  curvePoints?: Array<{ x: number; y: number }>;
  /**
   * Component is the projectile's explosion (launcher EXPL chase) —
   * explosive-scoped dbm modifiers (Demolition Expert) apply regardless of
   * the elemental damageType (additive in the dbm parenthesis, June 2026
   * patch semantics).
   */
  fromExplosion?: boolean;
  /**
   * Materialized-component scaling (effective-weapon.ts, DamageTypeValues
   * OMOD conversion — 2026-07-13 user-confirmed semantics): set when this
   * component was synthesized for a damage type the base weapon didn't deal.
   * Multiplies the curve-derived base (Σ positive MUL_ADDs on the type's
   * `baseDamage` modifiers scoped to it); absent/undefined = 1 (neutral).
   */
  scale?: number;
  /**
   * Flat bonus added on top of `curveBase × scale`, NOT level-scaled
   * ((last SET ?? 0) + Σ ADD from the same materialization fold). Absent =
   * 0 (neutral).
   */
  flatBonus?: number;
}

export interface Weapon {
  id: string;
  name: string;
  /** Damage components; base damage = Σ getBaseDamage per component. */
  components: WeaponComponent[];
  /** Primary damage type used for perk routing (e.g. energy bonus perks). */
  damageType: 'ballistic' | 'energy' | 'radiation' | 'poison' | 'cryo' | 'fire';
  weaponClass: 'rifle' | 'pistol' | 'shotgun' | 'heavy' | 'melee' | 'unarmed' | 'bow' | 'thrown';

  // ── Fire-rate parameters ─────────────────────────────────────────────────
  /** Weapon speed multiplier; almost always 1.0. */
  speed?: number;
  /** True for automatic weapons (uses animDurationSec). */
  isAutomatic: boolean;
  /**
   * True for ballistic / purely physical weapons — applies the 0.8248× speed
   * multiplier.  False for energy weapons (Gat Plasma, Plasma Gun, etc.).
   */
  isPhysical: boolean;
  /** Semi-auto: seconds between shots (animDelay). */
  animDelaySec?: number;
  /** Auto: fire animation cycle length in seconds (default ≈ 0.11). */
  animDurationSec?: number;

  // ── Magazine / reload (sustained DPS) ────────────────────────────────────
  /** Magazine capacity in rounds (0/undefined = no magazine: melee, some uniques). */
  capacity?: number;
  /** Ammo consumed per shot (Gauss Minigun 2, most weapons 1). */
  ammoPerShot?: number;
  /**
   * Engine-derived reload-skip probability (folded from `reloadSkipChance`
   * sustainChance bucket modifiers in effective-weapon.ts; consumed by sustain.ts).
   */
  reloadSkipChance?: number;
  /**
   * Engine-derived free-ammo probability (folded from `ammoFreeChance`
   * sustainChance bucket modifiers in effective-weapon.ts; consumed by sustain.ts).
   */
  ammoFreeChance?: number;
  /** Reload speed multiplier (Data.Reload Speed; higher = faster). */
  reloadSpeed?: number;
  /** Base reload animation length in seconds (RGW3 Animation Reload Seconds). */
  animationReloadSec?: number;
  /**
   * True when the reload animation repeats once per shell/round rather than
   * once for the whole magazine — WEAP keyword `AnimsSequentialReload`
   * (Lever Action Rifle, Pump Action Shotgun, Single Action Revolver;
   * Double-Barrel does NOT carry it — its break-action reload is one
   * combined animation). `sustain.ts` multiplies `animationReloadSec` by
   * shotsPerMag for these weapons. That per-shell-increment reading is an
   * ASSUMPTION pending in-game stopwatch (docs/assumptions.md "Sustained
   * DPS", dps-todos/measurement-backlog.md) — the keyword itself is
   * ESM-proven. Override either direction via weaponCorrections.
   */
  reloadPerShell?: boolean;
  /**
   * Per-shot VATS AP cost (WEAP Data."Action Point Cost"). Fixer 16, Minigun
   * 8, Super Sledge 52. Rewritten by the `vatsApCost` OMOD bucket (V.A.T.S.
   * Optimized) in `effective-weapon.ts`; consumed by `ap-economy.ts` (Stage B).
   */
  apCost?: number;

  // ── ESM-extracted metadata (present on generated weapons) ────────────────
  /** Source ESM FormID (e.g. "0x0046D2A1"). */
  formId?: string;
  /**
   * Levels the weapon actually drops/crafts at (WEAP Eligible Levels —
   * Enclave Plasma [25,35,45], Fixer [24,50], ...). Empty on ~44 records;
   * `weaponLevelStops` (src/data/live/weapons.ts) falls back to the full
   * 1..50 range then. Drives the item-level slider stops and the
   * select-time default (`maxEligibleLevel`).
   */
  eligibleLevels?: number[];
  /**
   * WEAP anim-type enum value (Data."Weapon Type" — what GetWeaponAnimType()
   * returns): 0 HandToHandMelee, 1 OneHandSword, 5 TwoHandSword, 6 TwoHandAxe,
   * 9 Gun, 10 Grenade (the only values in the FO76 roster). Consumed by the
   * `weaponAnimTypeMax` condition (Martial Artist ≤6); undefined fails closed.
   */
  animType?: number;
  /** Resolved keyword editor_ids (WeaponTypeRifle, WeaponTypeAutomatic, ...). */
  keywords?: string[];
  /** Attach point slot formids — an OMOD fits when its attach point is listed here. */
  attachParentSlots?: string[];
  /** OMOD formids flattened from ALL Object Template combinations (instance-template gating for unique mods). */
  templateModFormIds?: string[];
  /** OMOD formids of the Default combination — the weapon's real standard parts (picker default + engine fold-in). */
  defaultModFormIds?: string[];
  /** Base weapon crit damage multiplier (VATS crit; typically 2.0). */
  critDamageMult?: number;
  /** Crit meter fill multiplier per hit (typically 1.0). */
  critChargeBonus?: number;
  /** Base sneak attack multiplier (typically 2.0–2.75). */
  sneakAttackMult?: number;
  /** Projectiles per shot (shotguns > 1). */
  projectileCount?: number;
  /** Intrinsic Damage Bonus Multiplier (RGW3; baseline 1.0) — the "1 +" of the dbm fold. */
  damageBonusMult?: number;
  /**
   * EXPL "Base Weapon Damage Mult" (Gauss family: 0.15): fraction of each
   * component's damage dealt again as an explosive twin — the intrinsic base
   * of the `explosivePayload` fold in paper-damage.ts (the Explosive 2★
   * legendary ADDs on top of it).
   */
  explosionBaseWeaponDamageMult?: number;

  // ── Charging (Gauss family, bows, tesla/gamma/laser via charging-barrel OMODs) ──
  /**
   * WEAP Data "Full Power Seconds" (FPS) — seconds of holding the
   * trigger/draw to reach full charge. 0/undefined = the weapon doesn't
   * charge at all; `weaponCharges()` (src/lib/charge.ts) is the single gate
   * on this pair of fields (numeric, NOT the `HoldInputToPower` flag — laser
   * sniper barrels charge without carrying it).
   */
  fullPowerSeconds?: number;
  /**
   * WEAP Data "Full Power Damage Mult" (FPDM) — despite the "Mult" name, a
   * damage BONUS added on top of the 1.0× base at full charge (2.0 ⇒ ×3 —
   * Gauss Rifle's 91 base → 273 at full charge). User-confirmed formula, NOT
   * ESM-proven (docs/assumptions.md "Charging weapons"): see
   * `chargeDamageMultiplier` in `src/lib/charge.ts`.
   */
  fullPowerDamageMult?: number;
  /**
   * Bows only — top-level WEAP "Minimum Charge Time": the minimum draw
   * before the weapon can fire at all. NOT UI-only: both the charge-time
   * slider AND the engine (`resolvedChargeTimeSec`, src/lib/charge.ts) floor
   * the resolved charge time at this value, so the damage/cadence formulas
   * never see a `t` below it.
   */
  minimumChargeTime?: number;

  /**
   * Weapon-intrinsic modifiers (GeneratedWeapon.modifiers — the WEAP's own
   * Contact-delivery Enchantment chase, e.g. Cremator's built-in fire DoT).
   * Sourced `kind: 'weapon'`; folded by `computeDotDps` (paper-damage.ts) as
   * the intrinsic base an OMOD's own same-bucket modifiers stack onto or
   * replace (docs/assumptions.md "Weapon-intrinsic DoT & OMOD replacement").
   */
  modifiers?: Modifier[];

  // ── Legacy / scaffolding ─────────────────────────────────────────────────
  /** Flat base damage override (used by enemy weapon scaffolding). Derived
   *  weapons set this to 0; prefer `components` for player weapons. */
  baseDamage?: number;
  /** Accuracy (for future aim model). */
  accuracy?: number;
  /** Range (for future falloff model). */
  range?: number;
}

export interface WeaponConfig {
  weaponId: string;
  /** Equipped OMOD id per attach-point slot edid (e.g. { ap_gun_Receiver: 'mod_...' }). */
  mods: Record<string, string | null>;
  /** Equipped legendary-effect OMOD ids by star index (ap_Legendary1 → 0); null = empty slot. */
  legendaryEffects: (string | null)[];
}

// Armor types
export interface ArmorPiece {
  id: string;
  name: string;
  slot: 'head' | 'chest' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
  damageResist: number;
  energyResist: number;
  radiationResist: number;
}

export interface ArmorMod {
  id: string;
  name: string;
  modSlot: 1 | 2 | 3 | 4;
  statModifiers: Record<string, number>;
}

export interface ArmorSlotConfig {
  armorId: string | null;
  mods: [string | null, string | null, string | null, string | null];
  legendaryEffects: string[];
}

export interface ArmorConfig {
  head: ArmorSlotConfig;
  chest: ArmorSlotConfig;
  leftArm: ArmorSlotConfig;
  rightArm: ArmorSlotConfig;
  leftLeg: ArmorSlotConfig;
  rightLeg: ArmorSlotConfig;
}

// Enemy types
export interface Enemy {
  id: string;
  name: string;
  level: number;
  health: number;
  damageResist: number;
  energyResist: number;
}

export interface EnemyMutation {
  id: string;
  name: string;
  statModifiers: Record<string, number>;
}

export interface EnemyConfig {
  enemyId: string;
  legendaryRank: 0 | 1 | 2 | 3;
  mutation: string | null;
  weaponId: string | null;
  powerArmorId: string | null;
  conditions: EnemyConditions;
}

// Player config
export interface PlayerConfig {
  perks: PerkLoadout[];
  legendaryPerks: PerkLoadout[];
  weapon: WeaponConfig | null;
  armor: ArmorConfig;
  mutations: string[];
  consumables: string[];
  /**
   * Selected "I have this addiction" ids (GeneratedAddiction.id). Independent
   * of which consumable is active — suppression by an active addictive item
   * is derived (getSuppressedAddictions), never stored.
   */
  addictions: string[];
  conditions: PlayerConditions;
  /** Global item level for base-damage curve lookup (1–50, default 50). */
  itemLevel: number;
  /**
   * Custom enemy body-part damage multiplier (default 1.5 — the standard
   * humanoid headshot per BPTD data). Overridden by the Target section's
   * race + body-part picker when one is selected (resolveLoadout).
   */
  weakpointMult: number;
  /**
   * User-selected charge hold time in seconds, for weapons that charge
   * (Gauss family, bows, tesla/gamma/laser via charging-barrel OMODs).
   * Undefined = "always fully charge" (the default — optimal-play
   * assumption). The engine clamps this to the effective weapon's
   * [minimumChargeTime ?? 0, fullPowerSeconds] (`resolvedChargeTimeSec`,
   * src/lib/charge.ts) — never below the weapon's minimum charge time
   * (0 if it doesn't have one), never past full charge.
   */
  chargeTimeSec?: number;
}

// Default values factory
export function createDefaultPlayerConditions(): PlayerConditions {
  return {
    isSneaking: false,
    isAimingAtWeakpoint: false,
    isInPowerArmor: false,
    isSolo: true,
    isPowerAttacking: false,
    isLastShot: false,
    isAimingDownSights: false,
    isGhoul: false,
    healthPercent: 100,
    bulletStormStacks: -1, // Follow the computed max (sentinel; see field comment)
    bulletStormAverageMode: false, // manual slider by default
    onslaughtStacks: -1, // Follow the computed max (sentinel; see field comment)
    targetsHit: 1,
    adrenalineStacks: 0, // Default per user preference
    tenderizerStacks: 0, // Solo default — no other players hitting the target
    addictionCount: 0,
    capsOnHand: 0,
    maxHealth: 300, // synthetic-test default; the app derives it in resolveLoadout (245 + 5×END + buffs)
    hungerThirstTier: 0, // synthetic-test default; the app derives it in resolveLoadout (foodTier + drinkTier)
    foodTier: 0, // food meter empty (Hungry)
    drinkTier: 0, // drink meter empty (Thirsty)
    feralTier: 0, // Lucid/Feral's curve input (0–8; human default)
    glow: 0, // ghoul Glow meter, absolute (0..maxHealth; human/no-Glow default)
    limitBreakingPieces: 0,
    underAlcoholEffect: false, // synthetic-test default; the app derives it in resolveLoadout (active alcohol consumable)
    strangeInNumbers: false, // synthetic-test default; the app derives it in resolveLoadout (perk + teammates)
    classFreakRank: 0, // synthetic-test default; the app derives it in resolveLoadout (equipped ClassFreak rank)
    equippedPerkRanks: {}, // synthetic-test default; the app derives it in resolveLoadout (selected perk loadout)
    weaponConditionPct: 100, // full condition (Polished curve input; 200 = over-repaired max)
    hitRatePct: 100, // manual-aim hit rate (100 = every shot lands; VATS is unaffected)
    bodyPartHitRatePct: 100, // aimed shots always land on the targeted body part
    followThroughPct: 0, // no damage multiplier assumed by default
    takingOneForTheTeamPct: 0, // no damage multiplier assumed by default
    strength: 15,
    perception: 15,
    endurance: 15,
    charisma: 15,
    intelligence: 15,
    agility: 15,
    luck: 15,
    junkItemCount: 0,
    teammateCount: 0,
    publicTeamType: 'none',
    hydrated: true, // fully hydrated — optimal-play default (hydration AP-regen baseline)
  };
}

export function createDefaultEnemyConditions(): EnemyConditions {
  return {
    isCrippled: false,
    crippledLimbCount: 0,
    statusEffectCount: 0,
    isGlowing: false,
    isInsect: false,
    healthPercent: 100,
    groupTargetCount: 1,
    isBurning: false,
    isPoisoned: false,
    isBleeding: false,
    isFrozen: false,
    targetDistance: 'none',
    targetRace: null,
    targetBodyPart: null,
  };
}

export function createDefaultArmorConfig(): ArmorConfig {
  const defaultSlot: ArmorSlotConfig = {
    armorId: null,
    mods: [null, null, null, null],
    legendaryEffects: [],
  };

  return {
    head: { ...defaultSlot },
    chest: { ...defaultSlot },
    leftArm: { ...defaultSlot },
    rightArm: { ...defaultSlot },
    leftLeg: { ...defaultSlot },
    rightLeg: { ...defaultSlot },
  };
}

export function createDefaultPlayerConfig(): PlayerConfig {
  return {
    perks: [],
    legendaryPerks: [],
    weapon: null,
    armor: createDefaultArmorConfig(),
    mutations: [],
    consumables: [],
    addictions: [],
    conditions: createDefaultPlayerConditions(),
    itemLevel: 50,
    weakpointMult: 1.5,
  };
}

export function createDefaultEnemyConfig(): EnemyConfig {
  return {
    enemyId: 'super_mutant',
    legendaryRank: 0,
    mutation: null,
    weaponId: null,
    powerArmorId: null,
    conditions: createDefaultEnemyConditions(),
  };
}

