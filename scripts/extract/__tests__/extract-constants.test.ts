import { describe, it, expect } from 'vitest';
import type { EsmClient, EsmRecord } from '../esm-client';
import { extractConstants } from '../extract-constants';
import avifStrength from './fixtures/avif-strength.json';

// avif-strength.json is verbatim `esm -p get 0x000002C2 --json` output
// (20260717 ESM) — pins the real field names ("Minimum Value"/"Maximum
// Value") this extractor reads. The other 6 SPECIAL AVIFs are lightweight
// inline stubs (same shape as edidOnly() helpers elsewhere in this suite —
// AVIF records carry no other field this extractor touches).
const SPECIAL_FORM_IDS = ['0x000002C2', '0x000002C3', '0x000002C4', '0x000002C5', '0x000002C6', '0x000002C7', '0x000002C8'];

function avifStub(formId: string, editorId: string, min: number, max: number): EsmRecord {
  return {
    header: { signature: 'AVIF', form_id: formId },
    editor_id: editorId,
    fields: { 'Minimum Value': min, 'Maximum Value': max },
  };
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

describe('extractConstants', () => {
  it('reads the SPECIAL clamp as [1, 100] when all 7 AVIFs agree (real Strength fixture + 6 matching stubs)', async () => {
    const records: Record<string, EsmRecord> = { '0x000002C2': avifStrength as unknown as EsmRecord };
    for (const formId of SPECIAL_FORM_IDS.slice(1)) {
      records[formId] = avifStub(formId, 'stub', 1, 100);
    }
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.special).toEqual({ min: 1, max: 100 });
    expect(unresolved).toHaveLength(0);
  });

  it('flags divergence instead of silently picking one AVIF, but still emits the first-resolved bound', async () => {
    const records: Record<string, EsmRecord> = {};
    for (const [i, formId] of SPECIAL_FORM_IDS.entries()) {
      records[formId] = avifStub(formId, i === 6 ? 'Luck' : 'stub', 1, i === 6 ? 120 : 100);
    }
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.special).toEqual({ min: 1, max: 100 });
    expect(unresolved.some(u => u.includes('Luck') && u.includes('120'))).toBe(true);
  });

  it('drops a record with a non-numeric Minimum/Maximum Value and notes it, but still resolves from the rest', async () => {
    const records: Record<string, EsmRecord> = {};
    for (const formId of SPECIAL_FORM_IDS) records[formId] = avifStub(formId, 'stub', 1, 100);
    records['0x000002C2'] = { header: { signature: 'AVIF', form_id: '0x000002C2' }, editor_id: 'Strength', fields: {} };
    const { constants, unresolved } = await extractConstants(clientFrom(records));
    expect(constants.special).toEqual({ min: 1, max: 100 });
    expect(unresolved.some(u => u.includes('Strength') && u.includes('missing numeric'))).toBe(true);
  });

  it('falls back to [1, 100] and notes it when every SPECIAL AVIF fails to resolve', async () => {
    const { constants, unresolved } = await extractConstants(clientFrom({}));
    expect(constants.special).toEqual({ min: 1, max: 100 });
    expect(unresolved.some(u => u.includes('no SPECIAL AVIF resolved'))).toBe(true);
  });
});
