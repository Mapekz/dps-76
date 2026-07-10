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
  // COBJ-craftable workshop OBJECTS, not carryable player weapons — the
  // obtainability derivation keeps them because fireworks are craftable at
  // workshops (2026-07-02 run). All display as "Mortar".
  'DLC05WorkshopFireworkWeaponPalmGold',
  'DLC05WorkshopFireworkWeaponPalmSilver',
  'DLC05WorkshopFireworkWeaponPeonyBlue',
  'DLC05WorkshopFireworkWeaponPeonyCrackle',
  'DLC05WorkshopFireworkWeaponPeonyGreen',
  'DLC05WorkshopFireworkWeaponPeonyPink',
  'DLC05WorkshopFireworkWeaponPeonyRed',
  'DLC05WorkshopFireworkWeaponPeonyYellow',
  'WorkshopVertibirdGrenade', // workshop vertibird call-in, not a player grenade
  // NPC/staged duplicates of real weapons that survive derivation via shared
  // loot lists (2026-07-02 run).
  'crcrossbow', // creature copy of 'crossbow' (same display name)
  'AC_MQ02_Stage_ThrowingKnife_Weapon', // quest-stage prop dup of Throwing_Knife
  'V96_1_SuppressionPipeSyringer', // Vault 96 staged Syringer dup of PipeSyringer
  // Test Your Metal boss gear: quest-alias (QUST) references prove NPC use,
  // not player access — their only LVLI is NONPLAYABLE (2026-07-02 run).
  'P62_crTheDrifter10mmSMG',
  'P62_crTheDrifterM79',
  'P62_crTheDrifterAssaultronBlade',
]);

/**
 * Weapons the obtainability derivation (scripts/extract/obtainability.ts)
 * wrongly ruled unobtainable: shown despite `obtainable: false`. Review
 * `_meta.json → excludedDetailed.weaponUnobtainable` after each extraction
 * and rescue false negatives here — no re-extract needed.
 */
export const forceVisibleWeaponIds: ReadonlySet<string> = new Set<string>([
  // Script/vendor-granted uniques with NO record-level reverse reference in
  // the ESM (quest VMAD script properties and gold-bullion vendors aren't
  // indexed by `esm refs`) — rescued from the 2026-07-02 derivation run.
  // Source: known player-obtainable uniques; review against
  // _meta.excludedDetailed.weaponUnobtainable after each extraction.
  'DoubleBarrelShotgun_ColdShoulder', // Cold Shoulder — gold bullion vendor
  'AssaultRifle_WhistleInTheDark', // Whistle in the Dark — event/quest reward
  'DLC01_AssaultronBlade_TheGutter', // The Gutter — gold bullion vendor
  'DeathclawGauntlet_UnstoppableMonster', // Unstoppable Monster — gold bullion vendor
  '44_MedicalMalpractice', // Medical Malpractice — Wayward quest reward
  'FaceBreaker', // Face Breaker — event reward
  'LeverGun_SoleSurvivor', // Sole Survivor — quest reward
  'PipeWrench_MechanicsBestFriend', // Mechanic's Best Friend — event reward
  'SCORE_S11_AutoGrenadeLauncher_NukaLauncher', // Nuka-Launcher — scoreboard reward
  'E08B_CombatShotgun_CrowdControl', // Crowd Control — Invaders event reward
  'MTR05_ChineseOfficerSword', // Ancient Blade — Camden Park quest reward
  'CamdenWhackerWeapon', // Camden Whacker — Camden Park event reward
]);

/**
 * Generated omods to hide from pickers: records that pass extraction and
 * obtainability but are wrong anyway.
 */
export const hiddenOmodIds: ReadonlySet<string> = new Set<string>([]);

/**
 * Effects whose data cannot move numbers yet: 'pendingMechanic' = the game
 * mechanic behind it is a deferred rework; 'needsEnemyDefenses' = the value
 * is extracted but the engine has no enemy DR/ER to apply it to. Drives the
 * picker badges (src/data/omods.ts classifyOmodDisplay).
 */
export const omodBadgeOverrides: Readonly<Record<string, 'pendingMechanic' | 'needsEnemyDefenses'>> = {
  // Onslaught-stack effects (Furious, Pounder's) — Onslaught rework deferred.
  mod_Legendary_Weapon1_DmgConsecutiveHits: 'pendingMechanic',
  mod_Legendary_Weapon4_Melee_Pounders: 'pendingMechanic',
};

/** Omod counterpart of forceVisibleWeaponIds (rescues obtainable:false records). */
export const forceVisibleOmodIds: ReadonlySet<string> = new Set<string>([
  // Stock/default parts attached purely by keyword-slot matching — no COBJ,
  // no template include, no reverse reference of any kind (verified against
  // the 2026-07-02 dump). Real in-game default mods on obtainable weapons.
  'mod_50CalMachineGun_AmmoCan', // .50 Cal "Standard Magazine"
  'mod_Cryolator_Muzzle_Default', // Cryolator "Stock Muzzle"
  'mod_melee_Hatchet_Null', // Hatchet "No Upgrade"
  'mod_DoubleBarrelShotgun_barrel_short_Base_ColdShoulder', // Cold Shoulder standard barrel (weapon is itself rescue-listed)
]);

/**
 * Per-weapon field patches applied after adaptation.
 *
 * Fire-rate note: extracted `attackDelaySec` / automatic-keyword data is
 * approximate until animation-derived timing lands (dps-todos/fire-rate.md).
 * Verified timings belong here.
 */
export const weaponCorrections: Readonly<Record<string, Partial<Weapon>>> = {};
