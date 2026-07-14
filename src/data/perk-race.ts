import type { GameMode, PerkLoadout } from '@/types';
import { getPerks } from '@/data';

/**
 * Race (human/ghoul) restrictions on perk cards, straight from the ESM PCRD
 * "Race Restriction" enum (`Perk.raceRestriction`, joined in
 * `src/data/perk-cards.ts`). This is perk-level card metadata, not something
 * derived from `playerIsGhoul` modifier conditions — most race-locked cards
 * (Quick Hands, Wild West Hands, both legendary ActionDiet/WhatRads/FeralRage
 * cards, ...) carry no such condition on their modifiers at all, so scanning
 * modifiers would miss them.
 */

export type RaceRestriction = 'human' | 'ghoul';

/** The race a perk requires, or null when it works for both. */
export function perkRaceRestriction(mode: GameMode, perkId: string): RaceRestriction | null {
  return getPerks(mode)[perkId as keyof ReturnType<typeof getPerks>]?.raceRestriction ?? null;
}

export interface RaceLock {
  /** The race the equipped perks force, or null when unconstrained. */
  locked: RaceRestriction | null;
  /** Display names of the perks imposing the lock. */
  lockedBy: string[];
  /** Both a human-only and a ghoul-only perk are equipped (imports can do this). */
  conflict: boolean;
}

/** The race lock implied by an equipped perk loadout (regular + legendary). */
export function equippedRaceLock(mode: GameMode, perks: PerkLoadout[], legendaryPerks: PerkLoadout[]): RaceLock {
  const registry = getPerks(mode);
  const humanBy: string[] = [];
  const ghoulBy: string[] = [];
  for (const { perkId } of [...perks, ...legendaryPerks]) {
    const restriction = perkRaceRestriction(mode, perkId);
    if (!restriction) continue;
    const name = registry[perkId as keyof typeof registry]?.name ?? perkId;
    (restriction === 'human' ? humanBy : ghoulBy).push(name);
  }
  if (humanBy.length > 0 && ghoulBy.length > 0) {
    return { locked: null, lockedBy: [...humanBy, ...ghoulBy], conflict: true };
  }
  if (humanBy.length > 0) return { locked: 'human', lockedBy: humanBy, conflict: false };
  if (ghoulBy.length > 0) return { locked: 'ghoul', lockedBy: ghoulBy, conflict: false };
  return { locked: null, lockedBy: [], conflict: false };
}

/** Display names of equipped perks a switch to `targetIsGhoul` would remove. */
export function wrongRacePerks(
  mode: GameMode,
  perks: PerkLoadout[],
  legendaryPerks: PerkLoadout[],
  targetIsGhoul: boolean
): string[] {
  const registry = getPerks(mode);
  const target: RaceRestriction = targetIsGhoul ? 'ghoul' : 'human';
  return [...perks, ...legendaryPerks]
    .filter(({ perkId }) => {
      const restriction = perkRaceRestriction(mode, perkId);
      return restriction !== null && restriction !== target;
    })
    .map(({ perkId }) => registry[perkId as keyof typeof registry]?.name ?? perkId);
}
