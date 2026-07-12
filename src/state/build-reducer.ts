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
import { computePerkBudget, perkSpecialKey } from '@/data/perk-budget';
import { perkRaceRestriction } from '@/data/perk-race';
import { canSlotCardPoints, SPECIAL_ALLOCATION_POOL, SPECIAL_KEYS, SPECIAL_POINTS_CAP } from '@/lib/player-stats';

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
  // A fresh build starts at 1/1/1/1/1/1/1 like the game (the type factory's
  // 15s exist for synthetic engine tests, not the app).
  const player = createDefaultPlayerConfig();
  for (const k of SPECIAL_KEYS) player.conditions[k] = 1;
  return {
    player,
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

/** In-app legendary perk card slots (game rule). */
export const LEGENDARY_PERK_SLOTS = 4;

/** The user-defined base SPECIAL allocation stored in conditions, as a plain record. */
function allocationOf(player: PlayerConfig): Record<SpecialKey, number> {
  return Object.fromEntries(SPECIAL_KEYS.map(k => [k, player.conditions[k]])) as Record<SpecialKey, number>;
}

/**
 * Would raising `perkId`'s regular-card cost by `delta` break its stat's
 * perk-point budget, min(15, base allocation + Legendary SPECIAL bonus)?
 * Legendary cards have their own slot cap and never consume card points.
 * The registry is mode-independent today (pts re-exports live).
 */
function regularSlotBlocked(player: PlayerConfig, perkId: string, delta: number): boolean {
  if (delta <= 0) return false;
  const stat = perkSpecialKey('live', perkId);
  if (!stat) return false; // unknown perk: don't block (import edge cases)
  const budget = computePerkBudget('live', player.perks, player.legendaryPerks, allocationOf(player));
  return !canSlotCardPoints(budget, stat, delta);
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
      // Floor 0.1: sub-1 values model armored parts (Mirelurk shell 0.15×), 0 would zero the scenario.
      return withPlayer(state, { ...player, weakpointMult: Math.max(0.1, action.value) });

    case 'perk/add': {
      const list = action.legendary ? 'legendaryPerks' : 'perks';
      if (player[list].some(p => p.perkId === action.perkId)) return state;
      const rank = Math.max(1, action.rank);
      // Enforce the game's limits: 4 legendary slots; regular cards must fit
      // the stat's perk-point budget (min(15, base + Legendary SPECIAL bonus)).
      if (action.legendary && player.legendaryPerks.length >= LEGENDARY_PERK_SLOTS) return state;
      if (!action.legendary && regularSlotBlocked(player, action.perkId, rank)) return state;
      // A race-locked card forces the matching character race (ghoul-only →
      // ghoul, human-only → human) — in the reducer so speculative diffs and
      // imports stay consistent with the UI's locked race toggle.
      const race = perkRaceRestriction('live', action.perkId);
      const conditions =
        race !== null && (player.conditions.isGhoul ?? false) !== (race === 'ghoul')
          ? { ...player.conditions, isGhoul: race === 'ghoul' }
          : player.conditions;
      return withPlayer(state, {
        ...player,
        conditions,
        [list]: [...player[list], { perkId: action.perkId, rank }],
      });
    }

    case 'perk/setRank': {
      const current =
        player.perks.find(p => p.perkId === action.perkId) ??
        player.legendaryPerks.find(p => p.perkId === action.perkId);
      if (!current) return state;
      const rank = Math.max(1, action.rank);
      const isRegular = player.perks.some(p => p.perkId === action.perkId);
      if (isRegular && regularSlotBlocked(player, action.perkId, rank - current.rank)) return state;
      const bump = (list: typeof player.perks) =>
        list.map(p => (p.perkId === action.perkId ? { ...p, rank } : p));
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

    case 'special/set': {
      // Base allocation is user-defined: 1–15 per stat from the 56-point
      // pool. Raising a stat past what the pool covers is refused; lowering
      // below what slotted cards need is allowed and flagged (like imports).
      const value = Math.max(1, Math.min(SPECIAL_POINTS_CAP, action.value));
      const next = { ...player.conditions, [action.stat]: value };
      const total = SPECIAL_KEYS.reduce((sum, k) => sum + next[k], 0);
      if (value > player.conditions[action.stat] && total > SPECIAL_ALLOCATION_POOL) return state;
      return withPlayer(state, { ...player, conditions: next });
    }

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
      // loadout (documented in the import UI) and merges the URL's s= SPECIAL
      // (clamped to 1–15) when present. Imports are not blocked by the
      // budget — violations surface as the "over budget" badge.
      const regular = action.perks.filter(p => !isLegendaryPerkKey(p.key));
      const legendary = action.perks.filter(p => isLegendaryPerkKey(p.key));
      const importedSpecial = action.special
        ? (Object.fromEntries(
            Object.entries(action.special).map(([k, v]) => [k, Math.max(1, Math.min(SPECIAL_POINTS_CAP, v))])
          ) as unknown as ParsedSpecial)
        : null;
      return {
        ...state,
        buildName: action.name,
        player: {
          ...player,
          perks: parsedPerksToLoadout(regular),
          legendaryPerks: parsedPerksToLoadout(legendary),
          conditions: importedSpecial ? { ...player.conditions, ...importedSpecial } : player.conditions,
        },
      };
    }

    case 'build/hydrate':
      return action.state;
  }
}
