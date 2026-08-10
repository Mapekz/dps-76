import { keywordFormIds, type EsmRecord, type EsmSource } from './esm-client';
import { CURATED_TARGETS } from './curated-targets';
import { tierFromEdid } from './extract-curvetables';
import type {
  GeneratedNpc,
  GeneratedNpcDamageType,
  GeneratedNpcResist,
} from '../../src/types/generated';

/**
 * Per-curated-target NPC stats (Health + 6 resists + level-scaling window),
 * joined to CURATED_TARGETS/GeneratedBodyPartRace by `id`. Phase 2 spike
 * (scratchpad/phase2-curve-spike.md, 2026-07-18) proved the shape:
 * `NPC_.Properties[]` rows are `{Actor Value, Value, Curve Table?}`; the flat
 * `Value` is the real number when no Curve Table is set, otherwise it's a
 * curve-scaled stat evaluated at the actor's own effective level (clamp of
 * the nearby player's level to `Actor Scaling Info.{Level Min/Max
 * Global}`).
 *
 * NOT proven by the spike (found during this extractor's build, verified
 * against ~40 sampled records): resist AVs (DamageResist/EnergyResist/
 * Fire/Frost/Poison/RadResist) frequently live on the RACE record instead of
 * repeating on every NPC_ of that race (e.g. `EncMirelurkCrab_Template` has
 * zero resist Properties of its own — they're all on `MirelurkRace`), while
 * Health (0x2D4) is NPC_-only and never appears on a RACE record in any
 * sample. This extractor therefore merges RACE Properties as the fallback
 * layer, NPC_ Properties as the override, per AV — the general
 * "more-specific-record-wins" Bethesda convention, not previously documented
 * for this record pair. `docs/assumptions.md` carries a terse citation.
 *
 * Flat-wins tie-break: when a Properties row has BOTH a nonzero flat `Value`
 * AND a Curve Table (rare — `RD01_Enc06_ScorchtongueHead`'s Health is a flat
 * 500000 despite carrying a Tier59 Curve Table ref), the flat value wins and
 * the curve is ignored, mirroring the MGEF "flat-wins" GLOB-magnitude
 * convention documented in the esm-cli skill.
 */

/**
 * FLST "Actor having any of these will never spawn epic" (esm-walk
 * 2026-07-18, coordinator follow-up — see docs/assumptions.md "Creature stat
 * curves & NPC extraction"). Resolved once per run, not hardcoded, so a
 * future ESM update to the member list is picked up automatically.
 */
const EPIC_CREATURE_DISALLOWED_KEYWORDS_FLST = '0x004FC5B7';

/** Resolve the epic-creature disallow-keyword FLST to a formId set; empty (fail-open to `epicAllowed: true`) on any error. */
async function resolveEpicDisallowedKeywords(
  client: EsmSource,
  unresolved: string[],
): Promise<Set<string>> {
  try {
    const flst = await client.get(EPIC_CREATURE_DISALLOWED_KEYWORDS_FLST);
    const ids = (flst.fields['FormIDs'] as Array<{ FormID?: string }> | undefined) ?? [];
    return new Set(ids.map((f) => f.FormID).filter((id): id is string => !!id));
  } catch (err) {
    unresolved.push(
      `npcs: EpicCreatureDisallowedKeywords FLST ${EPIC_CREATURE_DISALLOWED_KEYWORDS_FLST} failed to resolve: ${(err as Error).message} — epicAllowed defaults to true for every row`,
    );
    return new Set();
  }
}

