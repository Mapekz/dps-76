import { describe, it, expect } from 'vitest';
import type { EsmClient, EsmRecord } from '../esm-client';
import { extractConstants } from '../extract-constants';
import avifStrength from './fixtures/avif-strength.json';
import gmstResistExponent from './fixtures/gmst-resist-exponent.json';

// avif-strength.json is verbatim `esm -p get 0x000002C2 --json` output
// (20260717 ESM) — pins the real field names ("Minimum Value"/"Maximum
// Value") this extractor reads. The other 6 SPECIAL AVIFs are lightweight
// inline stubs (same shape as edidOnly() helpers elsewhere in this suite —
// AVIF records carry no other field this extractor touches).
const SPECIAL_FORM_IDS = ['0x000002C2', '0x000002C3', '0x000002C4', '0x000002C5', '0x000002C6', '0x000002C7', '0x000002C8'];

// Mirrors extract-constants.ts's own GMST family FormID lists (duplicated
// here rather than exported — same convention as SPECIAL_FORM_IDS above).
const RESIST_EXPONENT_FORM_IDS = ['0x0017D8A9', '0x0017D8A6', '0x0017D8AB', '0x0017D8A7', '0x0017D8A8', '0x0017D8AA', '0x0017D8AC'];
const DAMAGE_FACTOR_FORM_IDS = ['0x000769CB', '0x000769C8', '0x000769CD', '0x000769C9', '0x000769CA', '0x000769CC', '0x000769CE'];
const MIN_DAMAGE_REDUCTION_FORM_IDS = ['0x00066DC7', '0x0006461D', '0x0006461C', '0x00064620', '0x00064623'];
const MAX_DAMAGE_REDUCTION_FORM_IDS = ['0x00066DC6', '0x0006461E', '0x000559A3', '0x0006461B', '0x0006461F', '0x003C295D', '0x00064624'];

function avifStub(formId: string, editorId: string, min: number, max: number): EsmRecord {
  return {
    header: { signature: 'AVIF', form_id: formId },
    editor_id: editorId,
    fields: { 'Minimum Value': min, 'Maximum Value': max },
  };
}

function gmstStub(formId: string, editorId: string, value: number): EsmRecord {
  return {
    header: { signature: 'GMST', form_id: formId },
    editor_id: editorId,
    fields: { Float: value },
  };
}

/** A full set of valid mitigation GMST records (uniform, real values) — merged into SPECIAL-focused fixtures so they don't spuriously flag mitigation as unresolved. */
function uniformMitigationRecords(): Record<string, EsmRecord> {
  const records: Record<string, EsmRecord> = {};
  for (const formId of RESIST_EXPONENT_FORM_IDS) records[formId] = gmstStub(formId, 'stub', 0.365);
  for (const formId of DAMAGE_FACTOR_FORM_IDS) records[formId] = gmstStub(formId, 'stub', 0.15);
  for (const formId of MIN_DAMAGE_REDUCTION_FORM_IDS) records[formId] = gmstStub(formId, 'stub', 0.01);
  for (const formId of MAX_DAMAGE_REDUCTION_FORM_IDS) records[formId] = gmstStub(formId, 'stub', 0.99);
  return records;
}

function clientFrom(records: Record<string, EsmRecord>): EsmClient {
  return {
    async get(target: string): Promise<EsmRecord> {
      const record = records[target];
      if (!record) throw new Error(`not found: ${target}`);
      return record;
    },
  } as unknown as EsmClient;
}

