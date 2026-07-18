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
  // Combo-Breaker's hide REMOVED 2026-07-15: the earlier "never released" note
  // (2026-07-12) was wrong — user-confirmed it IS a real, craftable melee-only
  // 4★ (hasGrantingCobj:true, ma_legendarycrafting_weaponmelee).
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
  // Cremator flame-color chems: pure cosmetics (zero modifiers) riding the
  // stat-bearing ap_gun_Receiver attach point instead of a COSMETIC_SLOT_RE
  // slot, so the cosmetic-slot exclusion can't catch them (tester report,
  // dps-todos/omod-slot-hygiene.md). Hiding all four empties the Cremator's
  // bogus "Receiver" slot; its real stat slots (Barrel/Tank/Magazine) are
  // unaffected.
  'mod_Cremator_Chemical_RedFire',
  'mod_Cremator_Chemical_BlueFire',
  'mod_Cremator_Chemical_GreenFire',
  'mod_Cremator_Chemical_PinkFire',
  // Unique identity mods riding their base weapon's template with NO
  // player-facing grant chain (2026-07-14 refs walks,
  // dps-todos/unique-cursed-mods.md "bogus" review; delete the line if one
  // ever ships):
  // Minty Breather (Cryolator): only granting LVLI is
  // zzz_LL_MutatedEvents_Rewards_Weapon_Cryolator (0x0067F601) — zzz_ dev
  // record with zero external refs. NOT to be confused with
  // mod_Custom_Overkill_Copy01 (also named "Minty Breather"), an
  // unobtainable dev dupe that needs no entry here.
  'mod_Custom_MintyBreather',
  // The Pipe (Pipe Gun): its template-combination keyword 0x0091EE2B has
  // zero external refs — no LVLI/QUST/FLST ever instantiates the config.
  'mod_Custom_ThePipe',
  // Pyro-Technician's (mod_Legendary_Weapon2_Fire, 0x00849316): the July-10
  // patch repurposed a formerly-orphaned bounty record (Attach Point left
  // null) into this weapon 2★. It has a real, correctly-formed crafting
  // recipe (COBJ co_mod_Legendary_Weapon2_Fire -> Created Object 0x00849316,
  // matching Cryologist's co_mod_Legendary_Weapon2_Cryo's naming convention)
  // and legendary crafting attaches via a scripted mechanism
  // (COBJ_Legendary_Attach_Scrip) rather than reading Attach Point directly
  // — so obtainability derivation reads `true` (real COBJ reverse-ref) and
  // this initially looked like a pure CK-metadata gap, not a functional one.
  // User-confirmed (2026-07-15) this is wrong: it is NOT actually craftable
  // in-game — the null Attach Point does break something in the live
  // crafting-bench flow this ESM-only check can't see. Same false-positive
  // shape as mod_GaussPistol_Barrel_Energy above. `extract-omods.ts`'s
  // ATTACH_POINT_OVERRIDES rescue still runs (keeps the record + its real
  // modifiers in the dataset for reference), but it's hidden here from the
  // player-facing picker until Bethesda fixes the record upstream.
  'mod_Legendary_Weapon2_Fire',
]);

/**
 * Effects whose data cannot move numbers yet: 'pendingMechanic' = the game
 * mechanic behind it is a deferred rework. ('needsEnemyDefenses' REMOVED
 * Phase 2 — Enemy defenses shipped, src/data/omods.ts.) Drives the picker
 * badges (src/data/omods.ts classifyOmodDisplay).
 */
