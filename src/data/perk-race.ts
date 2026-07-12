import type { GameMode, PerkLoadout } from '@/types';
import { getPerks } from '@/data';
import { getGeneratedPerk } from './perk-modifiers';

/**
 * Race (human/ghoul) restrictions implied by equipped perks. Restrictions are
 * not perk-level metadata — they're `playerIsGhoul` conditions on the perk's
 * ESM modifiers (Gourmand's value:false, Glowing Criticals value:true). A perk
 * is race-locked only when EVERY one of its modifiers agrees: mixed or absent
 * conditions mean the card works for both races (some effects just switch off).
 */

export type RaceRestriction = 'human' | 'ghoul';

/** The race a perk requires, or null when it works for both. */
export function perkRaceRestriction(mode: GameMode, perkId: string): RaceRestriction | null {
  const generated = getGeneratedPerk(mode, perkId);
  if (!generated) return null;
  const modifiers = generated.ranks.flatMap(r => r.modifiers);
  if (modifiers.length === 0) return null;
  let allGhoul = true;
  let allHuman = true;
  for (const mod of modifiers) {
    const gate = mod.conditions.find(c => c.kind === 'playerIsGhoul');
    if (!gate || gate.kind !== 'playerIsGhoul') return null; // an unrestricted modifier → card is dual-race
    if (gate.value) allHuman = false;
    else allGhoul = false;
  }
  if (allGhoul && !allHuman) return 'ghoul';
  if (allHuman && !allGhoul) return 'human';
  return null;
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