describe('extractConstants — SPECIAL clamp', () => {
  it('reads the SPECIAL clamp as [1, 100] when all 7 AVIFs agree (real Strength fixture + 6 matching stubs)', async () => {
    const records: Record<string, EsmRecord> = { '0x000002C2': avifStrength as unknown as EsmRecord, ...uniformMitigationRecords() };
    for (const formId of SPECIAL_FORM_IDS.slice(1)) {
      records[formId] = avifStub(formId, 'stub', 1, 100);
    }
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.special).toEqual({ min: 1, max: 100 });
    expect(unresolved).toHaveLength(0);
  });

  it('flags divergence instead of silently picking one AVIF, but still emits the first-resolved bound', async () => {
    const records: Record<string, EsmRecord> = { ...uniformMitigationRecords() };
    for (const [i, formId] of SPECIAL_FORM_IDS.entries()) {
      records[formId] = avifStub(formId, i === 6 ? 'Luck' : 'stub', 1, i === 6 ? 120 : 100);
    }
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.special).toEqual({ min: 1, max: 100 });
    expect(unresolved.some(u => u.includes('Luck') && u.includes('120'))).toBe(true);
  });

  it('drops a record with a non-numeric Minimum/Maximum Value and notes it, but still resolves from the rest', async () => {
    const records: Record<string, EsmRecord> = { ...uniformMitigationRecords() };
    for (const formId of SPECIAL_FORM_IDS) records[formId] = avifStub(formId, 'stub', 1, 100);
    records['0x000002C2'] = { header: { signature: 'AVIF', form_id: '0x000002C2' }, editor_id: 'Strength', fields: {} };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.special).toEqual({ min: 1, max: 100 });
    expect(unresolved.some(u => u.includes('Strength') && u.includes('missing numeric'))).toBe(true);
  });

  it('falls back to [1, 100] and notes it when every SPECIAL AVIF fails to resolve', async () => {
    const { constants, unresolved } = await extractConstants(clientFrom(uniformMitigationRecords()));
    expect(constants.special).toEqual({ min: 1, max: 100 });
    expect(unresolved.some(u => u.includes('no SPECIAL AVIF resolved'))).toBe(true);
  });
});

/** A full set of valid SPECIAL AVIF records — merged into mitigation-focused fixtures below for the same reason as uniformMitigationRecords(). */
function uniformSpecialRecords(): Record<string, EsmRecord> {
  const records: Record<string, EsmRecord> = {};
  for (const formId of SPECIAL_FORM_IDS) records[formId] = avifStub(formId, 'stub', 1, 100);
  return records;
}

describe('extractConstants — mitigation GMST families', () => {
  it('reads all 4 families as [0.365, 0.15, 0.01, 0.99] when every GMST agrees (real exponent fixture + matching stubs)', async () => {
    const records: Record<string, EsmRecord> = { ...uniformSpecialRecords(), ...uniformMitigationRecords() };
    records['0x0017D8A9'] = gmstResistExponent as unknown as EsmRecord;
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.mitigation).toEqual({ resistExponent: 0.365, damageFactor: 0.15, minReduction: 0.01, maxReduction: 0.99 });
    expect(unresolved).toHaveLength(0);
  });

  it('MinDamageReduction resolves from only its 5 real members (Rads/Poison have no dedicated GMST) without flagging that as unresolved', async () => {
    // uniformMitigationRecords() already only stubs MIN_DAMAGE_REDUCTION_FORM_IDS's 5 entries —
    // this test just makes that "5, not 7" shape explicit and asserts it resolves cleanly.
    expect(MIN_DAMAGE_REDUCTION_FORM_IDS).toHaveLength(5);
    const records: Record<string, EsmRecord> = { ...uniformSpecialRecords(), ...uniformMitigationRecords() };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.mitigation.minReduction).toBe(0.01);
    expect(unresolved).toHaveLength(0);
  });

  it('flags divergence within a family instead of silently picking one member, but still emits the first-resolved value', async () => {
    const records: Record<string, EsmRecord> = { ...uniformSpecialRecords(), ...uniformMitigationRecords() };
    records[DAMAGE_FACTOR_FORM_IDS[3]] = gmstStub(DAMAGE_FACTOR_FORM_IDS[3], 'Rogue', 0.2);
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.mitigation.damageFactor).toBe(0.15); // first-resolved member wins
    expect(unresolved.some(u => u.includes('DamageFactor') && u.includes('0.2'))).toBe(true);
  });

  it('falls back to the pre-extraction default for a family that fails to resolve entirely, independent of the other families', async () => {
    const records: Record<string, EsmRecord> = { ...uniformSpecialRecords(), ...uniformMitigationRecords() };
    for (const formId of MAX_DAMAGE_REDUCTION_FORM_IDS) delete records[formId];
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.mitigation).toEqual({ resistExponent: 0.365, damageFactor: 0.15, minReduction: 0.01, maxReduction: 0.99 });
    expect(unresolved.some(u => u.includes('no MaxDamageReduction GMST resolved'))).toBe(true);
  });
});
