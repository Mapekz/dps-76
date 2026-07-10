import type { GameMode, Perk } from '@/types';
import { getPerks, getWeapons } from '@/data';
import { getConsumables, getMutations } from '@/data/buffs';
import { getLegendaryOmodSlots, getOmodSlots } from '@/data/omods';
import { getGeneratedPerk } from '@/data/perk-modifiers';
import { legendaryPerkIds } from '@/lib/nukes-dragons';
import { Special } from '@/data/special';
import type { BuildState, SpecialKey } from '@/state/build-reducer';
import type { SuggestionBudget, SuggestionCandidate } from './types';

/**
 * Enumerates every legal-ish single-change variant of the current build:
 * alternative OMODs per slot, legendary effects per star, perk rank-ups and
 * damage-relevant unequipped perks (budget-aware — illegal moves are emitted
 * with `legal: false` and a deficit so the UI can say "requires dropping N
 * points"), and mutation/consumable toggles in both directions.
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

const LEGENDARY_SLOTS = 4;
const LEGAL: SuggestionBudget = { legal: true };

/** A perk family is damage-relevant when any rank emits modifiers. */
function isDamageRelevant(mode: GameMode, perkId: string): boolean {
  const generated = getGeneratedPerk(mode, perkId);
  return !!generated && generated.ranks.some(r => r.modifiers.length > 0);
}

function perkBudget(
  state: BuildState,
  registry: Record<string, Perk>,
  perk: Perk,
  extraCost: number
): SuggestionBudget {
  const key = SPECIAL_TO_KEY[perk.special];
  const budget = state.player.conditions[key];
  const spent = state.player.perks.reduce((sum, p) => {
    const equippedPerk = registry[p.perkId];
    return equippedPerk?.special === perk.special ? sum + p.rank : sum;
  }, 0);
  const deficit = spent + extraCost - budget;
  return deficit > 0 ? { legal: false, special: key, deficit } : LEGAL;
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
        out.push({
          id: `mod:${slot.slot}:${option.id}`,
          action: { type: 'weapon/mod', slot: slot.slot, omodId: option.id },
          label: `${slot.label}: ${option.name}`,
          group: 'mod',
          budget: LEGAL,
        });
      }
      if (equipped !== null) {
        out.push({
          id: `mod:${slot.slot}:stock`,
          action: { type: 'weapon/mod', slot: slot.slot, omodId: null },
          label: `${slot.label}: Stock`,
          group: 'mod',
          budget: LEGAL,
        });
      }
    }

    getLegendaryOmodSlots(mode, weapon).forEach((slot, i) => {
      const equipped = player.weapon!.legendaryEffects[i] ?? null;
      for (const option of slot.options) {
        if (option.id === equipped) continue;
        out.push({
          id: `leg:${i}:${option.id}`,
          action: { type: 'weapon/legendary', slotIndex: i, omodId: option.id },
          label: `Legendary ★${i + 1}: ${option.name}`,
          group: 'legendary',
          budget: LEGAL,
        });
      }
    });
  }

  // ── perks ─────────────────────────────────────────────────────────────────
  const registry = getPerks(mode) as Record<string, Perk>;
  const equippedRanks = new Map([...player.perks, ...player.legendaryPerks].map(p => [p.perkId, p.rank]));

  for (const [perkId, perk] of Object.entries(registry)) {
    if (!isDamageRelevant(mode, perkId)) continue;
    const isLegendary = legendaryPerkIds.has(perkId);
    const currentRank = equippedRanks.get(perkId);

    if (currentRank !== undefined) {
      if (currentRank < perk.maxRank) {
        out.push({
          id: `perk-rank:${perkId}`,
          action: { type: 'perk/setRank', perkId, rank: currentRank + 1 },
          label: `${perk.name} rank ${currentRank + 1}`,
          group: 'perk',
          budget: isLegendary ? LEGAL : perkBudget(state, registry, perk, 1),
        });
      }
    } else {
      const budget = isLegendary
        ? player.legendaryPerks.length >= LEGENDARY_SLOTS
          ? { legal: false, deficit: 1 }
          : LEGAL
        : perkBudget(state, registry, perk, 1);
      out.push({
        id: `perk-add:${perkId}`,
        action: { type: 'perk/add', perkId, rank: 1, legendary: isLegendary },
        label: `Equip ${perk.name}`,
        group: 'perk',
        budget,
      });
    }
  }

  // ── mutations & consumables (both directions) ─────────────────────────────
  for (const mutation of getMutations(mode)) {
    const active = player.mutations.includes(mutation.id);
    out.push({
      id: `mutation:${mutation.id}`,
      action: { type: 'mutation/toggle', id: mutation.id },
      label: `${active ? 'Drop' : 'Take'} ${mutation.name}`,
      group: 'mutation',
      budget: LEGAL,
    });
  }
  for (const consumable of getConsumables(mode)) {
    const active = player.consumables.includes(consumable.id);
    out.push({
      id: `consumable:${consumable.id}`,
      action: { type: 'consumable/toggle', id: consumable.id },
      label: `${active ? 'Drop' : 'Use'} ${consumable.name}`,
      group: 'consumable',
      budget: LEGAL,
    });
  }

  return out;
}
