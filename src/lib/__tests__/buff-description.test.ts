import { describe, it, expect } from 'bun:test';
import { describeBuffModifiers, type BuffDescriptionCtx } from '@/lib/buff-description';
import type { GeneratedBuff } from '@/types/generated';
import type { DamageType, Modifier, ModifierValue } from '@/types/modifiers';

const source: Modifier['source'] = {
  kind: 'consumable',
  formId: '0xTEST',
  edid: 'Test',
  name: 'Test',
};

function buff(modifiers: Modifier[]): GeneratedBuff {
  return { id: 'Test', formId: '0xTEST', name: 'Test', kind: 'consumable', modifiers, notes: [] };
}

type ModifierFields = Pick<Modifier, 'bucket' | 'op'> &
  Partial<Pick<Modifier, 'id' | 'conditions' | 'durationSec' | 'describeAs'>> &
  ModifierValue;

function mod(fields: ModifierFields): Modifier {
  return { id: '0x1:0', source, conditions: [], ...fields };
}

type DescriptionRow = {
  name: string;
  modifiers: Modifier[];
  ctx?: BuffDescriptionCtx;
  expected: string | null;
};

describe('describeBuffModifiers', () => {
  const rows: DescriptionRow[] = [
    {
      name: 'unconditional dbm reads as a plain damage percentage (Guns and Bullets 7)',
      modifiers: [mod({ bucket: 'dbm', op: 'ADD', value: 0.1 })],
      expected: '+10% damage bonus',
    },
    {
      name: 'SPECIAL bucket reads as a flat point add, not a percentage (Strength bobblehead)',
      modifiers: [mod({ bucket: 'specialStrength', op: 'ADD', value: 2 })],
      expected: '+2 Strength',
    },
    {
      name: 'weaponKeyword present/absent pair reads as a class qualifier (Small Guns bobblehead)',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.2,
          conditions: [
            { kind: 'weaponKeyword', keyword: 'WeaponTypeBallistic', present: true },
            { kind: 'weaponKeyword', keyword: 'WeaponTypeHeavyGun', present: false },
          ],
        }),
      ],
      expected: '+20% damage bonus (with ballistic weapons, non-heavy guns)',
    },
    {
      name: 'damageTypeScope reads as a damage-type qualifier (Explosive bobblehead)',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.3,
          conditions: [{ kind: 'damageTypeScope', types: ['explosive'] }],
        }),
      ],
      expected: '+30% damage bonus (explosive damage only)',
    },
    {
      name: 'enemyType reads as a "vs X" qualifier (Astonishing Tales Mothman magazine)',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.15,
          conditions: [{ kind: 'enemyType', keywordOrRace: 'ActorTypeMothman' }],
        }),
      ],
      expected: '+15% damage bonus (vs the Mothman)',
    },
    {
      name: 'an unresolved condition omits the clause but still describes the magnitude',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.5,
          conditions: [{ kind: 'unresolved', raw: 'OR-group[...]' }],
        }),
      ],
      expected: '+50% damage bonus',
    },
    {
      name: 'a non-whole percentage keeps its decimal',
      modifiers: [mod({ bucket: 'dbm', op: 'ADD', value: 0.075 })],
      expected: '+7.5% damage bonus',
    },
    {
      name: 'an unmodeled bucket is omitted rather than guessed at',
      modifiers: [mod({ bucket: 'apPerCrit', op: 'ADD', value: 0.1 })],
      expected: null,
    },
    { name: 'no modifiers → null', modifiers: [], expected: null },
  ];

  for (const row of rows) {
    it(row.name, () => {
      expect(describeBuffModifiers(buff(row.modifiers), row.ctx)).toBe(row.expected);
    });
  }
});

