import type { GeneratedBodyPart, GeneratedBodyPartRace } from '../../src/types/generated';
import { EsmClient, mapPool } from './esm-client';

/**
 * Enemy body-part damage multipliers: RACE → "Body Part Data" BPTD → per-part
 * Data."Damage Mult" (the engine's actual body-part multiplier — 1.5 humanoid
 * head, 1.25 Super Mutant head, 0.15 Mirelurk shell, ...). Feeds the Target
 * section's enemy + body-part picker.
 *
 * The race list is CURATED, not discovered: the ESM has hundreds of RACE
 * records (children, dev dupes, subgraph-data stubs) and display names
 * collide, so notable combat enemies are named explicitly. Add a row here and
 * re-run `pnpm extract --only bodyparts` to extend the picker.
 */
const CURATED_RACES: Array<{ edid: string; label: string }> = [
  { edid: 'HumanRace', label: 'Human' },
  { edid: 'FeralGhoulRace', label: 'Feral Ghoul' },
  { edid: 'ScorchedRace', label: 'Scorched' },
  { edid: 'SuperMutantRace', label: 'Super Mutant' },
  { edid: 'SupermutantBehemothRace', label: 'Behemoth' },
  { edid: 'MoleMinerRace', label: 'Mole Miner' },
  { edid: 'ViciousDogRace', label: 'Wild Mongrel' },
  { edid: 'WendigoRace', label: 'Wendigo' },
  { edid: 'WendigoColossusRace', label: 'Wendigo Colossus' },
  { edid: 'YaoGuaiRace', label: 'Yao Guai' },
  { edid: 'DeathclawRace', label: 'Deathclaw' },
  { edid: 'MirelurkRace', label: 'Mirelurk' },
  { edid: 'MirelurkHunterRace', label: 'Mirelurk Hunter' },
  { edid: 'MirelurkKingRace', label: 'Mirelurk King' },
  { edid: 'MirelurkQueenRace', label: 'Mirelurk Queen' },
  { edid: 'MothmanRace', label: 'Mothman' },
  // The Scorchbeast Queen has no separate RACE — she shares ScorchBeastRace.
  { edid: 'ScorchBeastRace', label: 'Scorchbeast' },
  { edid: 'RadScorpionRace', label: 'Radscorpion' },
  { edid: 'SnallyGasterRace', label: 'Snallygaster' },
  { edid: 'GraftonMonsterRace', label: 'Grafton Monster' },
  { edid: 'SheepsquatchRace', label: 'Sheepsquatch' },
  { edid: 'MegaSlothRace', label: 'Megasloth' },
  { edid: 'HoneyBeastRace', label: 'Honey Beast' },
  { edid: 'DLC03_AnglerRace', label: 'Angler' },
  { edid: 'DLC03_FogCrawlerRace', label: 'Fog Crawler' },
  { edid: 'DLC03_GulperRace', label: 'Gulper' },
  { edid: 'FlatwoodsMonsterRace', label: 'Flatwoods Monster' },
  { edid: 'BlueDevilRace', label: 'Blue Devil' },
  { edid: 'OguaRace', label: 'Ogua' },
  { edid: 'UltraciteAbominationRace', label: 'Ultracite Abomination' },
  { edid: 'AssaultronRace', label: 'Assaultron' },
  { edid: 'ProtectronRace', label: 'Protectron' },
  { edid: 'SentryBotRace', label: 'Sentry Bot' },
  { edid: 'LiberatorRace', label: 'Liberator' },
  { edid: 'StormBossRace', label: 'Storm Goliath' },
];

interface RawPartData {
  'Damage Mult'?: number;
  'Part Type'?: { name?: string };
  Flags?: { flags?: string[] };
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

/** Technical skeleton nodes, never shot at. */
const SKIPPED_PART_TYPES = new Set(['Root', 'COM', 'Camera', 'Eye', 'Weapon']);

function toGeneratedPart(raw: RawPart): GeneratedBodyPart | null {
  const data = raw.Data;
  const name = raw['Part Name'];
  if (!name || !data) return null;
  const partType = data['Part Type']?.name ?? 'Unknown';
  if (SKIPPED_PART_TYPES.has(partType)) return null;
  const flags = data.Flags?.flags ?? [];
  const crippable = flags.includes('On Cripple') || flags.includes('Explodable');
  // Round away float noise (0.8999999761581421 → 0.9).
  const dmgMult = Math.round((data['Damage Mult'] ?? 1) * 1000) / 1000;
  // Non-crippable parts at ×1.0 are damage-identical to the torso (helper
  // foot nodes &c.) — noise in the picker, no effect on any mechanic.
  if (!crippable && dmgMult === 1) return null;
  return { name, partType, dmgMult, crippable };
}

/** Pure BPTD → parts normalization (exposed for fixture tests). */
export function bptdToParts(bptdFields: unknown): GeneratedBodyPart[] {
  const seen = new Set<string>();
  return collectRawParts(bptdFields)
    .map(toGeneratedPart)
    .filter((p): p is GeneratedBodyPart => p !== null)
    // Some BPTDs list a part per skeleton side-node (Mirelurk "Left Legs" ×2) — one row per distinct part.
    .filter(p => {
      const key = `${p.name}|${p.dmgMult}|${p.crippable}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
}

export interface BodyPartsResult {
  races: GeneratedBodyPartRace[];
  /** Curated races the dump no longer resolves — review after each run. */
  unresolved: string[];
}

export async function extractBodyParts(client: EsmClient): Promise<BodyPartsResult> {
  const unresolved: string[] = [];

  const races = await mapPool(CURATED_RACES, 8, async ({ edid, label }): Promise<GeneratedBodyPartRace | null> => {
    let raceRecord;
    try {
      raceRecord = await client.get(edid);
    } catch {
      unresolved.push(`bodyparts: RACE ${edid} not found`);
      return null;
    }
    const bptdFormId = raceRecord.fields['Body Part Data'] as string | null;
    if (!bptdFormId) {
      unresolved.push(`bodyparts: RACE ${edid} has no Body Part Data`);
      return null;
    }
    const bptd = await client.get(bptdFormId);
    const parts = bptdToParts(bptd.fields);
    if (parts.length === 0) {
      unresolved.push(`bodyparts: BPTD ${bptdFormId} (${edid}) yielded no parts`);
      return null;
    }
    return {
      id: edid,
      formId: raceRecord.header.form_id,
      name: label,
      bodyPartDataFormId: bptdFormId,
      parts,
    };
  });

  return { races: races.filter((r): r is GeneratedBodyPartRace => r !== null), unresolved };
}
