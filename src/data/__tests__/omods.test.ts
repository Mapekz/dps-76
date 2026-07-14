import { describe, it, expect } from 'vitest';
import type { Weapon } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import { getWeapons } from '@/data';
import { getLegendaryOmodSlots, getOmodSlots, isEligible } from '@/data/omods';

// 2026-07-13 unique-weapon rework: named uniques collapsed into base weapon +
// a mod_Custom_* OMOD at ap_customName. Many carry zero extracted modifiers
// (notes-only effects) but must still surface in a "Unique" picker slot.

describe('Unique mod slot (ap_customName)', () => {
  it("Super Sledge's Unique slot is labeled 'Unique' and lists its four known unique mods", () => {
    const superSledge = getWeapons('live')['SuperSledge'];
    const slots = getOmodSlots('live', superSledge);
    const uniqueSlot = slots.find(s => s.slot === 'ap_customName');
    expect(uniqueSlot?.label).toBe('Unique');

    const ids = uniqueSlot?.options.map(o => o.id) ?? [];
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
    const uniqueSlot = slots.find(s => s.slot === 'ap_customName');
    const option = uniqueSlot?.options.find(o => o.id === 'mod_Custom_UnstoppableMonster');
    expect(option).toBeDefined();
    // classifyOmodDisplay's notes fallback: a zero-modifier stock part with
    // extraction notes badges 'inert' rather than showing unbadged.
    expect(option?.badge).toBe('inert');
  });
});

// 2026-07-14 COBJ-anchored eligibility (dps-todos/omod-eligibility.md): empty
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
    expect(isEligible(omod, synthWeapon({ keywords: ['ma_HuntingRifle', 'ObjectTypeWeapon'] }))).toBe(true);
    expect(isEligible(omod, synthWeapon({ keywords: ['ma_GatlingGun'] }))).toBe(false);
  });

  it('branch 2a: an empty-keyword mod is eligible where the weapon template whitelists it', () => {
    const omod = synthOmod({});
    expect(isEligible(omod, synthWeapon({ templateModFormIds: ['0xMOD'] }))).toBe(true);
  });

  it('branch 2b: omodWeaponRestrictions rescues reward-granted mods with no template seat', () => {
    // Real rescue-table entry — the V.A.T.S. Unknown variants exist in no
    // weapon's templateModFormIds (only their generic parent does).
    const omod = synthOmod({ id: 'mod_Custom_TheVATSUnknown_BetterCriticals' });
    expect(isEligible(omod, synthWeapon({ id: 'AlienBlaster' }))).toBe(true);
    expect(isEligible(omod, synthWeapon({ id: 'GaussMinigun' }))).toBe(false);
  });

  it('branch 2c: an empty-keyword mod with no template seat and no rescue is not eligible anywhere', () => {
    expect(isEligible(synthOmod({}), synthWeapon({}))).toBe(false);
  });
});

