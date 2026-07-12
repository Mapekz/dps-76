import type { GameMode } from '@/types';
import type { GeneratedBodyPartRace } from '@/types/generated';
import { getDataset } from './dataset';

/**
 * Enemy body-part damage multipliers (BPTD-extracted — bodyparts.json).
 * Powers the Target section's enemy + body-part picker and the derived
 * body-part multiplier in resolveLoadout.
 */

export function getBodyPartRaces(mode: GameMode): GeneratedBodyPartRace[] {
  return getDataset(mode).bodyPartRaces;
}

export function getBodyPartRace(mode: GameMode, raceId: string): GeneratedBodyPartRace | undefined {
  return getDataset(mode).bodyPartRaces.find(r => r.id === raceId);
}

/** The BPTD damage mult for a picked race + part, or undefined when either id is unknown (stale URL). */
export function getBodyPartMult(mode: GameMode, raceId: string, partName: string): number | undefined {
  return getBodyPartRace(mode, raceId)?.parts.find(p => p.name === partName)?.dmgMult;
}

/** Crippable-part count for a race — the Target section's crippled-limbs input max (fallback 10). */
export function getCrippablePartCount(mode: GameMode, raceId: string | null | undefined): number {
  if (!raceId) return 10;
  const race = getBodyPartRace(mode, raceId);
  if (!race) return 10;
  return race.parts.filter(p => p.crippable).length;
}
