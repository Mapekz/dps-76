import type { ArmorWorn, GameMode, Perk } from '@/types';
import { getPerks, getWeapons } from '@/data';
import {
  type ArmorEffectEntry,
  getArmorEffects,
  maxFeasibleArmorEffectCount,
} from '@/data/armor-modifiers';
import { getConsumables, getMutations } from '@/data/buffs';
import { getLegendaryOmodSlots, getOmodSlots } from '@/data/omods';
import { computePerkBudget } from '@/data/perk-budget';
import { perkHasEngineEffect } from '@/data/perk-modifiers';
import {
  allocationOf,
  maxAllowedArmorEffectCount,
  perkMoveBudget,
  storedArmorEffectCount,
} from '@/lib/build-rules';
import { legendaryPerkIds } from '@/lib/nukes-dragons';
import { perkCardCostAtRank } from '@/lib/player-stats';
import { LEGENDARY_PERK_SLOTS as LEGENDARY_SLOTS, type BuildState } from '@/state/build-reducer';
import { hasAnyEngineEffect } from '@/types/modifiers';
import type { SuggestionBudget, SuggestionCandidate } from './types';
import { enumerateCombos } from './combos';
import { buildStaticLoadoutContext } from './loadout-context';
import {
  armorEffectLabel,
  legendaryEffectLabel,
  modLabel,
  perkLabel,
  perkLabelWithCost,
} from './labels';

/**
 * Enumerates every legal-ish variant of the current build: alternative OMODs
 * per slot, legendary effects per star, perk rank-ups and damage-relevant
 * unequipped perks at every rank (budget-aware — illegal moves are emitted
 * with `legal: false` and a deficit so the UI can say "requires dropping N
 * points"), armor-effect count increases and same-tier legendary swaps,
 * mutation/consumable toggles in both directions, and mechanism-derived combo
 * pairs (Onslaught synergies, etc.) that open doors the single-step ladder cannot.
 *
 * Graduated families (perk ranks, armor counts) emit one candidate PER STEP
 * rather than only the next step — `family` groups the steps so
 * `collapseSuggestionFamilies` (evaluate.ts) can reduce them to the cheapest
 * positive mover and the best mover after evaluation.
 */

const LEGAL: SuggestionBudget = { legal: true };

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

export function enumerateVariants(state: BuildState, mode: GameMode): SuggestionCandidate[] {
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
          budget: LEGAL,
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
          budget: LEGAL,
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
          budget: LEGAL,
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
  const cardBudget = computePerkBudget(
    mode,
    player.perks,
    player.legendaryPerks,
    allocationOf(player),
  );
  const loadoutCtx = buildStaticLoadoutContext(mode, player, weapon);

  for (const [perkId, perk] of Object.entries(registry)) {
    if (!perkHasEngineEffect(mode, perkId, loadoutCtx)) continue;
    const isLegendary = legendaryPerkIds.has(perkId);
    const currentRank = equippedRanks.get(perkId);
    const family = `perk:${perkId}`;

    if (currentRank !== undefined) {
      // Equipped — one candidate per rank above the current, all the way to max.
      for (let rank = currentRank + 1; rank <= perk.maxRank; rank++) {
        const extraCost = perkCardCostAtRank(perk, rank) - perkCardCostAtRank(perk, currentRank);
        const cost = isLegendary ? rank - currentRank : extraCost;
        const budget = isLegendary ? LEGAL : perkMoveBudget(cardBudget, perk, extraCost);
        const label = isLegendary
          ? perkLabel(perk.name, rank)
          : perkLabelWithCost(perk.name, rank, extraCost);
        out.push({
          id: `perk-rank:${perkId}:${rank}`,
          action: [{ type: 'perk/setRank', perkId, rank }],
          label,
          group: 'perk',
          budget,
          family,
          cost,
        });
      }
    } else {
      // Unequipped — one candidate per rank from 1 to max (adding straight at that rank).
      const legendarySlotBudget: SuggestionBudget =
        player.legendaryPerks.length >= LEGENDARY_SLOTS ? { legal: false, deficit: 1 } : LEGAL;
      for (let rank = 1; rank <= perk.maxRank; rank++) {
        const extraCost = perkCardCostAtRank(perk, rank);
        const cost = isLegendary ? rank : extraCost;
        const budget = isLegendary
          ? legendarySlotBudget
          : perkMoveBudget(cardBudget, perk, extraCost);
        const label = isLegendary
          ? perkLabel(perk.name, rank)
          : perkLabelWithCost(perk.name, rank, extraCost);
        out.push({
          id: `perk-add:${perkId}:${rank}`,
          action: [{ type: 'perk/add', perkId, rank, legendary: isLegendary }],
          label,
          group: 'perk',
          budget,
          family,
          cost,
        });
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
        budget: LEGAL,
        family,
        cost: count - current,
      });
    }
  }

  // Same-star-tier swaps: move k worn pieces from an active effect X to a
  // damage-relevant effect Y, freeing X's tier room before spending it on Y
  // so the pair is always legal even when the tier is already full.
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
          budget: LEGAL,
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
      budget: LEGAL,
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
      budget: LEGAL,
      family: id,
      cost: 0,
    });
  }

  // ── combo pairs ────────────────────────────────────────────────────────────
  out.push(...enumerateCombos(state, mode));

  return out;
}
