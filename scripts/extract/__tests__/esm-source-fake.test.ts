import { describe, it, expect } from 'bun:test';
import type { EsmListRow, EsmRecord, EsmRefRow } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';

const rec = (formId: string, editorId: string): EsmRecord => ({
  header: { signature: 'WEAP', form_id: formId },
  editor_id: editorId,
  fields: {},
});

const row = (
  formId: string,
  type: string,
  editorId: string,
  name: string | null = null,
): EsmListRow => ({
  form_id: formId,
  record_type: type,
  editor_id: editorId,
  name,
});

describe('createInMemoryEsmSource', () => {
  it('get: returns a keyed record and throws on miss', async () => {
    const client = createInMemoryEsmSource({
      records: { '0x00000001': rec('0x00000001', 'Foo') },
    });
    expect((await client.get('0x00000001')).editor_id).toBe('Foo');
    await expect(client.get('0xMISSING')).rejects.toThrow('not found: 0xMISSING');
  });

  it('bulkGet: preserves order; rejects when any target is missing', async () => {
    const client = createInMemoryEsmSource({
      records: {
        '0xA': rec('0xA', 'A'),
        '0xB': rec('0xB', 'B'),
      },
    });
    const [a, b] = await client.bulkGet(['0xA', '0xB', '0xA']);
    expect(a.editor_id).toBe('A');
    expect(b.editor_id).toBe('B');
    await expect(client.bulkGet(['0xA', '0xMISSING'])).rejects.toThrow('not found: 0xMISSING');
  });

  it('list: filters by record type and respects limit', async () => {
    const client = createInMemoryEsmSource({
      rows: [row('0x1', 'WEAP', 'W1'), row('0x2', 'OMOD', 'O1'), row('0x3', 'WEAP', 'W2')],
    });
    expect(await client.list('WEAP')).toHaveLength(2);
    expect(await client.list('WEAP', 1)).toEqual([row('0x1', 'WEAP', 'W1')]);
    expect(await client.list('PERK')).toEqual([]);
  });

  it('search: filters by glob pattern, type, and searchIn', async () => {
    const client = createInMemoryEsmSource({
      rows: [
        row('0x1', 'CURV', 'CT_Creatures_Armor_Universal_Tier22', 'Armor 22'),
        row('0x2', 'CURV', 'CT_Creatures_Health_Universal_Tier01', null),
        row('0x3', 'GMST', 'fFooBar', null),
      ],
    });
    expect(await client.search('*Creatures_Armor*', { type: 'CURV' })).toHaveLength(1);
    expect(await client.search('fFooBar', { type: 'GMST', searchIn: 'edid' })).toHaveLength(1);
    expect(await client.search('Armor 22', { searchIn: 'name' })).toHaveLength(1);
    expect(await client.search('*', { type: 'CURV', limit: 1 })).toHaveLength(1);
  });

  it('refs: returns [] for unknown formIds and throws for the throw sentinel', async () => {
    const ref: EsmRefRow = {
      form_id: '0xCOBJ',
      record_type: 'COBJ',
      editor_id: 'co_test',
      name: null,
      depth: 1,
    };
    const client = createInMemoryEsmSource({
      refs: { '0xREAL': [ref], '0xBAD': 'throw' },
    });
    expect(await client.refs('0xREAL')).toEqual([ref]);
    expect(await client.refs('0xUNKNOWN')).toEqual([]);
    await expect(client.refs('0xBAD')).rejects.toThrow('refs failed');
  });

  it('resolveEdid: reads editor_id from records and falls back when missing', async () => {
    const client = createInMemoryEsmSource({
      records: { '0xKNOWN': rec('0xKNOWN', 'KnownEdid') },
      resolveEdidMap: { '0xMAP': 'MappedEdid' },
      resolveEdidFallback: (id) => `kw_${id}`,
    });
    expect(await client.resolveEdid('0xKNOWN')).toBe('KnownEdid');
    expect(await client.resolveEdid('0xMAP')).toBe('MappedEdid');
    expect(await client.resolveEdid('0xMISSING')).toBe('kw_0xMISSING');
  });

  it('resolveEdid: default miss label when no fallback is configured', async () => {
    const client = createInMemoryEsmSource();
    expect(await client.resolveEdid('0xNOPE')).toBe('<unresolved:0xNOPE>');
  });
});
