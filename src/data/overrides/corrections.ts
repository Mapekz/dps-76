import type { Weapon } from '@/types';
import type { Modifier } from '@/types/modifiers';

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
  // The Drifter's signature gear (P62_crTheDrifter*): the P62 content drop
  // ("The Drifter" boss encounter) NEVER RELEASED — user-confirmed 2026-07-12.
  // These were briefly un-hidden during the Onslaught pass (the reverse-ref
  // pattern looked like a script-driven on-defeat loot grant), but the whole
  // encounter is unreleased content, so no player can obtain them. Re-hidden.
  // If P62 ever ships, delete these three lines.
  'P62_crTheDrifter10mmSMG', // "Splinter"
  'P62_crTheDrifterM79', // "Chaos Engine"
  'P62_crTheDrifterAssaultronBlade', // "Tempest"
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
  // Atomic Shop weapons (^atx_ prefix filter dropped 2026-07-10): shop grants
  // are account-side, so real ownable weapons have NO ESM reverse refs.
  // Reskin duplicates stay hidden (ATX_CroquetMallet_Red, ATX_KDInkwell_Quill
  // — the latter even displays as "Baton").
  'ATX_Sten', // The Black Knight
  'ATX_TurkeyRipper', // Turkey Ripper
  'ATX_Grognak_HockeyStick', // Grognak's Hockey Stick
  'ATX_CroquetMallet', // Croquet Mallet
]);

/**
 * Generated omods to hide from pickers: records that pass extraction and
 * obtainability but are wrong anyway.
 */
export const hiddenOmodIds: ReadonlySet<string> = new Set<string>([
  // Combo-Breaker's: exists in the ESM as a 4★ melee legendary (granted perk =
  // GetRandomPercent-gated Set-Value-0 on EP79/EP27 AP costs) but was never
  // released to players — user-confirmed 2026-07-12, not in the in-game
  // legendary mod pool. Delete this line if it ever ships.
  'mod_Legendary_Weapon4_Melee_ComboBreaker',
]);

/**
 * Effects whose data cannot move numbers yet: 'pendingMechanic' = the game
 * mechanic behind it is a deferred rework; 'needsEnemyDefenses' = the value
 * is extracted but the engine has no enemy DR/ER to apply it to. Drives the
 * picker badges (src/data/omods.ts classifyOmodDisplay).
 */
export const omodBadgeOverrides: Readonly<Record<string, 'inert' | 'pendingMechanic' | 'needsEnemyDefenses'>> = {
  // Furious / Pounder's badges REMOVED (Onslaught, 2026-07-12): both now emit
  // real dbm+stacks modifiers via the granted-perk chase (EP189 "Mod Damage
  // on Consecutive Hits" + EP190 "Mod Max Consecutive Hits Allowed") — see
  // dps-todos/onslaught.md and docs/assumptions.md "Onslaught".
  //
  // Combo-Breaker's badge REMOVED (2026-07-12): the mod is unreleased and now
  // lives in hiddenOmodIds above (mechanical analysis preserved there).
  // Charged and Thrill-Seeker's badges REMOVED (Stage C2/C3, 2026-07-11): both
  // mechanics now move real numbers — Charged's light-attack/detonation cycle
  // folds into sustained DPS (scenarios.ts), Thrill-Seeker's killstreak-tiered
  // reload/melee speed folds into the effective weapon (effective-weapon.ts).
  // The V.A.T.S. Unknown effect variants: each grants real crit-perk ranks via
  // OMOD property 116 (verified in the 2026-07-02 dump: BetterCriticals01-03,
  // CriticalSavvy01-03, GHL_GlowingCriticals01-03, GrimReapersSprint01,
  // Psychopath01). Inert until the perk-grant route lands in the extractor.
  mod_Custom_TheVATSUnknown_BetterCriticals: 'inert',
  mod_Custom_TheVATSUnknown_CritSavvy: 'inert',
  mod_Custom_TheVATSUnknown_GlowingCriticals: 'inert',
  mod_Custom_TheVATSUnknown_GrimReapersSprint: 'inert',
  mod_Custom_TheVATSUnknown_Psychopath: 'inert',
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
  // The V.A.T.S. Unknown (W05_COMP_Astronaut_AlienBlaster_QuestReward) effect
  // variants: attached by the reward flow (no record-level reverse refs), each
  // grants crit-perk ranks — see omodBadgeOverrides (2026-07-10 walk).
  'mod_Custom_TheVATSUnknown_BetterCriticals',
  'mod_Custom_TheVATSUnknown_CritSavvy',
  'mod_Custom_TheVATSUnknown_GlowingCriticals',
  'mod_Custom_TheVATSUnknown_GrimReapersSprint',
  'mod_Custom_TheVATSUnknown_Psychopath',
]);

/**
 * Omods that must only be offered on specific weapons. Needed for mods with
 * EMPTY targetKeywords on shared attach points (they'd pass isAttachable on
 * every weapon exposing the slot).
 */
