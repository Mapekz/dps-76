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
 *
 * Two escape hatches for parts/mechanics a BPTD alone can't express:
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
const CURATED_TARGETS: Array<{
  edid: string;
  label: string;
  category: BodyPartRaceCategory;
  /** Keep only Actor-Value-tracked parts (drop perk-gated phantom weak points). */
  conditionPartsOnly?: boolean;
  /** Actor takes zero limb damage — force every part non-crippable. */
  crippleImmune?: boolean;
}> = [
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
  // NoCripple KYWD 0x00248D2D sits on the NPC_ EncBlueDevil (0x006A063D),
  // not this RACE — hand-flagged since a RACE-keyed curated row can't see it.
  { edid: 'BlueDevilRace', label: 'Blue Devil', category: 'standard', crippleImmune: true },
  { edid: 'OguaRace', label: 'Ogua', category: 'standard' },
  // In-game name is "Ultracite Titan" (edid kept — persisted as EnemyConditions.targetRace).
  { edid: 'UltraciteAbominationRace', label: 'Ultracite Titan', category: 'standard' },
  { edid: 'AssaultronRace', label: 'Assaultron', category: 'standard' },
  { edid: 'ProtectronRace', label: 'Protectron', category: 'standard' },
  { edid: 'SentryBotRace', label: 'Sentry Bot', category: 'standard' },
  { edid: 'LiberatorRace', label: 'Liberator', category: 'standard' },
  { edid: 'StormBossRace', label: 'Storm Goliath', category: 'standard' },
  // NoCripplePerk 0x004121E8 directly on the boss NPC_ EncBigfootTemplate.
  { edid: 'BigfootRace', label: 'Bigfoot', category: 'standard', crippleImmune: true },
  // NoCripplePerk 0x004121E8 directly on the NPC_ (not the shared DeathclawRace,
  // so the plain "Deathclaw" entry above stays crippable).
  { edid: 'Burn_E01_EncDeathclawMatriarch', label: 'Deathclaw Matriarch', category: 'standard', crippleImmune: true },

  // Gleaming Depths raid (RD01_) encounter bosses. The Ultragenetic Mole
  // Miner Stalker is deliberately absent — it takes no damage. The Terror's
  // tail/body NPCs have their own races, but every part there is a null-AV
  // ×1.0 (the head race carries the real weakpoints — eyes + armor plates),
  // so only the head entry is listed. The Guardian's torso and 5 of its 6
  // "limbs" are gated by the actor perk RD01_Enc01_PreventLimbDamage_Perk
  // (0x0077459D, EP "Mod Body Part Damage Mult" ×0 while its shield is up) —
  // only its shield generator and torso carry a real Actor Value, so
  // `conditionPartsOnly` drops the 5 phantom ×3 "weak points" the BPTD lists.
  { edid: 'RD01_Enc01_GuardianBot', label: 'EN06 Guardian', category: 'raid', conditionPartsOnly: true },
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
  return { name, partType, dmgMult, crippable, actorValue, partTypeValue: data['Part Type']?.value ?? 0 };
}

export interface BodyPartsNormalized {
  parts: GeneratedBodyPart[];
  /** Distinct crippable Actor Values — the game-true limb count (a shared condition across named zones, e.g. Titan's Chest+Belly, counts once). */
  crippableLimbCount: number;
}

/** Pure BPTD → parts normalization (exposed for fixture tests). */
export function bptdToParts(bptdFields: unknown, opts: { conditionPartsOnly?: boolean } = {}): BodyPartsNormalized {
  const candidates = collectRawParts(bptdFields)
    .map(raw => toCandidatePart(raw, opts.conditionPartsOnly ?? false))
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
  const crippableLimbCount = new Set(deduped.filter(p => p.crippable).map(p => p.actorValue)).size;
  const parts: GeneratedBodyPart[] = deduped.map(p => ({
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

export async function extractBodyParts(client: EsmClient): Promise<BodyPartsResult> {
  const unresolved: string[] = [];

  const races = await mapPool(
    CURATED_TARGETS,
    8,
    async ({ edid, label, category, conditionPartsOnly, crippleImmune }): Promise<GeneratedBodyPartRace | null> => {
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
      const normalized = bptdToParts(bptd.fields, { conditionPartsOnly });
      if (normalized.parts.length === 0) {
        unresolved.push(`bodyparts: BPTD ${bptdFormId} (${edid}) yielded no parts`);
        return null;
      }
      const noCripple = crippleImmune ?? false;
      const parts = noCripple ? normalized.parts.map(p => ({ ...p, crippable: false })) : normalized.parts;
      const crippableLimbCount = noCripple ? 0 : normalized.crippableLimbCount;
      return {
        id: edid,
        formId: raceRecord.header.form_id,
        name: label,
        bodyPartDataFormId: bptdFormId,
        parts,
        category,
        crippableLimbCount,
        noCripple,
      };
    }
  );

  return { races: races.filter((r): r is GeneratedBodyPartRace => r !== null), unresolved };
}