describe('describeBuffModifiers ctx: strangeInNumbers / classFreakRank filtering', () => {
  const sinPair = (): Modifier[] => [
    mod({
      id: '0x1:0',
      bucket: 'dbm',
      op: 'ADD',
      value: 0.1,
      conditions: [{ kind: 'strangeInNumbers', value: false }],
    }),
    mod({
      id: '0x1:1',
      bucket: 'dbm',
      op: 'ADD',
      value: 0.15,
      conditions: [{ kind: 'strangeInNumbers', value: true }],
    }),
  ];

  const rows: DescriptionRow[] = [
    {
      name: 'strangeInNumbers picks the false-conditioned variant by default',
      modifiers: sinPair(),
      expected: '+10% damage bonus',
    },
    {
      name: 'strangeInNumbers: true picks the boosted variant',
      modifiers: sinPair(),
      ctx: { strangeInNumbers: true },
      expected: '+15% damage bonus',
    },
    {
      name: 'strangeInNumbers condition never renders as a clause',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.1,
          conditions: [{ kind: 'strangeInNumbers', value: false }],
        }),
      ],
      expected: '+10% damage bonus',
    },
  ];

  for (const row of rows) {
    it(row.name, () => {
      expect(describeBuffModifiers(buff(row.modifiers), row.ctx)).toBe(row.expected);
    });
  }

  it('classFreakRank drops a modifier whose tier the current rank falls outside of', () => {
    const tier1 = mod({
      bucket: 'dbm',
      op: 'ADD',
      value: -0.15,
      conditions: [{ kind: 'classFreakRank', min: 1, max: 1 }],
    });
    expect(describeBuffModifiers(buff([tier1]), { classFreakRank: 0 })).toBeNull();
    expect(describeBuffModifiers(buff([tier1]), { classFreakRank: 2 })).toBeNull();
  });

  it('classFreakRank selects the matching tier and renders no clause for the gate', () => {
    const tier0 = mod({
      id: '0x1:0',
      bucket: 'dbm',
      op: 'ADD',
      value: -0.2,
      conditions: [{ kind: 'classFreakRank', min: 0, max: 0 }],
    });
    const tier1 = mod({
      id: '0x1:1',
      bucket: 'dbm',
      op: 'ADD',
      value: -0.15,
      conditions: [{ kind: 'classFreakRank', min: 1, max: 1 }],
    });
    expect(describeBuffModifiers(buff([tier0, tier1]), { classFreakRank: 0 })).toBe(
      '-20% damage bonus',
    );
    expect(describeBuffModifiers(buff([tier0, tier1]), { classFreakRank: 1 })).toBe(
      '-15% damage bonus',
    );
  });
});

describe('describeBuffModifiers ctx: penaltyScale', () => {
  const rows: DescriptionRow[] = [
    {
      name: 'scales a flat (non-SPECIAL) bucket value — maxHealth',
      modifiers: [mod({ bucket: 'maxHealth', op: 'ADD', value: -20 })],
      ctx: { penaltyScale: 0.5 },
      expected: '-10 max HP',
    },
    {
      name: 'scales a SPECIAL point bucket value',
      modifiers: [mod({ bucket: 'specialStrength', op: 'ADD', value: -4 })],
      ctx: { penaltyScale: 0.5 },
      expected: '-2 Strength',
    },
    {
      name: 'scales a percent-bucket curve range',
      modifiers: [
        mod({
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
        }),
      ],
      ctx: { penaltyScale: 0.5 },
      expected: '+2.5–50% damage bonus (scales with kill streak)',
    },
    {
      name: 'scales a dotDamage rate',
      modifiers: [
        mod({
          bucket: 'dotDamage',
          op: 'ADD',
          value: 10,
          conditions: [{ kind: 'damageTypeScope', types: ['poison'] }],
          durationSec: 15,
        }),
      ],
      ctx: { penaltyScale: 0.5 },
      expected: '+5/s poison damage (15s)',
    },
  ];

  for (const row of rows) {
    it(row.name, () => {
      expect(describeBuffModifiers(buff(row.modifiers), row.ctx)).toBe(row.expected);
    });
  }
});

describe('describeBuffModifiers: curve support', () => {
  const rows: DescriptionRow[] = [
    {
      name: 'a percent-bucket curve reads as a range with the axis named (Adrenal Reaction)',
      modifiers: [
        mod({
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
        }),
      ],
      expected: '+5–100% damage bonus (scales with kill streak)',
    },
    {
      name: 'an unmapped curve axis falls back to the raw CurveInput name',
      modifiers: [
        mod({
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
        }),
      ],
      expected: '0–20% damage bonus (scales with capsOnHand)',
    },
    {
      name: 'a curve on a bucket with neither a percent nor a flat-point label is omitted, not guessed at',
      modifiers: [
        mod({
          // deflectChance stays unlabeled on purpose (The Action Hero's data-broken effect)
          bucket: 'deflectChance',
          op: 'ADD',
          curve: {
            input: 'endurance',
            points: [
              { x: 0, y: 0 },
              { x: 10, y: 20 },
            ],
          },
          curveScale: 1,
        }),
      ],
      expected: null,
    },
    {
      name: 'a curve on a flat-point bucket describes as a flat range (Unyielding-shaped)',
      modifiers: [
        mod({
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
        }),
      ],
      expected: '0–+20 max HP (scales with Endurance)',
    },
    {
      name: 'a kill-streak identity curve on a SPECIAL bucket reads as a flat range (Barbarian)',
      modifiers: [
        mod({
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
        }),
      ],
      expected: '0–+10 Strength (scales with kill streak)',
    },
  ];

  for (const row of rows) {
    it(row.name, () => {
      expect(describeBuffModifiers(buff(row.modifiers), row.ctx)).toBe(row.expected);
    });
  }
});

