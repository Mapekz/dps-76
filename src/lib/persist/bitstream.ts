/** Group width for the byte-length prefix in {@link BitWriter.writeString} /
 * {@link BitReader.readString}. Fixed at compile time — not derived from payload. */
const STRING_LENGTH_GROUP_WIDTH = 8;

/**
 * Append-only bit stream writer. Bits are packed MSB-first within each byte;
 * the first bit written occupies the high bit of byte 0.
 */
export class BitWriter {
  private readonly bits: number[] = [];

  writeBit(value: 0 | 1 | boolean): void {
    this.bits.push(value ? 1 : 0);
  }

  /** Write `width` low bits of `value`, most-significant bit first. */
  writeBits(value: number, width: number): void {
    const masked = width === 32 ? value >>> 0 : value & ((1 << width) - 1);
    for (let i = width - 1; i >= 0; i--) {
      this.writeBit(((masked >> i) & 1) as 0 | 1);
    }
  }

  /**
   * Variable-length unsigned integer: `groupWidth` payload bits (MSB-first within
   * the group), then one continuation bit. Continuation `1` means another group
   * follows with the next-less-significant chunk.
   *
   * `groupWidth` is always a compile-time constant chosen by the caller — never
   * derived from runtime data — so section codecs stay version-skew-safe.
   */
  writeGroupedVarint(value: number, groupWidth: number): void {
    if (value < 0 || !Number.isInteger(value)) {
      throw new Error(`grouped varint requires a non-negative integer, got ${value}`);
    }

    const base = 2 ** groupWidth;
    const groups: number[] = [];

    if (value === 0) {
      groups.push(0);
    } else {
      let remaining = value;
      while (remaining > 0) {
        groups.unshift(remaining % base);
        remaining = Math.floor(remaining / base);
      }
    }

    for (let i = 0; i < groups.length; i++) {
      this.writeBits(groups[i]!, groupWidth);
      this.writeBit(i < groups.length - 1 ? 1 : 0);
    }
  }

  /**
   * Strictly ascending non-negative integers: first value as a grouped varint of
   * `firstWidth`, then each gap `current - previous - 1` as a grouped varint of
   * `deltaWidth`. Count is **not** written — the caller supplies it on read.
   */
  writeDeltaList(sortedAscending: number[], firstWidth: number, deltaWidth: number): void {
    let previous: number | undefined;
    for (const current of sortedAscending) {
      if (previous !== undefined && current <= previous) {
        throw new Error('writeDeltaList: values must be strictly ascending');
      }
      if (previous === undefined) {
        this.writeGroupedVarint(current, firstWidth);
      } else {
        this.writeGroupedVarint(current - previous - 1, deltaWidth);
      }
      previous = current;
    }
  }

  /** Write `width` bits; bit `i` is set when `i` is in `setIndices`. */
  writeBitmask(setIndices: Iterable<number>, width: number): void {
    const set = new Set(setIndices);
    for (let i = width - 1; i >= 0; i--) {
      this.writeBit(set.has(i) ? 1 : 0);
    }
  }

  /** Length-prefixed UTF-8 string (length via grouped varint, then raw bytes). */
  writeString(s: string): void {
    const bytes = new TextEncoder().encode(s);
    this.writeGroupedVarint(bytes.length, STRING_LENGTH_GROUP_WIDTH);
    for (const byte of bytes) {
      this.writeBits(byte, 8);
    }
  }

  /** Pack written bits into bytes; the final partial byte is zero-padded. */
  toBytes(): Uint8Array {
    const byteCount = Math.ceil(this.bits.length / 8);
    const bytes = new Uint8Array(byteCount);
    for (let i = 0; i < this.bits.length; i++) {
      if (this.bits[i]) {
        const byteIndex = Math.floor(i / 8);
        const bitInByte = i % 8;
        bytes[byteIndex]! |= 1 << (7 - bitInByte);
      }
    }
    return bytes;
  }
}

/**
 * Bit cursor over a byte buffer. Once {@link overrun} latches `true` (a read
 * ran past the end of the buffer), every read method returns a safe zero value
 * (`0`, `''`, or `[]`) and does not throw — the caller checks `overrun` and
 * bails out.
 */
export class BitReader {
  private bitPos = 0;
  /** Latches `true` after the first read past the end of `bytes`. */
  overrun = false;
  private readonly bytes: Uint8Array;

  constructor(bytes: Uint8Array) {
    this.bytes = bytes;
  }

  readBit(): 0 | 1 {
    return this.readBits(1) as 0 | 1;
  }

  readBits(width: number): number {
    if (this.overrun) {
      return 0;
    }

    let value = 0;
    for (let i = 0; i < width; i++) {
      if (this.bitPos >= this.bytes.length * 8) {
        this.overrun = true;
        return 0;
      }
      const byteIndex = Math.floor(this.bitPos / 8);
      const bitInByte = this.bitPos % 8;
      this.bitPos++;
      value = (value << 1) | ((this.bytes[byteIndex]! >> (7 - bitInByte)) & 1);
    }
    return width === 32 ? value >>> 0 : value;
  }

  readGroupedVarint(groupWidth: number): number {
    if (this.overrun) {
      return 0;
    }

    const base = 2 ** groupWidth;
    let value = 0;
    for (;;) {
      const group = this.readBits(groupWidth);
      if (this.overrun) {
        return 0;
      }
      const continuation = this.readBit();
      if (this.overrun) {
        return 0;
      }
      value = value * base + group;
      if (continuation === 0) {
        break;
      }
    }
    return value;
  }

  readDeltaList(count: number, firstWidth: number, deltaWidth: number): number[] {
    if (this.overrun || count === 0) {
      return [];
    }

    const result: number[] = [];
    let previous = 0;

    for (let i = 0; i < count; i++) {
      if (this.overrun) {
        return [];
      }
      if (i === 0) {
        const first = this.readGroupedVarint(firstWidth);
        if (this.overrun) {
          return [];
        }
        result.push(first);
        previous = first;
      } else {
        const delta = this.readGroupedVarint(deltaWidth);
        if (this.overrun) {
          return [];
        }
        const current = previous + delta + 1;
        result.push(current);
        previous = current;
      }
    }

    return result;
  }

  readBitmask(width: number): number[] {
    if (this.overrun) {
      return [];
    }

    const indices: number[] = [];
    for (let i = width - 1; i >= 0; i--) {
      const bit = this.readBit();
      if (this.overrun) {
        return [];
      }
      if (bit) {
        indices.push(i);
      }
    }
    indices.sort((a, b) => a - b);
    return indices;
  }

  readString(): string {
    if (this.overrun) {
      return '';
    }

    const length = this.readGroupedVarint(STRING_LENGTH_GROUP_WIDTH);
    if (this.overrun) {
      return '';
    }

    const bytes = new Uint8Array(length);
    for (let i = 0; i < length; i++) {
      bytes[i] = this.readBits(8);
      if (this.overrun) {
        return '';
      }
    }

    return new TextDecoder().decode(bytes);
  }
}
