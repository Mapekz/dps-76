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
  // Companion/robot attack records that pass obtainability via COBJ/GMRW
  // chains (2026-07-12 vetting pass): PharmaBot (Mister Handy) spray attacks,
  // display their raw edids as names.
  'PharmaBot_Left_Spray',
  'PharmaBot_Middle_Spray',
  'PharmaBot_Right_Spray',
  // Photo-mode tools, not weapons: WeaponTypeNonOffensive + BlockVATS +
  // ObjectTypeCamera (2026-07-12 vetting pass).
  'Camera_SnapMatic', // "ProSnap Deluxe Camera"
  'Camera_Disposable', // "Recon Imager"
  // Utility/effect throwables with placeholder WEAP damage (1–5 flat) — their
  // real payloads ride EXPL records (docs/assumptions.md "Launcher explosion
  // damage").
  // Throwing BLADES (Throwing Knife, Tomahawk, Meat Cleaver, Sheepsquatch
  // Shard) carry real damage curves and stay. User decision, 2026-07-12
  // vetting pass.
  'WorkshopArtillerySmokeFlare', // "Artillery Smoke Grenade" — artillery call-in flare
  'MTR04_DrossThrownItem', // "Dross" — Camden Park trash-toss prop
  'HalluciGenGrenade', // "HalluciGen Gas Grenade" — gas cloud, no direct damage
  'EN02_ScanGrenade', // "Orbital Scan Beacon"
  'EN02_OrbitalStrikeGrenade', // "Orbital Strike Beacon"
  'EN02_OrbitalStrikeWeapon', // "Orbital Strike" — the strike effect the beacon triggers, never held
  // Original Paddle Ball: every reverse-ref chain is dead (its LVLIs are
  // themselves unreferenced, its COBJ is a *_NOCRAFT dummy, plus a debug
  // FLST) — dev-room item, user-confirmed 2026-07-12. The obtainable one is
  // DLC04_PaddleBall_NWOT (sold by Chloe: NWOT_LL_Chloe_Weapon →
  // NWOT_Clown_VendorChest), which stays visible as the sole "Paddle Ball".
  'DLC04_PaddleBall',
  // 2026-07-12 user-review batch: NPC/quest/skin records that pass
  // obtainability via shared chains but aren't real player weapons.
  'Gutsy02LeftArmLaserGunAuto', // "Laser Gun" — Mister Gutsy robot-arm weapon
  'JoeyBello_SuperSledge_BadaBoom', // "Bada-Boom" — Joey Bello's NPC super sledge
  'ATX_AssaultronHeadCharging_Imposter', // "Imposter Assaultron Head" — not a player weapon
  'W05_MQ_003P_Muscle_PollyAssaultronHead', // "Polly's Assaultron Head" — quest prop
  'atx_alienprobe', // "The Invader" — cosmetic skin item, not a weapon
  'MTNS05_PipeSyringer_Vox', // "Vox Syringer" — quest-item syringer
  'WarShrike', // "War Shrike" — not player-obtainable (yet); unhide if it ships
  'MoM02B_HistoricSword', // "Grant's Saber" — quest item, not a general player weapon
  // Protest signs: ten stat-identical records differing only in sign text —
  // consolidated into ProtestSign01 (renamed "Protest Sign" below).
  'ProtestSign02',
  'ProtestSign03',
  'ProtestSign04',
  'ProtestSign05',
  'ProtestSign06',
  'ProtestSign07',
  'ProtestSign08',
  'ProtestSign09',
  'ProtestSign10',
  // Unique-weapons rework (2026-07-13): dead legacy WEAPs the obtainability
  // heuristic can't catch because their COBJs are real-looking but are
  // themselves unreferenced (not REPAIRONLY/NOCRAFT-suffixed, just orphaned)
  // — the game's unique-registry LVLIs actually grant the base weapon + a
  // mod_Custom_* OMOD. Verified via `esm refs` 2026-07-13. This
  // unreferenced-COBJ class is invisible to scripts/extract/obtainability.ts
  // — needs periodic manual re-review after future extractions.
  'E08B_SuperSledge_TheDebilitator', // -> SuperSledge Unique slot (E08B_mod_Custom_TheDebilitator)
  'E08B_HuntingRifle_DoctorsOrders', // -> HuntingRifle Unique slot (E08B_mod_Custom_HuntingRifle_DoctorsOrders)
  'E08B_Minigun_FoundationsVengeance', // -> Minigun Unique slot (E08B_mod_Custom_FoundationsVengeance)
  'E08B_Blunderbuss_PiratePunch', // -> Blackpowder_Pistol_Blunderbuss Unique slot (E08B_mod_Custom_Blackpowder_PiratePunch)
  'E08B_DeathTambo_ToneDeath', // -> DeathTambo Unique slot (E08B_mod_Custom_ToneDeath)
]);

