import { describe, it, expect } from 'bun:test';
import { applySelection, sanitizeConsumables, toggleConsumable } from '@/lib/consumable-rules';
import type { GeneratedBuff } from '@/types/generated';

// Synthetic buffs — hermetic against whatever scripts/extract currently
// produces (a concurrent agent is rewriting the buff extractor).
function buff(
  id: string,
  category: GeneratedBuff['category'],
  dispelKeys?: string[],
): GeneratedBuff {
  return {
    id,
    formId: `0x${id}`,
    name: id,
    kind: 'consumable',
    modifiers: [],
    notes: [],
    category,
    dispelKeys,
  };
}

const chemA = buff('ChemA', 'chem', ['ChemEffect|ChemDispelEffects|StackPsychoStrength']);
const chemB = buff('ChemB', 'chem', ['ChemEffect|ChemDispelEffects|StackBuffStrength']);
const alcoholA = buff('AlcoholA', 'alcohol', [
  'AlcoholEffect|AlcoholDispelEffect|StackAlcoholStrength',
]);
const alcoholB = buff('AlcoholB', 'alcohol', [
  'AlcoholEffect|AlcoholDispelEffect|StackAlcoholEndurance',
]);
// Two STR foods share a key (same bonus); an END food carries a different key.
const foodStr1 = buff('FoodStr1', 'food', [
  'FoodEffect|SURV_EffectTypeFoodBuff|FoodDispelEffect_Strength',
]);
const foodStr2 = buff('FoodStr2', 'food', [
  'FoodEffect|SURV_EffectTypeFoodBuff|FoodDispelEffect_Strength',
]);
const foodEnd = buff('FoodEnd', 'food', [
  'FoodEffect|SURV_EffectTypeFoodBuff|FoodDispelEffect_Endurance',
]);
// Milk_Chally-style case: a DRINK sharing a food's exact key (cross-category).
const drinkStr = buff('DrinkStr', 'drink', [
  'FoodEffect|SURV_EffectTypeFoodBuff|FoodDispelEffect_Strength',
]);
// Magazines/bobbleheads carry no dispelKeys — category alone drives their collision.
const magazineA = buff('MagazineA', 'magazine');
const magazineB = buff('MagazineB', 'magazine');
const bobbleheadA = buff('BobbleheadA', 'bobblehead');
const bobbleheadB = buff('BobbleheadB', 'bobblehead');

const buffsById = new Map<string, GeneratedBuff>(
  [
    chemA,
    chemB,
    alcoholA,
    alcoholB,
    foodStr1,
    foodStr2,
    foodEnd,
    drinkStr,
    magazineA,
    magazineB,
    bobbleheadA,
    bobbleheadB,
  ].map((b) => [b.id, b]),
);

