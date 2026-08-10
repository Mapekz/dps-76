import type { GeneratedBodyPart, GeneratedBodyPartRace } from '../../src/types/generated';
import { mapPool, resolveKeywordEdids, type EsmSource } from './esm-client';
import { isEnemyKeyword } from './normalize/conditions';
import { CURATED_TARGETS } from './curated-targets';

/**
 * Enemy body-part damage multipliers: RACE → "Body Part Data" BPTD → per-part
 * Data."Damage Mult" (the engine's actual body-part multiplier — 1.5 humanoid
 * head, 1.25 Super Mutant head, 0.15 Mirelurk shell, ...). Feeds the Target
 * section's enemy + body-part picker.
 *
 * The curated target list (CURATED_TARGETS) lives in ./curated-targets.ts —
 * shared with extract-npcs.ts so both extractors key off the exact same row
 * set. Add a row there (not here) and re-run `bun run extract --only
 * bodyparts,npcs` to extend the picker. Rows may name a RACE edid directly or
 * an NPC_ edid (this extractor resolves NPC → Race → BPTD), which lets boss
 * entries that share a race stay distinct in the picker.
 *
 * A curated row's `edid` may name an NPC_ whose BPTD is byte-identical to
 * another row's (a boss reskin with no unique weakpoints) — kept as a
 * separate row anyway so a future per-enemy resist system has something to
 * key off (Super Mutant Firestarter, Scorchbeast Queen). Verified against
 * the 20260710 dump.
 *
 * Two escape hatches for parts/mechanics a BPTD alone can't express (fields
 * on CuratedTarget, this extractor's only consumer):
 * - `conditionPartsOnly` — keep only Actor-Value-tracked parts, dropping any
 *   null-AV part regardless of its damage mult. For bosses whose extra ×N
 *   "weak points" are perk-gated phantoms rather than real BPTD targets (the
 *   Guardian — see below).
 * - `crippleImmune` — the actor holds `NoCripplePerk` (PERK `0x004121E8`,
 *   "Mod Incoming Limb Damage" ×0, no conditions) or the bare `NoCripple`
 *   keyword (KYWD `0x00248D2D`), so it takes zero limb damage and none of its
 *   parts can be crippled. Hand-authored per curated row (not resolved live —
 *   the perk/keyword is frequently template- or NPC_-scoped in ways a
 *   RACE-keyed curated entry can't see), each with a source comment.
 */

interface RawPartData {
  'Damage Mult'?: number;
  'Part Type'?: { name?: string; value?: number };
  Flags?: { flags?: string[] };
  'Actor Value'?: string | null;
}

interface RawPart {
  'Part Name'?: string;
  Data?: RawPartData;
}

/** BPTD part nodes sit at varying depths — collect every object carrying a Part Name. */
function collectRawParts(node: unknown, out: RawPart[] = []): RawPart[] {
  if (Array.isArray(node)) {
    for (const item of node) collectRawParts(item, out);
  } else if (node && typeof node === 'object') {
    if ('Part Name' in node) out.push(node as RawPart);
    for (const value of Object.values(node)) collectRawParts(value, out);
  }
  return out;
}

/** Technical skeleton nodes, never shot at. Real eye weak points (Terror) use Part Type "Eye" too, so it's not skipped here. */
const TECHNICAL_PART_TYPES = new Set(['Root', 'COM', 'Camera', 'Weapon']);

/** A candidate part plus the fields needed to dedup/count by shared limb condition, stripped before returning. */
interface CandidatePart extends GeneratedBodyPart {
  actorValue: string | null;
  partTypeValue: number;
}

function toCandidatePart(raw: RawPart, conditionPartsOnly: boolean): CandidatePart | null {
  const data = raw.Data;
  const name = raw['Part Name'];
  if (!name || !data) return null;
  const partType = data['Part Type']?.name ?? 'Unknown';
  if (TECHNICAL_PART_TYPES.has(partType)) return null;
  const actorValue = data['Actor Value'] ?? null;
  // Round away float noise (0.8999999761581421 → 0.9).
  const dmgMult = Math.round((data['Damage Mult'] ?? 1) * 1000) / 1000;
  // A part matters if the game tracks a limb condition for it (Actor Value —
  // the game-true "this is a real, independently-cripplable part" signal) or
  // it carries a real damage multiplier (armor/weakpoint parts with no
  // tracked condition, e.g. the Ogua's ×0.1 shell). Pure ×1.0, condition-less
  // nodes (Human's Headtracking eye, disjoint foot helper nodes, ...) are
  // picker noise. `conditionPartsOnly` narrows to condition-tracked parts
  // only, for bosses whose extra multiplier-only "parts" are perk-gated
  // phantoms rather than real targets (see CURATED_TARGETS).
  if (actorValue == null && (conditionPartsOnly || dmgMult === 1)) return null;
  // The torso core isn't a "limb" in the crippled-limb sense (Bully's/
  // Tormentor's perCrippledLimb) even when the game tracks its condition.
  const crippable = actorValue != null && partType !== 'Torso';
  return {
    name,
    partType,
    dmgMult,
    crippable,
    actorValue,
    partTypeValue: data['Part Type']?.value ?? 0,
  };
}

