import { describe, it, expect } from 'bun:test';
import { computeScenarios } from '@/lib/engine/scenarios';
import { resolveLoadout } from '@/lib/loadout';
import {
  createDefaultEnemyConfig,
  createDefaultEnemyConditions,
  createDefaultPlayerConfig,
  type EnemyConditions,
  type EnemyConfig,
  type PlayerConfig,
  type ResolvedPlayer,
} from '@/types';
import goldenData from './cases.json';
import { makeResolvedPlayer } from '@/lib/engine/__tests__/resolved-player-fixture';

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
  /** Armor checklist selections (Phase 3 armor pipeline): effectId → worn count. */
  armorEffects?: Record<string, number>;
  conditions: Partial<ResolvedPlayer>;
  /**
   * Player-selected charge hold time in seconds, for weapons that charge
   * (Gauss family, bows, tesla/gamma/laser via charging-barrel OMODs — see
   * `PlayerConfig.chargeTimeSec`, src/lib/charge.ts). Omitted/undefined =
   * "always fully charge" (the default). This is a top-level PlayerConfig
   * field, not a PlayerInput one, so `conditions` patches can't reach it.
   */
  chargeTimeSec?: number;
  enemyConditions: Partial<EnemyConditions>;
  scenario: 'freeAim' | 'vats';
  measure:
    | 'perHit'
    | 'burstDps'
    | 'sustainedDps'
    | 'fireRate'
    | 'apRegenPerSec'
    | 'reloadSec'
    | 'apUptime'
    // Phase 2 — Enemy defenses: `ScenarioResult.effective.*`, present only
    // when `enemyConditions.targetRace` (+ optional `targetLevel`) resolves
    // to real npc stats.
    | 'effectivePerHit'
    | 'effectiveSustainedDps'
    | 'effectiveRetainedPct'
    | 'effectiveTtk';
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
        armorEffects: c.armorEffects ?? {},
        itemLevel: c.itemLevel,
        conditions: { ...makeResolvedPlayer(), ...c.conditions },
        chargeTimeSec: c.chargeTimeSec,
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
                ? (expect(
                    scenario.ap,
                    'AP economy present for apRegenPerSec measure',
                  ).toBeDefined(),
                  scenario.ap!.regenPerSec)
                : c.measure === 'reloadSec'
                  ? scenario.sustain.reloadSec
                  : c.measure === 'apUptime'
                    ? (expect(scenario.ap, 'AP economy present for apUptime measure').toBeDefined(),
                      scenario.ap!.uptime)
                    : c.measure === 'effectivePerHit'
                      ? (expect(
                          scenario.effective,
                          'target resolved for an effective* measure',
                        ).toBeDefined(),
                        scenario.effective!.perHit.total)
                      : c.measure === 'effectiveSustainedDps'
                        ? (expect(
                            scenario.effective,
                            'target resolved for an effective* measure',
                          ).toBeDefined(),
                          scenario.effective!.sustainedDps)
                        : c.measure === 'effectiveRetainedPct'
                          ? (expect(
                              scenario.effective,
                              'target resolved for an effective* measure',
                            ).toBeDefined(),
                            scenario.effective!.retainedPct)
                          : c.measure === 'effectiveTtk'
                            ? (expect(
                                scenario.effective,
                                'target resolved for an effective* measure',
                              ).toBeDefined(),
                              scenario.effective!.ttk)
                            : scenario.perHit.total;

      const tolerance = (c.expected! * c.tolerancePct) / 100;
      expect(Math.abs(actual - c.expected!)).toBeLessThanOrEqual(tolerance);
    });
  }
});
