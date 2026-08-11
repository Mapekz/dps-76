/**
 * Hot-path benchmark for the suggestion engine's ~650-675-candidate sweep
 * (`bun run bench`). Informational only — the sweep runs off the main
 * thread in a Web Worker (`src/workers/suggestions.worker.ts`, wired
 * through `src/hooks/useSuggestions.ts`), so this number doesn't gate
 * anything; it's a regression signal for future engine-fold changes (a
 * bucket-indexed fold was tried and reverted here as a net regression at
 * this array size, `#76`).
 *
 * Ported from the old vitest `bench()`-based src/lib/engine/__tests__/perf.bench.ts
 * — bun:test has no bench() equivalent, so this is a plain script timed with
 * Bun.nanoseconds() instead.
 */
import {
  createDefaultEnemyConfig,
  createDefaultPlayerConfig,
  type PlayerConfig,
} from '../src/types';
import { PerkId } from '../src/data/perk-ids';
import { resolveLoadout } from '../src/lib/loadout';
import { computeScenarios } from '../src/lib/engine/scenarios';
import { type BuildState } from '../src/state/build-reducer';
import { enumerateVariants } from '../src/lib/suggest/variants';
import { evaluateSuggestions } from '../src/lib/suggest/evaluate';
import { makeResolvedPlayer } from '@/lib/engine/__tests__/resolved-player-fixture';

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
  // Multi-tier armor layout so the armor add/swap enumeration is exercised,
  // not benched at zero (tiers 1/2/3/4 partially occupied → both plain
  // increases and same-tier swaps get emitted).
  armorEffects: {
    mod_Legendary_Armor1_LowHealthIncreasesStats: 2,
    mod_Legendary_Armor2_StatStrength: 3,
    mod_Legendary_Armor3_Active: 1,
    mod_Legendary_Armor3_Healthy: 1,
    mod_Legendary_Armor4_BattleLoaders: 3,
    mod_Legendary_Armor4_LimitBreak: 2,
  },
  conditions: { ...makeResolvedPlayer(), tenderizerStacks: 10, healthPercent: 25 },
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

// End-to-end suggestions sweep — the number the "< 8ms → plain useMemo"
// decision rule above actually gates on. The per-eval benches predate this;
// useSuggestions' old "~400 evals ≈ 2ms" docstring figure was inferred from
// them, never measured. Informational, not a CI gate.
const maxedState: BuildState = {
  player: maxedConfig,
  enemy,
  buildName: null,
  view: { emphasized: null, breakdownOpen: false },
};
console.log(`enumerateVariants: ${enumerateVariants(maxedState, 'live').length} raw candidates`);
bench('evaluateSuggestions (full sweep, freeAim metric)', () => {
  evaluateSuggestions(maxedState, 'live', 'freeAim');
}, 200);
