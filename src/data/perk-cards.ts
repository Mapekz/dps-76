import type { Perk } from '@/types';
import type { GeneratedPerk } from '@/types/generated';
import type { PerkId } from './perk-ids';
import { Special } from './special';
import { buildPerkJoinMaps, normalizeName } from './perk-modifiers';
import { legendaryPerkIds } from '@/lib/nukes-dragons';
import { perkCardOverrides, perkFamilyOverrides } from './overrides/perk-overrides';

/**
 * Derives the full `Perk` registry (special/maxRank/costs) from the
 * name-only PerkId → display-name map (src/data/live/perks.ts) joined
 * against the ESM-generated perk families' PCRD card data
 * (src/data/live/generated/perks.json). Wired into the dataset at
 * `src/data/dataset.ts` so every accessor keeps reading `Record<PerkId, Perk>`.
 *
 * Join order mirrors `getGeneratedPerk` (perk-modifiers.ts): perkFamilyOverrides
 * first, then normalized-display-name via the shared join maps.
 */

/** Name-only registry entry — all a PerkId needs before card data is joined. */
export interface PerkNameEntry {
  name: string;
}

const SPECIAL_BY_CARD_STRING: Readonly<Record<string, Special>> = {
  [Special.Strength]: Special.Strength,
  [Special.Perception]: Special.Perception,
  [Special.Endurance]: Special.Endurance,
  [Special.Charisma]: Special.Charisma,
  [Special.Intelligence]: Special.Intelligence,
  [Special.Agility]: Special.Agility,
  [Special.Luck]: Special.Luck,
};

/**
 * Conservative maxRank for the (currently empty) tail of registry entries
 * with neither a joined card nor a perkCardOverrides entry — should never be
 * exercised; see perk-cards.test.ts's drift assertion.
 */
const FALLBACK_MAX_RANK = 3;

function findGeneratedFamily(
  perkId: string,
  name: string,
  joinMaps: ReturnType<typeof buildPerkJoinMaps>
): GeneratedPerk | undefined {
  const familyOverride = perkFamilyOverrides[perkId];
  if (familyOverride) return joinMaps.byFamily.get(familyOverride);
  return joinMaps.byName.get(normalizeName(name));
}

export function derivePerkRegistry(
  nameRegistry: Readonly<Record<PerkId, PerkNameEntry>>,
  generatedPerks: GeneratedPerk[]
): Record<PerkId, Perk> {
  const joinMaps = buildPerkJoinMaps(generatedPerks);
  const out = {} as Record<PerkId, Perk>;

  for (const perkId of Object.keys(nameRegistry) as PerkId[]) {
    const { name } = nameRegistry[perkId];
    const generated = findGeneratedFamily(perkId, name, joinMaps);

    // Legendary perks are never SPECIAL-slotted and never consume SPECIAL
    // perk points (they use the separate 6-slot system) — even though their
    // PCRD cards carry a `special`/`costs` in the ESM data (some do), that
    // data must never leak into the budget derivation. `costs` is kept (real
    // ESM data when available) purely so maxRank === costs.length holds
    // uniformly across the registry; it is inert without `special`.
    if (legendaryPerkIds.has(perkId)) {
      // Card entries are the live rank count (see the non-legendary path).
      const maxRank = generated?.card ? generated.card.costs.length : (generated?.maxRank ?? FALLBACK_MAX_RANK);
      const costs = generated?.card ? [...generated.card.costs] : Array.from({ length: maxRank }, () => 1);
      out[perkId] = { name, maxRank, costs, raceRestriction: generated?.card?.raceRestriction ?? null };
      continue;
    }

    const card = generated?.card;
    if (generated && card) {
      // The PCRD's Perks[] list IS the live shape of the card: 28 rebalanced
      // ("compressed") cards record fewer entries than the family has PERK
      // ranks (LifegiverCard 0x0000BB40 lists one rank at cost 2 while
      // LifeGiver01-03 exist) — the surplus ranks are dead content, so
      // maxRank clamps DOWN to the entry count. Rank → PERK-record resolution
      // goes through card.rankSources (perk-modifiers.ts).
      out[perkId] = {
        name,
        special: SPECIAL_BY_CARD_STRING[card.special],
        maxRank: card.costs.length,
        costs: [...card.costs],
        raceRestriction: card.raceRestriction,
      };
      continue;
    }

    const override = perkCardOverrides[perkId];
    if (override) {
      out[perkId] = { name, special: override.special, maxRank: override.maxRank, costs: override.costs, raceRestriction: null };
      continue;
    }

    // Last resort — no card data anywhere (join miss, or a joined family
    // without a PCRD). maxRank falls back to the joined family's rank count
    // when available, else a conservative default; cost = rank (the old
    // blanket assumption) since there's no real per-rank cost to read.
    const maxRank = generated?.maxRank ?? FALLBACK_MAX_RANK;
    out[perkId] = { name, maxRank, costs: Array.from({ length: maxRank }, (_, i) => i + 1), raceRestriction: null };
  }

  return out;
}