describe('describeBuffModifiers: new bucket labels', () => {
  const rows: DescriptionRow[] = [
    {
      name: 'maxHealth reads as a flat HP point add, not a percentage',
      modifiers: [mod({ bucket: 'maxHealth', op: 'ADD', value: -50 })],
      expected: '-50 max HP',
    },
    {
      name: 'reloadSpeed reads as a percentage',
      modifiers: [mod({ bucket: 'reloadSpeed', op: 'ADD', value: 0.3 })],
      expected: '+30% reload speed',
    },
    {
      name: 'moveSpeedBonus reads as a percentage (Wasteland Fish Sandwich)',
      modifiers: [mod({ bucket: 'moveSpeedBonus', op: 'ADD', value: 0.2 })],
      expected: '+20% movement speed',
    },
    {
      name: 'apMax reads as a flat max-AP point add (Poached Angler)',
      modifiers: [mod({ bucket: 'apMax', op: 'ADD', value: 20 })],
      expected: '+20 max AP',
    },
    {
      name: 'apRegenFlat reads as a flat AP-regen point add (Corn Soup)',
      modifiers: [mod({ bucket: 'apRegenFlat', op: 'ADD', value: 10 })],
      expected: '+10 base AP regen',
    },
    {
      name: 'stimpakHealMagMult reads as a percentage (Field Surgeon)',
      modifiers: [mod({ bucket: 'stimpakHealMagMult', op: 'MUL_ADD', value: 0.67 })],
      expected: '+67% Stimpak/RadAway heal magnitude',
    },
    {
      name: 'stimpakHealDurationMult reads as a percentage (Field Surgeon)',
      modifiers: [mod({ bucket: 'stimpakHealDurationMult', op: 'MUL_ADD', value: -0.4 })],
      expected: '-40% Stimpak/RadAway heal duration',
    },
    {
      name: "Doctor's 3★ stimpakHealMagMult reads as a percentage",
      modifiers: [mod({ bucket: 'stimpakHealMagMult', op: 'MUL_ADD', value: 0.25 })],
      expected: '+25% Stimpak/RadAway heal magnitude',
    },
  ];

  for (const row of rows) {
    it(row.name, () => {
      expect(describeBuffModifiers(buff(row.modifiers), row.ctx)).toBe(row.expected);
    });
  }
});

describe('describeBuffModifiers: dotDamage', () => {
  it('renders a damage/sec rate with duration, consuming damageTypeScope into the label (Acidic Gulper Venom)', () => {
    const dot = mod({
      bucket: 'dotDamage',
      op: 'ADD',
      value: 10,
      conditions: [{ kind: 'damageTypeScope', types: ['poison'] }],
      durationSec: 15,
    });
    expect(describeBuffModifiers(buff([dot]))).toBe('+10/s poison damage (15s)');
  });
});

describe('describeBuffModifiers: teammateCount clause', () => {
  const rows: DescriptionRow[] = [
    {
      name: 'count 0 reads as "while solo"',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.1,
          conditions: [{ kind: 'teammateCount', count: 0 }],
        }),
      ],
      expected: '+10% damage bonus (while solo)',
    },
    {
      name: 'orMore reads as "with N+ teammates"',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.1,
          conditions: [{ kind: 'teammateCount', count: 2, orMore: true }],
        }),
      ],
      expected: '+10% damage bonus (with 2+ teammates)',
    },
    {
      name: 'an exact singular count reads as "with 1 teammate", not "1 teammates"',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.1,
          conditions: [{ kind: 'teammateCount', count: 1 }],
        }),
      ],
      expected: '+10% damage bonus (with 1 teammate)',
    },
  ];

  for (const row of rows) {
    it(row.name, () => {
      expect(describeBuffModifiers(buff(row.modifiers), row.ctx)).toBe(row.expected);
    });
  }
});

