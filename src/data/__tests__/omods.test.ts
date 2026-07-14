import { describe, it, expect } from 'vitest';
import type { Weapon } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import { getWeapons } from '@/data';
import { getOmodSlots, isEligible } from '@/data/omods';

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