// ── Epic boss rank (Phase A — epic boss HP mult, esm-walk 2026-07-19) ──────
//
// Unlike `epicAllowed` (a real per-NPC/RACE keyword check), a curated boss's
// FIXED epic rank has no per-NPC ESM field — it lives on the summon QUEST's
// Virtual Machine Adapter, in one of two shapes verified directly against
// the 20260710 dump (`esm get <questEdid> --json`):
//
//  (a) `scripts[].properties` carries an `EncounterWaves` struct-array
//      property (VMAD property type 17); the boss wave (`BossWave: true`)
//      has a `BossEpicLevel` entry alongside `BossEpicChance` — trust it
//      only when the chance is exactly 100 (a <100 chance is a roll, not a
//      fixed rank). `CB15_ScorchedEarth` (SBQ): wave 0 = `BossEpicLevel: 3`,
//      `BossEpicChance: 100.0`.
//  (b) A boss-alias VMAD entry carries a `defaultforcelegendaryalias`
//      script with a `minRank` property. `Storm_RegionBoss` (Storm
//      Goliath): 3 boss aliases (Boss_01_Plasma/02_Frag/03_Cryo, one per
//      elemental variant) each carry `minRank: 3`.
//
// `E06_Colossus` (Earle / Wendigo Colossus) was checked exhaustively and
// carries NEITHER shape: its own 3-wave EncounterWaves has no
// BossEpicLevel/BossEpicChance field on any wave, and none of its 4 alias
// VMAD entries carry a defaultforcelegendaryalias script. Also checked and
// empty: `SQ_WendigoColossusSummonAllies` (the wild-spawn version of the
// same race), `RB_Master` (0x004DF720, the "Region Boss Master Quest" hub
// listing all 4 region-boss events — confirms Scorched Earth/Colossus/Nuka
// Launcher/Storm Region Boss are siblings), `E06_PocketWatch`, and the boss
// NPC_'s own Keywords/Perks — a circulating claim that E06_Colossus matches
// shape (a) at rank 3 does not reproduce against a live query. Earle is kept in
// `BOSS_EPIC_RANK_QUESTS` anyway so a run still emits a specific unresolved
// note (rather than silently having no row at all) and `epicRank` stays
// unset for this race. See `docs/assumptions.md "Creature stat curves & NPC extraction"`.
export const BOSS_EPIC_RANK_QUESTS: Readonly<
  Record<string, { questEdid: string; questFormId: string }>
> = {
  EncScorchbeastQueen01Template: { questEdid: 'CB15_ScorchedEarth', questFormId: '0x003E271D' },
  WendigoColossusRace: { questEdid: 'E06_Colossus', questFormId: '0x00583D14' },
  StormBossRace: { questEdid: 'Storm_RegionBoss', questFormId: '0x006AD506' },
};

/** One VMAD `{name, type, value}` property entry (type 17 = nested struct/struct-array; scalar types otherwise). */
interface VmadProperty {
  name: string;
  type: number;
  value: unknown;
}

interface VmadScript {
  name: string;
  status: number;
  properties: VmadProperty[];
}

/** One VMAD alias-script binding. `alias_id`/`form_id` are unreliable for "Create Reference to Object" aliases (the esm CLI reports the quest's own formid for all of them) — matched by script name only, never by these fields. */
interface VmadAliasEntry {
  alias_id: number;
  form_id: string;
  alias_scripts: VmadScript[];
}

interface VirtualMachineAdapter {
  version: number;
  scripts: VmadScript[];
  aliases?: VmadAliasEntry[];
}

/** Exact-name lookup within a VMAD struct-entry array (VMAD property names come straight from the compiled script, not normalized by the CLI). */
function vmadProp(props: VmadProperty[], name: string): VmadProperty | undefined {
  return props.find((p) => p.name === name);
}

/** Shape (a) — see header note above. Exported for tests. */
export function epicRankFromEncounterWaves(vmad: VirtualMachineAdapter): number | null {
  for (const script of vmad.scripts) {
    const wavesProp = vmadProp(script.properties, 'EncounterWaves');
    if (!wavesProp || !Array.isArray(wavesProp.value)) continue;
    for (const wave of wavesProp.value as VmadProperty[][]) {
      const level = vmadProp(wave, 'BossEpicLevel');
      const chance = vmadProp(wave, 'BossEpicChance');
      if (level && typeof level.value === 'number' && chance && Number(chance.value) === 100) {
        return level.value;
      }
    }
  }
  return null;
}

/** Shape (b) — see header note above. Exported for tests. */
export function epicRankFromForceLegendaryAlias(vmad: VirtualMachineAdapter): number | null {
  for (const alias of vmad.aliases ?? []) {
    for (const script of alias.alias_scripts) {
      if (script.name !== 'defaultforcelegendaryalias') continue;
      const rank = vmadProp(script.properties, 'minRank');
      if (rank && typeof rank.value === 'number') return rank.value;
    }
  }
  return null;
}

