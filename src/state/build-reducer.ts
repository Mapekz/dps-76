import {
  createDefaultEnemyConfig,
  createDefaultPlayerConfig,
  type ArmorWorn,
  type EnemyConditions,
  type EnemyConfig,
  type GameMode,
  type ParsedPerk,
  type PlayerInput,
  type PlayerConfig,
} from '@/types';
import { isLegendaryPerkKey, parsedPerksToLoadout, type ParsedSpecial } from '@/lib/nukes-dragons';
import { perkRaceRestriction } from '@/data/perk-race';
import {
  clampArmorEffectCount,
  clampCrippledLimbCount,
  clampSpecialStat,
  canRaiseSpecialAllocation,
  keepForRace,
  normalizeBuildState,
  regularSlotBlocked,
  snapPlayerHealthPercent,
  snapEnemyHealthPercent,
  syncTargetDebuffConditions,
  takingOneForTheTeamFields,
  targetBodyPartSelection,
  targetRaceSelection,
} from '@/lib/build-rules';
import { legendarySlotsAtLevel, PLAYER_LEVEL, SPECIAL_POINTS_CAP } from '@/lib/player-stats';
import { consumablesById, toggleConsumable } from '@/lib/consumable-rules';
import { CARNIVORE_MUTATION_ID, HERBIVORE_MUTATION_ID } from '@/lib/diet-mutations';
import { getPerks, getUniqueById, getEquippedUnique, getWeapons, maxEligibleLevel } from '@/data';
import { getOmodById } from '@/data/omods';
import { wrongArmorTypeEffects } from '@/data/armor-modifiers';
import { isOmodEligibleForWeapon } from '@/data/omod-eligibility';
import type { PerkId } from '@/data/perk-ids';

/**
 * The one store behind the whole app. The BuildAction union is the shared
 * "change" vocabulary: the UI dispatches actions to commit, the hover-diff
 * tooltips and the suggestions panel run the SAME actions through the reducer
 * speculatively (`makeBuildReducer(mode)(state, action)` is pure) and feed
 * the result to the engine — one vocabulary, three consumers.
 *
 * Mode is a parameter to the reducer FACTORY, not a field of `BuildState`
 * (see docs/adr/0002): a build is version-agnostic — the live/pts switcher
 * holds the build fixed and varies the game-data version to compare the DPS
 * math, so a build can't "have" a mode. The reducer still needs the ACTIVE
 * editing mode for perk-point-budget/race rules (they read the registry,
 * which is mode-keyed), hence the factory closes over it instead of reaching
 * for a hardcoded constant.
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
  | { type: 'weapon/selectUnique'; uniqueId: string }
  | { type: 'weapon/mod'; slot: string; omodId: string | null }
  | { type: 'weapon/legendary'; slotIndex: number; omodId: string | null }
  | { type: 'weapon/itemLevel'; value: number }
  | { type: 'weapon/weakpointMult'; value: number }
  /** Charge hold time in seconds, for weapons that charge (Gauss/bows/tesla-with-barrel/etc.). */
  | { type: 'weapon/chargeTime'; value: number }
  | { type: 'perk/add'; perkId: string; rank: number; legendary: boolean }
  | { type: 'perk/setRank'; perkId: string; rank: number }
  | { type: 'perk/remove'; perkId: string }
  | { type: 'special/set'; stat: SpecialKey; value: number }
  | { type: 'mutation/toggle'; id: string }
  | { type: 'consumable/toggle'; id: string }
  | { type: 'addiction/toggle'; id: string }
  | {
      type: 'condition/set';
      key: keyof PlayerInput;
      value: PlayerInput[keyof PlayerInput];
    }
  | { type: 'condition/setTakingOneForTheTeamRank'; rank: 0 | 1 | 2 | 3 | 4 }
  | { type: 'target/selectRace'; raceId: string | null }
  | { type: 'target/selectBodyPart'; part: string | null }
  | { type: 'armorEffect/setCount'; id: string; count: number }
  | { type: 'armorType/set'; armorWorn: ArmorWorn }
  | { type: 'race/set'; isGhoul: boolean }
  | {
      type: 'enemy/condition';
      key: keyof EnemyConditions;
      value: EnemyConditions[keyof EnemyConditions];
    }
  | { type: 'view/set'; view: Partial<ViewState> }
  | {
      type: 'build/importNd';
      perks: ParsedPerk[];
      name: string | null;
      special: ParsedSpecial | null;
      isGhoul: boolean;
    }
  | { type: 'build/hydrate'; state: BuildState };