/**
 * Weapons the obtainability derivation (scripts/extract/obtainability.ts)
 * wrongly ruled unobtainable: shown despite `obtainable: false`. Review
 * `_meta.json → excludedDetailed.weaponUnobtainable` after each extraction
 * and rescue false negatives here — no re-extract needed.
 */
export const forceVisibleWeaponIds: ReadonlySet<string> = new Set<string>([
  // Pleasant Valley bellhop protectron ticket-exchange uniques: script-
  // granted (ticket redemption has no record-level ESM reverse reference —
  // invisible to `esm refs`), user-confirmed obtainable in-game 2026-07-13.
  'MTNL01_PumpActionShotgun_Fancy', // Fancy Pump Action Shotgun
  'MTNL01_SingleActionRevolver_Fancy', // Fancy Single Action Revolver
  // 2026-07-13 unique-weapons rework cleanup: removed the 11 rescues that
  // used to live here (DoubleBarrelShotgun_ColdShoulder,
  // AssaultRifle_WhistleInTheDark, DeathclawGauntlet_UnstoppableMonster,
  // 44_MedicalMalpractice, LeverGun_SoleSurvivor,
  // PipeWrench_MechanicsBestFriend, E08B_CombatShotgun_CrowdControl,
  // DLC01_AssaultronBlade_TheGutter, FaceBreaker,
  // SCORE_S11_AutoGrenadeLauncher_NukaLauncher, CamdenWhackerWeapon) — they
  // were presumed obtainability false-negatives but are verified true
  // negatives (`esm refs`: no refs, or only REPAIRONLY/NOCRAFT COBJ stubs).
  // Each identity now lives as a mod_Custom_* OMOD on a base weapon's
  // templateModFormIds, not a standalone WEAP — see docs/assumptions.md
  // "Unique weapons".
  // 2026-07-12 user-review removals from this rescue list (they revert to
  // their obtainable:false hiding): MTR05_ChineseOfficerSword ("Ancient
  // Blade" — misnamed/not a real player weapon), ATX_Sten ("The Black
  // Knight" — not player-obtainable), ATX_TurkeyRipper (not a real weapon),
  // ATX_Grognak_HockeyStick (cosmetic skin of another weapon),
  // ATX_CroquetMallet (wrong name / invalid weapon).
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
  // Gauss Pistol "Energy Barrel": cut content that stays obtainable:true only
  // by riding the Gauss Pistol's template (2026-07-14 weak-evidence sweep,
  // _meta.reviewFlagged.omodWeakEvidence: weap:GaussPistol +
  // noGrantCobj:co_mod_GaussPistol_Barrel_Energy — its only recipe learns
  // from recipe_Dummy_Uncraftable_Item_NOCRAFT). Tester-confirmed not
  // craftable/obtainable in game (dps-todos/omod-obtainability-chains.md).
  'mod_GaussPistol_Barrel_Energy',
  // Legendary-crafting reroll placeholders (ap_Legendary_Reroll): workbench
  // UI machinery, not equippable effects — their FULL names are mojibake
  // star glyphs ("Random �..."). Surfaced by the 2026-07-14 show-all-mods
  // display policy (dps-todos/omod-nondps-stats.md); nothing else lives on
  // that attach point.
  'mod_Legendary_Crafting_Weapon1',
  'mod_Legendary_Crafting_Weapon2',
  'mod_Legendary_Crafting_Weapon3',
  'mod_Legendary_Crafting_Weapon4',
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
  // Fancy Pump Action Shotgun / Fancy Single Action Revolver stat mods:
  // flipped obtainable:false alongside their host WEAPs when the unique-
  // weapons rework hid the standalone Fancy records (same Pleasant Valley
  // bellhop protectron ticket-exchange rationale as forceVisibleWeaponIds
  // above) — rescue the mods too so the rescued weapons' slots populate.
  // Source: user-confirmed 2026-07-13.
  'MTNL01_mod_PumpActionShotgun_Barrel_Fancy',
  'MTNL01_mod_PumpActionShotgun_Grip_Fancy',
  'MTNL01_mod_PumpActionShotgun_Receiver_Fancy',
  'MTNL01_mod_SingleActionRevolver_Barrel_Fancy',
  'MTNL01_mod_SingleActionRevolver_Grip_Fancy',
  'MTNL01_mod_SingleActionRevolver_Receiver_Fancy',
  // The V.A.T.S. Unknown effect variants (2026-07-13: re-homed from the now-
  // hidden legacy W05_COMP_Astronaut_AlienBlaster_QuestReward record — base
  // AlienBlaster hosts mod_Custom_TheVATSUnknown in its templateModFormIds
  // and has always had the ap_customName attach slot): attached by the
  // reward flow (no record-level reverse refs), each grants crit-perk ranks
  // — see omodBadgeOverrides (2026-07-10 walk).
  'mod_Custom_TheVATSUnknown_BetterCriticals',
  'mod_Custom_TheVATSUnknown_CritSavvy',
  'mod_Custom_TheVATSUnknown_GlowingCriticals',
  'mod_Custom_TheVATSUnknown_GrimReapersSprint',
  'mod_Custom_TheVATSUnknown_Psychopath',
  // Terminal/script-sold plan books (2026-07-14 book-chain rework): these
  // mods' recipes are Learn-Method-4 with a real BOOK, but the BOOK's only
  // referencer is the recipe itself — the plans are sold by script-driven
  // vendors the record graph can't see, so the book chase correctly reports
  // cobjBookUnproven and the mods flip obtainable:false. Both are shipped,
  // player-purchasable content:
  // "Plan: Tesla Rifle Lobber Barrel" (recipe_DLC01_mod_LightningGun_Barrel_
  // Lobber, 0x007284E7) — expedition stamps vendor.
  'DLC01_mod_LightningGun_Barrel_Lobber',
  // "Plan: Weaponized Nuka-Cola Schematics" (Recipe_NWOT_mod_WeaponizedNukaCola,
  // 0x006692B7) — Nuka World on Tour Nuka-Cade prize terminal; teaches all
  // three Thirst Zapper magazine conversions. NOTE: still invisible in the
  // picker today — they extract with zero modifiers (payload is a projectile
  // swap) and the no-modifier display rule hides them; this rescue records
  // obtainability so they surface once dps-todos/omod-nondps-stats.md lands.
  'mod_ThirstZapper_Mag_NukaCola',
  'mod_ThirstZapper_Mag_Cherry',
  'mod_ThirstZapper_Mag_Quantum',
]);

