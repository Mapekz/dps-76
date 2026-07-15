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

/**
 * True when the picked part is wired to the BPTD Torso slot — the location axis
 * Center Masochist's DmgVsTorso keys off, independent of the damage multiplier
 * (an armored torso can be <1.0, a torso-weakpoint like a Deathclaw's Belly can
 * be >1.0). `undefined` for an unknown race/part (stale URL) so the caller falls
 * back to the legacy mult-derived category, same as `getBodyPartMult`. Pelvis-
 * slot bellies/bodies (UC Abomination, Deathclaw "Body") are a separate BPTD
 * slot and are NOT torso — an unmeasured assumption, see docs/assumptions.md.
 */
export function isTorsoBodyPart(mode: GameMode, raceId: string, partName: string): boolean | undefined {
  const part = getBodyPartRace(mode, raceId)?.parts.find(p => p.name === partName);
  return part ? part.partType === 'Torso' : undefined;
}

/**
 * Enemy-type identifiers the selected target matches for `enemyType`/
 * `enemyTypeAny` conditions: the RACE edid (GetIsRace gates — Assassin's
 * "HumanRace") plus the race's ActorType* keywords (HasKeyword gates —
 * Zealot's "ActorTypeScorched"). Empty when no/unknown race is selected —
 * enemy-type-gated modifiers stay inactive, like every other enemy gate.
 */
export function getEnemyTypeIds(mode: GameMode, raceId: string | null | undefined): readonly string[] {
  if (!raceId) return [];
  const race = getBodyPartRace(mode, raceId);
  if (!race) return [];
  return [race.raceEdid, ...race.keywords];
}

/** Crippable-limb count for a race — the Target section's crippled-limbs input max (0 when `noCripple`; fallback 10 for no/unknown race). */
export function getCrippablePartCount(mode: GameMode, raceId: string | null | undefined): number {
  if (!raceId) return 10;
  const race = getBodyPartRace(mode, raceId);
  if (!race) return 10;
  return race.crippableLimbCount;
}
