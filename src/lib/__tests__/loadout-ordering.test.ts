import { describe, expect, it, vi } from 'vitest';
import { createDefaultEnemyConfig, createDefaultPlayerConfig, type PlayerConfig } from '@/types';
import { resolveLoadout } from '@/lib/loadout';
// Bun's `vi.mock` factory gets no `importOriginal` and is unhoisted, so this
// namespace is still the real module when the factory below runs. Under
// Vitest the mock IS hoisted above this import, but the ternary in the
// factory never dereferences `actualPerkModifiers` there — `importOriginal`
// wins.
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

vi.mock('@/data/perk-modifiers', async (importOriginal) => {
  const actual =
    typeof importOriginal === 'function'
      ? await importOriginal<typeof import('@/data/perk-modifiers')>()
      : actualPerkModifiers;
  // Snapshot the real function before returning. Under Bun, when `actual` is
  // the `actualPerkModifiers` fallback above, it's a live reference to the
  // SAME module record this factory is about to replace — once the mock is
  // installed, `actual.getLoadoutModifiers` resolves to the mock itself, so
  // delegating via `actual.getLoadoutModifiers(...)` from inside the override
  // below would recurse into the override forever (verified: it hangs).
  // Capturing the function reference now, before the swap, avoids that.
  const realGetLoadoutModifiers = actual.getLoadoutModifiers;
  return {
    ...actual,
    getLoadoutModifiers: (
      mode: Parameters<typeof actual.getLoadoutModifiers>[0],
      perks: Parameters<typeof actual.getLoadoutModifiers>[1],
    ) =>
      perks.some((perk) => String(perk.perkId) === 'SyntheticWeaponStatPerk')
        ? [syntheticWeaponStatModifier]
        : realGetLoadoutModifiers(mode, perks),
  };
});

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
