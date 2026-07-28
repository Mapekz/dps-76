import { describe, it, expect } from 'vitest';
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
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% damage');
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
      '+20% damage (with ballistic weapons, non-heavy guns)',
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
    expect(describeBuffModifiers(buff([mod]))).toBe('+30% damage (explosive damage only)');
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
    expect(describeBuffModifiers(buff([mod]))).toBe('+15% damage (vs the Mothman)');
  });

  it('an unresolved condition flags the bonus as currently inactive, not silently hidden', () => {
    const mod: Modifier = {
      id: '0x6:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.5,
      conditions: [{ kind: 'unresolved', raw: 'OR-group[...]' }],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+50% damage — not modeled yet, no effect');
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
    expect(describeBuffModifiers(buff([mod]))).toBe('+7.5% damage');
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
    expect(describeBuffModifiers(buff([base, boosted]))).toBe('+10% damage');
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
      '+15% damage',
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
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% damage');
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
    expect(describeBuffModifiers(buff([tier0, tier1]), { classFreakRank: 0 })).toBe('-20% damage');
    expect(describeBuffModifiers(buff([tier0, tier1]), { classFreakRank: 1 })).toBe('-15% damage');
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
      '+2.5–50% damage (scales with kill streak)',
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
    expect(describeBuffModifiers(buff([mod]))).toBe('+5–100% damage (scales with kill streak)');
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
    expect(describeBuffModifiers(buff([mod]))).toBe('0–20% damage (scales with capsOnHand)');
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
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% damage (while solo)');
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
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% damage (with 2+ teammates)');
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
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% damage (with 1 teammate)');
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
