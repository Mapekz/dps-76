import { describe, it, expect } from 'bun:test';
import { getArmorEffects } from '@/data/armor-modifiers';
import { BODY_JETPACK, DEEP_POCKETED } from '@/data/__tests__/armor-test-helpers';

describe("ArmorStarTier: derived from the representative record's ap_LegendaryN attach point", () => {
  const effects = getArmorEffects('live');

  it(
    'Powered is a pre-existing data ambiguity: a non-obtainable tier-1 twin ' +
      '(mod_Legendary_Armor_APRegen @ ap_Legendary1) is filtered out by obtainability, ' +
      'leaving the tier-2 record (mod_Legendary_Armor2_APRegen @ ap_Legendary2) as the ' +
      'sole survivor and thus the representative — Powered counts against the 2★ budget',
    () => {
      const powered = effects.find((e) => e.name === 'Powered');
      expect(powered?.id).toBe('mod_Legendary_Armor2_APRegen');
      expect(powered?.starTier).toBe(2);
    },
  );

  it('misc-group entries never carry a starTier', () => {
    const misc = effects.filter((e) => e.group === 'misc');
    expect(misc.length).toBeGreaterThan(0); // sanity: misc group is non-empty
    for (const e of misc) expect(e.starTier).toBeUndefined();
  });
});

describe('ArmorSlotGroup: material/lining/misc split', () => {
  const effects = getArmorEffects('live');
  const byName = new Map(effects.map((e) => [e.name, e]));

  it('ap_armor_Tier records land in material; PA lining materials are excluded', () => {
    expect(byName.get('Standard')?.group).toBe('material');
    expect(byName.get('Standard Plate')).toBeUndefined();
    expect(byName.get('Model A')).toBeUndefined();
  });

  it('underarmor styles and _UnderArmor_ lining effects land in lining', () => {
    expect(byName.get('Casual Style')?.group).toBe('lining');
    expect(byName.get('Shielded Lining')?.group).toBe('lining');
  });

  it('non-underarmor ap_armor_Lining and ap_PowerArmor_Misc records land in misc', () => {
    expect(byName.get('Sleek')?.group).toBe('misc');
    expect(byName.get('Targeting HUD')?.group).toBe('misc');
  });

  it('excludes cosmetic attach points and PA lining materials entirely', () => {
    const excludedAttachPoints = [
      'ap_armor_Paint',
      'ap_PowerArmor_BodyMod',
      'ap_Legendary_Reroll',
      'ap_PowerArmor_Lining',
    ];
    for (const e of effects) expect(excludedAttachPoints).not.toContain(e.attachPointEdid);
  });

  it('collapses jetpack cosmetic reskins to the base entry per attach point', () => {
    const jetpackNames = effects.map((e) => e.name).filter((n) => /jet ?pack/i.test(n));
    expect(jetpackNames.sort()).toEqual(['Jet Pack', 'Jetpack']);
  });

  it('badges genuinely inert entries and does not badge engine-effective ones', () => {
    expect(byName.get('Sleek')?.badge).toBe('inert');
    expect(byName.get('Unyielding')?.badge).toBeUndefined();
    expect(byName.get("Bruiser's")?.badge).toBeUndefined();
  });
});

describe('pieceReach, maxCount, and armorType derivation', () => {
  const effects = getArmorEffects('live');
  const byName = new Map(effects.map((e) => [e.name, e]));

  const CUSHIONED = 'DLC03_mod_armor_Marine_Lining_LimbLeg_ReducedFallingDamage';
  const AERODYNAMIC = 'DLC03_mod_armor_Marine_Lining_LimbArm_ReducedPowerAttack';
  const MUFFLED = 'DLC03_mod_armor_Marine_Lining_Limb_ReducedDetection';
  const STANDARD_MATERIAL = 'DLC03_mod_armor_Marine_Arm_Material_0';

  it('derives expected pieceReach, maxCount, and armorType for named priority effects', () => {
    expect(byName.get('Deep Pocketed')).toMatchObject({
      id: DEEP_POCKETED,
      maxCount: 5,
      armorType: 'bodyArmor',
    });
    expect(byName.get('Cushioned')).toMatchObject({
      id: CUSHIONED,
      maxCount: 2,
      armorType: 'bodyArmor',
    });
    expect(byName.get('Aerodynamic')).toMatchObject({
      id: AERODYNAMIC,
      maxCount: 2,
      armorType: 'bodyArmor',
    });
    expect(byName.get('Muffled')).toMatchObject({
      id: MUFFLED,
      maxCount: 4,
      armorType: 'bodyArmor',
    });
    expect(byName.get('Jetpack')).toMatchObject({
      id: BODY_JETPACK,
      maxCount: 1,
      armorType: 'bodyArmor',
    });
    expect(byName.get('Standard')).toMatchObject({
      id: STANDARD_MATERIAL,
      maxCount: 5,
      armorType: 'bodyArmor',
    });
    expect(byName.get('Unyielding')?.armorType).toBe('bodyArmor');
    expect(byName.get('Propelling')?.armorType).toBe('powerArmor');
    expect(byName.get('Chameleon')?.armorType).toBe('both');
    expect(byName.get('Targeting HUD')).toMatchObject({
      maxCount: 1,
      armorType: 'powerArmor',
    });
    // Bun's toMatchObject ignores Set contents, so pieceReach needs toEqual.
    expect(byName.get('Deep Pocketed')?.pieceReach).toEqual(new Set(['torso', 'arm', 'leg']));
    expect(byName.get('Cushioned')?.pieceReach).toEqual(new Set(['leg']));
    expect(byName.get('Aerodynamic')?.pieceReach).toEqual(new Set(['arm']));
    expect(byName.get('Muffled')?.pieceReach).toEqual(new Set(['arm', 'leg']));
    expect(byName.get('Jetpack')?.pieceReach).toEqual(new Set(['torso']));
    expect(byName.get('Targeting HUD')?.pieceReach).toEqual(new Set(['helmet']));
  });

  it('every obtainable non-legendary entry has non-empty pieceReach', () => {
    for (const effect of effects) {
      if (effect.group === 'legendary') continue;
      expect(effect.pieceReach?.size ?? 0).toBeGreaterThan(0);
    }
  });

  it('no non-legendary name-group spans two armor types', () => {
    const byNameType = new Map<string, Set<string>>();
    for (const effect of effects) {
      if (effect.group === 'legendary') continue;
      const types = byNameType.get(effect.name) ?? new Set();
      types.add(effect.armorType);
      byNameType.set(effect.name, types);
    }
    for (const [, types] of byNameType) {
      expect(types.size).toBe(1);
    }
  });
});
