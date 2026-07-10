import { bench, describe } from 'vitest';
import {
  createDefaultEnemyConfig,
  createDefaultPlayerConfig,
  createDefaultPlayerConditions,
  type PlayerConfig,
} from '@/types';
import { PerkId } from '@/data/perk-ids';
import { resolveLoadout } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';

/**
 * 2A bench gate for the suggestion engine (plan: UI redesign phase 2).
 * Decision rule for a ~400-variant sweep:
 *   < 8ms total → plain useMemo + debounce on the main thread
 *   8–50ms      → structural memoization (assembleLoadoutParts) suffices
 *   > 50ms      → web worker
 */

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

describe('suggestion-engine hot path', () => {
  bench('resolveLoadout + computeScenarios (one variant eval)', () => {
    const input = resolveLoadout(maxedConfig, enemy, 'live');
    computeScenarios(input!);
  });

  bench('computeScenarios only (pre-resolved input)', () => {
    computeScenarios(resolvedOnce!);
  });
});

const resolvedOnce = resolveLoadout(maxedConfig, enemy, 'live');
