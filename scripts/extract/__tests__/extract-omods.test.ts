import { describe, it, expect } from 'vitest';
import type { EsmClient, EsmListRow, EsmRecord } from '../esm-client';
import { extractOmods, isExcludedOmodEdid, propertyName } from '../extract-omods';
import unstoppableMonsterOmod from './fixtures/omod-unstoppablemonster.json';
import unstoppableMonsterPerk from './fixtures/perk-unstoppablemonster.json';
import allRiseOmod from './fixtures/omod-allrise.json';

// Fixtures are verbatim `esm -p get <esmPath> <edid|formid> --json` output
// (20260710 ESM). These pin the unique-mod rework's two previously-undecoded
// OMOD property mechanisms (docs: how-do-we-handle-enumerated-feather.md):
//   omod-unstoppablemonster.json  mod_Custom_UnstoppableMonster  0x008F0DD2
//     — carries property 116 (raw numeric, no {value,name} join) attaching
//     UnstoppableMonster_Perk.
//   perk-unstoppablemonster.json  UnstoppableMonster_Perk        0x0069CBF4
//     — both its Entry Point effects are "Mod Incoming Weapon Damage"
//     (damage TAKEN, entry point 36) — no formula bucket exists for it
//     (deliberately out of scope), so it must decode to a note, not silence.
//   omod-allrise.json             mod_Custom_AllRise             0x0047187E
//     — carries an ActorValues property ADDing AV 0x000002D4 (Health) = 50.0.

describe('propertyName (property 116 raw-numeric decode)', () => {
  it('maps the raw number 116 to AttachedPerk', () => {
    expect(propertyName(116)).toBe('AttachedPerk');
  });

  it('maps other raw numbers to Property#<n> instead of collapsing to Unknown', () => {
    expect(propertyName(999)).toBe('Property#999');
  });

  it('passes a named {value,name} property through unchanged', () => {
    expect(propertyName({ value: 31, name: 'Keywords' })).toBe('Keywords');
  });

  it('falls back to Unknown when there is no name and no recognized number', () => {
    expect(propertyName(undefined)).toBe('Unknown');
    expect(propertyName(null)).toBe('Unknown');
  });
});

/**
 * Minimal stub EsmClient covering exactly what `extractOmods` touches for a
 * two-record OMOD list: the OMODs themselves, the attached perk, and the
 * Health AVIF. Every other formid (keywords, the shared Includes template,
 * the plumbing perks buildAvifRoutes always fetches) resolves to a harmless
 * placeholder record — the test doesn't assert on those.
 */
function makeStubClient(): EsmClient {
  const known: Record<string, EsmRecord> = {
    '0x0047187E': allRiseOmod as unknown as EsmRecord,
    '0x008F0DD2': unstoppableMonsterOmod as unknown as EsmRecord,
    '0x0069CBF4': unstoppableMonsterPerk as unknown as EsmRecord,
    '0x000002D4': {
      header: { signature: 'AVIF', form_id: '0x000002D4' },
      editor_id: 'Health',
      fields: {},
    } as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    // Placeholder for keywords / the shared Includes template / the
    // STAT_Damage*Perk plumbing perks buildAvifRoutes fetches by edid — none
    // of these carry Effects/Properties, so downstream parsing no-ops on them.
    return { header: { signature: 'KYWD', form_id: target }, editor_id: target, fields: {} } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        { form_id: '0x0047187E', record_type: 'OMOD', editor_id: 'mod_Custom_AllRise', name: 'All Rise Custom Mod' },
        {
          form_id: '0x008F0DD2',
          record_type: 'OMOD',
          editor_id: 'mod_Custom_UnstoppableMonster',
          name: 'Unstoppable Monster',
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (unique-mod rework, 2026-07-13)', () => {
  it('mod_Custom_UnstoppableMonster: property 116 resolves the attached perk, whose two damage-TAKEN entry points land as a note (not a silent drop) and never surface as an unknown property', async () => {
    const result = await extractOmods(makeStubClient(), new Set());
    const omod = result.omods.find(o => o.id === 'mod_Custom_UnstoppableMonster');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toEqual([]); // "Mod Incoming Weapon Damage" has no formula bucket — damage taken, out of scope
    expect((omod!.notes ?? []).some(n => n.includes('Mod Incoming Weapon Damage') && n.includes('not modeled'))).toBe(true);
    // The aggregate _meta-visible report also carries the note (edid-prefixed).
    expect(
      result.notes.some(
        n => n.startsWith('mod_Custom_UnstoppableMonster:') && n.includes('Mod Incoming Weapon Damage')
      )
    ).toBe(true);
    expect(result.unknownProperties).not.toContain('Unknown');
    expect(result.unknownProperties.some(p => p.startsWith('Property#'))).toBe(false);
  });

  it('mod_Custom_AllRise: ActorValues ADD Health 50.0 decodes to a maxHealth modifier of value 50', async () => {
    const result = await extractOmods(makeStubClient(), new Set());
    const omod = result.omods.find(o => o.id === 'mod_Custom_AllRise');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({ bucket: 'maxHealth', op: 'ADD', value: 50 })
    );
    expect(omod!.notes).not.toContain('ActorValues on Health — unmapped');
  });
});