/** Tries shape (a) then shape (b); null when a quest's VMAD carries neither (Earle — see header note). Exported for tests. */
export function resolveEpicRankFromVmad(vmad: VirtualMachineAdapter): number | null {
  return epicRankFromEncounterWaves(vmad) ?? epicRankFromForceLegendaryAlias(vmad);
}

/** Looks up `targetEdid` in `BOSS_EPIC_RANK_QUESTS`, fetches its summon quest, and resolves epic rank via both VMAD shapes. Returns `undefined` (+ an unresolved note) for every non-curated-boss row and for a curated boss whose quest carries neither shape. */
async function resolveBossEpicRank(
  client: EsmSource,
  targetEdid: string,
  unresolved: string[],
): Promise<number | undefined> {
  const boss = BOSS_EPIC_RANK_QUESTS[targetEdid];
  if (!boss) return undefined;

  let quest: EsmRecord;
  try {
    quest = await client.get(boss.questEdid);
  } catch (err) {
    unresolved.push(
      `npcs: ${targetEdid} epic-rank quest ${boss.questEdid} (${boss.questFormId}) not found: ${(err as Error).message}`,
    );
    return undefined;
  }

  const vmad = quest.fields['Virtual Machine Adapter'] as VirtualMachineAdapter | undefined;
  if (!vmad) {
    unresolved.push(
      `npcs: ${targetEdid} epic-rank quest ${boss.questEdid} (${boss.questFormId}) has no Virtual Machine Adapter`,
    );
    return undefined;
  }

  const rank = resolveEpicRankFromVmad(vmad);
  if (rank == null) {
    unresolved.push(
      `npcs: ${targetEdid} epic-rank quest ${boss.questEdid} (${boss.questFormId}) carries neither an EncounterWaves BossEpicLevel@100%-chance wave nor a defaultforcelegendaryalias.minRank alias — epicRank left unset`,
    );
    return undefined;
  }
  return rank;
}

// ── Normalized-level perk adjustment (esm-walk 2026-07-21) ─────────────────
//
// A curated boss's level-scaling window isn't always just the raw
// `Actor Scaling Info.{Level Min/Max Global}` GLOBs: ~65+ NPCs (Head Hunt
// bounty bosses among them) additionally carry a `crModNormalizedLevel*`
// PERK whose Entry Point effects further modify that window. Verified
// directly against the 20260717 dump (`esm get crModNormalizedLevelPerk_25
// --json`, `crModNormalizedLevelRangePerk_15_to_100`,
// `HTO_crModNormalizedLevelPerk_Boss`): the two relevant entry points are
// "Mod NPC Normalized Min Level" (206) and "Mod NPC Normalized Max level"
// (207 — note the lowercase "level", not a typo), each via one of two
// Functions — "Add Value" (accumulate onto the base — Head Hunt's
// `crModNormalizedLevelPerk_25`, +25/+25) or "Set Value" (replace the base
// outright — e.g. `HTO_crModNormalizedLevelPerk_Boss`, Infestation-event
// bosses, Set 150/200). A third entry point on the same perks, "Mod NPC
// Normalized Level" (208), is irrelevant here — no consumer reads a single
// "normalized level", only min/max.
//
// `Burn_BountyTarget_BIG_Death`: base 25/175 (Renorm_MinLVL_Tier06/
// Renorm_MaxLVL_Tier07 GLOBs) + `crModNormalizedLevelPerk_25` (Add +25/+25)
// → 50/200. `Burn_BountyTarget_BIG_Pilot`/`_Abraxo` carry no such perk
// (unchanged); `_RoboBrain` carries unrelated perks (ImmuneToRadiation/
// ImmuneToPoison — no matching entry point, unchanged).
//
// `NPC_.Perks` is a flat `[{Perk: {Perk: formid}}]` array — NOT the PCRD
// "Perks" shape (`{Perk: {Male Perk, Female Perk, Card Rank Cost}}`, see
// extract-perks.ts); don't confuse the two when reading this field
// elsewhere.
const NORMALIZED_MIN_LEVEL_ENTRY_POINT = 'Mod NPC Normalized Min Level';
const NORMALIZED_MAX_LEVEL_ENTRY_POINT = 'Mod NPC Normalized Max level'; // lowercase "level" — ESM-verified, not a typo
const ADD_VALUE_FUNCTION = 'Add Value';
const SET_VALUE_FUNCTION = 'Set Value';

