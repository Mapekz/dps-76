import type { Modifier } from '@/types/modifiers';

/**
 * Hand-maintained weapon-OMOD corrections layered over ESM-generated data.
 * This file survives regeneration (`pnpm extract`). Every entry should
 * carry a source comment (in-game test, wiki, community).
 */

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
  // craftable/obtainable in game (docs/assumptions.md "OMOD eligibility & recipe chains").
  'mod_GaussPistol_Barrel_Energy',
  // Legendary-crafting reroll placeholders (ap_Legendary_Reroll): workbench
  // UI machinery, not equippable effects — their FULL names are mojibake
  // star glyphs ("Random �..."). Surfaced by the 2026-07-14 show-all-mods
  // display policy (docs/assumptions.md "OMOD eligibility & recipe chains"); nothing else lives on
  // that attach point.
  'mod_Legendary_Crafting_Weapon1',
  'mod_Legendary_Crafting_Weapon2',
  'mod_Legendary_Crafting_Weapon3',
  'mod_Legendary_Crafting_Weapon4',
  // Cremator flame-color chems: pure cosmetics (zero modifiers) riding the
  // stat-bearing ap_gun_Receiver attach point instead of a COSMETIC_SLOT_RE
  // slot, so the cosmetic-slot exclusion can't catch them (tester report,
  // docs/assumptions.md "OMOD eligibility & recipe chains"). Hiding all four empties the Cremator's
  // bogus "Receiver" slot; its real stat slots (Barrel/Tank/Magazine) are
  // unaffected.
  'mod_Cremator_Chemical_RedFire',
  'mod_Cremator_Chemical_BlueFire',
  'mod_Cremator_Chemical_GreenFire',
  'mod_Cremator_Chemical_PinkFire',
  // Unique identity mods riding their base weapon's template with NO
  // player-facing grant chain (2026-07-14 refs walks,
  // docs/assumptions.md "Unique weapons" "bogus" review; delete the line if one
  // ever ships):
  // Minty Breather: hidden 2026-07-14 (its only granting LVLI was the
  // zzz_-prefixed dev record 0x0067F601 with zero external refs) — UNHIDDEN
  // 2026-07-21: the 20260717 dump renamed that same record to
  // LL_MutatedEvents_Rewards_Weapon_Cryolator_MintyBreather and wired it
  // into WeaponsUniqueNamedList (mutated-events reward, user-confirmed live).
  // The delete-the-line instruction above executed as designed.
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
  // shape as mod_GaussPistol_Barrel_Energy above.
  // RESOLVED 2026-07-21: the 20260717 dump renamed the record to
  // POST_mod_Legendary_Weapon2_Fire (POST_ staging prefix, alongside
  // Cryologist's POST_mod_Legendary_Weapon2_Cryo and Toxicologist's
  // POST_mod_Legendary_Weapon2_Poison) — Bethesda pulled the whole trio back
  // out of the shipping data, vindicating the 2026-07-15 verdict. The
  // records now drop at the extraction root, so the hide entry became a
  // stale overlay key and was removed; re-adjudicate when a future dump
  // drops the POST_ prefix.
]);
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
  // obtainability so they surface once docs/assumptions.md "OMOD eligibility & recipe chains" lands.
  'mod_ThirstZapper_Mag_NukaCola',
  'mod_ThirstZapper_Mag_Cherry',
  'mod_ThirstZapper_Mag_Quantum',
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
  // docs/assumptions.md "Onslaught".
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
 * docs/assumptions.md "OMOD eligibility & recipe chains"). Power tools NOT listed need nothing: the
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
  // #72.
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
