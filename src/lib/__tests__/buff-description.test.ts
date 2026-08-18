import { describe, it, expect } from 'bun:test';
import { describeBuffModifiers } from '@/lib/buff-description';
import type { GeneratedBuff } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';

const source: Modifier['source'] = {
  kind: 'consumable',
  formId: '0xTEST',
  edid: 'Test',
  name: 'Test',
};

function buff(modifiers: Modifier[]): GeneratedBuff {
  return { id: 'Test', formId: '0xTEST', name: 'Test', kind: 'consumable', modifiers, notes: [] };
}

describe('describeBuffModifiers', () => {
  it('unconditional dbm reads as a plain damage percentage (Guns and Bullets 7)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% damage bonus');
  });

  it('SPECIAL bucket reads as a flat point add, not a percentage (Strength bobblehead)', () => {
    const mod: Modifier = {
      id: '0x2:0',
      source,
      bucket: 'specialStrength',
      op: 'ADD',
      value: 2,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+2 Strength');
  });

  it('weaponKeyword present/absent pair reads as a class qualifier (Small Guns bobblehead)', () => {
    const mod: Modifier = {
      id: '0x3:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.2,
      conditions: [
        { kind: 'weaponKeyword', keyword: 'WeaponTypeBallistic', present: true },
        { kind: 'weaponKeyword', keyword: 'WeaponTypeHeavyGun', present: false },
      ],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe(
      '+20% damage bonus (with ballistic weapons, non-heavy guns)',
    );
  });

  it('damageTypeScope reads as a damage-type qualifier (Explosive bobblehead)', () => {
    const mod: Modifier = {
      id: '0x4:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.3,
      conditions: [{ kind: 'damageTypeScope', types: ['explosive'] }],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+30% damage bonus (explosive damage only)');
  });

  it('enemyType reads as a "vs X" qualifier (Astonishing Tales Mothman magazine)', () => {
    const mod: Modifier = {
      id: '0x5:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.15,
      conditions: [{ kind: 'enemyType', keywordOrRace: 'ActorTypeMothman' }],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+15% damage bonus (vs the Mothman)');
  });

  it('an unresolved condition omits the clause but still describes the magnitude', () => {
    const mod: Modifier = {
      id: '0x6:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.5,
      conditions: [{ kind: 'unresolved', raw: 'OR-group[...]' }],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+50% damage bonus');
  });

  it('a non-whole percentage keeps its decimal', () => {
    const mod: Modifier = {
      id: '0x8:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.075,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+7.5% damage bonus');
  });

  it('an unmodeled bucket is omitted rather than guessed at', () => {
    const mod: Modifier = {
      id: '0x7:0',
      source,
      bucket: 'apRegen',
      op: 'ADD',
      value: 0.1,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBeNull();
  });

  it('no modifiers → null', () => {
    expect(describeBuffModifiers(buff([]))).toBeNull();
  });
});

describe('describeBuffModifiers ctx: strangeInNumbers / classFreakRank filtering', () => {
  it('strangeInNumbers picks the false-conditioned variant by default', () => {
    const base: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [{ kind: 'strangeInNumbers', value: false }],
    };
    const boosted: Modifier = {
      id: '0x1:1',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.15,
      conditions: [{ kind: 'strangeInNumbers', value: true }],
    };
    expect(describeBuffModifiers(buff([base, boosted]))).toBe('+10% damage bonus');
  });

  it('strangeInNumbers: true picks the boosted variant', () => {
    const base: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [{ kind: 'strangeInNumbers', value: false }],
    };
    const boosted: Modifier = {
      id: '0x1:1',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.15,
      conditions: [{ kind: 'strangeInNumbers', value: true }],
    };
    expect(describeBuffModifiers(buff([base, boosted]), { strangeInNumbers: true })).toBe(
      '+15% damage bonus',
    );
  });

  it('strangeInNumbers condition never renders as a clause', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [{ kind: 'strangeInNumbers', value: false }],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% damage bonus');
  });

  it('classFreakRank drops a modifier whose tier the current rank falls outside of', () => {
    const tier1: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: -0.15,
      conditions: [{ kind: 'classFreakRank', min: 1, max: 1 }],
    };
    expect(describeBuffModifiers(buff([tier1]), { classFreakRank: 0 })).toBeNull();
    expect(describeBuffModifiers(buff([tier1]), { classFreakRank: 2 })).toBeNull();
  });

  it('classFreakRank selects the matching tier and renders no clause for the gate', () => {
    const tier0: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: -0.2,
      conditions: [{ kind: 'classFreakRank', min: 0, max: 0 }],
    };
    const tier1: Modifier = {
      id: '0x1:1',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: -0.15,
      conditions: [{ kind: 'classFreakRank', min: 1, max: 1 }],
    };
    expect(describeBuffModifiers(buff([tier0, tier1]), { classFreakRank: 0 })).toBe(
      '-20% damage bonus',
    );
    expect(describeBuffModifiers(buff([tier0, tier1]), { classFreakRank: 1 })).toBe(
      '-15% damage bonus',
    );
  });
});

