import { describe, it, expect } from 'vitest';
import { computeScenarios } from '@/lib/engine/scenarios';
import { resolveLoadout } from '@/lib/loadout';
import {
  createDefaultEnemyConfig,
  createDefaultEnemyConditions,
  createDefaultPlayerConfig,
  createDefaultPlayerConditions,
  type EnemyConditions,
  type EnemyConfig,
  type PlayerConfig,
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
  addictions?: string[];
  conditions: Partial<PlayerConditions>;
  enemyConditions: Partial<EnemyConditions>;
  scenario: 'freeAim' | 'vats';
  measure: 'perHit' | 'burstDps' | 'sustainedDps' | 'fireRate' | 'apRegenPerSec';
  expected: number | null;
  tolerancePct: number;
  source: string;
}

// Through `unknown`: cases with different `mods` slot keys make TS infer a
// union with optional-undefined properties, which is not directly comparable
// to Record<string, string>.
const cases = (goldenData as unknown as { cases: GoldenCase[] }).cases;

describe('golden cases (in-game measurements)', () => {
  for (const c of cases) {
    const run = c.expected === null ? it.skip : it;
    run(`${c.name} [${c.source}]`, () => {
      const playerConfig: PlayerConfig = {
        ...createDefaultPlayerConfig(),
        weapon: { weaponId: c.weaponId, mods: c.mods, legendaryEffects: c.legendaryEffects },
        perks: c.perks,
        legendaryPerks: c.legendaryPerks,
        mutations: c.mutations,
        consumables: c.consumables,
        addictions: c.addictions ?? [],
        itemLevel: c.itemLevel,
        conditions: { ...createDefaultPlayerConditions(), ...c.conditions },
      };
      const enemyConfig: EnemyConfig = {
        ...createDefaultEnemyConfig(),
        conditions: { ...createDefaultEnemyConditions(), ...c.enemyConditions },
      };

      const input = resolveLoadout(playerConfig, enemyConfig, 'live');
      expect(input, `weapon ${c.weaponId} exists`).not.toBeNull();

      const scenarios = computeScenarios(input!);

      const scenario = scenarios[c.scenario];
      const actual =
        c.measure === 'fireRate'
          ? scenario.fireRate
          : c.measure === 'burstDps'
            ? scenario.burstDps
            : c.measure === 'sustainedDps'
              ? scenario.sustain.sustainedDps
              : c.measure === 'apRegenPerSec'
                ? (expect(scenario.ap, 'AP economy present for apRegenPerSec measure').toBeDefined(), scenario.ap!.regenPerSec)
                : scenario.perHit.total;

      const tolerance = (c.expected! * c.tolerancePct) / 100;
      expect(Math.abs(actual - c.expected!)).toBeLessThanOrEqual(tolerance);
    });
  }
});