export interface BodyPartsNormalized {
  parts: GeneratedBodyPart[];
  /** Distinct crippable Actor Values — the game-true limb count (a shared condition across named zones, e.g. Titan's Chest+Belly, counts once). */
  crippableLimbCount: number;
}

/** Pure BPTD → parts normalization (exposed for fixture tests). */
export function bptdToParts(
  bptdFields: unknown,
  opts: { conditionPartsOnly?: boolean } = {},
): BodyPartsNormalized {
  const candidates = collectRawParts(bptdFields)
    .map((raw) => toCandidatePart(raw, opts.conditionPartsOnly ?? false))
    .filter((p): p is CandidatePart => p !== null);

  // Some BPTDs list one part per skeleton side-node that shares a single
  // in-game limb condition (Mirelurk "Left Legs" ×2, a Scorchbeast's two legs,
  // a foot sharing its leg's condition) — collapse to one row per distinct
  // (condition, multiplier) pair, preferring the lower Part-Type value (the
  // primary limb, e.g. "Left Leg") over a helper node (e.g. "Left Foot") on a tie.
  const byKey = new Map<string, CandidatePart>();
  for (const candidate of candidates) {
    const key = `${candidate.actorValue ?? candidate.name}|${candidate.dmgMult}`;
    const existing = byKey.get(key);
    if (!existing || candidate.partTypeValue < existing.partTypeValue) {
      byKey.set(key, candidate);
    }
  }

  const deduped = [...byKey.values()];
  const crippableLimbCount = new Set(deduped.filter((p) => p.crippable).map((p) => p.actorValue))
    .size;
  const parts: GeneratedBodyPart[] = deduped.map((p) => ({
    name: p.name,
    partType: p.partType,
    dmgMult: p.dmgMult,
    crippable: p.crippable,
  }));
  return { parts, crippableLimbCount };
}

export interface BodyPartsResult {
  races: GeneratedBodyPartRace[];
  /** Curated races the dump no longer resolves — review after each run. */
  unresolved: string[];
}

export async function extractBodyParts(client: EsmSource): Promise<BodyPartsResult> {
  const unresolved: string[] = [];

  const races = await mapPool(
    CURATED_TARGETS,
    8,
    async ({
      edid,
      label,
      category,
      conditionPartsOnly,
      crippleImmune,
    }): Promise<GeneratedBodyPartRace | null> => {
      let record;
      try {
        record = await client.get(edid);
      } catch {
        unresolved.push(`bodyparts: record ${edid} not found`);
        return null;
      }
      // NPC_ rows resolve through the actor's Race first (boss entries); RACE
      // rows use the record directly. NPCs whose race comes only from a
      // template chain land in unresolved rather than silently misresolving.
      let raceRecord = record;
      if (record.header.signature === 'NPC_') {
        const raceFormId = record.fields['Race'] as string | null;
        if (!raceFormId) {
          unresolved.push(`bodyparts: NPC_ ${edid} has no Race field`);
          return null;
        }
        try {
          raceRecord = await client.get(raceFormId);
        } catch {
          unresolved.push(`bodyparts: RACE ${raceFormId} (from NPC_ ${edid}) not found`);
          return null;
        }
      }
      // Enemy-type identity for damage-vs conditions: the RACE's ActorType*
      // keywords (Zealot's/Paranormal HasKeyword gates) — same predicate that
      // classifies enemyType conditions in normalize/conditions.ts. The race
      // edid itself (GetIsRace gates, Assassin's "HumanRace") is stored
      // separately as raceEdid below. Boss NPC_ records are never consulted:
      // no extracted condition references a boss-only keyword.
      const keywords = (await resolveKeywordEdids(client, raceRecord.fields)).filter(
        isEnemyKeyword,
      );

      const bptdFormId = raceRecord.fields['Body Part Data'] as string | null;
      if (!bptdFormId) {
        unresolved.push(`bodyparts: RACE for ${edid} has no Body Part Data`);
        return null;
      }
      const bptd = await client.get(bptdFormId);
      const normalized = bptdToParts(bptd.fields, { conditionPartsOnly });
      if (normalized.parts.length === 0) {
        unresolved.push(`bodyparts: BPTD ${bptdFormId} (${edid}) yielded no parts`);
        return null;
      }
      const noCripple = crippleImmune ?? false;
      const parts = noCripple
        ? normalized.parts.map((p) => ({ ...p, crippable: false }))
        : normalized.parts;
      const crippableLimbCount = noCripple ? 0 : normalized.crippableLimbCount;
      return {
        id: edid,
        formId: raceRecord.header.form_id,
        raceEdid: raceRecord.editor_id,
        keywords,
        name: label,
        bodyPartDataFormId: bptdFormId,
        parts,
        category,
        crippableLimbCount,
        noCripple,
      };
    },
  );

  return { races: races.filter((r): r is GeneratedBodyPartRace => r !== null), unresolved };
}