describe('describeBuffModifiers ctx: penaltyScale', () => {
  it('scales a flat (non-SPECIAL) bucket value — maxHealth', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'maxHealth',
      op: 'ADD',
      value: -20,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]), { penaltyScale: 0.5 })).toBe('-10 max HP');
  });

  it('scales a SPECIAL point bucket value', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'specialStrength',
      op: 'ADD',
      value: -4,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]), { penaltyScale: 0.5 })).toBe('-2 Strength');
  });

  it('scales a percent-bucket curve range', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      curve: {
        input: 'killStreak',
        points: [
          { x: 0, y: 5 },
          { x: 10, y: 100 },
        ],
      },
      curveScale: 0.01,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]), { penaltyScale: 0.5 })).toBe(
      '+2.5–50% damage bonus (scales with kill streak)',
    );
  });

  it('scales a dotDamage rate', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dotDamage',
      op: 'ADD',
      value: 10,
      conditions: [{ kind: 'damageTypeScope', types: ['poison'] }],
      durationSec: 15,
    };
    expect(describeBuffModifiers(buff([mod]), { penaltyScale: 0.5 })).toBe(
      '+5/s poison damage (15s)',
    );
  });
});

describe('describeBuffModifiers: curve support', () => {
  it('a percent-bucket curve reads as a range with the axis named (Adrenal Reaction)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      curve: {
        input: 'killStreak',
        points: [
          { x: 0, y: 5 },
          { x: 10, y: 100 },
        ],
      },
      curveScale: 0.01,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe(
      '+5–100% damage bonus (scales with kill streak)',
    );
  });

  it('an unmapped curve axis falls back to the raw CurveInput name', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      curve: {
        input: 'capsOnHand',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 20 },
        ],
      },
      curveScale: 0.01,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('0–20% damage bonus (scales with capsOnHand)');
  });

  it('a curve on a bucket with neither a percent nor a flat-point label is omitted, not guessed at', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'armorPen',
      op: 'ADD',
      curve: {
        input: 'endurance',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 20 },
        ],
      },
      curveScale: 1,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBeNull();
  });

  it('a curve on a flat-point bucket describes as a flat range (Unyielding-shaped)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'maxHealth',
      op: 'ADD',
      curve: {
        input: 'endurance',
        points: [
          { x: 0, y: 0 },
          { x: 10, y: 20 },
        ],
      },
      curveScale: 1,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('0–+20 max HP (scales with endurance)');
  });

  it('a kill-streak identity curve on a SPECIAL bucket reads as a flat range (Barbarian)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'specialStrength',
      op: 'ADD',
      curve: {
        input: 'killStreak',
        points: [
          { x: 0, y: 0 },
          { x: 1, y: 1 },
          { x: 10, y: 10 },
        ],
      },
      curveScale: 1,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('0–+10 Strength (scales with kill streak)');
  });
});

