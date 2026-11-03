import { describe, it, expect } from 'bun:test';
import type { CurveInput } from '@/types/modifiers';
import type { EsmSource } from '../esm-client';
import {
  normalizeEntryPointValue,
  type EntryPointValueInput,
} from '../normalize/entry-point-value';

// Owns the generic entry-point value rules shared by direct perks
// (extract-perks.ts) and granted perks (translateGrantedPerk). The adapter
// suites keep one case each proving they call this and keep their own
// conditions, ordering and note wording.

const CHA = '0x000002C5';
const curveInputAvs: Record<string, CurveInput> = { [CHA]: 'charisma' };

/** Resolver over `edids`; every call is recorded, and `'throw'` makes a lookup fail. */
function resolver(edids: Record<string, string | 'throw'> = {}) {
  const calls: string[] = [];
  const client: Pick<EsmSource, 'resolveEdid'> = {
    async resolveEdid(formId) {
      calls.push(formId);
      const edid = edids[formId];
      if (edid === undefined || edid === 'throw') throw new Error(`no edid for ${formId}`);
      return edid;
    },
  };
  return { client, calls };
}

function normalize(
  input: Partial<EntryPointValueInput> & Pick<EntryPointValueInput, 'functionName'>,
  opts: { edids?: Record<string, string | 'throw'>; cache?: Map<string, string> } = {},
) {
  const { client, calls } = resolver(opts.edids);
  const edidByFormId = opts.cache ?? new Map<string, string>();
  const result = normalizeEntryPointValue(
    { float: 0, curvePoints: null, curveInputAv: null, ...input },
    { client, edidByFormId, curveInputAvs },
  );
  return { result, calls, edidByFormId };
}

const multiPoint = [
  { x: 1, y: 1.25 },
  { x: 10, y: 1.5 },
];

describe('normalizeEntryPointValue: flat values', () => {
  const rows = [
    { functionName: 'Add Value', float: 0.25, op: 'ADD', value: 0.25 },
    { functionName: 'Set Value', float: 0.25, op: 'SET', value: 0.25 },
    { functionName: 'Multiply Value', float: 1.5, op: 'MUL_ADD', value: 0.5 },
  ] as const;
  for (const row of rows) {
    it(`${row.functionName} ${row.float} → ${row.op} ${row.value}`, async () => {
      const { result } = normalize({ functionName: row.functionName, float: row.float });
      expect(await result).toEqual({ kind: 'modifier', op: row.op, payload: { value: row.value } });
    });
  }
});

describe('normalizeEntryPointValue: single-point curves', () => {
  it('a single-point curve replaces the flat Float and never resolves an axis', async () => {
    const { result, calls } = normalize({
      functionName: 'Add Value',
      float: 0.9,
      curvePoints: [{ x: 0, y: 0.2 }],
      curveInputAv: '0x00ABC001',
    });
    expect(await result).toEqual({ kind: 'modifier', op: 'ADD', payload: { value: 0.2 } });
    expect(calls).toEqual([]);
  });

  it('Multiply Value still folds a single-point Y as MUL_ADD y−1', async () => {
    const { result } = normalize({
      functionName: 'Multiply Value',
      float: 3,
      curvePoints: [{ x: 0, y: 0.75 }],
    });
    expect(await result).toEqual({ kind: 'modifier', op: 'MUL_ADD', payload: { value: -0.25 } });
  });
});

