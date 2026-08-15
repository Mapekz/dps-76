import type { Weapon } from '@/types';

/**
 * Hand-maintained weapon corrections layered over ESM-generated data.
 * This file survives regeneration (`bun run extract`). Every entry should
 * carry a source comment (in-game test, wiki, community).
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
  // — WeaponsUniqueNamedList (the unique-registry FLST) grants the base weapon
  // + a mod_Custom_* OMOD at ap_customName (identity + effects), plus a paint.
  // Verified via `esm refs` 2026-07-13. This unreferenced-COBJ class is
  // invisible to scripts/extract/obtainability.ts — needs periodic manual
  // re-review after future extractions.
  'E08B_SuperSledge_TheDebilitator', // -> SuperSledge Unique slot (E08B_mod_Custom_TheDebilitator)
  'E08B_HuntingRifle_DoctorsOrders', // -> HuntingRifle Unique slot (E08B_mod_Custom_HuntingRifle_DoctorsOrders)
  'E08B_Minigun_FoundationsVengeance', // -> Minigun Unique slot (E08B_mod_Custom_FoundationsVengeance)
  'E08B_Blunderbuss_PiratePunch', // -> Blackpowder_Pistol_Blunderbuss Unique slot (E08B_mod_Custom_Blackpowder_PiratePunch)
  'E08B_DeathTambo_ToneDeath', // -> DeathTambo Unique slot (E08B_mod_Custom_ToneDeath)
  // Xerxos (Season 7 reward, user-confirmed live 2026-07-21): ships as a
  // mod_Custom_Xerxos preset on base Gamma Gun, not a standalone WEAP. The
  // legacy SCORE_S7_GammaGun_Xerxos record is the usual dead REPAIRONLY
  // pattern and correctly stays excluded.
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
 * Weapons modeled as splash-reliant (lobbed/splash-dependent launchers that
 * never land their direct projectile hit). With these weapons, the direct
 * projectile hit is modeled as never connecting, so Onslaught hit-event
 * counting suppresses their physical projectile tick and counts only the
 * explosion. Playstyle rationale: you rely on splash damage (user-stated
 * 2026-07-30; docs/assumptions.md "Onslaught").
 *
 * Deliberate exclusions (keep both hit ticks because their projectile damage is
 * significant and aimed directly): BOSRocketLauncher (Hellstorm Missile Launcher),
 * Cremator, TeslaCannon.
 */
export const splashReliantWeaponIds: ReadonlySet<string> = new Set<string>([
  'MissileLauncher',
  'Fatman',
  'M79',
  'E09A_MoleMinerM79',
  'LC096_LvlScorchedGrenadeLauncher_M79',
  'AutoGrenadeLauncher',
  'SDOW_crSlasherBoss_AutoGL_DailyOps',
  'Broadsider',
]);

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


/**
 * Build corrections object for splash-reliant weapons. These weapons are
 * modeled as never landing their direct projectile hit, so Onslaught
 * hit-event counting suppresses their physical projectile tick and counts
 * only the explosion.
 */
export function buildSplashReliantCorrections(
  weaponIds: ReadonlySet<string>,
): Readonly<Record<string, Partial<Weapon>>> {
  const corrections: Record<string, Partial<Weapon>> = {};
  for (const id of weaponIds) {
    corrections[id] = { splashReliant: true };
  }
  return corrections;
}

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
 * Weapons whose DEFAULT barrel is itself a continuous stream — a stream hit
 * has no discrete projectile impact to trigger an explosion, so Explosive 2★
 * (and any other explosive-family damage) never applies while it's equipped.
 * Not ESM-provable (the Explosive omod's own modifier carries no gating
 * condition) — USER-CONFIRMED 2026-08-15. Only the OBTAINABLE weapon id is
 * listed; unobtainable boss/workshop-trap variants never reach the picker.
 * Suppression lifts once a real explosive-conversion barrel is equipped
 * (Cryolator's Polar Lobber Barrel — produces a genuine `explosionChase`,
 * see effective-weapon.ts's `streamSuppressesExplosion`). Opposite direction
 * from `streamConvertingOmodIds` (omod-corrections.ts): those weapons are
 * normal by default and only become stream-suppressed once equipped.
 */
export const streamDeliveryWeaponIds: ReadonlySet<string> = new Set<string>([
  'Cryolator',
  'Flamer',
]);
