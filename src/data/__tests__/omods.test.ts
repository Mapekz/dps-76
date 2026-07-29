import { describe, it, expect } from 'vitest';
import type { Weapon } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import { getWeapons } from '@/data';
import { effectiveWeaponName, getLegendaryOmodSlots, getOmodSlots, isEligible } from '@/data/omods';
import { isOmodEligibleForWeapon } from '@/data/omod-eligibility';

// 2026-07-13 unique-weapon rework: named uniques collapsed into base weapon +
// a mod_Custom_* OMOD at ap_customName. Many carry zero extracted modifiers
// (notes-only effects) but must still surface in a "Unique" picker slot.

describe('Unique mod slot (ap_customName)', () => {
  it("Super Sledge's Unique slot is labeled 'Unique' and lists its four known unique mods", () => {
    const superSledge = getWeapons('live')['SuperSledge'];
    const slots = getOmodSlots('live', superSledge);
    const uniqueSlot = slots.find((s) => s.slot === 'ap_customName');
    expect(uniqueSlot?.label).toBe('Unique');

    const ids = uniqueSlot?.options.map((o) => o.id) ?? [];
    for (const id of [
      'mod_Custom_AllRise',
      'mod_Custom_SuperSledge_TheFarmhand',
      'E08B_mod_Custom_TheDebilitator',
      'E09B_mod_Custom_WhackerSmacker',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it("Deathclaw Gauntlet's Unique slot contains Unstoppable Monster, badged inert (its damage-taken effect is notes-only)", () => {
    const gauntlet = getWeapons('live')['DeathclawGauntlet'];
    const slots = getOmodSlots('live', gauntlet);
    const uniqueSlot = slots.find((s) => s.slot === 'ap_customName');
    const option = uniqueSlot?.options.find((o) => o.id === 'mod_Custom_UnstoppableMonster');
    expect(option).toBeDefined();
    // classifyOmodDisplay's notes fallback: a zero-modifier stock part with
    // extraction notes badges 'inert' rather than showing unbadged.
    expect(option?.badge).toBe('inert');
  });
});

// 2026-07-14 COBJ-anchored eligibility (docs/assumptions.md "OMOD eligibility & recipe chains"): empty
// targetKeywords no longer match every weapon sharing the attach point.

describe('isEligible', () => {
  const synthOmod = (overrides: Partial<GeneratedOmod>): GeneratedOmod => ({
    id: 'mod_Synth',
    formId: '0xMOD',
    name: 'Synth Mod',
    description: '',
    attachPointFormId: '0xAP',
    attachPointEdid: 'ap_gun_Barrel',
    targetKeywords: [],
    modifiers: [],
    addedKeywords: [],
    hasEnchantments: false,
    ...overrides,
  });
  const synthWeapon = (overrides: Partial<Weapon>): Weapon =>
    ({
      id: 'SynthWeapon',
      attachParentSlots: ['0xAP'],
      keywords: [],
      templateModFormIds: [],
      defaultModFormIds: [],
      ...overrides,
    }) as unknown as Weapon;

  it('branch 0: attach point missing from the weapon → not eligible', () => {
    expect(isEligible(synthOmod({ attachPointFormId: '0xOTHER' }), synthWeapon({}))).toBe(false);
  });

  it('branch 1: keyword-scoped mods use the subset check', () => {
    const omod = synthOmod({ targetKeywords: ['ma_HuntingRifle'] });
    expect(
      isEligible(omod, synthWeapon({ keywords: ['ma_HuntingRifle', 'ObjectTypeWeapon'] })),
    ).toBe(true);
    expect(isEligible(omod, synthWeapon({ keywords: ['ma_GatlingGun'] }))).toBe(false);
  });

  it('branch 1: template membership bypasses an instance-only keyword (Boiling Point pattern)', () => {
    // The game applies the second keyword (RD01_ma_*) at instance creation
    // via the template combination that includes the mod — the base WEAP
    // never carries it.
    const omod = synthOmod({ targetKeywords: ['ma_Flamer', 'RD01_ma_BoilingPoint'] });
    expect(
      isEligible(omod, synthWeapon({ keywords: ['ma_Flamer'], templateModFormIds: ['0xMOD'] })),
    ).toBe(true);
    expect(isEligible(omod, synthWeapon({ keywords: ['ma_Flamer'] }))).toBe(false);
  });

  it('branch 2a: an empty-keyword mod is eligible where the weapon template whitelists it', () => {
    const omod = synthOmod({});
    expect(isEligible(omod, synthWeapon({ templateModFormIds: ['0xMOD'] }))).toBe(true);
  });

  it('branch 2b: omodWeaponRestrictions rescues reward-granted mods with no template seat', () => {
    // Exercises isOmodEligibleForWeapon's restrictions param directly (rather
    // than a specific live omodWeaponRestrictions entry, which may be empty
    // at any given time) — reward-granted identity mods with no ESM-derivable
    // weapon tie at all still need this rescue path (see omod-eligibility.ts
    // branch 2 doc-comment).
    const omod = synthOmod({ id: 'mod_Custom_RewardMod' });
    const restrictions = { mod_Custom_RewardMod: ['AlienBlaster'] };
    expect(isOmodEligibleForWeapon(omod, synthWeapon({ id: 'AlienBlaster' }), restrictions)).toBe(
      true,
    );
    expect(isOmodEligibleForWeapon(omod, synthWeapon({ id: 'GaussMinigun' }), restrictions)).toBe(
      false,
    );
  });

  it('branch 2c: an empty-keyword mod with no template seat and no rescue is not eligible anywhere', () => {
    expect(isEligible(synthOmod({}), synthWeapon({}))).toBe(false);
  });
});

describe('COBJ-anchored eligibility against live data (regression cases from the 2026-07-14 tester sweep)', () => {
  const optionIds = (weaponId: string): string[] => {
    const weapon = getWeapons('live')[weaponId];
    expect(weapon, weaponId).toBeDefined();
    return getOmodSlots('live', weapon).flatMap((s) => s.options.map((o) => o.id));
  };

  it('the Vox Syringe Barrel stays on its quest syringer and leaves the gauss minigun', () => {
    expect(optionIds('GaussMinigun')).not.toContain('MTNS05_mod_PipeSyringer_Barrel_Vox');
  });

  it('the internal suppressor stays on the 10mm SMG and leaves the auto grenade launcher', () => {
    expect(optionIds('10mmSMG')).toContain('mod_10mmSMG_InternalSuppressor');
    expect(optionIds('AutoGrenadeLauncher')).not.toContain('mod_10mmSMG_InternalSuppressor');
  });

  it('the "Standard" assaultron-head receivers stop polluting receiver slots on unrelated weapons', () => {
    for (const weaponId of ['M79', 'GaussPistol']) {
      const ids = optionIds(weaponId);
      expect(ids, weaponId).not.toContain('DLC01mod_Weapon_AssaultronHead');
      expect(ids, weaponId).not.toContain('W05_MQ_003P_DLC01mod_Weapon_PollyAssaultronHead');
    }
  });

  it('the Alien Blaster offers only the base V.A.T.S. Unknown mod, not its five unreferenced legacy siblings (2026-07-16 regression guard)', () => {
    const ids = optionIds('AlienBlaster');
    expect(ids).toContain('mod_Custom_TheVATSUnknown');
    for (const id of [
      'mod_Custom_TheVATSUnknown_BetterCriticals',
      'mod_Custom_TheVATSUnknown_CritSavvy',
      'mod_Custom_TheVATSUnknown_GlowingCriticals',
      'mod_Custom_TheVATSUnknown_GrimReapersSprint',
      'mod_Custom_TheVATSUnknown_Psychopath',
    ]) {
      expect(ids, id).not.toContain(id);
    }
  });
});

// 2026-07-14 show-all-mods display policy (docs/assumptions.md "OMOD eligibility & recipe chains"):
// valid + obtainable zero-modifier mods surface badged 'inert' instead of
// vanishing; dead-mechanic slots and reroll placeholders stay out.

describe('show-all-mods display policy against live data', () => {
  const slotsOf = (weaponId: string) => {
    const weapon = getWeapons('live')[weaponId];
    expect(weapon, weaponId).toBeDefined();
    return getOmodSlots('live', weapon);
  };

  it("the Black Powder Rifle's muzzle slot offers the Large Bayonet, unbadged now that range folds (Phase 1)", () => {
    // Pre-Phase-1 this was badged 'inert' (its only two modifiers were
    // weaponMinRange/weaponMaxRange MUL_ADD -12%, extracted but not yet
    // folded). effective-weapon.ts now folds both buckets into
    // rangeFalloffMult's inputs (scenarios.ts), so modifierHasEngineEffect
    // sees a real effect and the badge clears — same predicate, new ground
    // truth (src/types/modifiers.ts BUCKET_REGISTRY).
    const muzzle = slotsOf('BlackPowder_Rifle').find((s) => s.slot === 'ap_gun_Muzzle');
    const bayonet = muzzle?.options.find((o) => o.id === 'mod_BlackPowder_Rifle_Bayonet');
    expect(bayonet).toBeDefined();
    expect(bayonet?.badge).toBeUndefined();
  });

  it("the Gauss Minigun's sight slot offers the Gunner Sights, badged inert", () => {
    const sight = slotsOf('GaussMinigun').find((s) => s.slot === 'ap_gun_Sight');
    const gunnerSights = sight?.options.find((o) => o.id === 'mod_GaussMinigun_Scope_SightReflex');
    expect(gunnerSights).toBeDefined();
    expect(gunnerSights?.badge).toBe('inert');
  });

  it('enemy-type-gated mods are unbadged conditionals, not "needs enemy DR"', () => {
    // Assassin's (1★ legendary, GetIsRace HumanRace) — legendary picker path.
    const fixer = getWeapons('live')['CombatRifle_Fixer'];
    const star1 = getLegendaryOmodSlots('live', fixer).find(
      (s) => /Weapon1/i.test(s.slot) || s.options.some((o) => o.id.includes('Weapon1')),
    );
    const assassins = star1?.options.find((o) => o.id === 'mod_Legendary_Weapon1_DmgVsPlayers');
    expect(assassins).toBeDefined();
    expect(assassins?.badge).toBeUndefined();

    // Cold Shoulder's Paranormal Mod (ActorTypeCryptid) — standard picker path.
    const doubleBarrel = getWeapons('live')['DoubleBarrelShotgun'];
    const unique = getOmodSlots('live', doubleBarrel).find((s) => s.slot === 'ap_customName');
    const paranormal = unique?.options.find((o) => o.id === 'mod_custom_Coldshoulder_DmgvsCryptid');
    expect(paranormal).toBeDefined();
    expect(paranormal?.badge).toBeUndefined();

    // Prime Receiver (anti-Scorched dbm) — receiver slot.
    const receiver = slotsOf('CombatRifle_Fixer').find((s) => s.slot === 'ap_gun_Receiver');
    const prime = receiver?.options.find(
      (o) => o.id === 'mod_CombatRifle_receiver_AntiScorchBeast',
    );
    expect(prime).toBeDefined();
    expect(prime?.badge).toBeUndefined();
  });

  it('dead-mechanic slots and legendary-reroll placeholders never surface anywhere in the roster', () => {
    for (const weapon of Object.values(getWeapons('live'))) {
      const slots = [...getOmodSlots('live', weapon), ...getLegendaryOmodSlots('live', weapon)];
      for (const slot of slots) {
        expect(slot.slot, weapon.id).not.toBe('ap_Gun_UniversalOffset_Range');
        expect(slot.slot, weapon.id).not.toBe('ap_Weapon_Model_Replacement');
        for (const o of slot.options) {
          expect(o.id.startsWith('mod_Legendary_Crafting_Weapon'), `${weapon.id}/${o.id}`).toBe(
            false,
          );
        }
      }
    }
  });
});

// 2026-07-14 slot hygiene (docs/assumptions.md "OMOD eligibility & recipe chains"): dedupe
// same-name/same-payload options; hide slots that offer no decision.
// ap_customName and legendary slots are exempt from both rules.

describe('slot hygiene against live data', () => {
  const slotsOf = (weaponId: string) => {
    const weapon = getWeapons('live')[weaponId];
    expect(weapon, weaponId).toBeDefined();
    return getOmodSlots('live', weapon);
  };

  it('the Hatchet\'s melee slot keeps exactly one "No Upgrade" (template-preferred) alongside its real upgrades', () => {
    const melee = slotsOf('Hatchet').find((s) => s.slot === 'ap_melee_MeleeMod');
    const noUpgrades = melee?.options.filter((o) => o.name === 'No Upgrade') ?? [];
    expect(noUpgrades.map((o) => o.id)).toEqual(['mod_melee_Null_MeleeMod']);
    expect(melee?.options.map((o) => o.id)).toContain('mod_melee_Hatchet_ElectroFusion');
  });

  it('standard-only slots disappear: M79 receiver, Auto Grenade Launcher feeder/grip/sight', () => {
    expect(slotsOf('M79').map((s) => s.slot)).not.toContain('ap_gun_Receiver');
    const aglSlots = slotsOf('AutoGrenadeLauncher').map((s) => s.slot);
    for (const slot of ['ap_gun_FeedThroat', 'ap_gun_Grip', 'ap_gun_Sight']) {
      expect(aglSlots, slot).not.toContain(slot);
    }
  });

  it('single-option stock-part slots disappear even when the part is not a listed default (AGL Bot Mag, .50 cal Mag)', () => {
    expect(slotsOf('AutoGrenadeLauncher').map((s) => s.slot)).not.toContain('ap_Bot_Mag');
    expect(slotsOf('50CalMachineGun').map((s) => s.slot)).not.toContain('ap_gun_Mag');
  });

  it('the Bone Club keeps its melee slot — clearing the default Wounding mod to "No Upgrade" is a real choice', () => {
    const melee = slotsOf('BoneClub').find((s) => s.slot === 'ap_melee_MeleeMod');
    expect(melee?.options.map((o) => o.name)).toContain('No Upgrade');
    expect(melee?.options.length).toBeGreaterThan(1);
  });

  it("the Cremator's bogus receiver slot (flame-color cosmetics) is gone; its real stat slots remain", () => {
    const slots = slotsOf('Cremator').map((s) => s.slot);
    expect(slots).not.toContain('ap_gun_Receiver');
    for (const slot of ['ap_gun_Barrel', 'ap_gun_ChemicalType', 'ap_gun_Mag']) {
      expect(slots, slot).toContain(slot);
    }
  });

  it('single-option unique-identity slots survive the standard-only rule (The Fixer, Circuit Breaker)', () => {
    for (const weaponId of ['CombatRifle_Fixer', '10mm_CircuitBreaker']) {
      const unique = slotsOf(weaponId).find((s) => s.slot === 'ap_customName');
      expect(unique, weaponId).toBeDefined();
      expect(unique!.options.length, weaponId).toBeGreaterThan(0);
    }
  });
});

// 2026-07-14 slot naming (docs/assumptions.md "OMOD eligibility & recipe chains"): global overrides
// (KYWD FULL-sourced where one exists) + a per-weapon layer for power tools
// whose gun attach points hold non-gun parts.

describe('slot labels', () => {
  const labelOf = (weaponId: string, slot: string): string | undefined => {
    const weapon = getWeapons('live')[weaponId];
    expect(weapon, weaponId).toBeDefined();
    return getOmodSlots('live', weapon).find((s) => s.slot === slot)?.label;
  };

  it('global overrides: melee "MeleeMod" reads Upgrade (KYWD FULL), Cremator "ChemicalType" reads Tank, "Mag" reads Magazine', () => {
    expect(labelOf('Machete', 'ap_melee_MeleeMod')).toBe('Upgrade');
    expect(labelOf('Cremator', 'ap_gun_ChemicalType')).toBe('Tank');
    expect(labelOf('Cremator', 'ap_gun_Mag')).toBe('Magazine');
  });

  it("power-tool per-weapon overrides derived from each slot's eligible mods", () => {
    expect(labelOf('AutoAxe', 'ap_gun_Scope')).toBe('Blade');
    expect(labelOf('Chainsaw_76', 'ap_gun_Barrel')).toBe('Bar');
    expect(labelOf('Chainsaw_76', 'ap_gun_Scope')).toBe('Attachment');
    expect(labelOf('Drill', 'ap_gun_Barrel')).toBe('Drill Bit');
    expect(labelOf('Ripper', 'ap_melee_MeleeMod')).toBe('Blade');
  });

  it('gun weapons keep their auto-derived labels (no per-weapon leakage)', () => {
    // Hunting Rifle again per the original intent — its scope slot only
    // exists via the attach-point closure (receiver-granted).
    expect(labelOf('HuntingRifle', 'ap_gun_Scope')).toBe('Scope');
    expect(labelOf('HuntingRifle', 'ap_gun_Barrel')).toBe('Barrel');
  });
});

// 2026-07-14 attach-point closure (docs/assumptions.md "Attach-point
// closure"): most slots are granted by installed mods (a receiver grants
// grip/scope/barrel/mag), so weapons.json attachParentSlots is a fixpoint
// closure over mod-granted slots, not the WEAP record's own list.

describe('attach-point closure against live data', () => {
  const slotsOf = (weaponId: string) => {
    const weapon = getWeapons('live')[weaponId];
    expect(weapon, weaponId).toBeDefined();
    return getOmodSlots('live', weapon);
  };

  it('the Hunting Rifle regains its receiver-granted slots; the scope slot lists all twelve scopes', () => {
    const slots = slotsOf('HuntingRifle');
    const edids = slots.map((s) => s.slot);
    for (const slot of [
      'ap_gun_Barrel',
      'ap_gun_Grip',
      'ap_gun_Mag',
      'ap_gun_Muzzle',
      'ap_gun_Scope',
    ]) {
      expect(edids, slot).toContain(slot);
    }
    const scope = slots.find((s) => s.slot === 'ap_gun_Scope');
    expect(scope?.options).toHaveLength(12);
    // Zero-stat non-stock scopes surface badged inert (show-all-mods policy).
    expect(scope?.options.find((o) => o.id === 'mod_HuntingRifle_SCOPE_reflex_Base')?.badge).toBe(
      'inert',
    );
  });

  it('The Fixer offers its full slot set again (was Receiver + Unique only)', () => {
    const edids = slotsOf('CombatRifle_Fixer').map((s) => s.slot);
    for (const slot of [
      'ap_gun_Barrel',
      'ap_gun_Grip',
      'ap_gun_Mag',
      'ap_gun_Muzzle',
      'ap_gun_Scope',
      'ap_customName',
    ]) {
      expect(edids, slot).toContain(slot);
    }
  });

  it('tester regression: .44, 10mm, 10mm SMG and assault rifle offer more than a receiver slot', () => {
    for (const weaponId of ['44', '10mm', '10mmSMG', 'AssaultRifle']) {
      const edids = slotsOf(weaponId).map((s) => s.slot);
      expect(edids.filter((e) => e !== 'ap_gun_Receiver').length, weaponId).toBeGreaterThanOrEqual(
        3,
      );
    }
  });

  it('the Plasma Gun barrel slot offers its full barrel family (flamer/sniper/splitter/…)', () => {
    const barrel = slotsOf('PlasmaGun').find((s) => s.slot === 'ap_gun_Barrel');
    expect(barrel?.options.length).toBeGreaterThanOrEqual(20);
  });
});

// 2026-07-14 unique & cursed slot completion (docs/assumptions.md "Unique weapons"):
// template membership bypasses instance-only keywords; unnamed identity
// effects are rescued at extraction (names via omodNameOverrides); cursed
// mods get their own slot label and rename the weapon.

describe('unique & cursed mods against live data', () => {
  const uniqueOptions = (weaponId: string, slot = 'ap_customName') => {
    const weapon = getWeapons('live')[weaponId];
    expect(weapon, weaponId).toBeDefined();
    return getOmodSlots('live', weapon).find((s) => s.slot === slot)?.options ?? [];
  };

  it('previously keyword-blocked template uniques surface in their Unique slot', () => {
    for (const [weaponId, omodId] of [
      ['Flamer', 'RD01_Mod_Custom_BoilingPoint_CustomName'],
      ['Gauntlet', 'RD01_Mod_Custom_DrillFist_CustomName'],
      ['GatlingLaser', 'RD01_Mod_Custom_Valkyrie_CustomName'],
      ['GaussRifle', 'RD01_Mod_Custom_StrikeBreaker_CustomName'],
      ['DLC04_HandMadeGun', 'mod_custom_ShatteredGrounds_Custom'],
      ['PlasmaGun', 'mod_Custom_Plasma_AbraxoGun'],
      ['PlasmaGun', 'mod_Custom_Plasma_Abraxolator'],
      ['RailwayRifle', 'RD01_Mod_Custom_LicketySplit_CustomName'],
    ] as const) {
      expect(
        uniqueOptions(weaponId).map((o) => o.id),
        `${weaponId}/${omodId}`,
      ).toContain(omodId);
    }
  });

  it('rescued unnamed identity effects surface with their corrected names', () => {
    const flamer = uniqueOptions('Flamer');
    expect(flamer.find((o) => o.id === 'mod_custom_HolyFire_Effect')?.name).toBe('Holy Fire');
    const pick = uniqueOptions('Pickaxe');
    expect(pick.find((o) => o.id === 'mod_custom_CultistPiercer_Effect')?.name).toBe(
      'Cultist Piercer',
    );
  });

  it('name fixes: The Kabloom (was "Poison"), Cold Shoulder (was "Paranormal Mod"), Flatliner, stripped Custom-Name suffixes', () => {
    expect(
      uniqueOptions('PumpActionShotgun').find((o) => o.id === 'mod_custom_TheKabloom_Effect')?.name,
    ).toBe('The Kabloom');
    expect(
      uniqueOptions('DoubleBarrelShotgun').find(
        (o) => o.id === 'mod_custom_Coldshoulder_DmgvsCryptid',
      )?.name,
    ).toBe('Cold Shoulder');
    expect(
      uniqueOptions('GaussRifle').find((o) => o.id === 'RD01_Mod_Custom_StrikeBreaker_CustomName')
        ?.name,
    ).toBe('Flatliner');
    expect(
      uniqueOptions('Flamer').find((o) => o.id === 'RD01_Mod_Custom_BoilingPoint_CustomName')?.name,
    ).toBe('Boiling Point');
  });

  it('cursed mods ride a slot labeled "Cursed" and rename the weapon', () => {
    const broadsider = getWeapons('live')['Broadsider'];
    const slot = getOmodSlots('live', broadsider).find((s) => s.slot === 'ap_curse');
    expect(slot?.label).toBe('Cursed');
    expect(slot?.options.map((o) => o.id)).toContain('EN06_mod_Ranged_Broadsider_Custom_Cursed');
    expect(
      effectiveWeaponName('live', broadsider, {
        ap_curse: 'EN06_mod_Ranged_Broadsider_Custom_Cursed',
      }),
    ).toBe('Cursed Broadsider');
    expect(effectiveWeaponName('live', broadsider, {})).toBe(broadsider.name);
  });

  it("Voice of Set's identity mod shows under a per-weapon 'Unique' label with its real name", () => {
    const options = uniqueOptions('MoM_VoiceOfSet_44', 'ap_Item_Description');
    expect(options.find((o) => o.id === 'mod_Description_MoM_VoiceofSet')?.name).toBe(
      'Voice of Set',
    );
    const weapon = getWeapons('live')['MoM_VoiceOfSet_44'];
    expect(getOmodSlots('live', weapon).find((s) => s.slot === 'ap_Item_Description')?.label).toBe(
      'Unique',
    );
  });
});
