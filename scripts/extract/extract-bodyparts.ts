import type { BodyPartRaceCategory, GeneratedBodyPart, GeneratedBodyPartRace } from '../../src/types/generated';
import { EsmClient, mapPool } from './esm-client';

/**
 * Enemy body-part damage multipliers: RACE → "Body Part Data" BPTD → per-part
 * Data."Damage Mult" (the engine's actual body-part multiplier — 1.5 humanoid
 * head, 1.25 Super Mutant head, 0.15 Mirelurk shell, ...). Feeds the Target
 * section's enemy + body-part picker.
 *
 * The target list is CURATED, not discovered: the ESM has hundreds of RACE
 * records (children, dev dupes, subgraph-data stubs) and display names
 * collide, so notable combat enemies are named explicitly. Rows may name a
 * RACE edid directly or an NPC_ edid (the extractor resolves NPC → Race →
 * BPTD), which lets boss entries that share a race stay distinct in the
 * picker. Labels are in-game FULL names verified against the 20260702 dump.
 * Add a row here and re-run `pnpm extract --only bodyparts` to extend the
 * picker.
 */
const CURATED_TARGETS: Array<{ edid: string; label: string; category: BodyPartRaceCategory }> = [
  { edid: 'HumanRace', label: 'Human', category: 'standard' },
  { edid: 'FeralGhoulRace', label: 'Feral Ghoul', category: 'standard' },
  { edid: 'ScorchedRace', label: 'Scorched', category: 'standard' },
  { edid: 'SuperMutantRace', label: 'Super Mutant', category: 'standard' },
  { edid: 'SupermutantBehemothRace', label: 'Behemoth', category: 'standard' },
  { edid: 'MoleMinerRace', label: 'Mole Miner', category: 'standard' },
  { edid: 'ViciousDogRace', label: 'Wild Mongrel', category: 'standard' },
  { edid: 'WendigoRace', label: 'Wendigo', category: 'standard' },
  { edid: 'WendigoColossusRace', label: 'Wendigo Colossus', category: 'standard' },
  { edid: 'YaoGuaiRace', label: 'Yao Guai', category: 'standard' },
  { edid: 'DeathclawRace', label: 'Deathclaw', category: 'standard' },
  { edid: 'MirelurkRace', label: 'Mirelurk', category: 'standard' },
  { edid: 'MirelurkHunterRace', label: 'Mirelurk Hunter', category: 'standard' },
  { edid: 'MirelurkKingRace', label: 'Mirelurk King', category: 'standard' },
  { edid: 'MirelurkQueenRace', label: 'Mirelurk Queen', category: 'standard' },
  { edid: 'MothmanRace', label: 'Mothman', category: 'standard' },
  // The Scorchbeast Queen has no separate RACE — she shares ScorchBeastRace.
  { edid: 'ScorchBeastRace', label: 'Scorchbeast', category: 'standard' },
  { edid: 'RadScorpionRace', label: 'Radscorpion', category: 'standard' },
  { edid: 'SnallyGasterRace', label: 'Snallygaster', category: 'standard' },
  { edid: 'GraftonMonsterRace', label: 'Grafton Monster', category: 'standard' },
  { edid: 'SheepsquatchRace', label: 'Sheepsquatch', category: 'standard' },
  { edid: 'MegaSlothRace', label: 'Megasloth', category: 'standard' },
  { edid: 'HoneyBeastRace', label: 'Honey Beast', category: 'standard' },
  { edid: 'DLC03_AnglerRace', label: 'Angler', category: 'standard' },
  { edid: 'DLC03_FogCrawlerRace', label: 'Fog Crawler', category: 'standard' },
  { edid: 'DLC03_GulperRace', label: 'Gulper', category: 'standard' },
  { edid: 'FlatwoodsMonsterRace', label: 'Flatwoods Monster', category: 'standard' },
  { edid: 'BlueDevilRace', label: 'Blue Devil', category: 'standard' },
  { edid: 'OguaRace', label: 'Ogua', category: 'standard' },
  { edid: 'UltraciteAbominationRace', label: 'Ultracite Abomination', category: 'standard' },
  { edid: 'AssaultronRace', label: 'Assaultron', category: 'standard' },
  { edid: 'ProtectronRace', label: 'Protectron', category: 'standard' },
  { edid: 'SentryBotRace', label: 'Sentry Bot', category: 'standard' },
  { edid: 'LiberatorRace', label: 'Liberator', category: 'standard' },
  { edid: 'StormBossRace', label: 'Storm Goliath', category: 'standard' },

  // Gleaming Depths raid (RD01_) encounter bosses. The Ultragenetic Mole
  // Miner Stalker is deliberately absent — it takes no damage. The Terror's
  // tail NPC has its own race but every tail part is ×1.0 (the head race
  // carries the weakpoints), so only the head entry is listed.
  { edid: 'RD01_Enc01_GuardianBot', label: 'EN06 Guardian', category: 'raid' },
  { edid: 'RD01_Enc04_Grenadier', label: 'Epsilon Squad - Lynx', category: 'raid' },
  { edid: 'RD01_Enc04_Assassin', label: 'Epsilon Squad - Vulture', category: 'raid' },
  { edid: 'RD01_Enc04_Brute', label: 'Epsilon Squad - Bloodhound', category: 'raid' },
  { edid: 'RD01_Enc06_ScorchtongueHead', label: 'Ultracite Terror', category: 'raid' },

  // Infestation event bosses (HTO_): tiers T1–T5 share name/race — T5 listed.
  { edid: 'HTO_LvlBloodEagle_Boss_T5', label: 'Blood Eagle Destroyer', category: 'infestation' },
  { edid: 'HTO_LvlPRCGhoul_Boss_T5', label: 'Communist Commissar', category: 'infestation' },
  { edid: 'HTO_LvlCultist_Boss_T5', label: 'Cultist Prophet', category: 'infestation' },
  { edid: 'HTO_LvlMoleMiner_Boss_T5', label: 'Mole Miner Juggernaut', category: 'infestation' },
  { edid: 'HTO_LvlSuperMutant_Boss_T5', label: 'Super Mutant Primus', category: 'infestation' },
  { edid: 'HTO_LvlScorched_Boss_T5', label: 'Scorched Exterminator', category: 'infestation' },
  { edid: 'HTO_LvlRobot_Boss_T5', label: 'Assaultron Intimidator', category: 'infestation' },

  // Head Hunt bounty bosses (Burning Springs, Burn_BountyTarget_BIG_*): all
  // 30 named targets; the two _Template rows and zzz*/SDOW_* records are
  // placeholders/seasonal-test, not listed.
  { edid: 'Burn_BountyTarget_BIG_Death', label: 'The Pale Horseman', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_War', label: 'The Red Rider', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Pestilence', label: 'The White Horseman', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Famine', label: 'The Black Horseman', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Granny', label: 'Granny Dolores', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Astronaut', label: 'The Space Ranger', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_AntiGhoul', label: 'Cletus Brimstone', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Irradiated', label: 'Irene The Irradiated', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Pilot', label: 'The Ace', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_NukaQueen', label: 'Anna The Nuka-Queen', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_QuackDoctor', label: 'The Malpractitioner', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Patriot', label: 'Corporal Jane', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Foreman', label: 'The Foreman', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Researcher', label: 'The Chief Researcher', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_ScoutLeader', label: 'Scout Leader Karen', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_BarryTone', label: 'Ragtime Randy', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Devil', label: 'The Devil of Defiance', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Rich', label: 'Baron Boris Wazie', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Gambler', label: 'Vito "The Vic" Bronco', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Mechanist', label: 'Tincan Toni', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Fisherman', label: 'Amadi the Piranha', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_RoboBrain', label: 'Chief Engineer Lewis', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Sniper', label: 'Charlie Half-Cocked', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Boxer', label: 'Becca The Heavyweight', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Gunslinger', label: 'Cowgirl Janine', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_BigGun', label: 'Richie Finesse', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Crusher', label: 'Gentle Gary', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Commie', label: 'The Proletariat Punisher', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Abraxo', label: 'The Cleaner', category: 'headhunt' },
  { edid: 'Burn_BountyTarget_BIG_Hunter', label: 'Colt the Bolt', category: 'headhunt' },
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

  const races = await mapPool(CURATED_TARGETS, 8, async ({ edid, label, category }): Promise<GeneratedBodyPartRace | null> => {
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
    const bptdFormId = raceRecord.fields['Body Part Data'] as string | null;
    if (!bptdFormId) {
      unresolved.push(`bodyparts: RACE for ${edid} has no Body Part Data`);
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
      category,
    };
  });

  return { races: races.filter((r): r is GeneratedBodyPartRace => r !== null), unresolved };
}