/**
 * ADDITIVE rescue for empty-targetKeywords mods with no ESM-derivable weapon
 * tie: isEligible (src/data/omods.ts) branch 2 offers a keyword-less mod only
 * where the weapon's own templateModFormIds whitelist it — OR where an entry
 * here names the weapon. Since the 2026-07-14 COBJ-anchored eligibility
 * rework this table no longer restricts anything by itself (keyword-less mods
 * are hidden-by-default everywhere); it exists for reward/script-granted mods
 * that appear in NO weapon's template (no record-level reverse refs at all).
 */
export const omodWeaponRestrictions: Readonly<Record<string, readonly string[]>> = {
  // The V.A.T.S. Unknown effect variants belong to the unique alien blaster
  // only (attached by the reward flow; 2026-07-10 walk). Re-homed 2026-07-13
  // from the legacy W05_COMP_Astronaut_AlienBlaster_QuestReward WEAP (now
  // hidden — unique-weapons rework) to base 'AlienBlaster', which has always
  // had the ap_customName attach slot (0x0047A264, verified) and hosts
  // mod_Custom_TheVATSUnknown in its templateModFormIds.
  mod_Custom_TheVATSUnknown_BetterCriticals: ['AlienBlaster'],
  mod_Custom_TheVATSUnknown_CritSavvy: ['AlienBlaster'],
  mod_Custom_TheVATSUnknown_GlowingCriticals: ['AlienBlaster'],
  mod_Custom_TheVATSUnknown_GrimReapersSprint: ['AlienBlaster'],
  mod_Custom_TheVATSUnknown_Psychopath: ['AlienBlaster'],
};

