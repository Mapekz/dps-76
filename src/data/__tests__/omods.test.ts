import { describe, it, expect } from 'vitest';
import { getWeapons } from '@/data';
import { getOmodSlots } from '@/data/omods';

// 2026-07-13 unique-weapon rework: named uniques collapsed into base weapon +
// a mod_Custom_* OMOD at ap_customName. Many carry zero extracted modifiers
// (notes-only effects) but must still surface in a "Unique" picker slot.

describe('Unique mod slot (ap_customName)', () => {
  it("Super Sledge's Unique slot is labeled 'Unique' and lists its four known unique mods", () => {
    const superSledge = getWeapons('live')['SuperSledge'];
    const slots = getOmodSlots('live', superSledge);
    const uniqueSlot = slots.find(s => s.slot === 'ap_customName');
    expect(uniqueSlot?.label).toBe('Unique');

    const ids = uniqueSlot?.options.map(o => o.id) ?? [];
    for (const id of [
      'mod_Custom_AllRise',
      'mod_Custom_SuperSledge_TheFarmhand',
      'E08B_mod_Custom_TheDebilitator',
      'E09B_mod_Custom_WhackerSmacker',
    ]) {
      expect(ids, id).toContain(id);
    }
  });

  it("Deathclaw Gauntlet's Unique slot contains Unstoppable Monster, badged inert (its damage-taken effect is notes-only)", () => {
    const gauntlet = getWeapons('live')['DeathclawGauntlet'];
    const slots = getOmodSlots('live', gauntlet);
    const uniqueSlot = slots.find(s => s.slot === 'ap_customName');
    const option = uniqueSlot?.options.find(o => o.id === 'mod_Custom_UnstoppableMonster');
    expect(option).toBeDefined();
    // classifyOmodDisplay's notes fallback: a zero-modifier stock part with
    // extraction notes badges 'inert' rather than showing unbadged.
    expect(option?.badge).toBe('inert');
  });
});