/** `{op: 'add', delta}` accumulates onto the base GLOB value; `{op: 'set', value}` replaces it outright. */
type NormalizedLevelBoundOp = { op: 'add'; delta: number } | { op: 'set'; value: number };

/** One entry-point effect's contribution to one bound (min or max), folded onto `acc`. Add accumulates onto a prior Add; Set replaces whatever came before (last-wins across perks, in `Perks` array order). */
function foldNormalizedLevelBound(
  acc: NormalizedLevelBoundOp | null,
  functionName: string,
  float: number,
): NormalizedLevelBoundOp | null {
  if (functionName === SET_VALUE_FUNCTION) {
    return { op: 'set', value: float };
  }
  if (functionName === ADD_VALUE_FUNCTION) {
    return { op: 'add', delta: (acc?.op === 'add' ? acc.delta : 0) + float };
  }
  return acc;
}

/**
 * Reads an NPC_'s `Perks` array, fetches each referenced PERK, and folds any
 * "Mod NPC Normalized Min/Max Level" Entry Point effects into a net
 * adjustment per bound (see header note for the exact strings and Add/Set
 * duality). Multiple matching perks: Add accumulates, Set replaces
 * (last-wins) — actual curated NPCs are expected to carry at most one, but
 * this doesn't crash on more. An unresolvable perk ref pushes an unresolved
 * note and is skipped (fail-open — the base GLOB window still applies).
 * Exported for tests.
 */
export async function resolveNormalizedLevelAdjustment(
  client: EsmSource,
  npcRecord: EsmRecord,
  label: string,
  unresolved: string[],
): Promise<{ min: NormalizedLevelBoundOp | null; max: NormalizedLevelBoundOp | null }> {
  const perksNode = npcRecord.fields['Perks'];
  const perkEntries = Array.isArray(perksNode) ? (perksNode as Array<Record<string, unknown>>) : [];

  let min: NormalizedLevelBoundOp | null = null;
  let max: NormalizedLevelBoundOp | null = null;

  for (const entry of perkEntries) {
    const perkFormId = (entry['Perk'] as Record<string, unknown> | undefined)?.['Perk'] as
      | string
      | undefined;
    if (!perkFormId) continue;

    let perkRecord: EsmRecord;
    try {
      perkRecord = await client.get(perkFormId);
    } catch (err) {
      unresolved.push(
        `npcs: ${label} Perks entry ${perkFormId} failed to resolve: ${(err as Error).message} — normalized-level adjustment skipped for this perk`,
      );
      continue;
    }

    const effects = perkRecord.fields['Effects'];
    if (!Array.isArray(effects)) continue;
    for (const item of effects) {
      const effect = (item as Record<string, unknown>)['Effect'] as
        | Record<string, unknown>
        | undefined;
      if (!effect) continue;
      const header = (effect['Effect Header'] ?? {}) as Record<string, unknown>;
      const effectType = (header['Effect Type'] as Record<string, unknown> | undefined)?.[
        'name'
      ] as string | undefined;
      if (effectType !== 'Entry Point') continue;

      const ep = (effect['Entry Point'] ?? {}) as Record<string, unknown>;
      const entryPointName = (ep['Entry Point'] as Record<string, unknown> | undefined)?.[
        'name'
      ] as string | undefined;
      const functionName = (ep['Function'] as Record<string, unknown> | undefined)?.['name'] as
        | string
        | undefined;
      const float = typeof effect['Float'] === 'number' ? (effect['Float'] as number) : 0;

      if (entryPointName === NORMALIZED_MIN_LEVEL_ENTRY_POINT) {
        min = foldNormalizedLevelBound(min, functionName ?? '', float);
      } else if (entryPointName === NORMALIZED_MAX_LEVEL_ENTRY_POINT) {
        max = foldNormalizedLevelBound(max, functionName ?? '', float);
      }
    }
  }

  return { min, max };
}

/** Applies a resolved bound adjustment to a base GLOB value. A null base (fixed-level unique with no scaling window at all) stays null — the adjustment doesn't fabricate a window that doesn't exist. Exported for tests. */
export function applyNormalizedLevelAdjustment(
  base: number | null,
  adjustment: NormalizedLevelBoundOp | null,
): number | null {
  if (base == null || adjustment == null) return base;
  return adjustment.op === 'set' ? adjustment.value : base + adjustment.delta;
}

