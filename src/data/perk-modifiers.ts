import type { GameMode, PerkId, PerkLoadout } from '@/types';
import type { GeneratedPerk } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';
import { hasAnyEngineEffect } from '@/types/modifiers';
import { getDataset } from './dataset';
import { extraPerkModifiers, perkForceEffectivePerkIds } from './overrides/perk-overrides';
import { LEGENDARY_SPECIAL_PERKS } from './perk-budget';
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

/**
 * The generated family + effective family rank behind one loadout entry.
 * The PCRD card is the live shape: its entry count caps the rank, and
 * rankSources maps each card rank to the family PERK rank backing it
 * (identity for all but compressed cards — StarchedGenes' one live rank
 * is the family's rank-2 record). Card-less families read ranks directly.
 */
function resolveLoadoutRank(
  mode: GameMode,
  loadout: PerkLoadout
): { generated: GeneratedPerk; familyRank: number } | undefined {
  const generated = getGeneratedPerk(mode, loadout.perkId);
  if (!generated) return undefined;
  const card = generated.card;
  const maxRank = card ? card.rankSources.length : generated.maxRank;
  const rank = Math.max(1, Math.min(loadout.rank, maxRank));
  const familyRank = card ? card.rankSources[rank - 1] : rank;
  return { generated, familyRank };
}

/** All engine modifiers contributed by a perk loadout (regular or legendary). */
export function getLoadoutModifiers(mode: GameMode, loadouts: PerkLoadout[]): Modifier[] {
  const modifiers: Modifier[] = [];
  for (const loadout of loadouts) {
    const resolved = resolveLoadoutRank(mode, loadout);
    if (!resolved) continue;
    const { generated, familyRank } = resolved;
    modifiers.push(...generated.ranks[familyRank - 1].modifiers);
    const extra = extraPerkModifiers[generated.family]?.[familyRank - 1];
    if (extra) modifiers.push(...extra);
  }
  return modifiers;
}

/**
 * Family editor-id → highest owned rank across a merged regular+legendary
 * loadout (legendary families are `Legendary*`-namespaced, so one map is
 * collision-free). Feeds PlayerConditions.equippedPerkRanks — the runtime
 * input of `perkFamilyRank` conditions (cross-family HasPerk gates, e.g.
 * Lock and Load → Bullet Storm's reload speed).
 */
export function getEquippedPerkFamilyRanks(mode: GameMode, loadouts: PerkLoadout[]): Record<string, number> {
  const ranks: Record<string, number> = {};
  for (const loadout of loadouts) {
    const resolved = resolveLoadoutRank(mode, loadout);
    if (!resolved) continue;
    const { generated, familyRank } = resolved;
    ranks[generated.family] = Math.max(ranks[generated.family] ?? 0, familyRank);
  }
  return ranks;
}

/** Registry PerkIds with no generated family — review after each extraction run. */
export function getUnjoinedPerkIds(mode: GameMode): string[] {
  const registry = getDataset(mode).perkRegistry;
  return Object.keys(registry).filter(perkId => !getGeneratedPerk(mode, perkId));
}

/**
 * True iff any rank of this perk contributes at least one engine-effective
 * modifier — the perk-picker analogue of the OMOD picker's 'no effect yet'
 * badge (`modifierHasEngineEffect`, @/types/modifiers). Unions across every
 * card rank (not just rank 1) so a perk whose effect only appears at a higher
 * rank isn't badged inert; a card-less family reads its own ranks directly,
 * matching `resolveLoadoutRank`'s clamp. Unjoined perks (no generated family)
 * have nothing to check and read as no-effect.
 */
export function perkHasEngineEffect(mode: GameMode, perkId: string): boolean {
  if (perkForceEffectivePerkIds.has(perkId)) return true;
  // Legendary SPECIAL cards act through the perk-budget baseSpecial pathway
  // (derivePerkBudget → derivePlayerStats), not the modifier IR — their PERK
  // records extract with zero modifiers by design (docs/assumptions.md
  // "SPECIAL & perk budget").
  if (perkId in LEGENDARY_SPECIAL_PERKS) return true;
  const generated = getGeneratedPerk(mode, perkId);
  if (!generated) return false;
  const maxRank = generated.card ? generated.card.rankSources.length : generated.maxRank;
  for (let rank = 1; rank <= maxRank; rank++) {
    const resolved = resolveLoadoutRank(mode, { perkId, rank });
    if (!resolved) continue;
    const { generated: family, familyRank } = resolved;
    const modifiers = family.ranks[familyRank - 1].modifiers;
    const extra = extraPerkModifiers[family.family]?.[familyRank - 1] ?? [];
    if (hasAnyEngineEffect(modifiers) || hasAnyEngineEffect(extra)) return true;
  }
  return false;
}
