import { describe, expect, it, vi } from 'bun:test';
import { createDefaultEnemyConfig, createDefaultPlayerConfig, type PlayerConfig } from '@/types';
import { resolveLoadout } from '@/lib/loadout';
// Bun's `vi.mock` factory gets no `importOriginal` argument and is unhoisted,
// so this namespace import is still the real module when the factory below
// runs — it stands in for `importOriginal()`.
import * as actualPerkModifiers from '@/data/perk-modifiers';

const syntheticWeaponStatModifier = {
  id: 'synthetic-weapon-stat',
  source: {
    kind: 'perk' as const,
    formId: '0xF1RE',
    edid: 'SyntheticWeaponStatPerk',
    name: 'Synthetic Weapon Stat Perk',
  },
  bucket: 'fireRateSpeed' as const,
  op: 'ADD' as const,
  value: 0.123,
  conditions: [],
};

// Snapshot the real function before returning. `actualPerkModifiers` is a
// live reference to the SAME module record `vi.mock` is about to replace —
// once the mock is installed, `actualPerkModifiers.getLoadoutModifiers`
// resolves to the mock itself, so delegating via
// `actualPerkModifiers.getLoadoutModifiers(...)` from inside the override
// below would recurse into the override forever (verified: it hangs).
// Capturing the function reference now, before the swap, avoids that.
const realGetLoadoutModifiers = actualPerkModifiers.getLoadoutModifiers;

vi.mock('@/data/perk-modifiers', () => ({
  ...actualPerkModifiers,
  getLoadoutModifiers: (
    mode: Parameters<typeof actualPerkModifiers.getLoadoutModifiers>[0],
    perks: Parameters<typeof actualPerkModifiers.getLoadoutModifiers>[1],
  ) =>
    perks.some((perk) => String(perk.perkId) === 'SyntheticWeaponStatPerk')
      ? [syntheticWeaponStatModifier]
      : realGetLoadoutModifiers(mode, perks),
}));

describe('loadout assembly ordering', () => {
  it('passes gathered loadout modifiers into buildEffectiveWeapon before weapon-stat folding', () => {
    const base: PlayerConfig = {
      ...createDefaultPlayerConfig(),
      weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
    };
    const syntheticPerk = {
      perkId: 'SyntheticWeaponStatPerk' as PlayerConfig['perks'][number]['perkId'],
      rank: 1,
    };

    const stock = resolveLoadout(base, createDefaultEnemyConfig(), 'live')!;
    const withSyntheticPerk = resolveLoadout(
      { ...base, perks: [syntheticPerk] },
      createDefaultEnemyConfig(),
      'live',
    )!;

    expect(withSyntheticPerk.weapon.speed).toBeCloseTo((stock.weapon.speed ?? 1) + 0.123, 10);
    expect(
      withSyntheticPerk.modifiers.some(
        (modifier) => modifier.id === syntheticWeaponStatModifier.id,
      ),
    ).toBe(false);
  });
});
