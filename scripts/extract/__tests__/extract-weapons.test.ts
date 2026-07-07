import { describe, it, expect } from 'vitest';
import type { EsmClient, EsmRecord } from '../esm-client';
import { toGeneratedWeapon } from '../extract-weapons';
import fixer from './fixtures/weap-fixer.json';
import gatlingPlasma from './fixtures/weap-gatling-plasma.json';
import mg42 from './fixtures/weap-mg42.json';
import shishkebab from './fixtures/weap-shishkebab.json';

// Fixtures are verbatim `esm -p get <formid> --json` output (20260702 ESM).
// These tests pin the WEAP → GeneratedWeapon normalization semantics.

const KNOWN_EDIDS: Record<string, string> = {
  '0x00060A81': 'dtEnergy',
  '0x00060A82': 'dtFire',
  '0x0004A0A1': 'WeaponTypeRifle',
  '0x0004A0A5': 'WeaponTypeHeavyGun',
};

const stubClient = {
  async resolveEdid(formId: string): Promise<string> {
    return KNOWN_EDIDS[formId] ?? `kw_${formId}`;
  },
} as unknown as EsmClient;

describe('toGeneratedWeapon', () => {
  it('Fixer: single ballistic component from the main curve, crit/sneak/fire-rate fields', async () => {
    const w = await toGeneratedWeapon(stubClient, fixer as unknown as EsmRecord, []);
    expect(w.id).toBe('CombatRifle_Fixer');
    expect(w.name).toBe('The Fixer');
    expect(w.components).toHaveLength(1);
    expect(w.components[0]).toMatchObject({ damageType: 'ballistic', tier: 24, amount: 33 });
    expect(w.components[0].curve?.at(-1)).toEqual({ x: 50, y: 103 });
    expect(w.critDamageMult).toBe(2.0);
    expect(w.sneakAttackMult).toBe(2.75);
    expect(w.attackDelaySec).toBeCloseTo(0.28, 5);
    expect(w.projectileCount).toBe(1);
    expect(w.templateModFormIds.length).toBeGreaterThan(0);
  });

  it('Gatling Plasma: main curve present → phys + energy (all plasma weapons deal both)', async () => {
    const w = await toGeneratedWeapon(stubClient, gatlingPlasma as unknown as EsmRecord, []);
    expect(w.components.map(c => c.damageType)).toEqual(['ballistic', 'energy']);
    expect(w.components[0].tier).toBe(12);
    expect(w.components[1].tier).toBe(12);
  });

  it('MG42: Base Damage 0 with no typed entries → physical from the main curve', async () => {
    const w = await toGeneratedWeapon(stubClient, mg42 as unknown as EsmRecord, []);
    expect(w.components).toHaveLength(1);
    expect(w.components[0].damageType).toBe('ballistic');
    expect(w.components[0].tier).toBe(16);
  });

  it('Shishkebab: Base Damage > 0 plus typed fire entry → two components sharing the tier-20 curve', async () => {
    const w = await toGeneratedWeapon(stubClient, shishkebab as unknown as EsmRecord, []);
    expect(w.components.map(c => c.damageType)).toEqual(['ballistic', 'fire']);
    expect(w.components[0].tier).toBe(20);
    expect(w.components[1].tier).toBe(20);
  });

  it('flags unrecognized damage types as unresolved instead of dropping them', async () => {
    const record = JSON.parse(JSON.stringify(shishkebab)) as EsmRecord;
    (record.fields['Damage Types'] as Array<{ Type: string }>)[0].Type = '0x0BADF00D';
    const unresolved: string[] = [];
    const w = await toGeneratedWeapon(stubClient, record, unresolved);
    expect(w.components[1].damageType).toBe('unknown');
    expect(unresolved.some(u => u.includes('0x0BADF00D'))).toBe(true);
  });
});