describe('COBJ-anchored eligibility against live data (regression cases from the 2026-07-14 tester sweep)', () => {
  const optionIds = (weaponId: string): string[] => {
    const weapon = getWeapons('live')[weaponId];
    expect(weapon, weaponId).toBeDefined();
    return getOmodSlots('live', weapon).flatMap(s => s.options.map(o => o.id));
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

  it('the Alien Blaster keeps all five V.A.T.S. Unknown variants (rescue-table regression guard)', () => {
    const ids = optionIds('AlienBlaster');
    for (const id of [
      'mod_Custom_TheVATSUnknown_BetterCriticals',
      'mod_Custom_TheVATSUnknown_CritSavvy',
      'mod_Custom_TheVATSUnknown_GlowingCriticals',
      'mod_Custom_TheVATSUnknown_GrimReapersSprint',
      'mod_Custom_TheVATSUnknown_Psychopath',
    ]) {
      expect(ids, id).toContain(id);
    }
  });
});

// 2026-07-14 show-all-mods display policy (dps-todos/omod-nondps-stats.md):
// valid + obtainable zero-modifier mods surface badged 'inert' instead of
// vanishing; dead-mechanic slots and reroll placeholders stay out.

describe('show-all-mods display policy against live data', () => {
  const slotsOf = (weaponId: string) => {
    const weapon = getWeapons('live')[weaponId];
    expect(weapon, weaponId).toBeDefined();
    return getOmodSlots('live', weapon);
  };

  it("the Black Powder Rifle's muzzle slot offers the Large Bayonet, badged inert", () => {
    const muzzle = slotsOf('BlackPowder_Rifle').find(s => s.slot === 'ap_gun_Muzzle');
    const bayonet = muzzle?.options.find(o => o.id === 'mod_BlackPowder_Rifle_Bayonet');
    expect(bayonet).toBeDefined();
    expect(bayonet?.badge).toBe('inert');
  });

  it("the Gauss Minigun's sight slot offers the Gunner Sights, badged inert", () => {
    const sight = slotsOf('GaussMinigun').find(s => s.slot === 'ap_gun_Sight');
    const gunnerSights = sight?.options.find(o => o.id === 'mod_GaussMinigun_Scope_SightReflex');
    expect(gunnerSights).toBeDefined();
    expect(gunnerSights?.badge).toBe('inert');
  });

  it('dead-mechanic slots and legendary-reroll placeholders never surface anywhere in the roster', () => {
    for (const weapon of Object.values(getWeapons('live'))) {
      const slots = [...getOmodSlots('live', weapon), ...getLegendaryOmodSlots('live', weapon)];
      for (const slot of slots) {
        expect(slot.slot, weapon.id).not.toBe('ap_Gun_UniversalOffset_Range');
        expect(slot.slot, weapon.id).not.toBe('ap_Weapon_Model_Replacement');
        for (const o of slot.options) {
          expect(o.id.startsWith('mod_Legendary_Crafting_Weapon'), `${weapon.id}/${o.id}`).toBe(false);
        }
      }
    }
  });
});

// 2026-07-14 slot hygiene (dps-todos/omod-slot-hygiene.md): dedupe
// same-name/same-payload options; hide slots that offer no decision.
// ap_customName and legendary slots are exempt from both rules.

describe('slot hygiene against live data', () => {
  const slotsOf = (weaponId: string) => {
    const weapon = getWeapons('live')[weaponId];
    expect(weapon, weaponId).toBeDefined();
    return getOmodSlots('live', weapon);
  };

  it("the Hatchet's melee slot keeps exactly one \"No Upgrade\" (template-preferred) alongside its real upgrades", () => {
    const melee = slotsOf('Hatchet').find(s => s.slot === 'ap_melee_MeleeMod');
    const noUpgrades = melee?.options.filter(o => o.name === 'No Upgrade') ?? [];
    expect(noUpgrades.map(o => o.id)).toEqual(['mod_melee_Null_MeleeMod']);
    expect(melee?.options.map(o => o.id)).toContain('mod_melee_Hatchet_ElectroFusion');
  });

  it('standard-only slots disappear: M79 receiver, Auto Grenade Launcher feeder/grip/sight', () => {
    expect(slotsOf('M79').map(s => s.slot)).not.toContain('ap_gun_Receiver');
    const aglSlots = slotsOf('AutoGrenadeLauncher').map(s => s.slot);
    for (const slot of ['ap_gun_FeedThroat', 'ap_gun_Grip', 'ap_gun_Sight']) {
      expect(aglSlots, slot).not.toContain(slot);
    }
  });

  it('single-option stock-part slots disappear even when the part is not a listed default (AGL Bot Mag, .50 cal Mag)', () => {
    expect(slotsOf('AutoGrenadeLauncher').map(s => s.slot)).not.toContain('ap_Bot_Mag');
    expect(slotsOf('50CalMachineGun').map(s => s.slot)).not.toContain('ap_gun_Mag');
  });

  it("the Bone Club keeps its melee slot — clearing the default Wounding mod to \"No Upgrade\" is a real choice", () => {
    const melee = slotsOf('BoneClub').find(s => s.slot === 'ap_melee_MeleeMod');
    expect(melee?.options.map(o => o.name)).toContain('No Upgrade');
    expect(melee?.options.length).toBeGreaterThan(1);
  });

  it("the Cremator's bogus receiver slot (flame-color cosmetics) is gone; its real stat slots remain", () => {
    const slots = slotsOf('Cremator').map(s => s.slot);
    expect(slots).not.toContain('ap_gun_Receiver');
    for (const slot of ['ap_gun_Barrel', 'ap_gun_ChemicalType', 'ap_gun_Mag']) {
      expect(slots, slot).toContain(slot);
    }
  });

  it('single-option unique-identity slots survive the standard-only rule (The Fixer, Circuit Breaker)', () => {
    for (const weaponId of ['CombatRifle_Fixer', '10mm_CircuitBreaker']) {
      const unique = slotsOf(weaponId).find(s => s.slot === 'ap_customName');
      expect(unique, weaponId).toBeDefined();
      expect(unique!.options.length, weaponId).toBeGreaterThan(0);
    }
  });
});