export function createDefaultBuildState(): BuildState {
  const player = createDefaultPlayerConfig();
  return {
    player,
    enemy: createDefaultEnemyConfig(),
    buildName: null,
    view: { emphasized: null, breakdownOpen: false },
  };
}

function toggle(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((x) => x !== id) : [...list, id];
}

function withPlayer(state: BuildState, player: PlayerConfig): BuildState {
  return { ...state, player };
}

/** Sentinel picker value for "no part picked" — must match TargetSection's DEFAULT_OPTION. */
export const TARGET_DEFAULT_BODY_PART = '__default_body_part__';

/**
 * Legendary perk card slots unlocked at `PLAYER_LEVEL` (6 at the hardcoded
 * endgame 300 — unlock levels 50/75/100/150/200/300 per the ESM's
 * `LegendaryPerkSlotCount` curve; see `legendarySlotsAtLevel`).
 */
export const LEGENDARY_PERK_SLOTS = legendarySlotsAtLevel(PLAYER_LEVEL);

/**
 * Builds the reducer for `mode` — the active editing mode, NOT build data
 * (docs/adr/0002). Re-create (memoized) when mode changes; the returned
 * function is otherwise a plain, pure `(state, action) => BuildState` reducer.
 */
export function makeBuildReducer(
  mode: GameMode,
): (state: BuildState, action: BuildAction) => BuildState {
  return (state, action) => buildReducer(state, action, mode);
}

function mergeLegendaryEffects(
  preset: (string | null)[],
  prior: (string | null)[],
  weaponId: string,
  mode: GameMode,
): (string | null)[] {
  const weapon = getWeapons(mode)[weaponId];
  if (!weapon) return [...preset];
  const maxLen = Math.max(preset.length, prior.length);
  const merged: (string | null)[] = [];
  for (let i = 0; i < maxLen; i++) {
    const priorEntry = prior[i] ?? null;
    if (priorEntry) {
      const omod = getOmodById(mode, priorEntry);
      if (omod && isOmodEligibleForWeapon(omod, weapon, omod.restrictedToWeaponIds)) {
        merged[i] = priorEntry;
        continue;
      }
    }
    merged[i] = preset[i] ?? null;
  }
  return merged;
}