const HEALTH_AV = 0x2d4;
/** Exported for tests. */
export const RESIST_AVS: Record<number, GeneratedNpcDamageType> = {
  0x2e3: 'physical', // DamageResist
  0x2eb: 'energy', // EnergyResist
  0x2e5: 'fire', // FireResist
  0x2e7: 'cryo', // FrostResist
  0x2e4: 'poison', // PoisonResist
  0x2ea: 'radiation', // RadResistExposure
};

/**
 * ~36 of the 83 curated rows key off a RACE (no stats of their own — see
 * CuratedTarget). This maps each such RACE edid to a representative,
 * stats-bearing NPC_ "template" record: the generic world-spawn actor for
 * that race, verified via `esm search "*<race>*Template*" --type NPC_`
 * (falling back to the bare `Enc<Race>NN` numbering when no `_Template`
 * variant exists — Mirelurk King/Hunter/Queen, Mothman, Blue Devil, Storm
 * Goliath, Ultracite Titan, Ogua) and confirmed each candidate's own `Race`
 * field resolves back to the RACE formId (scripted verification,
 * 2026-07-18 — every entry below passed; no row was picked on naming alone).
 *
 * `WendigoColossusRace` is the one deliberate exception: rather than the
 * generic `EncWendigoColossus01Template`, it maps to Earle
 * (`EN06_LvlWendigoColossus_Nuked`) per the spike's explicit "known-good
 * NPCs" list — the merged bodyparts row is labeled "Earle / Wendigo
 * Colossus" and Earle is the more interesting of the two for a DPS
 * calculator (a farmable world boss vs. a rare wild spawn).
 *
 * `DLC03_GulperRace` needed one extra disambiguation step:
 * `DLC03_EncGulper01Template`'s own `Race` field does NOT point at
 * `DLC03_GulperRace` (it's `Attack Race`-only there) — `DLC03_EncGulper03`
 * is the first candidate whose `Race` field actually matches.
 */
export const RACE_NPC_TEMPLATES: Readonly<Record<string, string>> = {
  HumanRace: 'EncRaider01Template',
  FeralGhoulRace: 'encFeralGhoul00Template',
  ScorchedRace: 'EncScorched_Template',
  SuperMutantRace: 'EncSuperMutant_Template',
  SupermutantBehemothRace: 'EncSMBehemoth01Template',
  MoleMinerRace: 'EncMoleMiner_Template',
  ViciousDogRace: 'EncViciousDog01Template',
  WendigoRace: 'EncWendigo01Template',
  WendigoColossusRace: 'EN06_LvlWendigoColossus_Nuked', // Earle — see header note.
  YaoGuaiRace: 'EncYaoGuai02Template',
  DeathclawRace: 'EncDeathclaw01Template',
  MirelurkRace: 'EncMirelurkCrab_Template',
  MirelurkHunterRace: 'EncMirelurkHunter01',
  MirelurkKingRace: 'EncMirelurkKing01',
  MirelurkQueenRace: 'EncMirelurkQueen01',
  MothmanRace: 'EncMothman02',
  ScorchBeastRace: 'EncScorchbeast01Template',
  RadScorpionRace: 'EncRadscorpion01Template',
  SnallyGasterRace: 'EncSnallygaster01Template',
  GraftonMonsterRace: 'EncGrafton01Template',
  SheepsquatchRace: 'EncSheepsquatch01Template',
  MegaSlothRace: 'EncMegaSloth01Template',
  HoneyBeastRace: 'EncHoneyBeast01Template',
  DLC03_AnglerRace: 'DLC03_EncAngler01Template',
  DLC03_FogCrawlerRace: 'DLC03_EncFogCrawler01Template',
  DLC03_GulperRace: 'DLC03_EncGulper03', // see header note — 01Template's own Race field doesn't match.
  FlatwoodsMonsterRace: 'EncFlatwoodsMonster01Template',
  BlueDevilRace: 'EncBlueDevil',
  OguaRace: 'EncOgua',
  UltraciteAbominationRace: 'EncUltraciteAbomination',
  AssaultronRace: 'EncAssaultron01Template',
  ProtectronRace: 'EncProtectron01Template',
  SentryBotRace: 'EncSentryBot01Template',
  LiberatorRace: 'EncLiberator01Template',
  StormBossRace: 'EncStormBoss',
  BigfootRace: 'EncBigfootTemplate',
};

