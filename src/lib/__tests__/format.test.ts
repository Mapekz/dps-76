import { describe, expect, it } from 'bun:test';
import { formatTtk } from '../format';

describe('formatTtk', () => {
  it('renders sub-minute values as seconds with one decimal', () => {
    expect(formatTtk(8.42)).toBe('8.4s');
    expect(formatTtk(0)).toBe('0.0s');
    expect(formatTtk(59.4)).toBe('59.4s');
  });

  it('renders exactly 60s as "1m", not "1m 0s"', () => {
    expect(formatTtk(60)).toBe('1m');
  });

  it('renders whole-minute values without a seconds suffix', () => {
    expect(formatTtk(120)).toBe('2m');
    expect(formatTtk(180)).toBe('3m');
  });

  it('renders a minutes+seconds split for the general case', () => {
    expect(formatTtk(65)).toBe('1m 5s');
    expect(formatTtk(90)).toBe('1m 30s');
    expect(formatTtk(605)).toBe('10m 5s');
  });

  it('rolls a rounded-up seconds remainder into the next minute', () => {
    // 119.6s -> 1m + round(59.6s) = 1m 60s, which is invalid — must become 2m.
    expect(formatTtk(119.6)).toBe('2m');
  });

  it('renders non-finite values as the infinity symbol', () => {
    expect(formatTtk(Infinity)).toBe('∞');
    expect(formatTtk(NaN)).toBe('∞');
  });
});
