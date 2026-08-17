import type { Modifier } from '@/types/modifiers';
import type { Special } from '@/data/special';
import { DEFAULT_DISTANCE_UNITS } from '@/lib/distance';
import type { PlayerInput } from '@/types/player';
export type { Special } from '@/data/special';
export type { PerkId } from '@/data/perk-ids';
export type { Stat, StatModification } from '@/data/stats';
export type {
  ArmorWorn,
  PlayerConditionContext,
  PlayerInput,
  ResolvedPlayer,
} from '@/types/player';
import { createDefaultPlayerInput, createDefaultResolvedPlayer } from '@/types/player';
export { createDefaultPlayerInput, createDefaultResolvedPlayer };

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
  /**
   * Raw game units to the target (Phase 1 — Range + falloff). Drives BOTH
   * the Close/Far perk gates (Guerrilla, Down Ranger, Sniper's — threshold
   * comparison in resolve.ts's `targetDistance` case, `src/lib/distance.ts`'s
   * CLOSE_THRESHOLD_UNITS/FAR_THRESHOLD_UNITS) and the continuous weapon
   * range-falloff multiplier (`rangeFalloffMult`, folded in scenarios.ts).
   * Default DEFAULT_DISTANCE_UNITS — strictly between the two gates, so
   * neither fires (the old default's 'none' behavior). UI: TargetSection's
   * distance slider, displayed in Pip-Boy units (÷ PIP_BOY_UNIT_DIVISOR).
   */
  targetDistance?: number;
  /** Selected target race id (bodyparts.json `id`) driving the body-part mult picker; null = custom multiplier. */
  targetRace?: string | null;
  /** Selected body part name on targetRace; null = custom multiplier. */
  targetBodyPart?: string | null;
  /**
   * Selected target's level (Phase 2 — Enemy defenses), driving its HP/DR/ER
   * via the creature curve tables (`src/lib/enemy-defenses.ts`). `null` =
   * not explicitly set — resolves to the race's `levelMaxGlobal` (endgame
   * assumption, docs/assumptions.md) at read time
   * (`resolveTargetLevel`), so this field only needs a stored value once the
   * user drags the slider off its default. Bounds come from the selected
   * race's `levelMinGlobal`/`levelMaxGlobal` (npcs accessor); 1-100 when
   * absent. Inert without a `targetRace` selected (mirrors `targetBodyPart`).
   */
  targetLevel?: number | null;
  /**
   * User-selected "Epic Levels" rank (0 = off, 1-3) for the target's HP mult
   * (Phase A — epic boss HP mult, `src/data/overrides/epic-creature.ts`'s
   * `EPIC_CREATURE_RANK_MULTS`). Only meaningful when the selected race's
   * `GeneratedNpc.epicAllowed` is true (UI hides the toggle otherwise) and
   * ignored entirely when the race carries a forced `epicRank` (SBQ, Storm
   * Goliath) — the forced rank always wins in `getEnemyDefenses`. Ranks 4-5
   * exist in the multiplier table but have no ESM-observed spawn path (every
   * curated/forced rank seen is ≤3), so the toggle caps at ★3.
   */
  epicRank?: number;
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
   * Passive-on-reload channel (Quick Hands, Wild West Hands) — see
   * `reloadSkipChanceBash` for the bash-triggered channel (Battle-Loader's).
   */
  reloadSkipChance?: number;
  /**
   * Engine-derived bash-triggered reload-skip probability (folded from
   * `reloadSkipChanceBash` sustainChance bucket modifiers in
   * effective-weapon.ts; consumed by sustain.ts). Battle-Loader's only
   * (EP199 "Instant Reload Clip On Bash") — split from `reloadSkipChance`
   * because a bash swing costs real time
   * (`PlayerInput.battleLoadersBashSec`), unlike a passive reload skip.
   */
  reloadSkipChanceBash?: number;
  /**
   * Engine-derived free-ammo probability (folded from `ammoFreeChance`
   * sustainChance bucket modifiers in effective-weapon.ts; consumed by sustain.ts).
   */
  ammoFreeChance?: number;
  /**
   * Engine-derived probability that the mag's last round is flagged as a Last
   * Shot (folded from `lastShotChance` sustainChance bucket modifiers in
   * effective-weapon.ts; consumed by resolve.ts's `lastRound` condition).
   */
  lastShotChance?: number;
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
   * DPS", #68) — the keyword itself is
   * ESM-proven. Override either direction via weaponCorrections.
   */
  reloadPerShell?: boolean;
  /**
   * Per-shot VATS AP cost (WEAP Data."Action Point Cost"). Fixer/Plasma 16,
   * Minigun 8, Super Sledge 52. Rewritten by the `vatsApCost` OMOD bucket in
   * `effective-weapon.ts` — raw float after Σ MUL_ADD, not Pip-Boy
   * `round(cost)`. Consumed by `ap-economy.ts` (Stage B).
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

  /**
   * Playstyle assumption, NOT a measured engine fact — lobbed/splash-dependent
   * launchers are modeled as never landing their direct projectile hit, so
   * Onslaught hit-event counting (`src/lib/engine/onslaught.ts`
   * `onslaughtHitEventsPerShot`) suppresses their physical projectile tick and
   * counts only the explosion. See docs/assumptions.md "Onslaught". Set from
   * `src/data/overrides/weapon-corrections.ts`, never by the extractor.
   */
  splashReliant?: boolean;

  // ── Legacy / scaffolding ─────────────────────────────────────────────────
  /** Flat base damage override (used by enemy weapon scaffolding). Derived
   *  weapons set this to 0; prefer `components` for player weapons. */
  baseDamage?: number;

  // ── Range & falloff (Phase 1 extraction half) ────────────────────────────
  // Storage is raw game units (WEAP Data "Min Range"/"Max Range"/
  // "Damage - OutOfRangeMult" — Hunting Rifle: 2612/5225/0.5). UI display
  // divides by PIP_BOY_UNIT_DIVISOR (64/3, src/lib/distance.ts, Phase 1
  // engine half) to render Pip-Boy units — these fields are NOT pre-divided.
  // 0 is a real value (melee weapons), not "absent".
  /** WEAP Data "Min Range", raw game units. */
  minRange?: number;
  /** WEAP Data "Max Range", raw game units. */
  maxRange?: number;
  /** WEAP Data "Damage - OutOfRangeMult". */
  outOfRangeDamageMult?: number;
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
  /**
   * Armor checklist selections — effectId (a stable representative
   * OMOD edid, `src/data/armor-modifiers.ts` `ArmorEffectEntry.id`) → worn
   * count (0-`maxCount`; single-slot effects use 0/1). Authoritative source
   * for both the folded `Modifier[]` list and `ResolvedPlayer.wornPieceCounts`
   * — resolveLoadout derives both, the UI never sets either downstream field
   * directly (docs/assumptions.md "Armor effects (engine + UI)").
   */
  armorEffects: Record<string, number>;
  mutations: string[];
  consumables: string[];
  /**
   * Selected "I have this addiction" ids (GeneratedAddiction.id). Independent
   * of which consumable is active — suppression by an active addictive item
   * is derived (getSuppressedAddictions), never stored.
   */
  addictions: string[];
  conditions: PlayerInput;
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
    targetDistance: DEFAULT_DISTANCE_UNITS,
    targetRace: null,
    targetBodyPart: null,
    targetLevel: null,
    epicRank: 0,
  };
}

export function createDefaultPlayerConfig(): PlayerConfig {
  return {
    perks: [],
    legendaryPerks: [],
    weapon: null,
    armorEffects: {},
    mutations: [],
    consumables: [],
    addictions: [],
    conditions: createDefaultPlayerInput(),
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
