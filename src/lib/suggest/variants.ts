import type { GameMode, Perk } from '@/types';
import { getPerks, getWeapons } from '@/data';
import {
  type ArmorEffectEntry,
  getArmorEffects,
  getArmorTierUsage,
  MAX_LEGENDARY_COUNT,
} from '@/data/armor-modifiers';
import { getConsumables, getMutations } from '@/data/buffs';
import { getLegendaryOmodSlots, getOmodSlots } from '@/data/omods';
import { computePerkBudget } from '@/data/perk-budget';
import { getGeneratedPerk } from '@/data/perk-modifiers';
import { legendaryPerkIds } from '@/lib/nukes-dragons';
import { perkCardCostAtRank, type PerkBudget } from '@/lib/player-stats';
import { Special } from '@/data/special';
import {
  LEGENDARY_PERK_SLOTS as LEGENDARY_SLOTS,
  type BuildState,
  type SpecialKey,
} from '@/state/build-reducer';
import { hasAnyEngineEffect } from '@/types/modifiers';
import type { SuggestionBudget, SuggestionCandidate } from './types';
import { enumerateCombos } from './combos';

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

const SPECIAL_TO_KEY: Record<Special, SpecialKey> = {
  [Special.Strength]: 'strength',
  [Special.Perception]: 'perception',
  [Special.Endurance]: 'endurance',
  [Special.Charisma]: 'charisma',
  [Special.Intelligence]: 'intelligence',
  [Special.Agility]: 'agility',
  [Special.Luck]: 'luck',
};

const LEGAL: SuggestionBudget = { legal: true };

/** A perk family is damage-relevant when any rank emits modifiers. */
function isDamageRelevant(mode: GameMode, perkId: string): boolean {
  const generated = getGeneratedPerk(mode, perkId);
  return !!generated && generated.ranks.some((r) => r.modifiers.length > 0);
}

/** An armor effect is damage-relevant when its per-piece modifiers reach the engine at all. */
function isArmorEffectRelevant(effect: ArmorEffectEntry): boolean {
  return hasAnyEngineEffect(effect.modifiers);
}

/**
 * Legality under the perk-budget rules (src/lib/player-stats.ts): card
 * points per stat ≤ min(15, base allocation + Legendary SPECIAL bonus).
 * Deficit = how many points past the budget the move would land.
 */
function perkBudget(budget: PerkBudget, perk: Perk, extraCost: number): SuggestionBudget {
  if (!perk.special) return LEGAL; // legendary cards are never SPECIAL-budget-constrained
  const key = SPECIAL_TO_KEY[perk.special];
  const deficit = budget.cardPoints[key] + extraCost - budget.budgetPerStat[key];
  return deficit > 0 ? { legal: false, special: key, deficit } : LEGAL;
}

/** Clamped selected count for an armor effect (mirrors armor-modifiers.ts's private `selectedCount`). */
function armorEffectCount(effect: ArmorEffectEntry, selections: Readonly<Record<string, number>>) {
  return Math.max(0, Math.min(effect.maxCount, selections[effect.id] ?? 0));
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
          label: `${slot.label}: ${option.name}`,
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
          label: `${slot.label}: Stock`,
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
          label: `Legendary ★${i + 1}: ${option.name}`,
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
  const allocation = Object.fromEntries(
    Object.values(SPECIAL_TO_KEY).map((key) => [key, player.conditions[key]]),
  ) as Record<SpecialKey, number>;
  const cardBudget = computePerkBudget(mode, player.perks, player.legendaryPerks, allocation);

  for (const [perkId, perk] of Object.entries(registry)) {
    if (!isDamageRelevant(mode, perkId)) continue;
    const isLegendary = legendaryPerkIds.has(perkId);
    const currentRank = equippedRanks.get(perkId);
    const family = `perk:${perkId}`;

    if (currentRank !== undefined) {
      // Equipped — one candidate per rank above the current, all the way to max.
      for (let rank = currentRank + 1; rank <= perk.maxRank; rank++) {
        const extraCost = perkCardCostAtRank(perk, rank) - perkCardCostAtRank(perk, currentRank);
        const cost = isLegendary ? rank - currentRank : extraCost;
        const budget = isLegendary ? LEGAL : perkBudget(cardBudget, perk, extraCost);
        const label = isLegendary
          ? `${perk.name} rank ${rank}`
          : `${perk.name} rank ${rank} (+${extraCost} pts)`;
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
        const budget = isLegendary ? legendarySlotBudget : perkBudget(cardBudget, perk, extraCost);
        const label =
          rank === 1
            ? isLegendary
              ? `Equip ${perk.name}`
              : `Equip ${perk.name} (+${extraCost} pts)`
            : isLegendary
              ? `Equip ${perk.name} rank ${rank}`
              : `Equip ${perk.name} rank ${rank} (+${extraCost} pts)`;
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
  const tierUsage = getArmorTierUsage(mode, player.armorEffects);

  for (const effect of armorEffects) {
    const current = armorEffectCount(effect, player.armorEffects);
    if (!isArmorEffectRelevant(effect)) continue;

    const free =
      effect.starTier !== undefined
        ? MAX_LEGENDARY_COUNT - tierUsage[effect.starTier]
        : effect.maxCount - current;
    if (free <= 0) continue;

    const family = `armor-count:${effect.id}`;
    const upper = Math.min(effect.maxCount, current + free);
    for (let count = current + 1; count <= upper; count++) {
      out.push({
        id: `armor-count:${effect.id}:${count}`,
        action: [{ type: 'armorEffect/setCount', id: effect.id, count }],
        label: `${effect.name} ×${count}`,
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
    const countX = armorEffectCount(x, player.armorEffects);
    if (countX <= 0) continue;

    for (const y of armorEffects) {
      if (y.id === x.id || y.starTier !== x.starTier || !isArmorEffectRelevant(y)) continue;
      const countY = armorEffectCount(y, player.armorEffects);
      for (let k = 1; k <= countX; k++) {
        if (countY + k > y.maxCount) continue;
        out.push({
          id: `armor-swap:${x.id}:${y.id}:${k}`,
          action: [
            { type: 'armorEffect/setCount', id: x.id, count: countX - k },
            { type: 'armorEffect/setCount', id: y.id, count: countY + k },
          ],
          label: `Replace ${k}× ${x.name} with ${k}× ${y.name}`,
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