export const omodBadgeOverrides: Readonly<Record<string, 'inert' | 'pendingMechanic'>> = {
  // Furious / Pounder's badges REMOVED (Onslaught, 2026-07-12): both now emit
  // real dbm+stacks modifiers via the granted-perk chase (EP189 "Mod Damage
  // on Consecutive Hits" + EP190 "Mod Max Consecutive Hits Allowed") — see
  // dps-todos/onslaught.md and docs/assumptions.md "Onslaught".
  //
  // Combo-Breaker's badge REMOVED (2026-07-12); its hiddenOmodIds entry was
  // also removed 2026-07-15 (real craftable melee 4★ — see hiddenOmodIds note).
  // Mechanical analysis: granted perk = GetRandomPercent-gated Set-Value-0 on
  // EP79/EP27 AP costs — probabilistic, not extractor-modeled.
  // Charged and Thrill-Seeker's badges REMOVED (Stage C2/C3, 2026-07-11): both
  // mechanics now move real numbers — Charged's light-attack/detonation cycle
  // folds into sustained DPS (scenarios.ts), Thrill-Seeker's killstreak-tiered
  // reload/melee speed folds into the effective weapon (effective-weapon.ts).
  // The V.A.T.S. Unknown effect variants' badges + rescue REMOVED (2026-07-16):
  // these five sibling OMODs (BetterCriticals/CritSavvy/GlowingCriticals/
  // GrimReapersSprint/Psychopath, 0x008F1647-B) have zero ESM reverse refs and
  // are unreferenced legacy/cut records, not real selectable variants — the
  // unique's actual shipped effect is the base `mod_Custom_TheVATSUnknown`
  // record (0x008F1646, SETs VATSCriticalMultAdjustMin/Max = 0.2/2.0, card
  // text "V.A.T.S. Criticals Deal Between 20% to 200% Damage"), now modeled
  // via omodModifierAdditions below. See forceVisibleOmodIds / removed
  // omodWeaponRestrictions entries (same rationale).
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
  // The V.A.T.S. Unknown effect variants' rescue REMOVED (2026-07-16): these
  // five sibling OMODs turned out to be unreferenced legacy/cut records, not
  // real selectable variants — see omodBadgeOverrides for the corrected
  // mechanical read (the unique's real effect lives on the base
  // mod_Custom_TheVATSUnknown record, which is obtainable:true on its own and
  // needs no rescue).
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
  // The V.A.T.S. Unknown effect-variant entries REMOVED (2026-07-16): those
  // five sibling OMODs turned out to be unreferenced legacy/cut records (see
  // omodBadgeOverrides). The real effect is the base mod_Custom_TheVATSUnknown
  // record, which is already correctly scoped to AlienBlaster via its own
  // templateModFormIds — no restriction entry needed.
};

/**
 * Display-name fixes for generated omods, applied at the dataset chokepoint
 * (dataset.ts) so every access path sees the corrected name. For unique
 * identity mods the name IS the weapon rename (`effectiveWeaponName`), so a
 * wrong one is user-visible twice. The mechanical " Custom Mod"/" Custom
 * Name" suffixes are already stripped at extraction (omodDisplayName,
 * extract-omods.ts) — entries here are for names that are simply wrong in
 * the ESM record.
 */
export const omodNameOverrides: Readonly<Record<string, string>> = {
  // ESM Name is "Poison" (the effect archetype, not the unique). The unique
  // pump action shotgun is "The Kabloom" (CustomItemName_TheKabloom keyword;
  // in-game name user-reported 2026-07-14).
  mod_custom_TheKabloom_Effect: 'The Kabloom',
  // ESM Name is "Paranormal Mod". The unique double-barrel is "Cold Shoulder"
  // (WeaponTypeColdShoulder keyword; docs/assumptions.md §Unique weapons).
  mod_custom_Coldshoulder_DmgvsCryptid: 'Cold Shoulder',
  // Record has NO Name field (rescued unnamed template member, emitted under
  // its edid) — the unique flamer is "Holy Fire" (its companion paint record
  // mod_custom_HolyFire_Paint 0x006A983C is named "Holy Fire"; effect mod
  // 0x006E06A3 walked 2026-07-14: 6 properties, in Flamer's template).
  mod_custom_HolyFire_Effect: 'Holy Fire',
  // The remaining rescued unnamed identity effects (see extract-omods.ts
  // unnamed-template-member rescue). Each ESM record has no Name and its
  // CustomItemName_* KYWD carries no FULL (checked 2026-07-14) — names are
  // the in-game unique item names (event/reward uniques matching the edids).
  mod_custom_CultistPiercer_Effect: 'Cultist Piercer',
  mod_custom_EldersMark_Effect: "Elder's Mark",
  mod_custom_LucaSwitchblade_Effect: "Luca's Switchblade",
  mod_custom_OguaGauntlet_Effect: 'Ogua Gauntlet',
  // Mistress of Mystery uniques' description mods (ap_Item_Description).
  // Voice of Set's carries the weapon's real +20% ballistic modifier and is
  // a DEFAULT part (engine folds it via getDefaultOmods).
  mod_Description_MoM_VoiceofSet: 'Voice of Set',
  mod_Description_MoM_BladeofBastet: 'Blade of Bastet',
};