export const omodWeaponRestrictions: Readonly<Record<string, readonly string[]>> = {
  // The V.A.T.S. Unknown effect variants belong to the unique alien blaster
  // only (attached by the reward flow; 2026-07-10 walk).
  mod_Custom_TheVATSUnknown_BetterCriticals: ['W05_COMP_Astronaut_AlienBlaster_QuestReward'],
  mod_Custom_TheVATSUnknown_CritSavvy: ['W05_COMP_Astronaut_AlienBlaster_QuestReward'],
  mod_Custom_TheVATSUnknown_GlowingCriticals: ['W05_COMP_Astronaut_AlienBlaster_QuestReward'],
  mod_Custom_TheVATSUnknown_GrimReapersSprint: ['W05_COMP_Astronaut_AlienBlaster_QuestReward'],
  mod_Custom_TheVATSUnknown_Psychopath: ['W05_COMP_Astronaut_AlienBlaster_QuestReward'],
};

/**
 * Per-weapon field patches applied after adaptation.
 *
 * Fire-rate note: extracted `attackDelaySec` / automatic-flag data is
 * ESM-verified for the base weapon (dps-todos/fire-rate.md — 30+ in-game
 * Pip-Boy Fire Rate readings, 2026-07-13). The two entries below are the only
 * confirmed exceptions to the standard `speed / 0.11` auto-fire divisor;
 * every other "exception" candidate (Submachine Gun, Railway Rifle, Combat
 * Shotgun's Automatic Receiver) turned out to be fully explained by ordinary
 * Speed SET/MUL_ADD folding once `isAutomatic` stopped reading the
 * `WeaponTypeAutomatic` keyword (see effective-weapon.ts) — no override
 * needed for those.
 */
export const weaponCorrections: Readonly<Record<string, Partial<Weapon>>> = {
  // The V.A.T.S. Unknown: its effect-variant mods sit on ap_customName
  // (0x0047A264), a slot the WEAP record doesn't list because the reward flow
  // attaches them as instance data. Appended so the picker can offer the
  // variants (2026-07-10 walk; full extracted list + the custom slot).
  W05_COMP_Astronaut_AlienBlaster_QuestReward: {
    attachParentSlots: [
      '0x00114364', '0x0002249D', '0x0002249F', '0x0005D4D7', '0x00022499',
      '0x001E32C8', '0x004E89A8', '0x004E89A9', '0x004E89AA', '0x004E89AB',
      '0x0047A264',
    ],
  },
  // Gatling Gun: confirmed via a dedicated `AnimsGatlingGun` keyword (distinct
  // from every other automatic weapon's own bespoke Anims* keyword, e.g.
  // Minigun's `AnimsMinigun` — which DOES use the standard 0.11s cycle,
  // proving each weapon's animation resource is independent, not a shared
  // override) — real, in-game Pip-Boy Fire Rate confirmed 2026-07-13: base
  // Speed 1.0, Pip-Boy 20 ⇒ animDurationSec 0.5s (1.0/0.5×10=20). No barrel
  // mod changes Speed, so this is a fixed weapon-level constant.
  GatlingGun: {
    animDurationSec: 0.5,
  },
};

/**
 * Modifier ADDITIONS layered onto an OMOD's extracted modifiers (unlike
 * `legendary-values.ts`'s `legendaryValueOverrides`, which REPLACES — these
 * concatenate, for cases where extraction got everything right except one
 * value with no corresponding ESM property). Keyed by OMOD edid.
 */
export const omodModifierAdditions: Readonly<Record<string, Modifier[]>> = {
  // Gatling Laser Charging Barrels: confirmed via two independent in-game
  // Pip-Boy Fire Rate readings (2026-07-13) landing on the identical derived
  // constant — Charging alone (0.5 effective speed, Pip-Boy 30) and Charging
  // + Prime Receiver (0.3 effective speed, Pip-Boy 18) both back-solve to
  // exactly 1/6s, confirming this OMOD swaps to a genuinely different,
  // slower "charged-beam" animation on top of its Speed MUL_ADD −0.75 (which
  // stays correctly extracted — this ADDS to it, doesn't replace it). All 4
  // regular + 4 Ultracite Gatling Laser variants share the same underlying
  // `_PARENT_mod_WEAPON_GatlingLaser_Super` include (0x0083EB31) and need the
  // identical addition.
  ...Object.fromEntries(
    [
      'mod_GatlingLaser_barrel_Super_Base',
      'mod_GatlingLaser_Barrel_Super_HipAccuracy',
      'mod_GatlingLaser_Barrel_Super_Recoil',
      'mod_GatlingLaser_Barrel_Super_Recoil-HipAccuracy',
      'mod_Ultracite_GatlingLaser_barrel_Super_Base',
      'mod_Ultracite_GatlingLaser_Barrel_Super_HipAccuracy',
      'mod_Ultracite_GatlingLaser_Barrel_Super_Recoil',
      'mod_Ultracite_GatlingLaser_Barrel_Super_Recoil-HipAccuracy',
    ].map((edid): [string, Modifier[]] => [
      edid,
      [
        {
          id: `${edid}:animDurationSec`,
          source: { kind: 'omod', formId: '', edid, name: 'Charging Barrels' },
          bucket: 'animDurationSec',
          op: 'SET',
          value: 1 / 6,
          conditions: [],
        },
      ],
    ])
  ),
};