export interface RawProperty {
  'Actor Value'?: string | null;
  Value?: number;
  'Curve Table'?: { formid?: string; editor_id?: string } | null;
}

export interface MergedEntry {
  value: number;
  curveTableEdid: string | null;
}

/** Normalize an esm-emitted AV hex string ("0x000002D4") to a plain number, tolerant of padding/case. Exported for tests. */
export function avToNumber(av: string | null | undefined): number | null {
  if (!av) return null;
  const n = parseInt(av, 16);
  return Number.isFinite(n) ? n : null;
}

/** RACE Properties as the base layer, NPC_ Properties overriding per-AV — see header note. Exported for tests. */
export function mergeProperties(
  raceProps: RawProperty[],
  npcProps: RawProperty[],
): Map<number, MergedEntry> {
  const merged = new Map<number, MergedEntry>();
  for (const [props] of [[raceProps], [npcProps]] as const) {
    for (const p of props) {
      const av = avToNumber(p['Actor Value']);
      if (av == null) continue;
      merged.set(av, { value: p.Value ?? 0, curveTableEdid: p['Curve Table']?.editor_id ?? null });
    }
  }
  return merged;
}

/** Resolve one merged Properties entry to {flatValue, curveTier} with the flat-wins tie-break. Pushes to `unresolved` on a non-Tier curve table. Exported for tests. */
export function resolveStat(
  entry: MergedEntry | undefined,
  label: string,
  unresolved: string[],
): { flatValue: number; curveTier: number | null } {
  if (!entry) return { flatValue: 0, curveTier: null };
  if (entry.curveTableEdid == null || entry.value !== 0) {
    // No curve, or flat-wins (nonzero flat alongside a curve — see header note).
    return { flatValue: entry.value, curveTier: null };
  }
  const tier = tierFromEdid(entry.curveTableEdid);
  if (tier == null) {
    unresolved.push(
      `npcs: ${label} references non-Universal-Tier curve table "${entry.curveTableEdid}" — not representable, dropped`,
    );
    return { flatValue: 0, curveTier: null };
  }
  return { flatValue: 0, curveTier: tier };
}

/** Resolve a GLOB formId reference to its numeric Value; null (+ unresolved note) on any failure. */
async function resolveGlobal(
  client: EsmSource,
  formId: string | undefined,
  label: string,
  unresolved: string[],
): Promise<number | null> {
  if (!formId) return null;
  try {
    const rec = await client.get(formId);
    const value = rec.fields['Value'];
    if (typeof value === 'number') return value;
    unresolved.push(`npcs: ${label} GLOB ${formId} has no numeric Value field`);
    return null;
  } catch (err) {
    unresolved.push(`npcs: ${label} GLOB ${formId} failed to resolve: ${(err as Error).message}`);
    return null;
  }
}

export interface NpcsResult {
  npcs: GeneratedNpc[];
  unresolved: string[];
}

