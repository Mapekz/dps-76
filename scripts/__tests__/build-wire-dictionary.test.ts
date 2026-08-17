import { describe, it, expect } from 'bun:test';
import type { WireDictionary } from '../../src/data/wire-dictionary/types';
import { syncWireDictionary } from '../build-wire-dictionary';

function empty(): WireDictionary {
  return { nextIndex: 0, ids: {}, acknowledgedRemovals: [] };
}

describe('syncWireDictionary', () => {
  it('assigns fresh integers to new ids in sorted order', () => {
    const result = syncWireDictionary(empty(), new Set(['c', 'a', 'b']), () => undefined);
    expect(result.added).toEqual(['a', 'b', 'c']);
    expect(result.dictionary.ids).toEqual({ a: 0, b: 1, c: 2 });
    expect(result.dictionary.nextIndex).toBe(3);
  });

  it('keeps existing integers on re-run', () => {
    const existing: WireDictionary = {
      nextIndex: 2,
      ids: { a: 0, b: 1 },
      acknowledgedRemovals: [],
    };
    const result = syncWireDictionary(existing, new Set(['a', 'b']), () => undefined);
    expect(result.added).toEqual([]);
    expect(result.dictionary.ids).toEqual({ a: 0, b: 1 });
    expect(result.dictionary.nextIndex).toBe(2);
    expect(result.possiblyRenamed).toEqual([]);
    expect(result.missing).toEqual([]);
  });

  it('only grows nextIndex — never shrinks or reuses', () => {
    const existing: WireDictionary = {
      nextIndex: 5,
      ids: { retired: 0, kept: 2 },
      acknowledgedRemovals: [],
    };
    const result = syncWireDictionary(existing, new Set(['kept', 'new']), () => undefined);
    expect(result.dictionary.ids).toEqual({ retired: 0, kept: 2, new: 5 });
    expect(result.dictionary.nextIndex).toBe(6);
  });

  it('reports removals instead of deleting keys', () => {
    const existing: WireDictionary = {
      nextIndex: 2,
      ids: { a: 0, gone: 1 },
      acknowledgedRemovals: [],
    };
    const result = syncWireDictionary(existing, new Set(['a']), () => undefined);
    expect(result.dictionary.ids).toEqual({ a: 0, gone: 1 });
    expect(result.missing).toEqual(['gone']);
  });

  it('suppresses acknowledged removals from the missing report', () => {
    const existing: WireDictionary = {
      nextIndex: 2,
      ids: { a: 0, gone: 1 },
      acknowledgedRemovals: ['gone'],
    };
    const result = syncWireDictionary(existing, new Set(['a']), () => undefined);
    expect(result.missing).toEqual([]);
  });

  it('detects possible renames via shared formId', () => {
    const existing: WireDictionary = {
      nextIndex: 1,
      ids: { old_edid: 0 },
      acknowledgedRemovals: [],
    };
    const formIds = new Map([
      ['old_edid', '0xABC'],
      ['new_edid', '0xABC'],
    ]);
    const result = syncWireDictionary(existing, new Set(['new_edid']), (id) => formIds.get(id));
    expect(result.added).toEqual(['new_edid']);
    expect(result.possiblyRenamed).toEqual([{ from: 'old_edid', to: 'new_edid', formId: '0xABC' }]);
    expect(result.missing).toEqual([]);
    expect(result.dictionary.ids.old_edid).toBe(0);
    expect(result.dictionary.ids.new_edid).toBe(1);
  });

  it('reports missing when multiple added ids share the removed formId', () => {
    const existing: WireDictionary = {
      nextIndex: 1,
      ids: { old: 0 },
      acknowledgedRemovals: [],
    };
    const formIds = new Map([
      ['old', '0x1'],
      ['new_a', '0x1'],
      ['new_b', '0x1'],
    ]);
    const result = syncWireDictionary(existing, new Set(['new_a', 'new_b']), (id) =>
      formIds.get(id),
    );
    expect(result.missing).toEqual(['old']);
    expect(result.possiblyRenamed).toEqual([]);
  });
});
