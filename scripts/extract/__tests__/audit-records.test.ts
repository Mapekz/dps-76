import { describe, expect, it } from 'bun:test';
import type { EsmRecord, EsmSource } from '../esm-client';
import type { GeneratedOmod, GeneratedWeapon } from '../../../src/types/generated';
import {
  auditIdentity,
  auditOmodTier2,
  auditTier3Carriers,
  auditWeaponTier2,
  enumerateOmodCarriers,
  enumerateWeaponCarriers,
  extractOmodTier2Source,
  extractWeaponTier2Source,
  isCarrierAccounted,
  isOmodPropertyDamageRelevant,
  sortFindings,
  type AuditFinding,
} from '../../audit-records';

function weapRecord(formId: string, editorId: string, fields: Record<string, unknown>): EsmRecord {
  return {
    header: { signature: 'WEAP', form_id: formId },
    editor_id: editorId,
    fields,
  };
}

function omodRecord(
  formId: string,
  editorId: string,
  data: Record<string, unknown>,
  extraFields: Record<string, unknown> = {},
): EsmRecord {
  return {
    header: { signature: 'OMOD', form_id: formId },
    editor_id: editorId,
    fields: { Data: data, ...extraFields },
  };
}

const mockClient = {
  resolveEdid: async (formId: string) => {
    const map: Record<string, string> = {
      '0xAP': 'ap_gun_Receiver',
      '0xKW1': 'ma_Rifle',
      '0xKW2': 'ma_Gun',
      '0xADD': 'Keyword_Added',
    };
    return map[formId] ?? `edid_${formId}`;
  },
};

describe('sortFindings', () => {
  it('orders identity before silent-drop before field-mismatch', () => {
    const findings: AuditFinding[] = [
      { kind: 'field-mismatch', tier: 2, recordId: 'a', field: 'x', expected: '1', actual: '2' },
      { kind: 'identity', tier: 1, recordId: 'b', field: 'edid', expected: 'A', actual: 'B' },
      { kind: 'silent-drop', tier: 3, recordId: 'c', field: 'y', expected: 'm', actual: 'none' },
    ];
    expect(sortFindings(findings).map((f) => f.kind)).toEqual([
      'identity',
      'silent-drop',
      'field-mismatch',
    ]);
  });
});

describe('auditIdentity', () => {
  it('flags missing records', () => {
    const findings = auditIdentity({
      recordId: 'MissingGun',
      expectedEdid: 'MissingGun',
      expectedSignature: 'WEAP',
      esmRecord: null,
    });
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'identity', field: 'formId', actual: 'missing' });
  });

  it('passes when edid, signature, and name match', () => {
    const findings = auditIdentity({
      recordId: 'Fixer',
      expectedEdid: 'CombatRifle_Fixer',
      expectedName: 'The Fixer',
      expectedSignature: 'WEAP',
      esmRecord: weapRecord('0x1', 'CombatRifle_Fixer', { Name: 'The Fixer' }),
    });
    expect(findings).toHaveLength(0);
  });
});

describe('auditWeaponTier2', () => {
  it('detects speed and capacity drift', () => {
    const weapon = {
      id: 'TestGun',
      formId: '0x1',
      name: 'Test Gun',
      speed: 1.5,
      capacity: 30,
      eligibleLevels: [10, 20],
      keywords: ['ma_Rifle'],
      components: [
        { damageType: 'ballistic', damageTypeEdid: null, amount: 42, tier: null, curve: null },
      ],
    } as GeneratedWeapon;

    const findings = auditWeaponTier2(weapon, {
      speed: 1.0,
      capacity: 30,
      eligibleLevels: [10, 20],
      keywords: ['ma_Rifle'],
      baseDamage: 42,
      typedAmounts: [],
    });

    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ field: 'speed', expected: '1', actual: '1.5' });
  });
});

describe('extractWeaponTier2Source', () => {
  it('reads verbatim speed/capacity/levels from fixture-shaped fields', async () => {
    const source = await extractWeaponTier2Source(
      mockClient as EsmSource,
      weapRecord('0x1', 'Gun', {
        Data: { Speed: 0.75, Capacity: 20, 'Base Damage': 10 },
        'Eligible Levels': [5, 15],
        Keywords: { Keywords: ['0xKW1'] },
      }),
    );
    expect(source.speed).toBe(0.75);
    expect(source.capacity).toBe(20);
    expect(source.eligibleLevels).toEqual([5, 15]);
    expect(source.keywords).toEqual(['ma_Rifle']);
  });
});

describe('omod tier 2/3', () => {
  const byFormId = new Map<string, EsmRecord>([
    [
      '0xOMOD',
      omodRecord(
        '0xOMOD',
        'mod_Test',
        {
          'Attach Point': '0xAP',
          Properties: [
            {
              'Function Type': { name: 'SET' },
              Property: { name: 'DamageBonusMult' },
              'Value 1': 0.25,
              'Value 2': null,
            },
            {
              'Function Type': { name: 'ADD' },
              Property: { name: 'Keywords' },
              'Value 1': '0xADD',
              'Value 2': null,
            },
          ],
        },
        { 'Target OMOD Keywords': ['0xKW1', '0xKW2'] },
      ),
    ],
  ]);

  it('compares attach point, keywords, and enchantment flag', async () => {
    const rec = byFormId.get('0xOMOD')!;
    const source = await extractOmodTier2Source(mockClient as EsmSource, rec, byFormId);
    expect(source.attachPointEdid).toBe('ap_gun_Receiver');
    expect(source.targetKeywords).toEqual(['ma_Gun', 'ma_Rifle']);
    expect(source.addedKeywords).toEqual(['Keyword_Added']);
    expect(source.hasEnchantments).toBe(false);

    const omod = {
      id: 'mod_Test',
      formId: '0xOMOD',
      name: 'Test',
      description: '',
      attachPointFormId: '0xAP',
      attachPointEdid: 'ap_gun_Receiver',
      targetKeywords: ['ma_Gun', 'ma_Rifle'],
      addedKeywords: ['Keyword_Added'],
      hasEnchantments: false,
      modifiers: [],
    } as GeneratedOmod;

    expect(auditOmodTier2(omod, source)).toHaveLength(0);
  });

  it('enumerates damage-relevant properties for tier 3', () => {
    expect(isOmodPropertyDamageRelevant('DamageBonusMult')).toBe(true);
    expect(isOmodPropertyDamageRelevant('Weight')).toBe(false);
    const carriers = enumerateOmodCarriers('0xOMOD', byFormId);
    expect(carriers.map((c) => c.label)).toEqual(['DamageBonusMult']);
  });
});

describe('isCarrierAccounted', () => {
  it('accepts unresolved unknown-property notes', () => {
    expect(
      isCarrierAccounted(
        'mod_Foo',
        { key: 'property:WeirdStat', label: 'WeirdStat' },
        [],
        [],
        ['unknown OMOD property: WeirdStat'],
      ),
    ).toBe(true);
  });

  it('flags silent drops when nothing accounts for a carrier', () => {
    const findings = auditTier3Carriers(
      'Gun01',
      [{ key: 'enchantment:0xENCH', label: 'Enchantment 0xENCH' }],
      [],
      [],
      [],
    );
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({ kind: 'silent-drop' });
  });
});

describe('enumerateWeaponCarriers', () => {
  it('returns an enchantment carrier when present', () => {
    const carriers = enumerateWeaponCarriers(weapRecord('0x1', 'Gun', { Enchantment: '0xENCH' }));
    expect(carriers).toEqual([{ key: 'enchantment:0xENCH', label: 'Enchantment 0xENCH' }]);
  });
});
