import { describe, expect, it, vi } from 'vitest';
import { createDefaultEnemyConfig, createDefaultPlayerConfig, type PlayerConfig } from '@/types';

const { syntheticWeaponStatModifier } = vi.hoisted(() => ({
  syntheticWeaponStatModifier: {
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
  },
}));

vi.mock('@/data/perk-modifiers', async importOriginal => {
  const actual = await importOriginal<typeof import('@/data/perk-modifiers')>();
  return {
    ...actual,
    getLoadoutModifiers: (mode: Parameters<typeof actual.getLoadoutModifiers>[0], perks: Parameters<typeof actual.getLoadoutModifiers>[1]) =>
      perks.some(perk => String(perk.perkId) === 'SyntheticWeaponStatPerk')
        ? [syntheticWeaponStatModifier]
        : actual.getLoadoutModifiers(mode, perks),
  };
});

import { resolveLoadout } from '@/lib/loadout';

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
      'live'
    )!;

    expect(withSyntheticPerk.weapon.speed).toBeCloseTo((stock.weapon.speed ?? 1) + 0.123, 10);
    expect(withSyntheticPerk.modifiers.some(modifier => modifier.id === syntheticWeaponStatModifier.id)).toBe(false);
  });
});
