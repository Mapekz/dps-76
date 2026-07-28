import type { GeneratedPerk } from '@/types/generated';
import { perkFamilyOverrides } from './overrides/perk-overrides';

/**
 * The PerkId → generated-family join: pure functions of a `GeneratedPerk[]`
 * list plus the registry's name-only entries, with no dataset access. A leaf
 * module on purpose — `perk-modifiers.ts` and `perk-cards.ts` both need the
 * SAME join at two different lifecycle points (read-time modifier lookup vs.
 * build-time registry derivation) and both already sit in the
 * `dataset.ts` merge cycle; having the shared join logic live in either of
 * them made the other's import of it a second edge into that cycle, which is
 * fragile under ESM circular-import initialization order (module-top-level
 * `buildDataset()` calls in dataset.ts can run before a cycle-mate's own
 * imports have finished initializing, depending on which module a test
 * enters through first). Keeping the join here, with zero edges back into
 * `dataset.ts`/`perk-modifiers.ts`/`perk-cards.ts`, sidesteps that instead of
 * relying on load-order luck.
 *
 * Join key: normalized display name — the registry already uses the
 * post-overhaul card names (e.g. PerkId.CenterMasochist ↔ "Center Masochist"
 * on ESM family "Commando"). Misses are patched via perkFamilyOverrides.
 */

export function normalizeName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export interface JoinMaps {
  byFamily: Map<string, GeneratedPerk>;
  byName: Map<string, GeneratedPerk>;
}

/** Builds the family/name join maps over a list of generated perks. */
export function buildPerkJoinMaps(perks: GeneratedPerk[]): JoinMaps {
  const byFamily = new Map<string, GeneratedPerk>();
  const byName = new Map<string, GeneratedPerk>();
  for (const perk of perks) {
    byFamily.set(perk.family, perk);
    const key = normalizeName(perk.name);
    const existing = byName.get(key);
    // Prefer proper perk cards on name collisions (NPC perks share names).
    if (!existing || (!existing.hasCard && perk.hasCard)) byName.set(key, perk);
  }
  return { byFamily, byName };
}

/**
 * The perk-join rule, shared by every join-time consumer: family override
 * first, else normalized-display-name against the join maps. One home so the
 * two lifecycle points that need it — registry derivation, which BUILDS
 * `perkRegistry` and so must take `name` from the raw name-only entry
 * (perk-cards.ts's `derivePerkRegistry`), and generated-modifier lookup,
 * which READS the already-built `perkRegistry` (perk-modifiers.ts's
 * `getGeneratedPerk`) — can't drift out of lockstep with each other.
 */
export function resolveFamily(
  perkId: string,
  name: string,
  joinMaps: JoinMaps,
): GeneratedPerk | undefined {
  const familyOverride = perkFamilyOverrides[perkId];
  if (familyOverride) return joinMaps.byFamily.get(familyOverride);
  return joinMaps.byName.get(normalizeName(name));
}
