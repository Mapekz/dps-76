import type { ArmorWorn, GameMode, Perk, PlayerConfig } from '@/types';
import { getPerks, getWeapons } from '@/data';
import {
  type ArmorEffectEntry,
  getArmorEffects,
  maxFeasibleArmorEffectCount,
} from '@/data/armor-modifiers';
import { getConsumables, getMutations } from '@/data/buffs';
import { getLegendaryOmodSlots, getOmodSlots } from '@/data/omods';
import { computePerkBudget } from '@/data/perk-budget';
import { manualUptimePerkSuggestible } from '@/data/manual-uptime';
import { perkHasEngineEffect } from '@/data/perk-modifiers';
import {
  allocationOf,
  maxAllowedArmorEffectCount,
  perkMoveBudget,
  storedArmorEffectCount,
} from '@/lib/build-rules';
import { legendaryPerkIds } from '@/lib/nukes-dragons';
import {
  perkCardCostAtRank,
  SPECIAL_ALLOCATION_POOL,
  SPECIAL_POINTS_CAP,
} from '@/lib/player-stats';
import {
  LEGENDARY_PERK_SLOTS as LEGENDARY_SLOTS,
  type BuildAction,
  type BuildState,
  type ScenarioKey,
  type SpecialKey,
} from '@/state/build-reducer';
import { hasAnyEngineEffect } from '@/types/modifiers';
import type { SuggestionCandidate } from './types';
import { enumerateCombos } from './combos';
import { buildStaticLoadoutContext } from './loadout-context';
import { armorEffectLabel, legendaryEffectLabel, modLabel, perkLabel } from './labels';

/**
 * Enumerates every legal variant of the current build: alternative OMODs
 * per slot, legendary effects per star, perk rank-ups and damage-relevant
 * unequipped perks at every rank (budget-aware — illegal moves become
 * SPECIAL-allocation compounds or legendary swaps, or are omitted), armor-
 * effect count increases and same-tier legendary swaps, mutation/consumable
 * toggles in both directions, and mechanism-derived combo bundles (Onslaught
 * synergies, etc.) that open doors the single-step ladder cannot.
 *
 * Graduated families (perk ranks, armor counts) emit one candidate PER STEP
 * rather than only the next step — `family` groups the steps so
 * `collapseSuggestionFamilies` (evaluate.ts) can reduce them to the cheapest
 * positive mover and the best mover after evaluation.
 */

const SPECIAL_ABBR: Record<SpecialKey, string> = {
  strength: 'STR',
  perception: 'PER',
  endurance: 'END',
  charisma: 'CHA',
  intelligence: 'INT',
  agility: 'AGI',
  luck: 'LCK',
};

/** An armor effect is damage-relevant when its per-piece modifiers reach the engine at all. */
function isArmorEffectRelevant(effect: ArmorEffectEntry): boolean {
  return hasAnyEngineEffect(effect.modifiers);
}

function armorTypeEligible(effect: ArmorEffectEntry, armorWorn: ArmorWorn): boolean {
  if (armorWorn === 'none') return false;
  if (effect.armorType === 'both') return true;
  if (armorWorn === 'power') return effect.armorType === 'powerArmor';
  return effect.armorType === 'bodyArmor';
}

function allocationPoolFree(allocation: Record<SpecialKey, number>): number {
  let sum = 0;
  for (const v of Object.values(allocation)) sum += v;
  return SPECIAL_ALLOCATION_POOL - sum;
}

export function perkAddAction(perkId: string, rank: number, legendary: boolean): BuildAction {
  return { type: 'perk/add', perkId, rank, legendary };
}

export function firstEmptyLegendarySlot(player: PlayerConfig, slotIndices: number[]): number | -1 {
  if (!player.weapon) return -1;
  for (const idx of slotIndices) {
    if (player.weapon.legendaryEffects[idx] == null) return idx;
  }
  return -1;
}

function tryEmitPerkMove(
  out: SuggestionCandidate[],
  params: {
    id: string;
    action: BuildAction[];
    label: string;
    family: string;
    cost: number;
    perk: Perk;
    extraCost: number;
    cardBudget: ReturnType<typeof computePerkBudget>;
    allocation: Record<SpecialKey, number>;
  },
): void {
  const { id, action, label, family, cost, perk, extraCost, cardBudget, allocation } = params;
  const budget = perkMoveBudget(cardBudget, perk, extraCost);
  if (budget.legal) {
    out.push({ id, action, label, group: 'perk', family, cost });
    return;
  }
  if (!budget.special || budget.deficit === undefined) return;
  const special = budget.special;
  const d = budget.deficit;
  const poolFree = allocationPoolFree(allocation);
  if (poolFree < d || allocation[special] + d > SPECIAL_POINTS_CAP) return;
  out.push({
    id: `${id}:alloc`,
    action: [{ type: 'special/set', stat: special, value: allocation[special] + d }, ...action],
    label: `${label} (+${d} ${SPECIAL_ABBR[special]})`,
    group: 'perk',
    family,
    cost: cost + d,
  });
}

