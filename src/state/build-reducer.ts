import {
  createDefaultEnemyConfig,
  createDefaultPlayerConfig,
  type EnemyConditions,
  type EnemyConfig,
  type ParsedPerk,
  type PlayerConditions,
  type PlayerConfig,
} from '@/types';
import { isLegendaryPerkKey, parsedPerksToLoadout, type ParsedSpecial } from '@/lib/nukes-dragons';

/**
 * The one store behind the whole app. The BuildAction union is the shared
 * "change" vocabulary: the UI dispatches actions to commit, the hover-diff
 * tooltips and the suggestions panel run the SAME actions through the reducer
 * speculatively (`buildReducer(state, action)` is pure) and feed the result to
 * the engine — one vocabulary, three consumers.
 */

export type SpecialKey =
  | 'strength'
  | 'perception'
  | 'endurance'
  | 'charisma'
  | 'intelligence'
  | 'agility'
  | 'luck';

export type ScenarioKey = 'freeAim' | 'vats';

export interface ViewState {
  /** Emphasized scenario card — the metric for suggestions and the mobile bar. Null = auto (higher DPS). */
  emphasized: ScenarioKey | null;
  /** "Why these numbers" panel open state (persisted). */
  breakdownOpen: boolean;
}

export interface BuildState {
  player: PlayerConfig;
  enemy: EnemyConfig;
  buildName: string | null;
  view: ViewState;
}

export type BuildAction =
  | { type: 'weapon/select'; weaponId: string | null }
  | { type: 'weapon/mod'; slot: string; omodId: string | null }
  | { type: 'weapon/legendary'; slotIndex: number; omodId: string | null }
  | { type: 'weapon/itemLevel'; value: number }
  | { type: 'weapon/weakpointMult'; value: number }
  | { type: 'perk/add'; perkId: string; rank: number; legendary: boolean }
  | { type: 'perk/setRank'; perkId: string; rank: number }
  | { type: 'perk/remove'; perkId: string }
  | { type: 'special/set'; stat: SpecialKey; value: number }
  | { type: 'mutation/toggle'; id: string }
  | { type: 'consumable/toggle'; id: string }
  | { type: 'condition/set'; key: keyof PlayerConditions; value: PlayerConditions[keyof PlayerConditions] }
  | { type: 'enemy/condition'; key: keyof EnemyConditions; value: EnemyConditions[keyof EnemyConditions] }
  | { type: 'view/set'; view: Partial<ViewState> }
  | { type: 'build/importNd'; perks: ParsedPerk[]; name: string | null; special: ParsedSpecial | null }
  | { type: 'build/hydrate'; state: BuildState };

export function createDefaultBuildState(): BuildState {
  return {
    player: createDefaultPlayerConfig(),
    enemy: createDefaultEnemyConfig(),
    buildName: null,
    view: { emphasized: null, breakdownOpen: false },
  };
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter(x => x !== id) : [...list, id];
}

function withPlayer(state: BuildState, player: PlayerConfig): BuildState {
  return { ...state, player };
}

export function buildReducer(state: BuildState, action: BuildAction): BuildState {
  const { player } = state;
  switch (action.type) {
    case 'weapon/select':
      return withPlayer(state, {
        ...player,
        weapon: action.weaponId ? { weaponId: action.weaponId, mods: {}, legendaryEffects: [] } : null,
      });

    case 'weapon/mod': {
      if (!player.weapon) return state;
      return withPlayer(state, {
        ...player,
        weapon: { ...player.weapon, mods: { ...player.weapon.mods, [action.slot]: action.omodId } },
      });
    }

    case 'weapon/legendary': {
      if (!player.weapon) return state;
      const legendaryEffects = [...player.weapon.legendaryEffects];
      if (action.omodId === null) legendaryEffects.splice(action.slotIndex, 1);
      else legendaryEffects[action.slotIndex] = action.omodId;
      return withPlayer(state, { ...player, weapon: { ...player.weapon, legendaryEffects } });
    }

    case 'weapon/itemLevel':
      return withPlayer(state, { ...player, itemLevel: Math.max(1, Math.min(50, action.value)) });

    case 'weapon/weakpointMult':
      return withPlayer(state, { ...player, weakpointMult: Math.max(0, action.value) });

    case 'perk/add': {
      const list = action.legendary ? 'legendaryPerks' : 'perks';
      if (player[list].some(p => p.perkId === action.perkId)) return state;
      return withPlayer(state, {
        ...player,
        [list]: [...player[list], { perkId: action.perkId, rank: Math.max(1, action.rank) }],
      });
    }

    case 'perk/setRank': {
      const bump = (list: typeof player.perks) =>
        list.map(p => (p.perkId === action.perkId ? { ...p, rank: Math.max(1, action.rank) } : p));
      return withPlayer(state, {
        ...player,
        perks: bump(player.perks),
        legendaryPerks: bump(player.legendaryPerks),
      });
    }

    case 'perk/remove':
      return withPlayer(state, {
        ...player,
        perks: player.perks.filter(p => p.perkId !== action.perkId),
        legendaryPerks: player.legendaryPerks.filter(p => p.perkId !== action.perkId),
      });

    case 'special/set':
      return withPlayer(state, {
        ...player,
        conditions: { ...player.conditions, [action.stat]: Math.max(1, Math.min(20, action.value)) },
      });

    case 'mutation/toggle':
      return withPlayer(state, { ...player, mutations: toggle(player.mutations, action.id) });

    case 'consumable/toggle':
      return withPlayer(state, { ...player, consumables: toggle(player.consumables, action.id) });

    case 'condition/set':
      return withPlayer(state, { ...player, conditions: { ...player.conditions, [action.key]: action.value } });

    case 'enemy/condition':
      return {
        ...state,
        enemy: { ...state.enemy, conditions: { ...state.enemy.conditions, [action.key]: action.value } },
      };

    case 'view/set':
      return { ...state, view: { ...state.view, ...action.view } };

    case 'build/importNd': {
      // N&D legendary perk keys all start with "0"; import REPLACES the perk
      // loadout (documented in the import UI) and merges SPECIAL when present.
      const regular = action.perks.filter(p => !isLegendaryPerkKey(p.key));
      const legendary = action.perks.filter(p => isLegendaryPerkKey(p.key));
      return {
        ...state,
        buildName: action.name,
        player: {
          ...player,
          perks: parsedPerksToLoadout(regular),
          legendaryPerks: parsedPerksToLoadout(legendary),
          conditions: action.special ? { ...player.conditions, ...action.special } : player.conditions,
        },
      };
    }

    case 'build/hydrate':
      return action.state;
  }
}
