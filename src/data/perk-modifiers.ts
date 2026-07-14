import type { GameMode, PerkId, PerkLoadout } from '@/types';
import type { GeneratedPerk } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';
import { getDataset } from './dataset';
import { extraPerkModifiers } from './overrides/perk-overrides';
import { buildPerkJoinMaps, resolveFamily, type JoinMaps } from './perk-join';

/**
 * Bridges the PerkId registry (N&D-aligned) to the ESM-generated perk families
 * (both sourced from the merged dataset, src/data/dataset.ts). The join rule
 * itself (`resolveFamily`, `buildPerkJoinMaps`) lives in `./perk-join` — a
 * leaf module shared with perk-cards.ts's registry derivation; this file only
 * adds the mode-keyed dataset lookup on top.
 */

const joinCache = new Map<GameMode, JoinMaps>();

function getJoinMaps(mode: GameMode): JoinMaps {
  let maps = joinCache.get(mode);
  if (!maps) {
    maps = buildPerkJoinMaps(getDataset(mode).perks);
    joinCache.set(mode, maps);
  }
  return maps;
}

/** The generated perk family backing a PerkId, or undefined when unjoined. */
export function getGeneratedPerk(mode: GameMode, perkId: string): GeneratedPerk | undefined {
  const entry = getDataset(mode).perkRegistry[perkId as PerkId];
  if (!entry) return undefined;
  return resolveFamily(perkId, entry.name, getJoinMaps(mode));
}

/** All engine modifiers contributed by a perk loadout (regular or legendary). */
export function getLoadoutModifiers(mode: GameMode, loadouts: PerkLoadout[]): Modifier[] {
  const modifiers: Modifier[] = [];
  for (const loadout of loadouts) {
    const generated = getGeneratedPerk(mode, loadout.perkId);
    if (!generated) continue;
    // The PCRD card is the live shape: its entry count caps the rank, and
    // rankSources maps each card rank to the family PERK rank backing it
    // (identity for all but compressed cards — StarchedGenes' one live rank
    // is the family's rank-2 record). Card-less families read ranks directly.
    const card = generated.card;
    const maxRank = card ? card.rankSources.length : generated.maxRank;
    const rank = Math.max(1, Math.min(loadout.rank, maxRank));
    const familyRank = card ? card.rankSources[rank - 1] : rank;
    modifiers.push(...generated.ranks[familyRank - 1].modifiers);
    const extra = extraPerkModifiers[generated.family]?.[familyRank - 1];
    if (extra) modifiers.push(...extra);
  }
  return modifiers;
}

/** Registry PerkIds with no generated family — review after each extraction run. */
export function getUnjoinedPerkIds(mode: GameMode): string[] {
  const registry = getDataset(mode).perkRegistry;
  return Object.keys(registry).filter(perkId => !getGeneratedPerk(mode, perkId));
}