/**
 * Per-weapon field patches applied after adaptation.
 *
 * Fire-rate note: extracted `attackDelaySec` / automatic-flag data is
 * ESM-verified for the base weapon (docs/assumptions.md — 30+ in-game
 * Pip-Boy Fire Rate readings, 2026-07-13). The two entries below are the only
 * confirmed exceptions to the standard `speed / 0.11` auto-fire divisor;
 * every other "exception" candidate (Submachine Gun, Railway Rifle, Combat
 * Shotgun's Automatic Receiver) turned out to be fully explained by ordinary
 * Speed SET/MUL_ADD folding once `isAutomatic` stopped reading the
 * `WeaponTypeAutomatic` keyword (see effective-weapon.ts) — no override
 * needed for those.
 */
export const weaponCorrections: Readonly<Record<string, Partial<Weapon>>> = {
  // Bare-fist damage records (real, engine-supported unarmed archetype —
  // paper-damage.ts STR/10 scaling). Renamed from "Unarmed Human"/"Unarmed
  // Power Armor" so they read as deliberate build options; the PA record is
  // the only way to model power-armored punches (higher damage tier).
  // User decision, 2026-07-12 vetting pass.
  UnarmedHuman: { name: 'Unarmed' },
  UnarmedPowerArmor: { name: 'Unarmed (Power Armor)' },
  // In-game display names are FULL + an Instance Naming (INNR) class chunk
  // the extractor doesn't evaluate — dn_CommonGun (0x002377CF) appends
  // "Pistol"/"Rifle"/... from grip/stock keywords. Baked here as the
  // standard-config name (2026-07-12 user review). Note: dn_CommonGun has no
  // "Revolver" chunk — the .44 reads ".44 Pistol" in game.
  '10mm': { name: '10mm Pistol' },
  '44': { name: '.44 Pistol' },
  LaserGun: { name: 'Laser Gun' },
  PlasmaGun: { name: 'Plasma Gun' },
  Enclave_PlasmaGun: { name: 'Enclave Plasma Gun' },
  UltraciteLaserGun: { name: 'Ultracite Laser Gun' },
  PipeGun: { name: 'Pipe Gun' },
  RadiumRifle: { name: 'Radium Rifle' },
  RailwayRifle: { name: 'Railway Rifle' },
  DLC01LightningGun: { name: 'Tesla Rifle' },
  // Ten stat-identical sign-text variants consolidated into this one (the
  // other nine are in hiddenWeaponIds).
  ProtestSign01: { name: 'Protest Sign' },
  // The V.A.T.S. Unknown patch for the legacy
  // W05_COMP_Astronaut_AlienBlaster_QuestReward record REMOVED (2026-07-13,
  // unique-weapons rework): that WEAP is now hidden (hiddenWeaponIds handles
  // it implicitly via obtainable:false — no explicit entry needed) and its
  // attachParentSlots patch is stale. The effect-variant mods are re-homed to
  // base 'AlienBlaster' (see omodWeaponRestrictions), which already lists
  // ap_customName (0x0047A264) in its own attachParentSlots — no patch
  // required there either.
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

/**
 * Generated consumables to hide from pickers: records that pass extraction
 * and obtainability but are wrong anyway (mirrors hiddenOmodIds).
 *
 * `GHL_Glowing*` bobbleheads (2026-07-13): ghoul-mode duplicate ALCH records
 * of the 13 normal bobbleheads, carrying the identical extracted modifier
 * (verified live — e.g. `GHL_GlowingBobbleHead_SmallGuns_Potion` and
 * `BobbleHead_SmallGuns_Potion` both resolve to the same +20% ballistic dbm).
 * Since they're mechanically indistinguishable from the base item, showing
 * both in the picker is pure clutter — hide the glowing twin, keep the base.
 */
export const hiddenConsumableIds: ReadonlySet<string> = new Set<string>([
  'GHL_GlowingBobblehead_Agility_Potion',
  'GHL_GlowingBobbleHead_BigGuns_Potion',
  'GHL_GlowingBobbleHead_Charisma_Potion',
  'GHL_GlowingBobbleHead_Endurance_Potion',
  'GHL_GlowingBobbleHead_EnergyWeapons_Potion',
  'GHL_GlowingBobbleHead_Explosives_Potion',
  'GHL_GlowingBobbleHead_Intelligence_Potion',
  'GHL_GlowingBobbleHead_Luck_Potion',
  'GHL_GlowingBobbleHead_Melee_Potion',
  'GHL_GlowingBobbleHead_Perception_Potion',
  'GHL_GlowingBobbleHead_SmallGuns_Potion',
  'GHL_GlowingBobbleHead_Strength_Potion',
  'GHL_GlowingBobbleHead_Unarmed_Potion',

  // Nuclear Don's Custom Chem Blend (2026-07-14): quest item from "The Ol'
  // Weston Shuffle" (W05_MQR_203P) — found in Nuclear Don's locker, meant to
  // be stolen and used mid-arena-fight. Per the Fallout Wiki it's stripped
  // from inventory on quest completion if unconsumed; the ESM's VMAD data
  // (script property bindings only, no decompiled Papyrus bytecode) can't
  // surface that removal itself. Not a persistent chem a build can rely on.
  'W05_MQR_203P_ChemBlend',
]);

/**
 * Consumable counterpart of forceVisibleWeaponIds/forceVisibleOmodIds
 * (rescues obtainable:false records). Review `_meta.json →
 * excludedDetailed.consumableUnobtainable` after each extraction and rescue
 * false negatives here — no re-extract needed.
 */
export const forceVisibleConsumableIds: ReadonlySet<string> = new Set<string>([
  // 2026-07-14 audit of excludedDetailed.consumableUnobtainable. The RESO
  // (CAMP resource generator), craftable-ACTI and ALCH ferment/age routes are
  // now derived by scripts/extract/obtainability.ts, so the camp-machine foods,
  // the Sunset Sarsaparillas and Vintage Mire Magic Moonshine no longer need
  // rescuing. These two remain script-granted, with no record-level reverse
  // reference the derivation could ever see:
  //
  // Milked from Chally the Moo-Moo: MGEF abBrahminRaceEffect runs
  // Creatures:BrahminRaceMilkingScript, whose `ChallyMilk` property points at
  // this ALCH, gated on the unique NPC's ChallyKeyword. Verified 2026-07-14.
  'Milk_Chally',
  // Spawned by EXPL Storm_SE09_ChickenExplosion via its *Placed Object* field
  // (quest Storm_SE09, "Storm Encounter: Roast Chicken"). Following EXPL
  // referencers in general would let every creature death-explosion through, so
  // this one stays a hand-rescue. Verified 2026-07-14.
  'Storm_SE09_ChickenMeatCooked',
]);
