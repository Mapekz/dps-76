import { describe, expect, it } from 'bun:test';
import { buildLedger, familyLabel } from '@/lib/chem-ledger';
import type { GeneratedAddiction, GeneratedBuff } from '@/types/generated';

function chem(id: string, name: string, addiction?: { id: string; name: string }): GeneratedBuff {
  return {
    id,
    formId: `0x${id}`,
    name,
    kind: 'consumable',
    category: 'chem',
    modifiers: [],
    notes: [],
    ...(addiction ? { addiction: { ...addiction, formId: `0x${addiction.id}` } } : {}),
  };
}

function alcoholBuff(
  id: string,
  name: string,
  addiction: { id: string; name: string },
): GeneratedBuff {
  return { ...chem(id, name, addiction), category: 'alcohol' };
}

function addiction(id: string, name: string): GeneratedAddiction {
  return { id, formId: `0x${id}`, name, modifiers: [], notes: [], causedBy: [] };
}

describe('familyLabel', () => {
  it('strips the SPEL " Addiction" suffix', () => {
    expect(familyLabel('Psycho Addiction')).toBe('Psycho');
    expect(familyLabel('Med-X Addiction')).toBe('Med-X');
  });
});

describe('buildLedger', () => {
  const psychoFamily = addiction('AbAddictionPsycho', 'Psycho Addiction');
  const alcoholFamily = addiction('AbAddictionAlcohol', 'Alcohol Addiction');
  const medXFamily = addiction('AbAddictionMedX', 'Med-X Addiction');

  it('groups chems by addiction family and alcohols into picker rows', () => {
    const chems = [
      chem('Psycho', 'Psycho', psychoFamily),
      chem('Psychobuff', 'Psychobuff', psychoFamily),
      chem('Stimpak', 'Stimpak'),
    ];
    const alcohols = [alcoholBuff('Beer', 'Beer', alcoholFamily)];
    const ledger = buildLedger(chems, alcohols, [psychoFamily, alcoholFamily, medXFamily]);

    const psycho = ledger.find((g) => g.addiction?.id === 'AbAddictionPsycho');
    expect(psycho?.chems.map((c) => c.id).sort()).toEqual(['Psycho', 'Psychobuff']);
    expect(psycho?.picker).toEqual([]);

    const alcoholGroup = ledger.find((g) => g.addiction?.id === 'AbAddictionAlcohol');
    expect(alcoholGroup?.chems).toEqual([]);
    expect(alcoholGroup?.picker.map((c) => c.id)).toEqual(['Beer']);

    const medX = ledger.find((g) => g.addiction?.id === 'AbAddictionMedX');
    expect(medX?.chems).toEqual([]);
    expect(medX?.picker).toEqual([]);

    const unaddictive = ledger.find((g) => g.addiction === null);
    expect(unaddictive?.chems.map((c) => c.id)).toEqual(['Stimpak']);
  });

  it('sorts families by stripped addiction label and unaddictive chems by name', () => {
    const chems = [chem('Zeta', 'Zeta Chem'), chem('Alpha', 'Alpha Chem')];
    const ledger = buildLedger(chems, [], [alcoholFamily, psychoFamily]);
    expect(ledger.map((g) => g.sortKey)).toEqual(['Alcohol', 'Alpha Chem', 'Psycho', 'Zeta Chem']);
  });
});
