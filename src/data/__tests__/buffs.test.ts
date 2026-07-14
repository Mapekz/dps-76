import { describe, it, expect } from 'vitest';
import { getConsumables } from '../buffs';

describe('consumable picker', () => {
  it('keeps known junk hidden (quest-bound items stripped on completion)', () => {
    const ids = getConsumables('live').map(c => c.id);
    for (const id of [
      // Nuclear Don's Custom Chem Blend: "The Ol' Weston Shuffle" quest item,
      // auto-removed from inventory on quest completion if unconsumed — not a
      // chem a build can rely on having. See overrides/corrections.ts.
      'W05_MQR_203P_ChemBlend',
    ]) {
      expect(ids, id).not.toContain(id);
    }
  });
});
