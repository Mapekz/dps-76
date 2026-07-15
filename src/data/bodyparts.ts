import type { GameMode } from '@/types';
import type { GeneratedBodyPart, GeneratedBodyPartRace } from '@/types/generated';
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

/**
 * The neutral "default" body part for a race — the ×1.00 part the Target
 * picker/chip fall back to when not aiming. Prefer the torso when it's ×1.00
 * (Human & co.); otherwise the alphabetically-first ×1.00 part (Super Mutant's
 * limbs, EN06's Ultragenetic Shield System). undefined only for no/unknown race
 * or a race with no ×1.00 part (none exist in current data — all 83 have one).
 */
export function getDefaultBodyPart(
  mode: GameMode,
  raceId: string | null | undefined
): GeneratedBodyPart | undefined {
  if (!raceId) return undefined;
  const race = getBodyPartRace(mode, raceId);
  if (!race) return undefined;
  const ones = race.parts.filter(p => p.dmgMult === 1.0);
  const torso = ones.find(p => p.partType === 'Torso');
  if (torso) return torso;
  return [...ones].sort((a, b) => a.name.localeCompare(b.name))[0];
}

export interface ResolvedTargetBodyPart {
  /** BPTD part name (e.g. "Head"), or 'Custom' when no race/part is picked. */
  name: string;
  /** Effective body-part damage multiplier: the picked part's dmgMult, or the custom fallback. */
  mult: number;
  /**
   * True when the picked part is wired to the BPTD Torso slot — the location
   * axis Center Masochist's DmgVsTorso keys off, independent of `mult` (an
   * armored torso can be <1.0, a torso-weakpoint like a Deathclaw's Belly can
   * be >1.0). `undefined` when no race/part is picked (or the id is stale —
   * unknown race/part), so the caller falls back to the legacy mult-derived
   * category. Pelvis-slot bellies/bodies (UC Abomination, Deathclaw "Body")
   * are a separate BPTD slot and are NOT torso — an unmeasured assumption,
   * see docs/assumptions.md.
   */
  isTorso: boolean | undefined;
  /** True when falling back to `customMult` — no race+part was resolved. */
  isCustom: boolean;
}

/**
 * Resolves the Target section's race+part pick (or the custom fallback
 * multiplier) to one effective mult + location axis. Single source of truth
 * for this precedence — consumed by `resolveLoadout` and every UI readout of
 * the current target body part.
 */
export function resolveTargetBodyPart(
  mode: GameMode,
  raceId: string | null | undefined,
  partName: string | null | undefined,
  customMult: number
): ResolvedTargetBodyPart {
  const part = raceId && partName ? getBodyPartRace(mode, raceId)?.parts.find(p => p.name === partName) : undefined;
  if (part) {
    return { name: part.name, mult: part.dmgMult, isTorso: part.partType === 'Torso', isCustom: false };
  }
  return { name: 'Custom', mult: customMult, isTorso: undefined, isCustom: true };
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