/**
 * Per-weapon slot label overrides — (weaponId, attachPointEdid) → label.
 *
 * The game reuses gun attach points on automatic-melee/power-tool weapons, so
 * their slots inherit nonsense gun names ("Scope" holding blades). None of
 * these attach-point KYWDs carries a FULL name to source, so each label is
 * derived from the slot's actual eligible mods (2026-07-14 sweep,
 * dps-todos/omod-slot-naming.md). Power tools NOT listed need nothing: the
 * Mr. Handy Buzz Blade's sole shock mod rides ap_melee_MeleeMod, which
 * already reads "Upgrade" (its real KYWD FULL) via SLOT_LABEL_OVERRIDES.
 */
export const perWeaponSlotLabelOverrides: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  // "Scope" options: No Mod / Burning / Electrified / Poisoned / Turbo —
  // blade treatments.
  AutoAxe: { ap_gun_Scope: 'Blade' },
  // "Barrel" options: Standard/Bow/Dual/Long Bow BAR; "Scope" options:
  // No Mod / Flamer — an accessory, not optics.
  Chainsaw_76: { ap_gun_Barrel: 'Bar', ap_gun_Scope: 'Attachment' },
  // "Barrel" options: Standard / Piercing DRILL BIT.
  Drill: { ap_gun_Barrel: 'Drill Bit' },
  // "Upgrade" options: Standard / Curved BLADE / Extended BLADE.
  Ripper: { ap_melee_MeleeMod: 'Blade' },
  // Voice of Set's identity rides ap_Item_Description like the Cursed mods
  // (global label "Cursed") — but it's a Mistress of Mystery unique, not a
  // cursed item.
  MoM_VoiceOfSet_44: { ap_Item_Description: 'Unique' },
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
  // Dom Pedro (WEAP `Nitro`) Explosive muzzle mods: their OverrideProjectile
  // chase finds EXPL `Nitro_Explosive` (0x0084460A → PROJ → EXPL, walked
  // 2026-07-14) carrying ONLY a main Damage Curve Table
  // (CT_Player_Damage_Universal_Tier24) — direct damage with no Placed
  // Object hazard, which the extractor deliberately leaves note-only (the
  // Cremator-reskin anti-double-count rule, docs/assumptions.md "OMOD-chased
  // launcher payloads"). Here the payload is real (it IS the mod's effect,
  // paired with its extracted −20%/−30% base-damage trade), so it's
  // hand-supplied. Scoped to 'ballistic': the engine has no OMOD-conditional
  // explosive component (materializeDamageTypeComponents excludes
  // 'explosive'), so the explosion folds into the physical hit — right paper
  // number; explosive-only perk interactions not modeled (noted in
  // assumptions). ADD lands after the mods' own MUL_ADD reduction in
  // foldOps, so the payload is correctly NOT reduced by the −20%/−30%.
  ...Object.fromEntries(
    ['mod_Nitro_SpecialEffect_Explosive', 'mod_Nitro_SpecialEffect_ExplosivePenetrating'].map(
      (edid): [string, Modifier[]] => [
        edid,
        [
          {
            id: `${edid}:explosion`,
            source: { kind: 'omod', formId: '', edid, name: 'Explosive' },
            bucket: 'baseDamage',
            op: 'ADD',
            curve: {
              input: 'itemLevel',
              // EXPL Nitro_Explosive Damage Curve Table (Tier24 universal).
              points: [
                { x: 1, y: 31 }, { x: 5, y: 35 }, { x: 10, y: 39 }, { x: 15, y: 44 },
                { x: 20, y: 50 }, { x: 25, y: 56 }, { x: 30, y: 64 }, { x: 35, y: 72 },
                { x: 40, y: 81 }, { x: 45, y: 91 }, { x: 50, y: 103 },
              ],
            },
            curveScale: 1,
            conditions: [{ kind: 'damageTypeScope', types: ['ballistic'] }],
          },
        ],
      ]
    )
  ),
  // Dom Pedro (Nitro) Fortunate magazine mods: EP-211 "add a bullet to clip"
  // chance is note-only in extraction — hand-supplied as ammoFreeChance EV
  // (same magazine-amortization as no-consume; see docs/assumptions.md).
  mod_Nitro_Magazine_Fortunate4: [
    {
      id: 'mod_Nitro_Magazine_Fortunate4:ammoFreeChance',
      source: {
        kind: 'omod',
        formId: '0x008445DA',
        edid: 'mod_Nitro_Magazine_Fortunate4',
        name: 'Fortunate Four Magazine',
      },
      bucket: 'ammoFreeChance',
      op: 'ADD',
      value: 0.21,
      conditions: [],
    },
  ],
  mod_Nitro_Magazine_Fortunate6: [
    {
      id: 'mod_Nitro_Magazine_Fortunate6:ammoFreeChance',
      source: {
        kind: 'omod',
        formId: '0x00844605',
        edid: 'mod_Nitro_Magazine_Fortunate6',
        name: 'Fortunate Six Magazine',
      },
      bucket: 'ammoFreeChance',
      op: 'ADD',
      value: 0.14,
      conditions: [],
    },
  ],
  // The V.A.T.S. Unknown (Alien Blaster quest reward) base OMOD
  // mod_Custom_TheVATSUnknown (0x008F1646, walked 2026-07-16): SETs actor
  // values VATSCriticalMultAdjustMin/Max = 0.2/2.0 — a uniform-random ×0.2 to
  // ×2.0 roll each VATS crit, card text "V.A.T.S. Criticals Deal Between 20%
  // to 200% Damage". Both AVs are unmapped in the extractor (no bucket route)
  // so the record extracts with zero modifiers; hand-supplied here.
  // User-confirmed (2026-07-16): the roll scales the additive crit-damage
  // BONUS (perks/legendary ADDs on critDmgBonus), not the base weapon crit
  // mult — Max 2.0 matching the default base crit mult is coincidental, not a
  // second roll on the base. Modeled at the roll's expected value (mean of
  // uniform[0.2, 2.0] = 1.1) via the critDmgBonusScale bucket (MUL_ADD 0.1
  // over base 1.0 → ×1.1), which is linear so the mean is exact for expected
  // DPS even though any single crit's roll isn't. Exact scaling target only
  // (not the base mult) still wants an in-game measurement — see
  // dps-todos/measurement-backlog.md.
  mod_Custom_TheVATSUnknown: [
    {
      id: 'mod_Custom_TheVATSUnknown:critDmgBonusScale',
      source: {
        kind: 'omod',
        formId: '0x008F1646',
        edid: 'mod_Custom_TheVATSUnknown',
        name: 'The V.A.T.S. Unknown',
      },
      bucket: 'critDmgBonusScale',
      op: 'MUL_ADD',
      value: 0.1,
      conditions: [],
    },
  ],
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
