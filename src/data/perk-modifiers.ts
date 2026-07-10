import type { GameMode, PerkId, PerkLoadout } from '@/types';
import type { GeneratedPerk } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';
import { getDataset } from './dataset';
import { extraPerkModifiers, perkFamilyOverrides } from './overrides/perk-overrides';

/**
 * Bridges the PerkId registry (N&D-aligned) to the ESM-generated perk families
 * (both sourced from the merged dataset, src/data/dataset.ts).
 *
 * Join key: normalized display name — the registry already uses the
 * post-overhaul card names (e.g. PerkId.CenterMasochist ↔ "Center Masochist"
 * on ESM family "Commando"). Misses are patched via perkFamilyOverrides.
 */

function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

interface JoinMaps {
  byFamily: Map<string, GeneratedPerk>;
  byName: Map<string, GeneratedPerk>;
}

const joinCache = new Map<GameMode, JoinMaps>();

function getJoinMaps(mode: GameMode): JoinMaps {
  let maps = joinCache.get(mode);
  if (!maps) {
    const byFamily = new Map<string, GeneratedPerk>();
    const byName = new Map<string, GeneratedPerk>();
    for (const perk of getDataset(mode).perks) {
      byFamily.set(perk.family, perk);
      const key = normalizeName(perk.name);
      const existing = byName.get(key);
      // Prefer proper perk cards on name collisions (NPC perks share names).
      if (!existing || (!existing.hasCard && perk.hasCard)) byName.set(key, perk);
    }
    maps = { byFamily, byName };
    joinCache.set(mode, maps);
  }
  return maps;
}

/** The generated perk family backing a PerkId, or undefined when unjoined. */
export function getGeneratedPerk(mode: GameMode, perkId: string): GeneratedPerk | undefined {
  const maps = getJoinMaps(mode);
  const familyOverride = perkFamilyOverrides[perkId];
  if (familyOverride) return maps.byFamily.get(familyOverride);
  const entry = getDataset(mode).perkRegistry[perkId as PerkId];
  if (!entry) return undefined;
  return maps.byName.get(normalizeName(entry.name));
}

/** All engine modifiers contributed by a perk loadout (regular or legendary). */
export function getLoadoutModifiers(mode: GameMode, loadouts: PerkLoadout[]): Modifier[] {
  const modifiers: Modifier[] = [];
  for (const loadout of loadouts) {
    const generated = getGeneratedPerk(mode, loadout.perkId);
    if (!generated) continue;
    const rank = Math.max(1, Math.min(loadout.rank, generated.maxRank));
    modifiers.push(...generated.ranks[rank - 1].modifiers);
    const extra = extraPerkModifiers[generated.family]?.[rank - 1];
    if (extra) modifiers.push(...extra);
  }
  return modifiers;
}

/** Registry PerkIds with no generated family — review after each extraction run. */
export function getUnjoinedPerkIds(mode: GameMode): string[] {
  const registry = getDataset(mode).perkRegistry;
  return Object.keys(registry).filter(perkId => !getGeneratedPerk(mode, perkId));
}