describe('applySelection', () => {
  const replaceRows: { name: string; active: string; added: string }[] = [
    { name: 'a new chem replaces an active chem', active: 'ChemA', added: 'ChemB' },
    { name: 'a new alcohol replaces an active alcohol', active: 'AlcoholA', added: 'AlcoholB' },
    { name: 'a new magazine replaces an active magazine', active: 'MagazineA', added: 'MagazineB' },
    {
      name: 'a new bobblehead replaces an active bobblehead',
      active: 'BobbleheadA',
      added: 'BobbleheadB',
    },
    {
      name: 'a same-key food replaces the active food (exact dispelKeys match)',
      active: 'FoodStr1',
      added: 'FoodStr2',
    },
  ];

  for (const row of replaceRows) {
    it(row.name, () => {
      const result = applySelection(buffsById, [row.active], row.added);
      expect(result.consumables).toEqual([row.added]);
      expect(result.replaced).toEqual([row.active]);
    });
  }

  const coexistRows: { name: string; first: string; second: string }[] = [
    {
      name: 'chem and alcohol coexist (different categories, no shared dispel key)',
      first: 'ChemA',
      second: 'AlcoholA',
    },
    {
      name: 'a magazine and a bobblehead coexist (independent categories)',
      first: 'MagazineA',
      second: 'BobbleheadA',
    },
    {
      name: 'STR vs END foods (different keys) stack — no displacement',
      first: 'FoodStr1',
      second: 'FoodEnd',
    },
  ];

  for (const row of coexistRows) {
    it(row.name, () => {
      const withFirst = applySelection(buffsById, [], row.first);
      const withBoth = applySelection(buffsById, withFirst.consumables, row.second);
      expect(withBoth.consumables.sort()).toEqual([row.first, row.second].sort());
      expect(withBoth.replaced).toEqual([]);
    });
  }

  it('a magazine/bobblehead coexists with chem/alcohol/food (fully independent axes)', () => {
    let active: string[] = [];
    active = applySelection(buffsById, active, 'ChemA').consumables;
    active = applySelection(buffsById, active, 'AlcoholA').consumables;
    active = applySelection(buffsById, active, 'FoodStr1').consumables;
    active = applySelection(buffsById, active, 'MagazineA').consumables;
    const result = applySelection(buffsById, active, 'BobbleheadA');
    expect(result.consumables.sort()).toEqual(
      ['AlcoholA', 'BobbleheadA', 'ChemA', 'FoodStr1', 'MagazineA'].sort(),
    );
    expect(result.replaced).toEqual([]);
  });

  it('a drink collides with a food sharing the same dispel key (cross-category, Milk_Chally case)', () => {
    const withFood = applySelection(buffsById, [], 'FoodStr1');
    const result = applySelection(buffsById, withFood.consumables, 'DrinkStr');
    expect(result.consumables).toEqual(['DrinkStr']);
    expect(result.replaced).toEqual(['FoodStr1']);
  });

  it('multi-item displacement: a new food colliding with 2 active items removes both', () => {
    // FoodStr1 and DrinkStr share the same key; a new same-key item displaces both at once.
    const seeded = applySelection(buffsById, [], 'FoodStr1').consumables;
    const withTwo = [...seeded, 'DrinkStr'];
    const result = applySelection(buffsById, withTwo, 'FoodStr2');
    expect(result.consumables).toEqual(['FoodStr2']);
    expect(result.replaced.sort()).toEqual(['DrinkStr', 'FoodStr1']);
  });

  it('an unknown id is a no-op add (no crash, nothing changes)', () => {
    const result = applySelection(buffsById, ['ChemA'], 'DoesNotExist');
    expect(result.consumables).toEqual(['ChemA']);
    expect(result.replaced).toEqual([]);
  });
});

describe('toggleConsumable', () => {
  it('active id: plain removal, no displacement side effects', () => {
    const result = toggleConsumable(buffsById, ['ChemA', 'AlcoholA'], 'ChemA');
    expect(result.consumables).toEqual(['AlcoholA']);
    expect(result.replaced).toEqual([]);
  });

  it('re-toggling the just-added id removes it (add then remove round-trips to empty)', () => {
    const added = toggleConsumable(buffsById, [], 'ChemA');
    expect(added.consumables).toEqual(['ChemA']);
    const removed = toggleConsumable(buffsById, added.consumables, 'ChemA');
    expect(removed.consumables).toEqual([]);
  });

  it('inactive id: delegates to applySelection (auto-displaces a collision)', () => {
    const result = toggleConsumable(buffsById, ['ChemA'], 'ChemB');
    expect(result.consumables).toEqual(['ChemB']);
    expect(result.replaced).toEqual(['ChemA']);
  });
});

describe('sanitizeConsumables', () => {
  it('replays ids in order, later ids win collisions (two chems → the last one)', () => {
    expect(sanitizeConsumables(buffsById, ['ChemA', 'ChemB'])).toEqual(['ChemB']);
  });

  it('drops unknown ids', () => {
    expect(sanitizeConsumables(buffsById, ['ChemA', 'NotReal'])).toEqual(['ChemA']);
  });

  it('drops duplicates', () => {
    expect(sanitizeConsumables(buffsById, ['FoodStr1', 'FoodEnd', 'FoodStr1'])).toEqual([
      'FoodStr1',
      'FoodEnd',
    ]);
  });

  it('keeps non-colliding items and resolves collisions across a mixed legacy payload', () => {
    // ChemA then ChemB (B wins), AlcoholA stays (different category/keys),
    // FoodStr1 then FoodStr2 (Str2 wins) — final set: ChemB, AlcoholA, FoodStr2.
    const result = sanitizeConsumables(buffsById, [
      'ChemA',
      'ChemB',
      'AlcoholA',
      'FoodStr1',
      'FoodStr2',
    ]);
    expect(result.slice().sort()).toEqual(['AlcoholA', 'ChemB', 'FoodStr2'].sort());
  });

  it('two magazines in a legacy payload → the last one wins, independent of a bobblehead', () => {
    const result = sanitizeConsumables(buffsById, ['MagazineA', 'BobbleheadA', 'MagazineB']);
    expect(result.slice().sort()).toEqual(['BobbleheadA', 'MagazineB'].sort());
  });
});