describe('describeBuffModifiers: new bucket labels', () => {
  it('maxHealth reads as a flat HP point add, not a percentage', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'maxHealth',
      op: 'ADD',
      value: -50,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('-50 max HP');
  });

  it('reloadSpeed reads as a percentage', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'reloadSpeed',
      op: 'ADD',
      value: 0.3,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+30% reload speed');
  });

  it('moveSpeedBonus reads as a percentage (Wasteland Fish Sandwich)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'moveSpeedBonus',
      op: 'ADD',
      value: 0.2,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+20% movement speed');
  });

  it('apMax reads as a flat max-AP point add (Poached Angler)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'apMax',
      op: 'ADD',
      value: 20,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+20 max AP');
  });

  it('apRegenFlat reads as a flat AP-regen point add (Corn Soup)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'apRegenFlat',
      op: 'ADD',
      value: 10,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+10 AP regen');
  });

  it('stimpakHealMagMult reads as a percentage (Field Surgeon)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'stimpakHealMagMult',
      op: 'MUL_ADD',
      value: 0.67,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+67% Stimpak/RadAway heal magnitude');
  });

  it('stimpakHealDurationMult reads as a percentage (Field Surgeon)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'stimpakHealDurationMult',
      op: 'MUL_ADD',
      value: -0.4,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('-40% Stimpak/RadAway heal duration');
  });

  it("Doctor's 3★ stimpakHealMagMult reads as a percentage", () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'stimpakHealMagMult',
      op: 'MUL_ADD',
      value: 0.25,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+25% Stimpak/RadAway heal magnitude');
  });
});

describe('describeBuffModifiers: dotDamage', () => {
  it('renders a damage/sec rate with duration, consuming damageTypeScope into the label (Acidic Gulper Venom)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dotDamage',
      op: 'ADD',
      value: 10,
      conditions: [{ kind: 'damageTypeScope', types: ['poison'] }],
      durationSec: 15,
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+10/s poison damage (15s)');
  });

  it('does not render damageTypeScope a second time as a separate clause', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dotDamage',
      op: 'ADD',
      value: 10,
      conditions: [{ kind: 'damageTypeScope', types: ['poison'] }],
      durationSec: 15,
    };
    const result = describeBuffModifiers(buff([mod]));
    expect(result?.match(/poison/g)?.length).toBe(1);
    expect(result).not.toContain('poison damage only');
  });
});

describe('describeBuffModifiers: teammateCount clause', () => {
  it('count 0 reads as "while solo"', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [{ kind: 'teammateCount', count: 0 }],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% damage bonus (while solo)');
  });

  it('orMore reads as "with N+ teammates"', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [{ kind: 'teammateCount', count: 2, orMore: true }],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% damage bonus (with 2+ teammates)');
  });

  it('an exact singular count reads as "with 1 teammate", not "1 teammates"', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [{ kind: 'teammateCount', count: 1 }],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% damage bonus (with 1 teammate)');
  });
});

describe('describeBuffModifiers: relaxed param type', () => {
  it('accepts a bare { modifiers } shape, not just a full GeneratedBuff (GeneratedAddiction callers)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'specialAgility',
      op: 'ADD',
      value: -1,
      conditions: [],
    };
    // Shaped like GeneratedAddiction (id/formId/name/causedBy/modifiers/notes),
    // not GeneratedBuff (no `kind`/`category`) — describeBuffModifiers must not
    // require anything beyond `modifiers`.
    const addictionShaped = {
      id: 'AbAddictionAlcohol',
      formId: '0xTEST',
      name: 'Alcohol Addiction',
      causedBy: ['SomeBrew'],
      modifiers: [mod],
      notes: [],
    };
    expect(describeBuffModifiers(addictionShaped)).toBe('-1 Agility');
  });
});

describe('describeBuffModifiers: bucket and keyword routing', () => {
  it('wholeDamage reads as total damage with weapon qualifier (Awesome Tales 5)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'wholeDamage',
      op: 'MUL_ADD',
      value: 0.25,
      conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeCryolator', present: true }],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+25% total damage (with the Cryolator)');
  });

  it('incomingDamageMult with plasma collapse reads "from" not "with" (Tesla Science 2)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'incomingDamageMult',
      op: 'MUL_ADD',
      value: -0.25,
      conditions: [
        {
          kind: 'enemyTypeAny',
          keywordsOrRaces: ['WeaponTypePlasma', 'WeaponTypePlasmaGrenade', 'WeaponTypePlasmaMine'],
        },
      ],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe(
      '-25% damage taken (from plasma weapons incl. grenades and mines)',
    );
  });

  it('Grounded energy collapse reads as energy weapons (not per-keyword join)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'MUL_ADD',
      value: -0.1,
      conditions: [
        {
          kind: 'weaponKeywordAny',
          keywords: ['WeaponTypeEnergy', 'WeaponTypeAlienBlaster'],
        },
      ],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('-10% damage bonus (with energy weapons)');
  });

  it('mixed absorption list collapse reads "from energy damage" for incomingDamageMult', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'incomingDamageMult',
      op: 'MUL_ADD',
      value: -0.15,
      conditions: [
        {
          kind: 'enemyTypeAny',
          keywordsOrRaces: ['DamageTypeEnergy', 'AmmoTypeEnergy', 'WeaponTypeEnergy'],
        },
      ],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('-15% damage taken (from energy damage)');
  });

  it('POST-DLC04_WeaponTypeSmartGrenade routes through weapon path, not enemy "vs"', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [
        {
          kind: 'enemyType',
          keywordOrRace: 'POST-DLC04_WeaponTypeSmartGrenade',
        },
      ],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% damage bonus (with smart grenades)');
  });

  it('HasSilencer weaponKeyword reads as suppressed weapons', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [{ kind: 'weaponKeyword', keyword: 'HasSilencer', present: true }],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% damage bonus (with suppressed weapons)');
  });

  it('vatsHitChance reads as a percentage', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'vatsHitChance',
      op: 'ADD',
      value: 0.1,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% VATS hit chance');
  });

  it('explosionRadiusBonus reads as a percentage', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'explosionRadiusBonus',
      op: 'ADD',
      value: 0.1,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% explosion radius');
  });

  it('ammoFreeChance reads as a percentage', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'ammoFreeChance',
      op: 'ADD',
      value: 0.1,
      conditions: [],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% chance to not consume ammo');
  });
});

