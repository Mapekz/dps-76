import { describe, expect, it } from 'bun:test';
import { buildShareSlug } from '@/lib/persist/slug';

describe('buildShareSlug', () => {
  it('returns empty when both names are absent', () => {
    expect(buildShareSlug(null, null)).toBe('');
    expect(buildShareSlug('', '')).toBe('');
    expect(buildShareSlug('   ', '  ')).toBe('');
  });

  it('prefers buildName over weaponName', () => {
    expect(buildShareSlug('Bloodied Commando', 'The Fixer')).toBe('bloodied-commando');
  });

  it('falls back to weaponName when buildName is empty', () => {
    expect(buildShareSlug(null, 'The Fixer')).toBe('the-fixer');
    expect(buildShareSlug('', 'Combat Rifle (Fixer)')).toBe('combat-rifle-fixer');
  });

  it('collapses runs of non-alphanumerics to a single dash', () => {
    expect(buildShareSlug('Hello   ---   World!!!', null)).toBe('hello-world');
  });

  it('truncates at 24 characters mid-word', () => {
    expect(buildShareSlug('abcdefghijklmnopqrstuvwxyz', null)).toBe('abcdefghijklmnopqrstuvwx');
  });

  it('re-trims a trailing dash left by truncation', () => {
    expect(buildShareSlug('alpha-beta-gamma-delta-epsilon-zeta', null)).toBe(
      'alpha-beta-gamma-delta-e',
    );
  });

  it('returns empty for entirely punctuation', () => {
    expect(buildShareSlug('!!!@@@###', null)).toBe('');
  });
});