describe('normalizeEntryPointValue: multi-point curves', () => {
  const rows: Array<{
    functionName: string;
    op: 'ADD' | 'SET' | 'MUL_ADD';
    points: Array<{ x: number; y: number }>;
  }> = [
    { functionName: 'Add Value', op: 'ADD', points: multiPoint },
    { functionName: 'Set Value', op: 'SET', points: multiPoint },
    {
      functionName: 'Multiply Value',
      op: 'MUL_ADD',
      points: [
        { x: 1, y: 0.25 },
        { x: 10, y: 0.5 },
      ],
    },
  ];
  for (const row of rows) {
    it(`${row.functionName} on a registered axis → ${row.op} curve, ignoring the Float`, async () => {
      const { result, calls } = normalize({
        functionName: row.functionName,
        float: 7,
        curvePoints: multiPoint,
        curveInputAv: CHA,
      });
      expect(await result).toEqual({
        kind: 'modifier',
        op: row.op,
        payload: { curve: { input: 'charisma', points: row.points }, curveScale: 1 },
      });
      expect(calls).toEqual([]);
    });
  }

  it('maps an LGND_* counter with a domain of at most 5 to wornPieces', async () => {
    const points = [
      { x: 1, y: 3 },
      { x: 5, y: 15 },
    ];
    const { result, edidByFormId } = normalize(
      { functionName: 'Add Value', curvePoints: points, curveInputAv: '0x00ABC002' },
      { edids: { '0x00ABC002': 'LGND_TestPieces' } },
    );
    expect(await result).toEqual({
      kind: 'modifier',
      op: 'ADD',
      payload: { curve: { input: 'wornPieces', points }, curveScale: 1 },
    });
    expect(edidByFormId.get('0x00ABC002')).toBe('LGND_TestPieces');
  });

  it('rejects an LGND_* counter whose domain exceeds 5, naming it in the label', async () => {
    const { result } = normalize(
      {
        functionName: 'Add Value',
        curvePoints: [
          { x: 1, y: 3 },
          { x: 6, y: 18 },
        ],
        curveInputAv: '0x00ABC002',
      },
      { edids: { '0x00ABC002': 'LGND_TestPieces' } },
    );
    expect(await result).toEqual({ kind: 'unmappedCurveInput', inputLabel: 'LGND_TestPieces' });
  });

  it('labels an unmapped non-LGND axis by its resolved editor id', async () => {
    const { result } = normalize(
      { functionName: 'Add Value', curvePoints: multiPoint, curveInputAv: '0x00ABC001' },
      { edids: { '0x00ABC001': 'SomeCounter' } },
    );
    expect(await result).toEqual({ kind: 'unmappedCurveInput', inputLabel: 'SomeCounter' });
  });

  it("labels a missing axis 'none'", async () => {
    const { result } = normalize({ functionName: 'Add Value', curvePoints: multiPoint });
    expect(await result).toEqual({ kind: 'unmappedCurveInput', inputLabel: 'none' });
  });

  it('uses a cached editor id without calling the resolver', async () => {
    const points = [
      { x: 0, y: 0 },
      { x: 2, y: 4 },
    ];
    const { result, calls } = normalize(
      { functionName: 'Add Value', curvePoints: points, curveInputAv: '0x00ABC002' },
      { cache: new Map([['0x00ABC002', 'LGND_Cached']]) },
    );
    expect(await result).toEqual({
      kind: 'modifier',
      op: 'ADD',
      payload: { curve: { input: 'wornPieces', points }, curveScale: 1 },
    });
    expect(calls).toEqual([]);
  });

  it('falls back to the raw formid when the resolver throws, and caches nothing', async () => {
    const { result, edidByFormId } = normalize(
      { functionName: 'Add Value', curvePoints: multiPoint, curveInputAv: '0x00ABC003' },
      { edids: { '0x00ABC003': 'throw' } },
    );
    expect(await result).toEqual({ kind: 'unmappedCurveInput', inputLabel: '0x00ABC003' });
    expect(edidByFormId.has('0x00ABC003')).toBe(false);
  });
});

describe('normalizeEntryPointValue: unsupported functions', () => {
  it('leaves other function shapes to the caller', async () => {
    const { result } = normalize({ functionName: 'Add Actor Value Mult', float: 0.01 });
    expect(await result).toEqual({ kind: 'unsupportedFunction' });
  });

  it('reports an unmapped curve axis before an unsupported function', async () => {
    const { result } = normalize(
      {
        functionName: 'Add Actor Value Mult',
        curvePoints: multiPoint,
        curveInputAv: '0x00ABC001',
      },
      { edids: { '0x00ABC001': 'SomeCounter' } },
    );
    expect(await result).toEqual({ kind: 'unmappedCurveInput', inputLabel: 'SomeCounter' });
  });
});