export function enumerateVariants(
  state: BuildState,
  mode: GameMode,
  metric: ScenarioKey = 'vats',
): SuggestionCandidate[] {
  const out: SuggestionCandidate[] = [];
  const { player } = state;

  // ── weapon mods & legendary effects ───────────────────────────────────────
  const weapon = player.weapon ? getWeapons(mode)[player.weapon.weaponId] : undefined;
  if (weapon && player.weapon) {
    for (const slot of getOmodSlots(mode, weapon)) {
      const equipped = player.weapon.mods[slot.slot] ?? null;
      for (const option of slot.options) {
        if (option.id === equipped) continue;
        const id = `mod:${slot.slot}:${option.id}`;
        out.push({
          id,
          action: [{ type: 'weapon/mod', slot: slot.slot, omodId: option.id }],
          label: modLabel(slot.label, option.name),
          group: 'mod',
          family: id,
          cost: 0,
        });
      }
      if (equipped !== null) {
        const id = `mod:${slot.slot}:stock`;
        out.push({
          id,
          action: [{ type: 'weapon/mod', slot: slot.slot, omodId: null }],
          label: modLabel(slot.label, 'Stock'),
          group: 'mod',
          family: id,
          cost: 0,
        });
      }
    }

    getLegendaryOmodSlots(mode, weapon).forEach((slot, i) => {
      const equipped = player.weapon!.legendaryEffects[i] ?? null;
      for (const option of slot.options) {
        if (option.id === equipped) continue;
        const id = `leg:${i}:${option.id}`;
        out.push({
          id,
          action: [{ type: 'weapon/legendary', slotIndex: i, omodId: option.id }],
          label: legendaryEffectLabel(option.name, i),
          group: 'legendary',
          family: id,
          cost: 0,
        });
      }
    });
  }

  // ── perks ─────────────────────────────────────────────────────────────────
  const registry = getPerks(mode) as Record<string, Perk>;
  const equippedRanks = new Map(
    [...player.perks, ...player.legendaryPerks].map((p) => [p.perkId, p.rank]),
  );
  const allocation = allocationOf(player);
  const cardBudget = computePerkBudget(mode, player.perks, player.legendaryPerks, allocation);
  const loadoutCtx = buildStaticLoadoutContext(mode, player, weapon);
  const equippedLegendaryIds = new Set(player.legendaryPerks.map((p) => p.perkId));

  for (const [perkId, perk] of Object.entries(registry)) {
    if (!perkHasEngineEffect(mode, perkId, loadoutCtx)) continue;
    if (!manualUptimePerkSuggestible(perkId, player.conditions.isSneaking)) continue;
    const isLegendary = legendaryPerkIds.has(perkId);
    const currentRank = equippedRanks.get(perkId);
    const family = `perk:${perkId}`;

    if (currentRank !== undefined) {
      for (let rank = currentRank + 1; rank <= perk.maxRank; rank++) {
        const extraCost = perkCardCostAtRank(perk, rank) - perkCardCostAtRank(perk, currentRank);
        const cost = isLegendary ? rank - currentRank : extraCost;
        const label = perkLabel(perk.name, rank);
        const action: BuildAction[] = [{ type: 'perk/setRank', perkId, rank }];

        if (isLegendary) {
          out.push({
            id: `perk-rank:${perkId}:${rank}`,
            action,
            label,
            group: 'perk',
            family,
            cost,
          });
        } else {
          tryEmitPerkMove(out, {
            id: `perk-rank:${perkId}:${rank}`,
            action,
            label,
            family,
            cost,
            perk,
            extraCost,
            cardBudget,
            allocation,
          });
        }
      }
    } else if (isLegendary) {
      if (player.legendaryPerks.length < LEGENDARY_SLOTS) {
        for (let rank = 1; rank <= perk.maxRank; rank++) {
          out.push({
            id: `perk-add:${perkId}:${rank}`,
            action: [perkAddAction(perkId, rank, true)],
            label: perkLabel(perk.name, rank),
            group: 'perk',
            family,
            cost: rank,
          });
        }
      }
    } else {
      for (let rank = 1; rank <= perk.maxRank; rank++) {
        const extraCost = perkCardCostAtRank(perk, rank);
        const label = perkLabel(perk.name, rank);
        const action: BuildAction[] = [perkAddAction(perkId, rank, false)];
        tryEmitPerkMove(out, {
          id: `perk-add:${perkId}:${rank}`,
          action,
          label,
          family,
          cost: extraCost,
          perk,
          extraCost,
          cardBudget,
          allocation,
        });
      }
    }
  }

  // Legendary perk swaps when slots are full
  if (player.legendaryPerks.length >= LEGENDARY_SLOTS) {
    for (const old of player.legendaryPerks) {
      const oldPerk = registry[old.perkId];
      const oldName = oldPerk?.name ?? old.perkId;
      for (const [perkId, perk] of Object.entries(registry)) {
        if (!legendaryPerkIds.has(perkId)) continue;
        if (equippedLegendaryIds.has(perkId)) continue;
        if (!perkHasEngineEffect(mode, perkId, loadoutCtx)) continue;
        if (!manualUptimePerkSuggestible(perkId, player.conditions.isSneaking)) continue;
        for (let r = 1; r <= perk.maxRank; r++) {
          out.push({
            id: `leg-perk-swap:${old.perkId}->${perkId}:${r}`,
            action: [{ type: 'perk/remove', perkId: old.perkId }, perkAddAction(perkId, r, true)],
            label: `${oldName} → ${perkLabel(perk.name, r)}`,
            group: 'perk',
            family: `leg-swap:${old.perkId}->${perkId}`,
            cost: r,
          });
        }
      }
    }
  }

  // ── armor effects ──────────────────────────────────────────────────────────
  const armorEffects = getArmorEffects(mode);
  const armorWorn = player.conditions.armorWorn;

  for (const effect of armorEffects) {
    const current = storedArmorEffectCount(effect, player.armorEffects);
    if (!isArmorEffectRelevant(effect) || !armorTypeEligible(effect, armorWorn)) continue;

    const maxAllowed = maxAllowedArmorEffectCount(mode, player.armorEffects, effect.id);
    if (current >= maxAllowed) continue;

    const family = `armor-count:${effect.id}`;
    for (let count = current + 1; count <= maxAllowed; count++) {
      out.push({
        id: `armor-count:${effect.id}:${count}`,
        action: [{ type: 'armorEffect/setCount', id: effect.id, count }],
        label: armorEffectLabel(effect.name, count, effect.starTier),
        group: 'armor',
        family,
        cost: count - current,
      });
    }
  }

  for (const x of armorEffects) {
    if (x.starTier === undefined) continue;
    const countX = storedArmorEffectCount(x, player.armorEffects);
    if (countX <= 0) continue;

    for (const y of armorEffects) {
      if (
        y.id === x.id ||
        y.starTier !== x.starTier ||
        !isArmorEffectRelevant(y) ||
        !armorTypeEligible(y, armorWorn)
      )
        continue;
      const countY = storedArmorEffectCount(y, player.armorEffects);
      const withoutY = { ...player.armorEffects };
      delete withoutY[y.id];
      const maxY = maxFeasibleArmorEffectCount(mode, y.id, withoutY);
      for (let k = 1; k <= countX; k++) {
        if (countY + k > maxY) continue;
        out.push({
          id: `armor-swap:${x.id}:${y.id}:${k}`,
          action: [
            { type: 'armorEffect/setCount', id: x.id, count: countX - k },
            { type: 'armorEffect/setCount', id: y.id, count: countY + k },
          ],
          label: `${k}× ${x.name} → ${k}× ${y.name}`,
          group: 'armor',
          family: `armor-swap:${x.id}->${y.id}`,
          cost: k,
        });
      }
    }
  }

  // ── mutations & consumables (both directions) ─────────────────────────────
  for (const mutation of getMutations(mode)) {
    const active = player.mutations.includes(mutation.id);
    const id = `mutation:${mutation.id}`;
    out.push({
      id,
      action: [{ type: 'mutation/toggle', id: mutation.id }],
      label: `${active ? 'Drop' : 'Take'} ${mutation.name}`,
      group: 'mutation',
      family: id,
      cost: 0,
    });
  }
  for (const consumable of getConsumables(mode)) {
    const active = player.consumables.includes(consumable.id);
    const id = `consumable:${consumable.id}`;
    out.push({
      id,
      action: [{ type: 'consumable/toggle', id: consumable.id }],
      label: `${active ? 'Drop' : 'Use'} ${consumable.name}`,
      group: 'consumable',
      family: id,
      cost: 0,
    });
  }

  // ── combo bundles ──────────────────────────────────────────────────────────
  out.push(...enumerateCombos(state, mode, metric));

  return out;
}