function buildReducer(state: BuildState, action: BuildAction, mode: GameMode): BuildState {
  const { player } = state;
  switch (action.type) {
    case 'weapon/select':
      return withPlayer(state, {
        ...player,
        weapon: action.weaponId
          ? { weaponId: action.weaponId, mods: {}, legendaryEffects: [] }
          : null,
        // Default to the weapon's best obtainable level (Enclave Plasma 45,
        // Shishkebab 45, most weapons 50) — the slider only offers its real
        // eligible levels anyway.
        itemLevel: action.weaponId
          ? maxEligibleLevel(getWeapons(mode)[action.weaponId])
          : player.itemLevel,
        // A new weapon resets to "always fully charge" — the old hold time
        // was relative to the previous weapon's charge window.
        chargeTimeSec: undefined,
      });

    case 'weapon/selectUnique': {
      const unique = getUniqueById(mode, action.uniqueId);
      if (!unique) return state;
      const baseWeapon = getWeapons(mode)[unique.baseWeaponId];
      if (!baseWeapon) return state;

      const current = player.weapon;
      const currentUnique = current ? getEquippedUnique(mode, current) : undefined;
      if (currentUnique?.id === action.uniqueId) return state;

      const crossBase = !current || current.weaponId !== unique.baseWeaponId;
      const sameBaseDifferentUnique =
        !!current &&
        current.weaponId === unique.baseWeaponId &&
        !!currentUnique &&
        currentUnique.id !== action.uniqueId;

      if (crossBase || sameBaseDifferentUnique) {
        return withPlayer(state, {
          ...player,
          weapon: {
            weaponId: unique.baseWeaponId,
            mods: { ...unique.mods },
            legendaryEffects: mergeLegendaryEffects(
              unique.legendaryEffects,
              current?.legendaryEffects ?? [],
              unique.baseWeaponId,
              mode,
            ),
          },
          itemLevel: crossBase ? maxEligibleLevel(baseWeapon) : player.itemLevel,
          chargeTimeSec: crossBase ? undefined : player.chargeTimeSec,
        });
      }

      const identitySlot =
        Object.entries(unique.mods).find(([, omodId]) => omodId === unique.id)?.[0] ??
        getOmodById(mode, unique.id)?.attachPointEdid ??
        'ap_customName';

      return withPlayer(state, {
        ...player,
        weapon: {
          ...current!,
          mods: { ...current!.mods, [identitySlot]: unique.id },
        },
      });
    }

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
      if (action.omodId === null) legendaryEffects[action.slotIndex] = null;
      else legendaryEffects[action.slotIndex] = action.omodId;
      return withPlayer(state, { ...player, weapon: { ...player.weapon, legendaryEffects } });
    }

    case 'weapon/itemLevel':
      return withPlayer(state, { ...player, itemLevel: Math.max(1, Math.min(50, action.value)) });

    case 'weapon/weakpointMult':
      // Floor 0.1: sub-1 values model armored parts (Mirelurk shell 0.15×), 0 would zero the scenario.
      return withPlayer(state, { ...player, weakpointMult: Math.max(0.1, action.value) });

    case 'weapon/chargeTime':
      // Only a lower bound belongs here: the reducer only sees the base
      // weapon, but OMODs can grant/extend the charge window (tesla only
      // gets fullPowerSeconds from its barrel OMOD) — the engine clamps the
      // upper bound to the effective weapon's fullPowerSeconds itself.
      return withPlayer(state, { ...player, chargeTimeSec: Math.max(0, action.value) });

    case 'perk/add': {
      const list = action.legendary ? 'legendaryPerks' : 'perks';
      if (player[list].some((p) => p.perkId === action.perkId)) return state;
      const rank = Math.max(1, action.rank);
      // Enforce the game's limits: LEGENDARY_PERK_SLOTS legendary slots (6 at
      // endgame); regular cards must fit
      // the stat's perk-point budget (min(15, base + Legendary SPECIAL bonus)).
      if (action.legendary && player.legendaryPerks.length >= LEGENDARY_PERK_SLOTS) return state;
      if (!action.legendary && regularSlotBlocked(player, action.perkId, 0, rank, mode))
        return state;
      // A card locked to the other race can't be added — the picker greys it
      // out for the same reason (PerkEditorSection.tsx). Race itself only
      // changes via race/set, which prunes the loadout to match.
      const race = perkRaceRestriction(mode, action.perkId);
      if (race !== null && (player.conditions.isGhoul ?? false) !== (race === 'ghoul'))
        return state;
      return withPlayer(state, {
        ...player,
        [list]: [...player[list], { perkId: action.perkId, rank }],
        conditions: syncTargetDebuffConditions(player.conditions, action.perkId, rank),
      });
    }

    case 'perk/setRank': {
      const current =
        player.perks.find((p) => p.perkId === action.perkId) ??
        player.legendaryPerks.find((p) => p.perkId === action.perkId);
      if (!current) return state;
      // Defensive clamp: a stale/imported action.rank must not exceed the
      // card's real maxRank (derived from the ESM card — see perk-cards.ts).
      const maxRank = getPerks(mode)[action.perkId as PerkId]?.maxRank ?? action.rank;
      const rank = Math.max(1, Math.min(action.rank, maxRank));
      const isRegular = player.perks.some((p) => p.perkId === action.perkId);
      if (isRegular && regularSlotBlocked(player, action.perkId, current.rank, rank, mode))
        return state;
      const bump = (list: typeof player.perks) =>
        list.map((p) => (p.perkId === action.perkId ? { ...p, rank } : p));
      return withPlayer(state, {
        ...player,
        perks: bump(player.perks),
        legendaryPerks: bump(player.legendaryPerks),
        conditions: syncTargetDebuffConditions(player.conditions, action.perkId, rank),
      });
    }

    case 'perk/remove':
      return withPlayer(state, {
        ...player,
        perks: player.perks.filter((p) => p.perkId !== action.perkId),
        legendaryPerks: player.legendaryPerks.filter((p) => p.perkId !== action.perkId),
        conditions: syncTargetDebuffConditions(player.conditions, action.perkId, 0),
      });

    case 'special/set': {
      const value = clampSpecialStat(action.value);
      if (!canRaiseSpecialAllocation(player.conditions, action.stat, value)) return state;
      return withPlayer(state, {
        ...player,
        conditions: { ...player.conditions, [action.stat]: value },
      });
    }

    case 'mutation/toggle': {
      let mutations = toggle(player.mutations, action.id);
      // Carnivore ↔ Herbivore are mutually exclusive in-game (taking one
      // serum cures the other) — selecting one evicts its counterpart.
      const dietTwin =
        action.id === CARNIVORE_MUTATION_ID
          ? HERBIVORE_MUTATION_ID
          : action.id === HERBIVORE_MUTATION_ID
            ? CARNIVORE_MUTATION_ID
            : null;
      if (dietTwin && mutations.includes(action.id)) {
        mutations = mutations.filter((id) => id !== dietTwin);
      }
      return withPlayer(state, { ...player, mutations });
    }

    case 'consumable/toggle':
      // Stacking rules (one chem/alcohol at a time, same-bonus food/drink
      // displacement) are enforced here, not in the engine.
      return withPlayer(state, {
        ...player,
        consumables: toggleConsumable(consumablesById(mode), player.consumables, action.id)
          .consumables,
      });

    case 'addiction/toggle':
      return withPlayer(state, { ...player, addictions: toggle(player.addictions, action.id) });

    case 'condition/set': {
      let value = action.value;
      if (action.key === 'healthPercent' && typeof value === 'number') {
        value = snapPlayerHealthPercent(value);
      }
      return withPlayer(state, {
        ...player,
        conditions: { ...player.conditions, [action.key]: value },
      });
    }

    case 'condition/setTakingOneForTheTeamRank':
      return withPlayer(state, {
        ...player,
        conditions: { ...player.conditions, ...takingOneForTheTeamFields(action.rank) },
      });

    case 'armorEffect/setCount': {
      const count = clampArmorEffectCount(mode, player.armorEffects, action.id, action.count);
      const armorEffects = { ...player.armorEffects };
      if (count > 0) armorEffects[action.id] = count;
      else delete armorEffects[action.id];
      return withPlayer(state, { ...player, armorEffects });
    }

    case 'armorType/set': {
      const removing = wrongArmorTypeEffects(mode, player.armorEffects, action.armorWorn);
      const armorEffects = { ...player.armorEffects };
      for (const id of removing) delete armorEffects[id];
      return withPlayer(state, {
        ...player,
        conditions: {
          ...player.conditions,
          armorWorn: action.armorWorn,
          isInPowerArmor: action.armorWorn === 'power',
        },
        armorEffects,
      });
    }

    case 'race/set':
      // The user's choice, not a side effect of adding a perk — prune whatever
      // no longer fits instead of blocking the switch (UI confirms first).
      // Switching to Ghoul also resets Health % to 100: low-HP builds lean on
      // taking Rads to cut max HP, and Ghouls convert Rads into Glow instead,
      // so a carried-over low value wouldn't reflect a feasible ghoul build.
      // Human→Ghoul only — switching back to Human leaves whatever's there.
      return withPlayer(state, {
        ...player,
        conditions: {
          ...player.conditions,
          isGhoul: action.isGhoul,
          ...(action.isGhoul ? { healthPercent: 100 } : {}),
        },
        perks: keepForRace(player.perks, action.isGhoul, mode),
        legendaryPerks: keepForRace(player.legendaryPerks, action.isGhoul, mode),
      });

    case 'target/selectRace': {
      const selection = targetRaceSelection(
        mode,
        action.raceId,
        state.enemy.conditions.crippledLimbCount,
      );
      return {
        ...state,
        enemy: {
          ...state.enemy,
          conditions: {
            ...state.enemy.conditions,
            targetRace: selection.targetRace,
            targetBodyPart: selection.targetBodyPart,
            crippledLimbCount: selection.crippledLimbCount,
          },
        },
        player: {
          ...player,
          conditions: {
            ...player.conditions,
            isAimingAtWeakpoint: selection.isAimingAtWeakpoint,
          },
        },
      };
    }

    case 'target/selectBodyPart': {
      const selection = targetBodyPartSelection(action.part, TARGET_DEFAULT_BODY_PART);
      return {
        ...state,
        player: {
          ...player,
          conditions: {
            ...player.conditions,
            isAimingAtWeakpoint: selection.isAimingAtWeakpoint,
          },
        },
        enemy: {
          ...state.enemy,
          conditions: {
            ...state.enemy.conditions,
            ...(selection.targetBodyPart !== undefined
              ? { targetBodyPart: selection.targetBodyPart }
              : {}),
          },
        },
      };
    }

    case 'enemy/condition': {
      let value = action.value;
      if (action.key === 'crippledLimbCount' && typeof value === 'number') {
        value = clampCrippledLimbCount(mode, state.enemy.conditions.targetRace, value);
      }
      if (action.key === 'healthPercent' && typeof value === 'number') {
        value = snapEnemyHealthPercent(value);
      }
      return {
        ...state,
        enemy: {
          ...state.enemy,
          conditions: { ...state.enemy.conditions, [action.key]: value },
        },
      };
    }

    case 'view/set':
      return { ...state, view: { ...state.view, ...action.view } };

    case 'build/importNd': {
      // Import REPLACES the perk loadout AND race together (the UI resolves
      // action.isGhoul from the link's own race lock — BuildUrlInput.tsx —
      // confirming first only when that changes the current race or the link
      // conflicts). Merges the URL's s= SPECIAL (clamped to 1–15) when
      // present. Imports are not blocked by the budget — violations surface
      // as the "over budget" badge. Perks locked to the other race are
      // pruned so a mixed-race (invalid) link can't leave silently-inert
      // cards behind once a race is chosen for it.
      const regular = keepForRace(
        parsedPerksToLoadout(action.perks.filter((p) => !isLegendaryPerkKey(p.key))),
        action.isGhoul,
        mode,
      );
      const legendary = keepForRace(
        parsedPerksToLoadout(action.perks.filter((p) => isLegendaryPerkKey(p.key))),
        action.isGhoul,
        mode,
      );
      const importedSpecial = action.special
        ? (Object.fromEntries(
            Object.entries(action.special).map(([k, v]) => [
              k,
              Math.max(1, Math.min(SPECIAL_POINTS_CAP, v)),
            ]),
          ) as unknown as ParsedSpecial)
        : null;
      const conditions = {
        ...player.conditions,
        ...(importedSpecial ?? {}),
        isGhoul: action.isGhoul,
        // Same reasoning as race/set: a ghoul import can't land on a
        // low-HP value that Health % on Ghoul doesn't support.
        ...(action.isGhoul ? { healthPercent: 100 } : {}),
      };
      return {
        ...state,
        buildName: action.name,
        player: {
          ...player,
          perks: regular,
          legendaryPerks: legendary,
          conditions,
        },
      };
    }

    case 'build/hydrate':
      return normalizeBuildState(mode, action.state).state;
  }
}
