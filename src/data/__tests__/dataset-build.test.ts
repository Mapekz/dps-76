import { describe, expect, it } from 'bun:test';
import { buildDataset, type DatasetSource, type HandAuthored } from '@/data/dataset';
import type { GeneratedConstants, GeneratedOmod } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';

function modifier(id: string, value: number): Modifier {
  return {
    id,
    source: { kind: 'omod', formId: '', edid: 'synthetic', name: 'Synthetic' },
    bucket: 'dbm',
    op: 'ADD',
    value,
    conditions: [],
  };
}

function omod(modifiers: Modifier[], name = 'Extracted'): GeneratedOmod {
  return { id: 'synthetic', name, modifiers } as GeneratedOmod;
}

function source(
  generatedOmods: GeneratedOmod[],
  overrides: Partial<DatasetSource> = {},
): DatasetSource {
  return {
    generatedWeapons: [],
    generatedOmods,
    generatedArmorOmods: [],
    generatedPerks: [],
    generatedMutations: [],
    generatedConsumables: [],
    generatedAddictions: [],
    generatedBodyParts: [],
    generatedUniques: [],
    generatedNpcs: [],
    constants: {} as GeneratedConstants,
    legendaryValueOverrides: {},
    armorLegendaryValueOverrides: {},
    buffValueOverrides: {},
    npcOverrides: {},
    weaponCorrections: {},
    hiddenWeaponIds: new Set(),
    forceVisibleWeaponIds: new Set(),
    hiddenOmodIds: new Set(),
    forceVisibleOmodIds: new Set(),
    hiddenArmorOmodIds: new Set(),
    forceVisibleArmorOmodIds: new Set(),
    hiddenConsumableIds: new Set(),
    forceVisibleConsumableIds: new Set(),
    omodBadgeOverrides: {},
    omodWeaponRestrictions: {},
    omodNameOverrides: {},
    perWeaponSlotLabelOverrides: {},
    omodModifierAdditions: {},
    ...overrides,
  };
}

function build(generatedOmods: GeneratedOmod[], overrides: Partial<DatasetSource> = {}) {
  return buildDataset({ perkNames: {} } as HandAuthored, source(generatedOmods, overrides));
}

describe('buildDataset OMOD Overlay composition', () => {
  const extracted = modifier('extracted', 0.1);
  const replacement = modifier('replacement', 0.2);
  const addition = modifier('addition', 0.3);

  it('replaces modifiers when a value override exists', () => {
    const dataset = build([omod([extracted])], {
      legendaryValueOverrides: { synthetic: [replacement] },
    });
    expect(dataset.omods[0].modifiers).toEqual([replacement]);
  });

  it('concatenates modifier additions onto existing modifiers', () => {
    const dataset = build([omod([extracted])], {
      omodModifierAdditions: { synthetic: [addition] },
    });
    expect(dataset.omods[0].modifiers).toEqual([extracted, addition]);
  });

  it('replaces an OMOD name', () => {
    const dataset = build([omod([extracted])], {
      omodNameOverrides: { synthetic: 'Overridden' },
    });
    expect(dataset.omods[0].name).toBe('Overridden');
  });

  it('applies replacement before concatenating additions', () => {
    const dataset = build([omod([extracted])], {
      legendaryValueOverrides: { synthetic: [replacement] },
      omodModifierAdditions: { synthetic: [addition] },
    });
    expect(dataset.omods[0].modifiers).toEqual([replacement, addition]);
  });
});
