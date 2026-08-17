import { describe, expect, it } from 'bun:test';
import { BitReader, BitWriter } from '@/lib/persist/bitstream';

/** Deterministic 32-bit LCG — failures reproduce across runs. */
function makePrng(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state;
  };
}

function roundTripBits(value: number, width: number, leadingPadBits: number): void {
  const writer = new BitWriter();
  for (let i = 0; i < leadingPadBits; i++) {
    writer.writeBit((i & 1) as 0 | 1);
  }
  writer.writeBits(value, width);

  const reader = new BitReader(writer.toBytes());
  for (let i = 0; i < leadingPadBits; i++) {
    expect(reader.readBit()).toBe((i & 1) as 0 | 1);
  }
  expect(reader.readBits(width)).toBe(width === 32 ? value >>> 0 : value & ((1 << width) - 1));
  expect(reader.overrun).toBe(false);
}

function maxForWidth(width: number): number {
  return width === 32 ? 0xffffffff : (1 << width) - 1;
}

describe('BitWriter / BitReader', () => {
  describe('writeBits / readBits', () => {
    for (let width = 1; width <= 32; width++) {
      const max = maxForWidth(width);

      for (const leadingPad of [0, 1, 2, 3, 4, 5, 6, 7]) {
        it(`round-trips width ${width} value 0 with ${leadingPad} leading pad bits`, () => {
          roundTripBits(0, width, leadingPad);
        });

        it(`round-trips width ${width} max value with ${leadingPad} leading pad bits`, () => {
          roundTripBits(max, width, leadingPad);
        });

        if (width >= 3) {
          it(`round-trips width ${width} mid value with ${leadingPad} leading pad bits`, () => {
            roundTripBits(Math.floor(max / 3) | 1, width, leadingPad);
          });
        }
      }
    }
  });

  describe('grouped varint', () => {
    const groupWidths = [4, 6, 8, 9, 13] as const;

    for (const groupWidth of groupWidths) {
      const oneGroupMax = maxForWidth(groupWidth);

      it(`round-trips 0 with groupWidth ${groupWidth}`, () => {
        const writer = new BitWriter();
        writer.writeGroupedVarint(0, groupWidth);
        const reader = new BitReader(writer.toBytes());
        expect(reader.readGroupedVarint(groupWidth)).toBe(0);
        expect(reader.overrun).toBe(false);
      });

      it(`round-trips exactly one group max (${oneGroupMax}) with groupWidth ${groupWidth}`, () => {
        const writer = new BitWriter();
        writer.writeGroupedVarint(oneGroupMax, groupWidth);
        const reader = new BitReader(writer.toBytes());
        expect(reader.readGroupedVarint(groupWidth)).toBe(oneGroupMax);
        expect(reader.overrun).toBe(false);
      });

      it(`round-trips one over boundary (${oneGroupMax + 1}) with groupWidth ${groupWidth}`, () => {
        const writer = new BitWriter();
        writer.writeGroupedVarint(oneGroupMax + 1, groupWidth);
        const reader = new BitReader(writer.toBytes());
        expect(reader.readGroupedVarint(groupWidth)).toBe(oneGroupMax + 1);
        expect(reader.overrun).toBe(false);
      });

      it(`round-trips several groups deep with groupWidth ${groupWidth}`, () => {
        // Three groups: keep shifts within safe integer range for JS number math.
        const deep =
          (BigInt(oneGroupMax) << BigInt(groupWidth * 2)) |
          (BigInt(oneGroupMax) << BigInt(groupWidth)) |
          3n;
        const deepNum = Number(deep);
        const writer = new BitWriter();
        writer.writeGroupedVarint(deepNum, groupWidth);
        const reader = new BitReader(writer.toBytes());
        expect(reader.readGroupedVarint(groupWidth)).toBe(deepNum);
        expect(reader.overrun).toBe(false);
      });
    }
  });

  describe('delta list', () => {
    it('round-trips an empty list (count 0, nothing written)', () => {
      const writer = new BitWriter();
      writer.writeDeltaList([], 6, 4);
      const reader = new BitReader(writer.toBytes());
      expect(reader.readDeltaList(0, 6, 4)).toEqual([]);
      expect(reader.overrun).toBe(false);
    });

    it('round-trips a single-element list', () => {
      const writer = new BitWriter();
      writer.writeDeltaList([42], 8, 6);
      const reader = new BitReader(writer.toBytes());
      expect(reader.readDeltaList(1, 8, 6)).toEqual([42]);
      expect(reader.overrun).toBe(false);
    });

    it('round-trips consecutive integers (all deltas 0)', () => {
      const list = [3, 4, 5, 6, 7];
      const writer = new BitWriter();
      writer.writeDeltaList(list, 6, 4);
      const reader = new BitReader(writer.toBytes());
      expect(reader.readDeltaList(list.length, 6, 4)).toEqual(list);
      expect(reader.overrun).toBe(false);
    });

    it('round-trips a large gap forcing a multi-group delta', () => {
      const list = [1, 1_000_000];
      const writer = new BitWriter();
      writer.writeDeltaList(list, 8, 9);
      const reader = new BitReader(writer.toBytes());
      expect(reader.readDeltaList(list.length, 8, 9)).toEqual(list);
      expect(reader.overrun).toBe(false);
    });

    it('throws on non-ascending input', () => {
      const writer = new BitWriter();
      expect(() => writer.writeDeltaList([5, 5], 4, 4)).toThrow(/strictly ascending/);
      expect(() => writer.writeDeltaList([7, 3], 4, 4)).toThrow(/strictly ascending/);
    });
  });

  describe('bitmask', () => {
    it('round-trips empty', () => {
      const writer = new BitWriter();
      writer.writeBitmask([], 8);
      const reader = new BitReader(writer.toBytes());
      expect(reader.readBitmask(8)).toEqual([]);
      expect(reader.overrun).toBe(false);
    });

    it('round-trips all-set', () => {
      const width = 10;
      const all = Array.from({ length: width }, (_, i) => i);
      const writer = new BitWriter();
      writer.writeBitmask(all, width);
      const reader = new BitReader(writer.toBytes());
      expect(reader.readBitmask(width)).toEqual(all);
      expect(reader.overrun).toBe(false);
    });

    it('round-trips a set index at the exact top of the width', () => {
      const width = 12;
      const writer = new BitWriter();
      writer.writeBitmask([width - 1], width);
      const reader = new BitReader(writer.toBytes());
      expect(reader.readBitmask(width)).toEqual([width - 1]);
      expect(reader.overrun).toBe(false);
    });
  });

  describe('string', () => {
    const cases = ['', 'hello', 'café', '🔥🎯', 'mixed ASCII café 🔥'];

    for (const s of cases) {
      it(`round-trips ${s === '' ? 'empty' : JSON.stringify(s)}`, () => {
        const writer = new BitWriter();
        writer.writeString(s);
        const reader = new BitReader(writer.toBytes());
        expect(reader.readString()).toBe(s);
        expect(reader.overrun).toBe(false);
      });
    }
  });

  describe('mixed sequence', () => {
    it('round-trips bits, varints, string, bitmask, and more bits in order', () => {
      const writer = new BitWriter();
      writer.writeBits(0b1011, 4);
      writer.writeGroupedVarint(200, 8);
      writer.writeString('café ☕');
      writer.writeBitmask([0, 3, 7], 8);
      writer.writeBits(0xab, 8);
      writer.writeDeltaList([2, 5, 100], 6, 8);
      writer.writeBit(1);

      const bytes = writer.toBytes();
      const reader = new BitReader(bytes);

      expect(reader.readBits(4)).toBe(0b1011);
      expect(reader.readGroupedVarint(8)).toBe(200);
      expect(reader.readString()).toBe('café ☕');
      expect(reader.readBitmask(8)).toEqual([0, 3, 7]);
      expect(reader.readBits(8)).toBe(0xab);
      expect(reader.readDeltaList(3, 6, 8)).toEqual([2, 5, 100]);
      expect(reader.readBit()).toBe(1);
      expect(reader.overrun).toBe(false);

      // Reference byte count for the next codec task.
      expect(bytes.length).toBe(17);
    });
  });

  describe('overrun', () => {
    it('latches overrun and returns safe defaults without throwing', () => {
      const writer = new BitWriter();
      writer.writeBits(0xff, 8);
      const reader = new BitReader(writer.toBytes());

      expect(reader.readBits(8)).toBe(0xff);
      expect(reader.overrun).toBe(false);

      expect(reader.readBit()).toBe(0);
      expect(reader.overrun).toBe(true);

      expect(reader.readBits(16)).toBe(0);
      expect(reader.readGroupedVarint(8)).toBe(0);
      expect(reader.readDeltaList(3, 4, 4)).toEqual([]);
      expect(reader.readBitmask(5)).toEqual([]);
      expect(reader.readString()).toBe('');
      expect(reader.overrun).toBe(true);
    });

    it('latches overrun when grouped varint is truncated mid-stream', () => {
      const writer = new BitWriter();
      writer.writeGroupedVarint(500, 8);
      const bytes = writer.toBytes().slice(0, 1);
      const reader = new BitReader(bytes);

      reader.readGroupedVarint(8);
      expect(reader.overrun).toBe(true);
      expect(reader.readBit()).toBe(0);
    });
  });

  describe('fuzz (seeded PRNG)', () => {
    type Op =
      | { kind: 'bit'; value: 0 | 1 }
      | { kind: 'bits'; value: number; width: number }
      | { kind: 'varint'; value: number; groupWidth: number }
      | { kind: 'delta'; values: number[]; firstWidth: number; deltaWidth: number }
      | { kind: 'bitmask'; indices: number[]; width: number }
      | { kind: 'string'; value: string };

    const CHARSET = [...'abcXYZ012 café🔥🎯'];

    function randomString(next: () => number, maxLen: number): string {
      const len = next() % (maxLen + 1);
      let s = '';
      for (let i = 0; i < len; i++) {
        s += CHARSET[next() % CHARSET.length]!;
      }
      return s;
    }

    function randomAscending(next: () => number, count: number): number[] {
      const out: number[] = [];
      let cursor = next() % 100;
      for (let i = 0; i < count; i++) {
        out.push(cursor);
        cursor += 1 + (next() % 50_000);
      }
      return out;
    }

    it('round-trips hundreds of random operation sequences', () => {
      const next = makePrng(0xdec0de);
      const iterations = 300;

      for (let run = 0; run < iterations; run++) {
        const opCount = 3 + (next() % 12);
        const ops: Op[] = [];
        const writer = new BitWriter();

        for (let i = 0; i < opCount; i++) {
          const tag = next() % 6;
          switch (tag) {
            case 0: {
              const value = (next() & 1) as 0 | 1;
              ops.push({ kind: 'bit', value });
              writer.writeBit(value);
              break;
            }
            case 1: {
              const width = 1 + (next() % 16);
              const value = next() & maxForWidth(width);
              ops.push({ kind: 'bits', value, width });
              writer.writeBits(value, width);
              break;
            }
            case 2: {
              const groupWidth = [4, 6, 8, 9, 13][next() % 5]!;
              const value = next() % 1_000_000;
              ops.push({ kind: 'varint', value, groupWidth });
              writer.writeGroupedVarint(value, groupWidth);
              break;
            }
            case 3: {
              const firstWidth = 4 + (next() % 9);
              const deltaWidth = 4 + (next() % 9);
              const count = next() % 6;
              const values = randomAscending(next, count);
              ops.push({ kind: 'delta', values, firstWidth, deltaWidth });
              writer.writeDeltaList(values, firstWidth, deltaWidth);
              break;
            }
            case 4: {
              const width = 1 + (next() % 20);
              const indexCount = next() % 6;
              const indices: number[] = [];
              for (let j = 0; j < indexCount; j++) {
                indices.push(next() % width);
              }
              ops.push({ kind: 'bitmask', indices, width });
              writer.writeBitmask(indices, width);
              break;
            }
            default: {
              const value = randomString(next, 12);
              ops.push({ kind: 'string', value });
              writer.writeString(value);
              break;
            }
          }
        }

        const reader = new BitReader(writer.toBytes());
        for (const op of ops) {
          switch (op.kind) {
            case 'bit':
              expect(reader.readBit()).toBe(op.value);
              break;
            case 'bits':
              expect(reader.readBits(op.width)).toBe(op.value);
              break;
            case 'varint':
              expect(reader.readGroupedVarint(op.groupWidth)).toBe(op.value);
              break;
            case 'delta':
              expect(reader.readDeltaList(op.values.length, op.firstWidth, op.deltaWidth)).toEqual(
                op.values,
              );
              break;
            case 'bitmask':
              expect(reader.readBitmask(op.width)).toEqual(
                [...new Set(op.indices)].sort((a, b) => a - b),
              );
              break;
            case 'string':
              expect(reader.readString()).toBe(op.value);
              break;
          }
          expect(reader.overrun).toBe(false);
        }
      }
    });
  });
});
