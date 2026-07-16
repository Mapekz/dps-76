import { describe, it, expect } from 'vitest';
import { getPerks } from '@/data';
import { perkHasEngineEffect } from '@/data/perk-modifiers';

describe('onslaught perk badges', () => {
  it('Gunslinger/Guerrilla onslaught line perks are not badged inert', () => {
    const registry = getPerks('live');
    const ids = Object.keys(registry).filter(id =>
      /Gunslinger|Guerrilla/i.test(registry[id as keyof typeof registry].name)
    );
    const inert = ids.filter(id => !perkHasEngineEffect('live', id));
    expect(inert).toEqual([]);
  });
});