describe('describeBuffModifiers: relaxed param type', () => {
  it('accepts a bare { modifiers } shape, not just a full GeneratedBuff (GeneratedAddiction callers)', () => {
    // Shaped like GeneratedAddiction (id/formId/name/causedBy/modifiers/notes),
    // not GeneratedBuff (no `kind`/`category`) — describeBuffModifiers must not
    // require anything beyond `modifiers`.
    const addictionShaped = {
      id: 'AbAddictionAlcohol',
      formId: '0xTEST',
      name: 'Alcohol Addiction',
      causedBy: ['SomeBrew'],
      modifiers: [mod({ bucket: 'specialAgility', op: 'ADD', value: -1 })],
      notes: [],
    };
    expect(describeBuffModifiers(addictionShaped)).toBe('-1 Agility');
  });
});

describe('describeBuffModifiers: bucket and keyword routing', () => {
  const rows: DescriptionRow[] = [
    {
      name: 'wholeDamage reads as total damage with weapon qualifier (Awesome Tales 5)',
      modifiers: [
        mod({
          bucket: 'wholeDamage',
          op: 'MUL_ADD',
          value: 0.25,
          conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeCryolator', present: true }],
        }),
      ],
      expected: '+25% total damage (with the Cryolator)',
    },
    {
      name: 'incomingDamageMult with plasma collapse reads "from" not "with" (Tesla Science 2)',
      modifiers: [
        mod({
          bucket: 'incomingDamageMult',
          op: 'MUL_ADD',
          value: -0.25,
          conditions: [
            {
              kind: 'enemyTypeAny',
              keywordsOrRaces: [
                'WeaponTypePlasma',
                'WeaponTypePlasmaGrenade',
                'WeaponTypePlasmaMine',
              ],
            },
          ],
        }),
      ],
      expected: '-25% damage taken (from plasma weapons incl. grenades and mines)',
    },
    {
      name: 'Grounded energy collapse reads as energy weapons (not per-keyword join)',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'MUL_ADD',
          value: -0.1,
          conditions: [
            { kind: 'weaponKeywordAny', keywords: ['WeaponTypeEnergy', 'WeaponTypeAlienBlaster'] },
          ],
        }),
      ],
      expected: '-10% damage bonus (with energy weapons)',
    },
    {
      name: 'mixed absorption list collapse reads "from energy damage" for incomingDamageMult',
      modifiers: [
        mod({
          bucket: 'incomingDamageMult',
          op: 'MUL_ADD',
          value: -0.15,
          conditions: [
            {
              kind: 'enemyTypeAny',
              keywordsOrRaces: ['DamageTypeEnergy', 'AmmoTypeEnergy', 'WeaponTypeEnergy'],
            },
          ],
        }),
      ],
      expected: '-15% damage taken (from energy damage)',
    },
    {
      name: 'POST-DLC04_WeaponTypeSmartGrenade routes through weapon path, not enemy "vs"',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.1,
          conditions: [{ kind: 'enemyType', keywordOrRace: 'POST-DLC04_WeaponTypeSmartGrenade' }],
        }),
      ],
      expected: '+10% damage bonus (with smart grenades)',
    },
    {
      name: 'HasSilencer weaponKeyword reads as suppressed weapons',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.1,
          conditions: [{ kind: 'weaponKeyword', keyword: 'HasSilencer', present: true }],
        }),
      ],
      expected: '+10% damage bonus (with suppressed weapons)',
    },
    {
      name: 'vatsHitChance reads as a percentage',
      modifiers: [mod({ bucket: 'vatsHitChance', op: 'ADD', value: 0.1 })],
      expected: '+10% VATS hit chance',
    },
    {
      name: 'explosionRadiusBonus reads as a percentage',
      modifiers: [mod({ bucket: 'explosionRadiusBonus', op: 'ADD', value: 0.1 })],
      expected: '+10% explosion radius',
    },
    {
      name: 'ammoFreeChance reads as a percentage',
      modifiers: [mod({ bucket: 'ammoFreeChance', op: 'ADD', value: 0.1 })],
      expected: '+10% chance to not consume ammo',
    },
  ];

  for (const row of rows) {
    it(row.name, () => {
      expect(describeBuffModifiers(buff(row.modifiers), row.ctx)).toBe(row.expected);
    });
  }
});

