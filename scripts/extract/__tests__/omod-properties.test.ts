import { describe, it, expect } from 'bun:test';
import type { EsmRecord } from '../esm-client';
import { collectProperties } from '../omod-properties';

function omodRecord(formId: string, editorId: string, data: Record<string, unknown>): EsmRecord {
  return {
    header: { signature: 'OMOD', form_id: formId },
    editor_id: editorId,
    fields: { Data: data },
  };
}

function prop(name: string, value1: unknown = 1.0): Record<string, unknown> {
  return {
    'Function Type': { name: 'SET' },
    Property: { name },
    'Value 1': value1,
    'Value 2': null,
  };
}

function include(modFormId: string): Record<string, unknown> {
  return { Mod: modFormId };
}

describe('collectProperties', () => {
  it('returns only own properties when the record has no Includes', () => {
    const byFormId = new Map<string, EsmRecord>([
      [
        '0xCHILD',
        omodRecord('0xCHILD', 'mod_Child', {
          Properties: [prop('DamageBonusMult', 0.25)],
        }),
      ],
    ]);

    const result = collectProperties('0xCHILD', byFormId);
    expect(result).toHaveLength(1);
    expect(result[0]!.property).toBe('DamageBonusMult');
    expect(result[0]!.value1).toBe(0.25);
  });

  it('concatenates parents first, child last across a multi-level include chain', () => {
    const byFormId = new Map<string, EsmRecord>([
      [
        '0xGP',
        omodRecord('0xGP', 'mod_Grandparent', {
          Properties: [prop('Speed', 0.5)],
        }),
      ],
      [
        '0xP',
        omodRecord('0xP', 'mod_Parent', {
          Includes: [include('0xGP')],
          Properties: [prop('DamageBonusMult', 0.1)],
        }),
      ],
      [
        '0xC',
        omodRecord('0xC', 'mod_Child', {
          Includes: [include('0xP')],
          Properties: [prop('IsAutomatic', 1)],
        }),
      ],
    ]);

    const result = collectProperties('0xC', byFormId);
    expect(result.map((p) => p.property)).toEqual(['Speed', 'DamageBonusMult', 'IsAutomatic']);
  });

  it('terminates on an include cycle without revisiting records', () => {
    const byFormId = new Map<string, EsmRecord>([
      [
        '0xA',
        omodRecord('0xA', 'mod_A', {
          Includes: [include('0xB')],
          Properties: [prop('Speed', 1)],
        }),
      ],
      [
        '0xB',
        omodRecord('0xB', 'mod_B', {
          Includes: [include('0xA')],
          Properties: [prop('DamageBonusMult', 2)],
        }),
      ],
    ]);

    const seen = new Set<string>();
    const result = collectProperties('0xA', byFormId, seen);
    expect(seen).toEqual(new Set(['0xA', '0xB']));
    expect(result.map((p) => p.property)).toEqual(['DamageBonusMult', 'Speed']);
  });

  it('includes a shared ancestor once in a diamond include graph', () => {
    const byFormId = new Map<string, EsmRecord>([
      [
        '0xD',
        omodRecord('0xD', 'mod_Base', {
          Properties: [prop('AmmoCapacity', 10)],
        }),
      ],
      [
        '0xB',
        omodRecord('0xB', 'mod_BranchB', {
          Includes: [include('0xD')],
          Properties: [prop('Speed', 1)],
        }),
      ],
      [
        '0xC',
        omodRecord('0xC', 'mod_BranchC', {
          Includes: [include('0xD')],
          Properties: [prop('DamageBonusMult', 0.2)],
        }),
      ],
      [
        '0xA',
        omodRecord('0xA', 'mod_Diamond', {
          Includes: [include('0xB'), include('0xC')],
          Properties: [prop('IsAutomatic', 1)],
        }),
      ],
    ]);

    const result = collectProperties('0xA', byFormId);
    expect(result.map((p) => p.property)).toEqual([
      'AmmoCapacity',
      'Speed',
      'DamageBonusMult',
      'IsAutomatic',
    ]);
  });

  it('skips Includes pointing at form ids absent from the map', () => {
    const byFormId = new Map<string, EsmRecord>([
      [
        '0xCHILD',
        omodRecord('0xCHILD', 'mod_Child', {
          Includes: [include('0xMISSING')],
          Properties: [prop('CriticalChargeBonus', 5)],
        }),
      ],
    ]);

    expect(() => collectProperties('0xCHILD', byFormId)).not.toThrow();
    expect(collectProperties('0xCHILD', byFormId)).toEqual([
      expect.objectContaining({ property: 'CriticalChargeBonus', value1: 5 }),
    ]);
  });
});