describe('describeBuffModifiers: describeAs', () => {
  it('emits describeAs verbatim instead of synthesizing a line', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.35,
      conditions: [{ kind: 'weaponKeywordAny', keywords: ['HasScope', 'HasScopeRecon'] }],
      describeAs: '+35% damage bonus (while aiming through scopes)',
    };
    expect(describeBuffModifiers(buff([mod]))).toBe(
      '+35% damage bonus (while aiming through scopes)',
    );
  });

  it('describeAs empty string suppresses the line entirely', () => {
    const visible: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.2,
      conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeHeavyGun', present: true }],
      describeAs: '+20% damage bonus (with non-explosive heavy guns)',
    };
    const suppressed: Modifier = {
      id: '0x1:1',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.2,
      conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeExplosiveHybrid', present: true }],
      describeAs: '',
    };
    expect(describeBuffModifiers(buff([visible, suppressed]))).toBe(
      '+20% damage bonus (with non-explosive heavy guns)',
    );
  });
});

describe('describeBuffModifiers: keyword collapses and sorted fallbacks', () => {
  it('collapses mirelurk variants to "vs Mirelurks" (Awesome Tales 1)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.15,
      conditions: [
        {
          kind: 'enemyTypeAny',
          keywordsOrRaces: [
            'ActorTypeMirelurkQueen',
            'ActorTypeMirelurkKing',
            'ActorTypeMirelurkHunter',
            'ActorTypeMirelurk',
          ],
        },
      ],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+15% damage bonus (vs Mirelurks)');
  });

  it('collapses super mutant variants to "vs super mutants" (Awesome Tales 2)', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.15,
      conditions: [
        {
          kind: 'enemyTypeAny',
          keywordsOrRaces: ['ActorTypeSuperMutantBehemoth', 'ActorTypeSuperMutant'],
        },
      ],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+15% damage bonus (vs super mutants)');
  });

  it('collapses WeaponTypeUnarmed + WeaponTypeMeleeGeneral to melee or unarmed weapons', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [
        {
          kind: 'weaponKeywordAny',
          keywords: ['WeaponTypeUnarmed', 'WeaponTypeMeleeGeneral'],
        },
      ],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe(
      '+10% damage bonus (with melee or unarmed weapons)',
    );
  });

  it('collapses unarmed + knife-class keywords to unarmed weapons or knives', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.5,
      conditions: [
        {
          kind: 'weaponKeywordAny',
          keywords: ['WeaponTypeUnarmed', 'ma_Knife', 'ma_Switchblade'],
        },
      ],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe(
      '+50% damage bonus (with unarmed weapons or knives)',
    );
  });

  it('sorts fallback keyword labels alphabetically when no collapse applies', () => {
    const mod: Modifier = {
      id: '0x1:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [
        {
          kind: 'weaponKeywordAny',
          keywords: ['WeaponTypeAlienBlaster', 'WeaponTypeBow', 'WeaponTypePistol'],
        },
      ],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe(
      '+10% damage bonus (with alien blasters or bows or pistols)',
    );
  });
});
