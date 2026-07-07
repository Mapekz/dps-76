import { describe, it, expect } from 'vitest';
import { getWeapons } from '@/data';
import { getBuffModifiers } from '@/data/buffs';
import { getOmodById } from '@/data/omods';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { buildEffectiveWeapon } from '@/lib/engine/effective-weapon';
import { computeScenarios } from '@/lib/engine/scenarios';
import {
  createDefaultEnemyConditions,
  createDefaultPlayerConditions,
  type EnemyConditions,
  type PlayerConditions,
} from '@/types';
import goldenData from './cases.json';

/**
 * Golden cases: in-game measured numbers (docs/assumptions.md). Cases with
 * expected: null are pending measurement and skipped.
 */

interface GoldenCase {
  name: string;
  weaponId: string;
  itemLevel: number;
  mods: Record<string, string>;
  legendaryEffects: string[];
  perks: Array<{ perkId: string; rank: number }>;
  legendaryPerks: Array<{ perkId: string; rank: number }>;
  mutations: string[];
  consumables: string[];
  conditions: Partial<PlayerConditions>;
  enemyConditions: Partial<EnemyConditions>;
  scenario: 'manualAim' | 'manualAimWeakpoint' | 'vats' | 'vatsSneak';
  measure: 'perHit' | 'dps' | 'fireRate';
  expected: number | null;
  tolerancePct: number;
  source: string;
}

const cases = (goldenData as { cases: GoldenCase[] }).cases;

describe('golden cases (in-game measurements)', () => {
  for (const c of cases) {
    const run = c.expected === null ? it.skip : it;
    run(`${c.name} [${c.source}]`, () => {
      const baseWeapon = getWeapons('live')[c.weaponId];
      expect(baseWeapon, `weapon ${c.weaponId} exists`).toBeDefined();

      const omods = [...Object.values(c.mods), ...c.legendaryEffects]
        .map(id => getOmodById('live', id))
        .filter(o => o !== undefined);
      const { weapon, modifiers: omodModifiers } = buildEffectiveWeapon(baseWeapon, omods);

      const scenarios = computeScenarios({
        mode: 'live',
        weapon,
        itemLevel: c.itemLevel,
        modifiers: [
          ...omodModifiers,
          ...getLoadoutModifiers('live', c.perks),
          ...getLoadoutModifiers('live', c.legendaryPerks),
          ...getBuffModifiers('live', c.mutations, c.consumables),
        ],
        player: { ...createDefaultPlayerConditions(), ...c.conditions },
        enemy: { ...createDefaultEnemyConditions(), ...c.enemyConditions },
        weakpointMult: 2.0,
      });

      const scenario = c.scenario === 'manualAimWeakpoint' ? scenarios.manualAim : scenarios[c.scenario];
      const actual =
        c.measure === 'fireRate'
          ? scenario.fireRate
          : c.scenario === 'manualAimWeakpoint'
            ? c.measure === 'dps'
              ? scenarios.manualAim.weakpointDps
              : scenarios.manualAim.weakpointPerHit.total
            : c.measure === 'dps'
              ? scenario.sustainedDps
              : scenario.perHit.total;

      const tolerance = (c.expected! * c.tolerancePct) / 100;
      expect(Math.abs(actual - c.expected!)).toBeLessThanOrEqual(tolerance);
    });
  }
});