/**
 * Stub client for a synthetic OMOD carrying DamageTypeValues ADD/SET
 * properties (Task A, 2026-07-13). Verified raw ESM shape: Value 1 =
 * damage-type formid, Value 2 = amount, for all three operators (SET/
 * MUL_ADD/ADD) — mirrors the makeStubClient() pattern above but with its own
 * minimal record set (the OMOD plus the two damage-type formids it resolves).
 */
function makeDamageTypeValuesStubClient(): EsmClient {
  const dtEnergyFormId = '0x0001CA9F';
  const dtFireFormId = '0x0001CAA0';
  const omodFormId = '0x00DEC001';
  const known: Record<string, EsmRecord> = {
    [omodFormId]: {
      header: { signature: 'OMOD', form_id: omodFormId },
      editor_id: 'mod_Test_DamageTypeValues',
      fields: {
        Name: 'Test Damage Type Values Mod',
        Data: {
          'Form Type': { name: 'Weapon' },
          'Attach Point': '0x0047A264',
          Properties: [
            {
              'Function Type': { name: 'ADD' },
              Property: { name: 'DamageTypeValues' },
              'Value 1': dtEnergyFormId,
              'Value 2': 5,
            },
            {
              'Function Type': { name: 'SET' },
              Property: { name: 'DamageTypeValues' },
              'Value 1': dtFireFormId,
              'Value 2': 0,
            },
          ],
        },
      },
    } as unknown as EsmRecord,
    [dtEnergyFormId]: {
      header: { signature: 'DMGT', form_id: dtEnergyFormId },
      editor_id: 'dtEnergy',
      fields: {},
    } as unknown as EsmRecord,
    [dtFireFormId]: {
      header: { signature: 'DMGT', form_id: dtFireFormId },
      editor_id: 'dtFire',
      fields: {},
    } as unknown as EsmRecord,
  };
  const get = async (target: string): Promise<EsmRecord> => {
    if (known[target]) return known[target];
    return { header: { signature: 'KYWD', form_id: target }, editor_id: target, fields: {} } as unknown as EsmRecord;
  };
  return {
    async list(type: string): Promise<EsmListRow[]> {
      if (type !== 'OMOD') return [];
      return [
        {
          form_id: omodFormId,
          record_type: 'OMOD',
          editor_id: 'mod_Test_DamageTypeValues',
          name: 'Test Damage Type Values Mod',
        },
      ];
    },
    get,
    resolveEdid: async (formId: string) => (await get(formId)).editor_id,
    refs: async () => [],
  } as unknown as EsmClient;
}

describe('extractOmods (DamageTypeValues ADD/SET, Task A 2026-07-13)', () => {
  it('emits baseDamage modifiers for ADD and SET, damage-type scoped, with no "not yet modeled" note', async () => {
    const result = await extractOmods(makeDamageTypeValuesStubClient(), new Set());
    const omod = result.omods.find(o => o.id === 'mod_Test_DamageTypeValues');
    expect(omod).toBeDefined();
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({
        bucket: 'baseDamage',
        op: 'ADD',
        value: 5,
        conditions: [{ kind: 'damageTypeScope', types: ['energy'] }],
      })
    );
    expect(omod!.modifiers).toContainEqual(
      expect.objectContaining({
        bucket: 'baseDamage',
        op: 'SET',
        value: 0,
        conditions: [{ kind: 'damageTypeScope', types: ['fire'] }],
      })
    );
    expect((omod!.notes ?? []).some(n => n.includes('not yet modeled'))).toBe(false);
    expect(result.notes.some(n => n.includes('not yet modeled'))).toBe(false);
  });
});

describe('isExcludedOmodEdid (regression, unrelated pre-filter)', () => {
  it('still drops dev/test-prefixed edids', () => {
    expect(isExcludedOmodEdid('zzzDeprecatedMod')).toBe(true);
    expect(isExcludedOmodEdid('mod_Custom_AllRise')).toBe(false);
  });
});