describe('describeBuffModifiers: describeAs', () => {
  const rows: DescriptionRow[] = [
    {
      name: 'emits describeAs verbatim instead of synthesizing a line',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.35,
          conditions: [{ kind: 'weaponKeywordAny', keywords: ['HasScope', 'HasScopeRecon'] }],
          describeAs: '+35% damage bonus (while aiming through scopes)',
        }),
      ],
      expected: '+35% damage bonus (while aiming through scopes)',
    },
    {
      name: 'describeAs empty string suppresses the line entirely',
      modifiers: [
        mod({
          id: '0x1:0',
          bucket: 'dbm',
          op: 'ADD',
          value: 0.2,
          conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeHeavyGun', present: true }],
          describeAs: '+20% damage bonus (with non-explosive heavy guns)',
        }),
        mod({
          id: '0x1:1',
          bucket: 'dbm',
          op: 'ADD',
          value: 0.2,
          conditions: [
            { kind: 'weaponKeyword', keyword: 'WeaponTypeExplosiveHybrid', present: true },
          ],
          describeAs: '',
        }),
      ],
      expected: '+20% damage bonus (with non-explosive heavy guns)',
    },
  ];

  for (const row of rows) {
    it(row.name, () => {
      expect(describeBuffModifiers(buff(row.modifiers), row.ctx)).toBe(row.expected);
    });
  }
});

describe('describeBuffModifiers: keyword collapses and sorted fallbacks', () => {
  const rows: DescriptionRow[] = [
    {
      name: 'collapses mirelurk variants to "vs Mirelurks" (Awesome Tales 1)',
      modifiers: [
        mod({
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
        }),
      ],
      expected: '+15% damage bonus (vs Mirelurks)',
    },
    {
      name: 'collapses super mutant variants to "vs super mutants" (Awesome Tales 2)',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.15,
          conditions: [
            {
              kind: 'enemyTypeAny',
              keywordsOrRaces: ['ActorTypeSuperMutantBehemoth', 'ActorTypeSuperMutant'],
            },
          ],
        }),
      ],
      expected: '+15% damage bonus (vs super mutants)',
    },
    {
      name: 'collapses WeaponTypeUnarmed + WeaponTypeMeleeGeneral to melee or unarmed weapons',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.1,
          conditions: [
            { kind: 'weaponKeywordAny', keywords: ['WeaponTypeUnarmed', 'WeaponTypeMeleeGeneral'] },
          ],
        }),
      ],
      expected: '+10% damage bonus (with melee or unarmed weapons)',
    },
    {
      name: 'collapses unarmed + knife-class keywords to unarmed weapons or knives',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.5,
          conditions: [
            {
              kind: 'weaponKeywordAny',
              keywords: ['WeaponTypeUnarmed', 'ma_Knife', 'ma_Switchblade'],
            },
          ],
        }),
      ],
      expected: '+50% damage bonus (with unarmed weapons or knives)',
    },
    {
      name: 'sorts fallback keyword labels alphabetically when no collapse applies',
      modifiers: [
        mod({
          bucket: 'dbm',
          op: 'ADD',
          value: 0.1,
          conditions: [
            {
              kind: 'weaponKeywordAny',
              keywords: ['WeaponTypeAlienBlaster', 'WeaponTypeBow', 'WeaponTypePistol'],
            },
          ],
        }),
      ],
      expected: '+10% damage bonus (with alien blasters or bows or pistols)',
    },
  ];

  for (const row of rows) {
    it(row.name, () => {
      expect(describeBuffModifiers(buff(row.modifiers), row.ctx)).toBe(row.expected);
    });
  }
});

