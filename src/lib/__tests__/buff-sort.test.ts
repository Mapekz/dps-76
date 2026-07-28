import { describe, it, expect } from 'vitest';
import { byName } from '@/lib/buff-sort';
import type { GeneratedBuff } from '@/types/generated';

function buff(name: string): GeneratedBuff {
  return { id: name, formId: `0x${name}`, name, kind: 'consumable', modifiers: [], notes: [] };
}

describe('byName', () => {
  it('sorts embedded issue numbers numerically, not lexicographically', () => {
    const names = [
      'Guns and Bullets 10',
      'Guns and Bullets 2',
      'Guns and Bullets 1',
      'Guns and Bullets 9',
    ];
    const sorted = names
      .map(buff)
      .sort(byName)
      .map((b) => b.name);
    expect(sorted).toEqual([
      'Guns and Bullets 1',
      'Guns and Bullets 2',
      'Guns and Bullets 9',
      'Guns and Bullets 10',
    ]);
  });

  it('plain alphabetical names (no digits) sort unaffected', () => {
    const names = ['Bobblehead: Strength', 'Bobblehead: Agility', 'Bobblehead: Luck'];
    const sorted = names
      .map(buff)
      .sort(byName)
      .map((b) => b.name);
    expect(sorted).toEqual(['Bobblehead: Agility', 'Bobblehead: Luck', 'Bobblehead: Strength']);
  });
});
