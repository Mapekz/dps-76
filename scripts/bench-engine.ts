/**
 * 2A bench gate for the suggestion engine (plan: UI redesign phase 2).
 * Decision rule for a ~400-variant sweep:
 *   < 8ms total → plain useMemo + debounce on the main thread
 *   8–50ms      → structural memoization (assembleLoadoutParts) suffices
 *   > 50ms      → web worker
 *
 *   bun run bench
 *
 * Ported from the old vitest `bench()`-based src/lib/engine/__tests__/perf.bench.ts
 * — bun:test has no bench() equivalent, so this is a plain script timed with
 * Bun.nanoseconds() instead.
 */
import {
  createDefaultEnemyConfig,
  createDefaultPlayerConfig,
  createDefaultPlayerConditions,
  type PlayerConfig,
} from '../src/types';
import { PerkId } from '../src/data/perk-ids';
import { resolveLoadout } from '../src/lib/loadout';
import { computeScenarios } from '../src/lib/engine/scenarios';

function bench(name: string, fn: () => void, iters = 2000): void {
  fn(); // warm
  const t0 = Bun.nanoseconds();
  for (let i = 0; i < iters; i++) fn();
  const ms = (Bun.nanoseconds() - t0) / 1e6 / iters;
  console.log(`${name}: ${ms.toFixed(4)} ms/op`);
}

const maxedConfig: PlayerConfig = {
  ...createDefaultPlayerConfig(),
  weapon: {
    weaponId: 'CombatRifle_Fixer',
    mods: { ap_gun_Receiver: 'mod_CombatRifle_Receiver_Damage-Auto' },
    legendaryEffects: [],
  },
  perks: [
    { perkId: PerkId.CenterMasochist, rank: 3 },
    { perkId: PerkId.RiflemanExpert, rank: 3 },
    { perkId: PerkId.RiflemanMaster, rank: 3 },
    { perkId: PerkId.Tenderizer, rank: 3 },
    { perkId: PerkId.BloodyMess, rank: 3 },
    { perkId: PerkId.Ninja, rank: 3 },
    { perkId: PerkId.Sniper, rank: 3 },
  ],
  legendaryPerks: [],
  mutations: ['Mutation_SpeedDemon', 'Mutation_AdrenalReaction'],
  consumables: [],
  conditions: { ...createDefaultPlayerConditions(), tenderizerStacks: 10, healthPercent: 25 },
};
const enemy = createDefaultEnemyConfig();

// Hoisted above the bench() calls — the original vitest file relied on
// `bench()` deferring its callback until run time to read a const declared
// later in module scope; a straight-line script has no such deferral.
const resolvedOnce = resolveLoadout(maxedConfig, enemy, 'live');

console.log('suggestion-engine hot path');
bench('resolveLoadout + computeScenarios (one variant eval)', () => {
  const input = resolveLoadout(maxedConfig, enemy, 'live');
  computeScenarios(input!);
});

bench('computeScenarios only (pre-resolved input)', () => {
  computeScenarios(resolvedOnce!);
});