describe('describeBuffModifiers: weapon-stat buckets (standard OMODs)', () => {
  const stat = (bucket: Modifier['bucket'], op: Modifier['op'], value: number): Modifier =>
    mod({ id: `0x1:${bucket}`, bucket, op, value });

  it('MUL_ADD is a fraction of the weapon base stat — percent', () => {
    expect(describeBuffModifiers(buff([stat('vatsApCost', 'MUL_ADD', 0.2)]))).toBe(
      '+20% VATS AP cost',
    );
    expect(describeBuffModifiers(buff([stat('baseDamage', 'MUL_ADD', -0.3)]))).toBe(
      '-30% base damage',
    );
  });

  it('isAutomatic SET renders as prose with no magnitude', () => {
    expect(describeBuffModifiers(buff([stat('isAutomatic', 'SET', 1)]))).toBe('automatic fire');
    expect(describeBuffModifiers(buff([stat('isAutomatic', 'SET', 0)]))).toBe(
      'semi-automatic fire',
    );
  });

  const rows: DescriptionRow[] = [
    {
      name: 'ADD is flat in the stat units',
      modifiers: [stat('projectileCount', 'ADD', 4)],
      expected: '+4 projectiles',
    },
    {
      name: 'SET is omitted without a weapon base',
      modifiers: [stat('fireRateSpeed', 'SET', 0.8617)],
      expected: null,
    },
    {
      name: 'SET fireRateSpeed renders as a percent delta vs the selected weapon base',
      modifiers: [stat('fireRateSpeed', 'SET', 0.8617)],
      ctx: { weaponStatBases: { fireRateSpeed: 1 } },
      expected: '-13.8% fire rate',
    },
    {
      name: 'chargeFullPower SET enablers render as absolute values, not deltas',
      modifiers: [
        stat('chargeFullPowerSec', 'SET', 1),
        stat('chargeFullPowerDamageMult', 'SET', 2),
      ],
      expected: 'full-power charge time set to 1s; full-power damage ×2',
    },
    {
      name: 'critConsumption SET 85 vs meter base 100 reads as a percent delta',
      modifiers: [stat('critConsumption', 'SET', 85)],
      ctx: { weaponStatBases: { critConsumption: 100 } },
      expected: '-15% crit meter cost',
    },
    {
      name: 'same-signature min/max range modifiers collapse to one "range" line (long barrels)',
      modifiers: [stat('weaponMaxRange', 'MUL_ADD', 0.5), stat('weaponMinRange', 'MUL_ADD', 0.5)],
      expected: '+50% range',
    },
    {
      name: 'unpaired range modifiers keep their own min/max label',
      modifiers: [stat('weaponMaxRange', 'MUL_ADD', 0.5), stat('weaponMinRange', 'MUL_ADD', -0.5)],
      expected: '+50% max range; -50% min range',
    },
  ];

  for (const row of rows) {
    it(row.name, () => {
      expect(describeBuffModifiers(buff(row.modifiers), row.ctx)).toBe(row.expected);
    });
  }
});

describe('describeBuffModifiers: duplicate-line folding', () => {
  it('same-bucket duplicates sum the way the engine folds them (Super Chem MK II)', () => {
    const dr = (id: string): Modifier =>
      mod({ id, bucket: 'damageResistGain', op: 'ADD', value: 25 });
    expect(describeBuffModifiers(buff([dr('0x1:0'), dr('0x1:1')]))).toBe('+50 Damage Resist');
  });

  it('per-element duplicates union their damageTypeScope', () => {
    const scoped = (type: DamageType): Modifier =>
      mod({
        id: `0x1:${type}`,
        bucket: 'baseDamage',
        op: 'MUL_ADD',
        value: -0.3,
        conditions: [{ kind: 'damageTypeScope', types: [type] }],
      });
    expect(describeBuffModifiers(buff([scoped('ballistic'), scoped('energy')]))).toBe(
      '-30% base damage (ballistic/energy damage only)',
    );
    // Covering every core element drops the scope clause entirely
    // (automatic-barrel receivers carry all six).
    const all = (['ballistic', 'energy', 'radiation', 'poison', 'cryo', 'fire'] as const).map(
      scoped,
    );
    expect(describeBuffModifiers(buff(all))).toBe('-30% base damage');
  });
});

describe('describeBuffModifiers: curve DoTs (weapon-mod bleed/burn/poison)', () => {
  it('renders the Y range, element, duration, and axis', () => {
    const dot = mod({
      bucket: 'dotDamage',
      op: 'ADD',
      curve: {
        input: 'itemLevel',
        points: [
          { x: 1, y: 5 },
          { x: 50, y: 17 },
        ],
      },
      curveScale: 1,
      conditions: [{ kind: 'damageTypeScope', types: ['ballistic'] }],
      durationSec: 11,
    });
    expect(describeBuffModifiers(buff([dot]))).toBe(
      '+5–17/s ballistic damage (scales with weapon level, 11s)',
    );
  });
});