export async function extractNpcs(client: EsmSource): Promise<NpcsResult> {
  const unresolved: string[] = [];
  const npcs: GeneratedNpc[] = [];
  const epicDisallowedKeywords = await resolveEpicDisallowedKeywords(client, unresolved);

  for (const target of CURATED_TARGETS) {
    let record: EsmRecord;
    try {
      record = await client.get(target.edid);
    } catch {
      unresolved.push(`npcs: record ${target.edid} not found`);
      continue;
    }

    let npcRecord: EsmRecord;
    if (record.header.signature === 'NPC_') {
      npcRecord = record;
    } else if (record.header.signature === 'RACE') {
      const templateEdid = RACE_NPC_TEMPLATES[target.edid];
      if (!templateEdid) {
        unresolved.push(
          `npcs: ${target.edid} is a RACE with no representative NPC_ template mapped — see RACE_NPC_TEMPLATES`,
        );
        continue;
      }
      try {
        npcRecord = await client.get(templateEdid);
      } catch {
        unresolved.push(`npcs: ${target.edid}'s mapped template ${templateEdid} not found`);
        continue;
      }
      if (npcRecord.header.signature !== 'NPC_') {
        unresolved.push(
          `npcs: ${target.edid}'s mapped template ${templateEdid} is not an NPC_ record (got ${npcRecord.header.signature})`,
        );
        continue;
      }
    } else {
      unresolved.push(
        `npcs: ${target.edid} is neither RACE nor NPC_ (got ${record.header.signature})`,
      );
      continue;
    }

    const npcProps = (npcRecord.fields['Properties'] as RawProperty[] | undefined) ?? [];

    let raceProps: RawProperty[] = [];
    let raceKeywords: string[] = [];
    const raceFormId = npcRecord.fields['Race'] as string | null | undefined;
    if (raceFormId) {
      try {
        const raceRecord = await client.get(raceFormId);
        raceProps = (raceRecord.fields['Properties'] as RawProperty[] | undefined) ?? [];
        raceKeywords = keywordFormIds(raceRecord.fields);
      } catch {
        unresolved.push(
          `npcs: ${target.edid} (${npcRecord.editor_id})'s Race ${raceFormId} not found — resist fallback skipped`,
        );
      }
    }

    // Epic-creature eligibility (coordinator follow-up, 2026-07-18): checks
    // the NPC_'s own keywords AND its RACE's (one hop, matching the resist
    // fallback depth above — no deeper template-inheritance chase). Neither
    // hop is exhaustive of every possible indirection Bethesda might use, but
    // it matches every other keyword-gate depth this extractor already uses.
    const npcKeywords = keywordFormIds(npcRecord.fields);
    const epicAllowed = ![...npcKeywords, ...raceKeywords].some((id) =>
      epicDisallowedKeywords.has(id),
    );

    const merged = mergeProperties(raceProps, npcProps);

    const health = resolveStat(merged.get(HEALTH_AV), `${target.edid} health`, unresolved);
    if (!merged.has(HEALTH_AV)) {
      unresolved.push(
        `npcs: ${target.edid} (${npcRecord.editor_id}) has no Health Property (NPC_ nor RACE fallback)`,
      );
    }

    const resists: GeneratedNpcResist[] = [];
    for (const [avNum, damageType] of Object.entries(RESIST_AVS).map(
      ([k, v]) => [Number(k), v] as const,
    )) {
      const entry = merged.get(avNum);
      if (!entry) {
        unresolved.push(
          `npcs: ${target.edid} (${npcRecord.editor_id}) has no ${damageType} resist Property (NPC_ nor RACE fallback)`,
        );
      }
      const resolved = resolveStat(entry, `${target.edid} ${damageType} resist`, unresolved);
      resists.push({ damageType, flatValue: resolved.flatValue, curveTier: resolved.curveTier });
    }

    const scaling =
      (npcRecord.fields['Actor Scaling Info'] as Record<string, string> | undefined) ?? {};
    const baseLevelMinGlobal = await resolveGlobal(
      client,
      scaling['Level Min Global'],
      `${target.edid} Level Min Global`,
      unresolved,
    );
    const baseLevelMaxGlobal = await resolveGlobal(
      client,
      scaling['Level Max Global'],
      `${target.edid} Level Max Global`,
      unresolved,
    );
    const levelOffsetGlobal = await resolveGlobal(
      client,
      scaling['Level Offset Global'],
      `${target.edid} Level Offset Global`,
      unresolved,
    );

    // Bake any NPC-perk-based normalized-level adjustment directly into the
    // stored min/max (see `resolveNormalizedLevelAdjustment` header note) —
    // no new field, no runtime consumer changes needed.
    const normalizedLevelAdjustment = await resolveNormalizedLevelAdjustment(
      client,
      npcRecord,
      target.edid,
      unresolved,
    );
    const levelMinGlobal = applyNormalizedLevelAdjustment(
      baseLevelMinGlobal,
      normalizedLevelAdjustment.min,
    );
    const levelMaxGlobal = applyNormalizedLevelAdjustment(
      baseLevelMaxGlobal,
      normalizedLevelAdjustment.max,
    );

    const epicRank = await resolveBossEpicRank(client, target.edid, unresolved);

    npcs.push({
      id: target.edid,
      formId: npcRecord.header.form_id,
      name: target.label,
      healthCurveTier: health.curveTier,
      healthFlatValue: health.flatValue,
      resists,
      levelMinGlobal,
      levelMaxGlobal,
      levelOffsetGlobal,
      epicAllowed,
      epicRank,
    });
  }

  return { npcs, unresolved };
}
