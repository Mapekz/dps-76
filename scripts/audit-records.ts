/**
 * Round-trip ESM record auditor: compares checked-in generated JSON against
 * the live SeventySix.esm dump (FO76_ESM_PATH / --esm). Catches staleness and
 * silent extraction drops that `extract:diff` (git-only) cannot see.
 *
 *   bun run audit:records [--mode live] [--domain weapons,omods,...]
 *                       [--tier 1,2,3] [--json <path>] [--out <path>]
 *
 * Nonzero exit when any mismatch is found. Uses EsmClient.bulkGet — never
 * one-record-at-a-time loops over large domains.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import type { GameMode } from '../src/types';
import type {
  GeneratedAddiction,
  GeneratedArmor,
  GeneratedBodyPartRace,
  GeneratedBuff,
  GeneratedHealingItem,
  GeneratedMeta,
  GeneratedNpc,
  GeneratedOmod,
  GeneratedPerk,
  GeneratedProc,
  GeneratedUnique,
  GeneratedWeapon,
} from '../src/types/generated';
import type { Modifier } from '../src/types/modifiers';
import {
  EsmClient,
  resolveKeywordEdids,
  type EsmRecord,
  type EsmSource,
} from './extract/esm-client';
import { asNumber } from './extract/normalize/explosion';
import type { Bucket } from '../src/types/modifiers';
import { parseMagicEffects, ENTRY_POINT_BUCKETS } from './extract/normalize/mgef';
import {
  decodeExplosionDamage,
  explosionIsChain,
  projectileExplosionFormId,
} from './extract/normalize/explosion';
import { ACTOR_VALUE_BUCKETS, resolveVariantDisplayName } from './extract/extract-omods';
import { collectProperties, includeFormIds, omodData } from './extract/omod-properties';
import {
  applyNormalizedLevelAdjustment,
  mergeProperties,
  resolveNormalizedLevelAdjustment,
  resolveStat,
  type RawProperty as NpcRawProperty,
} from './extract/extract-npcs';
import { effectiveFamilyMaxRank, toGeneratedPerkCard } from './extract/extract-perks';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const BULK_CHUNK = 200;

export const ALL_DOMAINS = [
  'weapons',
  'omods',
  'armor-omods',
  'uniques',
  'perks',
  'mutations',
  'consumables',
  'addictions',
  'armor',
  'npcs',
  'bodyparts',
  'healing',
] as const;

export type AuditDomain = (typeof ALL_DOMAINS)[number];
export type AuditTier = 1 | 2 | 3;

export type FindingKind = 'identity' | 'silent-drop' | 'field-mismatch';

export interface AuditFinding {
  kind: FindingKind;
  tier: AuditTier;
  recordId: string;
  field: string;
  expected: string;
  actual: string;
}

export interface TierStats {
  checked: number;
  passed: number;
  failed: number;
  skipped?: number;
}

export interface Tier3InfoBuckets {
  /** Enchantment carriers credited by per-record needs-override/not-modeled/procChase ack. */
  'covered-by-note'?: number;
  /** Armor-omod cosmetic FX enchantments (ATX/paint/jetpack-skin/_FX/…). */
  cosmetic?: number;
  /** OverrideProjectile swaps with no Explosion flag or zero-damage EXPL. */
  'benign-cosmetic-swap'?: number;
  /** Silent non-damage ability carriers (family names for human scan). */
  'silent-nondamage'?: { count: number; families: string[] };
}

export interface Tier3AuditResult {
  findings: AuditFinding[];
  info: Tier3InfoBuckets;
}

export interface DomainAuditResult {
  domain: AuditDomain;
  tier1: TierStats;
  tier2: TierStats;
  tier3: TierStats;
  findings: AuditFinding[];
  skippedFields: string[];
  tier3Note?: string;
  tier3Info?: Tier3InfoBuckets;
}

export interface AuditSummary {
  mode: GameMode;
  esmPath: string;
  domains: DomainAuditResult[];
  totalFindings: number;
}

/** Property names routed to formula buckets in extract-omods.ts (not exported). */
const ROUTED_OMOD_PROPERTIES = new Set([
  'DamageBonusMult',
  'CriticalDamageMult',
  'SneakAttackMult',
  'Speed',
  'IsAutomatic',
  'NumProjectiles',
  'CriticalChargeBonus',
  'AmmoCapacity',
  'ReloadSpeed',
  'AttackActionPointCost',
  'FullPowerSeconds',
  'FullPowerDamageMult',
  'AttackDelaySec',
  'MinRange',
  'MaxRange',
  'OutOfRangeDamageMult',
]);

/** AVs skipped because the value is carried elsewhere (extract-omods.ts ACTOR_VALUE_SKIP). */
const ACTOR_VALUE_SKIP_NAMES = new Set(['LGND_ExecuteDmg']);

/** Health actor value — extract-npcs.ts HEALTH_AV (not exported). */
const HEALTH_AV = 0x2d4;

/** Property → bucket routing mirrored from extract-omods.ts PROPERTY_BUCKETS (bucket only). */
const OMOD_PROPERTY_BUCKETS: Record<string, Bucket | Bucket[]> = {
  DamageBonusMult: 'dbm',
  CriticalDamageMult: ['critDmgBase', 'critDmgBonus'],
  SneakAttackMult: ['sneakBase', 'sneakBonus'],
  Speed: 'fireRateSpeed',
  IsAutomatic: 'isAutomatic',
  NumProjectiles: 'projectileCount',
  CriticalChargeBonus: 'critFill',
  AmmoCapacity: 'ammoCapacity',
  ReloadSpeed: 'reloadSpeed',
  AttackActionPointCost: 'vatsApCost',
  FullPowerSeconds: 'chargeFullPowerSec',
  FullPowerDamageMult: 'chargeFullPowerDamageMult',
  AttackDelaySec: 'animDelaySec',
  MinRange: 'weaponMinRange',
  MaxRange: 'weaponMaxRange',
  OutOfRangeDamageMult: 'weaponOutOfRangeMult',
  AttackDamage: 'baseDamage',
};

const IDENTITY_OMOD_NAME_SUFFIX_RE = /\s+Custom (Mod|Name)$/i;
const FINDING_SEVERITY: Record<FindingKind, number> = {
  identity: 0,
  'silent-drop': 1,
  'field-mismatch': 2,
};

/** Worst-first: identity > silent-drop > field-mismatch, then record/field. */
export function sortFindings(findings: AuditFinding[]): AuditFinding[] {
  return [...findings].sort((a, b) => {
    const sa = FINDING_SEVERITY[a.kind];
    const sb = FINDING_SEVERITY[b.kind];
    if (sa !== sb) return sa - sb;
    if (a.tier !== b.tier) return a.tier - b.tier;
    const id = a.recordId.localeCompare(b.recordId);
    if (id !== 0) return id;
    return a.field.localeCompare(b.field);
  });
}

export function formatValue(v: unknown): string {
  if (v === undefined) return '<undefined>';
  if (v === null) return '<null>';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function valuesEqual(a: unknown, b: unknown): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

function pushFieldMismatch(
  findings: AuditFinding[],
  recordId: string,
  field: string,
  expected: unknown,
  actual: unknown,
): void {
  if (valuesEqual(expected, actual)) return;
  findings.push({
    kind: 'field-mismatch',
    tier: 2,
    recordId,
    field,
    expected: formatValue(expected),
    actual: formatValue(actual),
  });
}

function pushIdentity(
  findings: AuditFinding[],
  recordId: string,
  field: string,
  expected: string,
  actual: string,
): void {
  if (expected === actual) return;
  findings.push({
    kind: 'identity',
    tier: 1,
    recordId,
    field,
    expected,
    actual,
  });
}

function emptyStats(): TierStats {
  return { checked: 0, passed: 0, failed: 0 };
}

function countResult(stats: TierStats, failed: boolean): void {
  stats.checked++;
  if (failed) stats.failed++;
  else stats.passed++;
}

// ── Tier 1 ─────────────────────────────────────────────────────────────────

export interface IdentityInput {
  recordId: string;
  expectedEdid: string;
  expectedName?: string;
  expectedSignature: string;
  esmRecord: EsmRecord | null;
}

export function auditIdentity(input: IdentityInput): AuditFinding[] {
  const findings: AuditFinding[] = [];
  const { recordId, expectedEdid, expectedName, expectedSignature, esmRecord } = input;

  if (!esmRecord) {
    pushIdentity(findings, recordId, 'formId', 'resolves', 'missing');
    return findings;
  }

  pushIdentity(findings, recordId, 'signature', expectedSignature, esmRecord.header.signature);
  pushIdentity(findings, recordId, 'edid', expectedEdid, esmRecord.editor_id);

  if (expectedName !== undefined) {
    const esmName = (esmRecord.fields['Name'] as string | undefined) ?? esmRecord.editor_id;
    pushIdentity(findings, recordId, 'name', expectedName, esmName);
  }

  return findings;
}

/** Display name derivation — mirrors extract-omods.ts `omodDisplayName`. */
export function omodDisplayName(record: EsmRecord): string {
  const raw = (record.fields['Name'] as string | undefined) ?? record.editor_id;
  return raw.replace(IDENTITY_OMOD_NAME_SUFFIX_RE, '');
}

/** Re-derive the checked-in OMOD name via the extractor naming pipeline. */
export function deriveOmodExpectedName(
  omod: Pick<GeneratedOmod, 'id' | 'variantOf'>,
  record: EsmRecord,
  containerRecord: EsmRecord | null,
): string {
  if (omod.variantOf && containerRecord) {
    return resolveVariantDisplayName(omod.variantOf, omodDisplayName(containerRecord), omod.id);
  }
  return omodDisplayName(record);
}

/** Unique preset name — mirrors extract-uniques.ts container/identity naming. */
export function deriveUniqueExpectedName(
  unique: Pick<GeneratedUnique, 'variantIds'>,
  identityOmod: GeneratedOmod,
  containerRecord: EsmRecord | null,
  comboName: string,
): string {
  if (unique.variantIds && identityOmod.variantOf && containerRecord) {
    return omodDisplayName(containerRecord);
  }
  const fromOmod = identityOmod.name.replace(IDENTITY_OMOD_NAME_SUFFIX_RE, '').trim();
  if (fromOmod) return fromOmod;
  return comboName;
}

export function auditDerivedName(
  recordId: string,
  expected: string,
  actual: string,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  pushIdentity(findings, recordId, 'name', expected, actual);
  return findings;
}

/** Unresolved lines are keyed by record edid prefix before the first colon. */
export function unresolvedForRecord(unresolved: readonly string[], recordId: string): string[] {
  const prefix = `${recordId}:`;
  return unresolved.filter((u) => u.startsWith(prefix));
}

async function resolveGlobalValue(
  client: EsmSource,
  formId: string | undefined,
): Promise<number | null> {
  if (!formId) return null;
  try {
    const rec = await client.get(formId);
    const value = rec.fields['Value'];
    return typeof value === 'number' ? value : null;
  } catch {
    return null;
  }
}

/** Bulk-fetch every OMOD in an Includes closure so collectProperties matches the extractor. */
export async function expandOmodIncludeGraph(
  client: EsmSource,
  seedRecords: Map<string, EsmRecord>,
): Promise<Map<string, EsmRecord>> {
  const byFormId = new Map(seedRecords);
  let frontier = [...byFormId.keys()];
  while (frontier.length > 0) {
    const needed = new Set<string>();
    for (const formId of frontier) {
      const rec = byFormId.get(formId);
      if (!rec) continue;
      for (const id of includeFormIds(omodData(rec))) {
        if (!byFormId.has(id)) needed.add(id);
      }
    }
    if (needed.size === 0) break;
    const fetched = await bulkFetchRecords(client, [...needed]);
    for (const [id, rec] of fetched) byFormId.set(id, rec);
    frontier = [...needed];
  }
  return byFormId;
}

/** Variant-container records are not emitted but drive variant display names. */
export async function fetchVariantContainerRecords(
  client: EsmSource,
  omods: readonly Pick<GeneratedOmod, 'variantOf'>[],
  byFormId: Map<string, EsmRecord>,
): Promise<Map<string, EsmRecord>> {
  const containers = new Map<string, EsmRecord>();
  for (const edid of new Set(omods.map((o) => o.variantOf).filter((v): v is string => v != null))) {
    try {
      const rec = await client.get(edid);
      containers.set(edid, rec);
      byFormId.set(rec.header.form_id, rec);
    } catch {
      /* container missing — name derivation falls back to omodDisplayName */
    }
  }
  return containers;
}

// ── Tier 2 helpers ───────────────────────────────────────────────────────

export interface WeaponTier2Source {
  speed: number;
  capacity: number;
  eligibleLevels: number[];
  keywords: string[];
  baseDamage: number;
  typedAmounts: Array<{ edid: string; amount: number }>;
}

export async function extractWeaponTier2Source(
  client: EsmSource,
  record: EsmRecord,
): Promise<WeaponTier2Source> {
  const data = (record.fields['Data'] ?? {}) as Record<string, unknown>;
  const typedAmounts: WeaponTier2Source['typedAmounts'] = [];
  const damageTypes = record.fields['Damage Types'];
  if (Array.isArray(damageTypes)) {
    for (const entry of damageTypes as Array<Record<string, unknown>>) {
      const typeFormId = entry['Type'] as string;
      const edid = await client.resolveEdid(typeFormId);
      typedAmounts.push({ edid, amount: asNumber(entry['Amount']) });
    }
  }
  return {
    speed: asNumber(data['Speed'], 1),
    capacity: asNumber(data['Capacity']),
    eligibleLevels: Array.isArray(record.fields['Eligible Levels'])
      ? [...(record.fields['Eligible Levels'] as number[])].sort((a, b) => a - b)
      : [],
    keywords: [...(await resolveKeywordEdids(client, record.fields))].sort(),
    baseDamage: asNumber(data['Base Damage']),
    typedAmounts: typedAmounts.sort((a, b) => a.edid.localeCompare(b.edid)),
  };
}

export function auditWeaponTier2(
  weapon: GeneratedWeapon,
  source: WeaponTier2Source,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  pushFieldMismatch(findings, weapon.id, 'speed', source.speed, weapon.speed);
  pushFieldMismatch(findings, weapon.id, 'capacity', source.capacity, weapon.capacity);
  pushFieldMismatch(
    findings,
    weapon.id,
    'eligibleLevels',
    source.eligibleLevels,
    [...weapon.eligibleLevels].sort((a, b) => a - b),
  );
  pushFieldMismatch(findings, weapon.id, 'keywords', source.keywords, [...weapon.keywords].sort());

  const ballistic = weapon.components.find((c) => c.damageType === 'ballistic' && !c.fromExplosion);
  if (ballistic && ballistic.curve == null) {
    pushFieldMismatch(findings, weapon.id, 'baseDamage', source.baseDamage, ballistic.amount);
  }

  const genTyped = weapon.components
    .filter((c) => c.damageTypeEdid != null && !c.fromExplosion)
    .map((c) => ({ edid: c.damageTypeEdid!, amount: c.amount }))
    .sort((a, b) => a.edid.localeCompare(b.edid));
  pushFieldMismatch(findings, weapon.id, 'typedDamageAmounts', source.typedAmounts, genTyped);

  return findings;
}

export const WEAPON_TIER2_SKIPPED =
  'components.curve/tier/fromExplosion — curve resolution and explosion chase are extractor transforms (tier 3)';

export async function extractOmodTier2Source(
  client: EsmSource,
  record: EsmRecord,
  byFormId: Map<string, EsmRecord>,
  propertyRootFormId: string = record.header.form_id,
): Promise<{
  attachPointEdid: string;
  targetKeywords: string[];
  addedKeywords: string[];
  hasEnchantments: boolean;
}> {
  const data = (record.fields['Data'] ?? {}) as Record<string, unknown>;
  const attachPoint = (data['Attach Point'] as string) ?? '';
  const targetKeywords = await Promise.all(
    (Array.isArray(record.fields['Target OMOD Keywords'])
      ? (record.fields['Target OMOD Keywords'] as string[])
      : []
    ).map((k) => client.resolveEdid(k)),
  );
  const properties = collectProperties(propertyRootFormId, byFormId);
  const addedKeywords: string[] = [];
  let hasEnchantments = false;
  for (const prop of properties) {
    if (prop.property === 'Keywords') {
      if (prop.functionType === 'ADD' && typeof prop.value1 === 'string') {
        addedKeywords.push(await client.resolveEdid(prop.value1));
      }
      continue;
    }
    if (prop.property === 'Enchantments') hasEnchantments = true;
  }
  return {
    attachPointEdid: attachPoint ? await client.resolveEdid(attachPoint) : '',
    targetKeywords: [...targetKeywords].sort(),
    addedKeywords: [...addedKeywords].sort(),
    hasEnchantments,
  };
}

export function auditOmodTier2(
  omod: GeneratedOmod,
  source: Awaited<ReturnType<typeof extractOmodTier2Source>>,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  pushFieldMismatch(
    findings,
    omod.id,
    'attachPointEdid',
    source.attachPointEdid,
    omod.attachPointEdid,
  );
  pushFieldMismatch(
    findings,
    omod.id,
    'targetKeywords',
    source.targetKeywords,
    [...omod.targetKeywords].sort(),
  );
  pushFieldMismatch(
    findings,
    omod.id,
    'addedKeywords',
    source.addedKeywords,
    [...omod.addedKeywords].sort(),
  );
  pushFieldMismatch(
    findings,
    omod.id,
    'hasEnchantments',
    source.hasEnchantments,
    omod.hasEnchantments,
  );
  return findings;
}

export const OMOD_TIER2_SKIPPED =
  'modifiers/procChase/explosionChase — transformed modifier IR (tier 3)';

export function auditBuffTier2(buff: GeneratedBuff, esmName: string): AuditFinding[] {
  const findings: AuditFinding[] = [];
  pushFieldMismatch(findings, buff.id, 'name', esmName, buff.name);
  return findings;
}

export const BUFF_TIER2_SKIPPED =
  'modifier magnitudes with curves/globals — MGEF translation is a tier-3 transform; flat value-only mods compared when present';

export function auditNpcTier2(
  npc: GeneratedNpc,
  healthFlat: number,
  levelMin: number | null,
  levelMax: number | null,
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  if (npc.healthCurveTier == null) {
    pushFieldMismatch(findings, npc.id, 'healthFlatValue', healthFlat, npc.healthFlatValue);
  }
  pushFieldMismatch(findings, npc.id, 'levelMinGlobal', levelMin, npc.levelMinGlobal);
  pushFieldMismatch(findings, npc.id, 'levelMaxGlobal', levelMax, npc.levelMaxGlobal);
  return findings;
}

export const NPC_TIER2_SKIPPED =
  'healthCurveTier/resists/epic* — curve-tier and merged RACE properties are extractor transforms';

export async function extractNpcTier2Source(
  client: EsmSource,
  npcRecord: EsmRecord,
  targetEdid: string,
): Promise<{ healthFlat: number; levelMin: number | null; levelMax: number | null }> {
  const unresolved: string[] = [];
  const npcProps = (npcRecord.fields['Properties'] as NpcRawProperty[] | undefined) ?? [];

  let raceProps: NpcRawProperty[] = [];
  const raceFormId = npcRecord.fields['Race'] as string | null | undefined;
  if (raceFormId) {
    try {
      const raceRecord = await client.get(raceFormId);
      raceProps = (raceRecord.fields['Properties'] as NpcRawProperty[] | undefined) ?? [];
    } catch {
      /* resist fallback skipped — matches extract-npcs.ts */
    }
  }

  const merged = mergeProperties(raceProps, npcProps);
  const health = resolveStat(merged.get(HEALTH_AV), `${targetEdid} health`, unresolved);

  const scaling =
    (npcRecord.fields['Actor Scaling Info'] as Record<string, string | undefined> | undefined) ??
    {};
  const baseLevelMinGlobal = await resolveGlobalValue(client, scaling['Level Min Global']);
  const baseLevelMaxGlobal = await resolveGlobalValue(client, scaling['Level Max Global']);

  const normalizedLevelAdjustment = await resolveNormalizedLevelAdjustment(
    client,
    npcRecord,
    targetEdid,
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

  return {
    healthFlat: health.flatValue,
    levelMin: levelMinGlobal,
    levelMax: levelMaxGlobal,
  };
}

// ── Tier 3 ─────────────────────────────────────────────────────────────────

const PROPERTY_IGNORED_FOR_TIER3 = new Set([
  'Weight',
  'Value',
  'Keywords',
  'Includes',
  'MaterialSwaps',
  'ModelSwap',
  'ColorRemappingIndex',
]);

export function isOmodPropertyDamageRelevant(property: string): boolean {
  if (PROPERTY_IGNORED_FOR_TIER3.has(property)) return false;
  if (ROUTED_OMOD_PROPERTIES.has(property)) return true;
  if (property in ACTOR_VALUE_BUCKETS && !ACTOR_VALUE_SKIP_NAMES.has(property)) return true;
  if (property === 'Enchantments' || property === 'AttachedPerk') return true;
  if (
    property === 'AttackDamage' ||
    property === 'DamageTypeValues' ||
    property === 'OverrideProjectile'
  ) {
    return true;
  }
  return false;
}

export interface SourceCarrier {
  key: string;
  label: string;
  /** Human-readable target for tier-3 adjudication (formid + edid). */
  detail?: string;
}

export interface CarrierAccountContext {
  notes: readonly string[];
  modifiers: readonly Modifier[];
  unresolved: readonly string[];
  hasEnchantments?: boolean;
  hasExplosionChase?: boolean;
  hasChainSuppressesExplosion?: boolean;
  procChase?: readonly GeneratedProc[];
}

/**
 * Extractor acknowledgment notes describe the chased mechanism (MGEF/PERK/spell),
 * not the carrier's own edid — credit Enchantments when notes or procChase are
 * attributable to the enchantment chase (not bare ActorValues-only lines).
 */
const EXTRACTOR_ACK_NOTE_RE = /needs override|not modeled/i;
const ENCHANTMENT_CHASE_NOTE_RE = /^(MGEF |perk |condition:|self-targeted damage)|\benchant\b/i;

export function hasExtractorAckNote(notes: readonly string[]): boolean {
  return notes.some((n) => EXTRACTOR_ACK_NOTE_RE.test(n));
}

export function hasProcChaseAck(procChase?: readonly GeneratedProc[]): boolean {
  return procChase != null && procChase.length > 0;
}

/** Notes/procChase from translateEnchantment / proc chase, not other property paths. */
export function enchantmentsCoveredByAck(ctx: CarrierAccountContext): boolean {
  if (hasProcChaseAck(ctx.procChase)) return true;
  return ctx.notes.some(
    (n) =>
      ENCHANTMENT_CHASE_NOTE_RE.test(n) || (EXTRACTOR_ACK_NOTE_RE.test(n) && /MGEF|perk /i.test(n)),
  );
}

/** Include-derived DamageTypeValues land as baseDamage + damageTypeScope on the child. */
export function damageTypeValuesAccounted(modifiers: readonly Modifier[]): boolean {
  return modifiers.some(
    (m) => m.bucket === 'baseDamage' && m.conditions.some((c) => c.kind === 'damageTypeScope'),
  );
}

const COSMETIC_ENCH_NAME_RE = /(?:^ATX_|_ATX_|paint|jetpack|jetpack-skin|_FX|Klakson|VoiceModule)/i;

/** ATX cosmetic FX enchantments on armor-omods — info bucket, not findings. */
export function isCosmeticEnchantmentRecord(recordId: string, detail?: string): boolean {
  return COSMETIC_ENCH_NAME_RE.test(`${recordId}:${detail ?? ''}`);
}

const DEFENSIVE_EP_RE =
  /\b(incoming|resist|defense|survival|disease|cure|hunger|thirst|rads|heal|carry weight|ap regen|sneak detection|detection)\b/i;
const OFFENSIVE_EP_RE =
  /\b(crit|damage|weapon|explosion|sneak attack|limb|vats|power attack|consecutive hit|ammo|reload|gun-fu|blitz|bash|bashing|outgoing|attack)\b/i;

export function isOffensiveEntryPoint(name: string): boolean {
  if (DEFENSIVE_EP_RE.test(name)) return false;
  if (name in ENTRY_POINT_BUCKETS) return true;
  return OFFENSIVE_EP_RE.test(name);
}

const DEFENSIVE_MGEF_NAME_RE =
  /\b(incoming|resist|resistance|defense|survival|disease|cure|hunger|thirst|rads|heal|limb damage res|limb damge res)\b/i;
const OFFENSIVE_MGEF_NAME_RE =
  /\b(crit|damage|weapon|vats|explosion|melee|attack|bash|sneak attack)\b/i;

function spellEffectBaseFormIds(record: EsmRecord): string[] {
  const effects = record.fields['Effects'];
  if (!Array.isArray(effects)) return [];
  const formIds: string[] = [];
  for (const row of effects) {
    const effect = (row as Record<string, unknown>)['Effect'] as Record<string, unknown>;
    const base = effect['Base Effect'];
    if (typeof base === 'string') formIds.push(base);
  }
  return formIds;
}

async function spellAbilityIsOffensive(client: EsmSource, spell: EsmRecord): Promise<boolean> {
  for (const mgefFormId of spellEffectBaseFormIds(spell)) {
    try {
      const mgef = await client.get(mgefFormId);
      const label = ((mgef.fields['Name'] as string | undefined) ?? mgef.editor_id).toLowerCase();
      if (DEFENSIVE_MGEF_NAME_RE.test(label)) return false;
      if (OFFENSIVE_MGEF_NAME_RE.test(label)) return true;
    } catch {
      /* skip unresolved MGEF */
    }
  }
  return false;
}

export async function isAbilityOffensive(
  client: EsmSource,
  abilityFormId: string,
): Promise<boolean> {
  try {
    const record = await client.get(abilityFormId);
    if (record.header.signature === 'SPEL') {
      return spellAbilityIsOffensive(client, record);
    }
    for (const effect of perkEffectRows(record)) {
      const header = (effect['Effect Header'] ?? {}) as Record<string, unknown>;
      const effectType =
        ((header['Effect Type'] as Record<string, unknown> | undefined)?.['name'] as string) ??
        'Unknown';
      if (effectType !== 'Entry Point') continue;
      const ep = (effect['Entry Point'] ?? {}) as Record<string, unknown>;
      const name =
        ((ep['Entry Point'] as Record<string, unknown> | undefined)?.['name'] as string) ??
        'Unknown';
      if (isOffensiveEntryPoint(name)) return true;
    }
    return false;
  } catch {
    return true;
  }
}

export type OverrideProjectileAdjudication = 'benign-cosmetic-swap' | 'finding';

/**
 * Self-adjudicate OverrideProjectile: cosmetic when PROJ lacks Explosion flag or
 * EXPL carries no decodable damage (mirrors omod-projectile-chase.ts gate).
 */
export async function adjudicateOverrideProjectile(
  client: EsmSource,
  projFormId: string,
): Promise<OverrideProjectileAdjudication> {
  try {
    const explFormId = await projectileExplosionFormId(client, projFormId);
    if (!explFormId) return 'benign-cosmetic-swap';

    const expl = await client.get(explFormId);
    if (explosionIsChain(expl)) return 'benign-cosmetic-swap';

    const decoded = await decodeExplosionDamage(client, expl, []);
    const hasDirectDamage =
      decoded.main != null ||
      decoded.typed.some((t) => t.damageType !== 'unknown' && (t.curve || t.amount > 0));
    if (!hasDirectDamage) return 'benign-cosmetic-swap';
    return 'finding';
  } catch {
    return 'finding';
  }
}

export function enumerateOmodCarriers(
  rootFormId: string,
  byFormId: Map<string, EsmRecord>,
): SourceCarrier[] {
  const properties = collectProperties(rootFormId, byFormId);
  const carriers: SourceCarrier[] = [];
  const seen = new Set<string>();
  for (const prop of properties) {
    if (!isOmodPropertyDamageRelevant(prop.property)) continue;
    const key = `property:${prop.property}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let detail: string | undefined;
    if (
      (prop.property === 'OverrideProjectile' ||
        prop.property === 'AttachedPerk' ||
        prop.property === 'Enchantments') &&
      typeof prop.value1 === 'string'
    ) {
      detail = prop.value1;
    }
    carriers.push({ key, label: prop.property, detail });
  }
  return carriers;
}

export function enumerateWeaponCarriers(record: EsmRecord): SourceCarrier[] {
  const ench = record.fields['Enchantment'] as string | null | undefined;
  if (!ench || ench === '0x00000000') return [];
  return [{ key: `enchantment:${ench}`, label: `Enchantment ${ench}` }];
}

function perkEffectRows(record: EsmRecord): Array<Record<string, unknown>> {
  const effects = record.fields['Effects'];
  if (!Array.isArray(effects)) return [];
  return effects.map((e) => (e as Record<string, unknown>)['Effect'] as Record<string, unknown>);
}

export function enumeratePerkCarriers(record: EsmRecord): SourceCarrier[] {
  const carriers: SourceCarrier[] = [];
  for (const effect of perkEffectRows(record)) {
    const header = (effect['Effect Header'] ?? {}) as Record<string, unknown>;
    const effectType =
      ((header['Effect Type'] as Record<string, unknown> | undefined)?.['name'] as string) ??
      'Unknown';
    if (effectType === 'Entry Point') {
      const ep = (effect['Entry Point'] ?? {}) as Record<string, unknown>;
      const name =
        ((ep['Entry Point'] as Record<string, unknown> | undefined)?.['name'] as string) ??
        'Unknown';
      if (name in ENTRY_POINT_BUCKETS) {
        carriers.push({ key: `entryPoint:${name}`, label: name });
      }
      continue;
    }
    const ability = effect['Ability'] as string | undefined;
    if (ability) {
      carriers.push({ key: `ability:${ability}`, label: `Ability ${ability}` });
    }
  }
  return carriers;
}

function modifierBucketsForProperty(property: string): Bucket[] {
  const avRoute = ACTOR_VALUE_BUCKETS[property];
  if (avRoute && !ACTOR_VALUE_SKIP_NAMES.has(property)) return [avRoute.bucket];
  const mapped = OMOD_PROPERTY_BUCKETS[property];
  if (!mapped) return [];
  return Array.isArray(mapped) ? [...mapped] : [mapped];
}

function propertyModifiersAccounted(property: string, modifiers: readonly Modifier[]): boolean {
  const buckets = modifierBucketsForProperty(property);
  if (buckets.length === 0) return false;
  return modifiers.some((m) => buckets.includes(m.bucket));
}

export function isCarrierAccounted(
  recordKey: string,
  carrier: SourceCarrier,
  ctx: CarrierAccountContext,
): boolean {
  const { notes, modifiers, unresolved } = ctx;
  const recordUnresolved = unresolvedForRecord(unresolved, recordKey);

  if (carrier.key.startsWith('property:')) {
    const prop = carrier.label;
    if (recordUnresolved.some((u) => u.includes(`unknown OMOD property: ${prop}`))) return true;
    if (notes.some((n) => n.includes(prop))) return true;

    if (prop === 'Enchantments') {
      // Per-record ack: extractor notes/procChase describe chased MGEFs, not carrier edids.
      if (enchantmentsCoveredByAck(ctx)) return true;
      if (ctx.hasEnchantments && (modifiers.length > 0 || notes.some((n) => /enchant/i.test(n))))
        return true;
      if (recordUnresolved.some((u) => u.toLowerCase().includes('enchant'))) return true;
      return false;
    }
    if (prop === 'DamageTypeValues') {
      return damageTypeValuesAccounted(modifiers);
    }
    if (prop === 'OverrideProjectile') {
      if (ctx.hasExplosionChase || ctx.hasChainSuppressesExplosion) return true;
      if (notes.some((n) => /projectile/i.test(n))) return true;
      if (recordUnresolved.some((u) => u.toLowerCase().includes('projectile'))) return true;
      return propertyModifiersAccounted('AttackDamage', modifiers);
    }
    if (prop === 'AttachedPerk') {
      if (notes.some((n) => /granted perk|attached perk|perk to apply/i.test(n))) return true;
      if (carrier.detail && notes.some((n) => n.includes(carrier.detail!))) return true;
      return modifiers.length > 0;
    }
    return propertyModifiersAccounted(prop, modifiers);
  }

  if (carrier.key.startsWith('entryPoint:')) {
    if (recordUnresolved.some((u) => u.includes(`unknown entry point: ${carrier.label}`))) {
      return true;
    }
    const bucket = ENTRY_POINT_BUCKETS[carrier.label];
    if (bucket && modifiers.some((m) => m.bucket === bucket)) return true;
    return false;
  }

  if (carrier.key.startsWith('enchantment:')) {
    if (modifiers.length > 0) return true;
    if (recordUnresolved.some((u) => u.toLowerCase().includes('enchant'))) return true;
    return false;
  }

  if (carrier.key.startsWith('ability:')) {
    if (modifiers.length > 0) return true;
    if (notes.length > 0) return true;
    if (recordUnresolved.some((u) => u.toLowerCase().includes('ability'))) return true;
    return false;
  }

  const needles = [carrier.key, carrier.label, carrier.label.split(' ')[0] ?? carrier.label];
  const haystacks = [...notes, ...recordUnresolved];
  return haystacks.some((h) => needles.some((n) => h.includes(n)));
}

function mergeTier3Info(into: Tier3InfoBuckets, from: Tier3InfoBuckets): void {
  if (from['covered-by-note']) {
    into['covered-by-note'] = (into['covered-by-note'] ?? 0) + from['covered-by-note'];
  }
  if (from.cosmetic) {
    into.cosmetic = (into.cosmetic ?? 0) + from.cosmetic;
  }
  if (from['benign-cosmetic-swap']) {
    into['benign-cosmetic-swap'] =
      (into['benign-cosmetic-swap'] ?? 0) + from['benign-cosmetic-swap'];
  }
  if (from['silent-nondamage']) {
    const prev = into['silent-nondamage'] ?? { count: 0, families: [] };
    into['silent-nondamage'] = {
      count: prev.count + from['silent-nondamage'].count,
      families: [...prev.families, ...from['silent-nondamage'].families],
    };
  }
}

export interface AuditTier3Options {
  client?: EsmSource;
  domain?: AuditDomain;
  resolveDetail?: (carrier: SourceCarrier) => Promise<string | undefined> | string | undefined;
}

export async function auditTier3Carriers(
  recordId: string,
  carriers: SourceCarrier[],
  ctx: CarrierAccountContext,
  options?: AuditTier3Options,
): Promise<Tier3AuditResult> {
  const findings: AuditFinding[] = [];
  const info: Tier3InfoBuckets = {};
  const { client, domain, resolveDetail } = options ?? {};

  for (const carrier of carriers) {
    if (isCarrierAccounted(recordId, carrier, ctx)) {
      if (
        carrier.label === 'Enchantments' &&
        enchantmentsCoveredByAck(ctx) &&
        ctx.modifiers.length === 0
      ) {
        info['covered-by-note'] = (info['covered-by-note'] ?? 0) + 1;
      }
      continue;
    }

    const adjudication = resolveDetail ? await resolveDetail(carrier) : carrier.detail;

    if (
      carrier.label === 'Enchantments' &&
      domain === 'armor-omods' &&
      isCosmeticEnchantmentRecord(recordId, adjudication)
    ) {
      info.cosmetic = (info.cosmetic ?? 0) + 1;
      continue;
    }

    if (carrier.label === 'OverrideProjectile' && carrier.detail && client) {
      const verdict = await adjudicateOverrideProjectile(client, carrier.detail);
      if (verdict === 'benign-cosmetic-swap') {
        info['benign-cosmetic-swap'] = (info['benign-cosmetic-swap'] ?? 0) + 1;
        continue;
      }
    }

    if (carrier.key.startsWith('ability:') && client) {
      const abilityFormId = carrier.key.slice('ability:'.length);
      const offensive = await isAbilityOffensive(client, abilityFormId);
      if (!offensive) {
        const bucket = info['silent-nondamage'] ?? { count: 0, families: [] };
        bucket.count++;
        bucket.families.push(recordId);
        info['silent-nondamage'] = bucket;
        continue;
      }
    }

    const field =
      adjudication != null && adjudication.length > 0
        ? `${carrier.label} → ${adjudication}`
        : carrier.label;
    findings.push({
      kind: 'silent-drop',
      tier: 3,
      recordId,
      field,
      expected: 'modifier, note, or unresolved entry',
      actual: 'none',
    });
  }
  return { findings, info };
}

// ── Bulk fetch ─────────────────────────────────────────────────────────────

export async function bulkFetchRecords(
  client: EsmSource,
  formIds: string[],
): Promise<Map<string, EsmRecord>> {
  const map = new Map<string, EsmRecord>();
  const unique = [...new Set(formIds.filter(Boolean))];
  for (let i = 0; i < unique.length; i += BULK_CHUNK) {
    const chunk = unique.slice(i, i + BULK_CHUNK);
    const records = await client.bulkGet(chunk);
    for (let j = 0; j < chunk.length; j++) {
      map.set(chunk[j]!, records[j]!);
    }
  }
  return map;
}

// ── Domain runners ─────────────────────────────────────────────────────────

interface RunContext {
  client: EsmSource;
  mode: GameMode;
  generatedDir: string;
  tiers: Set<AuditTier>;
  metaUnresolved: string[];
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, 'utf8')) as T;
}

async function auditWeapons(ctx: RunContext): Promise<DomainAuditResult> {
  const weapons = await readJson<GeneratedWeapon[]>(join(ctx.generatedDir, 'weapons.json'));
  const result: DomainAuditResult = {
    domain: 'weapons',
    tier1: emptyStats(),
    tier2: emptyStats(),
    tier3: emptyStats(),
    findings: [],
    skippedFields: ctx.tiers.has(2) ? [WEAPON_TIER2_SKIPPED] : [],
  };

  const formIds = weapons.map((w) => w.formId);
  const records = await bulkFetchRecords(ctx.client, formIds);

  for (const weapon of weapons) {
    const rec = records.get(weapon.formId) ?? null;

    if (ctx.tiers.has(1)) {
      const idFindings = auditIdentity({
        recordId: weapon.id,
        expectedEdid: weapon.id,
        expectedName: weapon.name,
        expectedSignature: 'WEAP',
        esmRecord: rec,
      });
      result.findings.push(...idFindings);
      countResult(result.tier1, idFindings.length > 0);
    }

    if (ctx.tiers.has(2) && rec) {
      const source = await extractWeaponTier2Source(ctx.client, rec);
      const t2 = auditWeaponTier2(weapon, source);
      result.findings.push(...t2);
      countResult(result.tier2, t2.length > 0);
    }

    if (ctx.tiers.has(3) && rec) {
      const carriers = enumerateWeaponCarriers(rec);
      const t3 = await auditTier3Carriers(weapon.id, carriers, {
        notes: [],
        modifiers: weapon.modifiers,
        unresolved: unresolvedForRecord(ctx.metaUnresolved, weapon.id),
      });
      result.findings.push(...t3.findings);
      if (Object.keys(t3.info).length > 0) {
        result.tier3Info = result.tier3Info ?? {};
        mergeTier3Info(result.tier3Info, t3.info);
      }
      countResult(result.tier3, t3.findings.length > 0);
    }
  }

  result.findings = sortFindings(result.findings);
  return result;
}

async function auditOmodDomain(
  ctx: RunContext,
  domain: 'omods' | 'armor-omods',
  filename: string,
): Promise<DomainAuditResult> {
  const omods = await readJson<GeneratedOmod[]>(join(ctx.generatedDir, filename));
  const result: DomainAuditResult = {
    domain,
    tier1: emptyStats(),
    tier2: emptyStats(),
    tier3: emptyStats(),
    findings: [],
    skippedFields: ctx.tiers.has(2) ? [OMOD_TIER2_SKIPPED] : [],
  };

  const formIds = omods.map((o) => o.formId);
  const records = await bulkFetchRecords(ctx.client, formIds);
  let byFormId = new Map(records);
  byFormId = await expandOmodIncludeGraph(ctx.client, byFormId);
  const variantContainers = await fetchVariantContainerRecords(ctx.client, omods, byFormId);

  const nameOverrideNote =
    'name — extract-time only (omodDisplayName / variant suffix); omodNameOverrides applied at dataset merge (src/data/dataset.ts), not in generated JSON';
  if (ctx.tiers.has(1) && !result.skippedFields.includes(nameOverrideNote)) {
    result.skippedFields.unshift(nameOverrideNote);
  }

  for (const omod of omods) {
    const rec = records.get(omod.formId) ?? null;

    if (ctx.tiers.has(1)) {
      let failed = false;
      if (!rec) {
        const idFindings = auditIdentity({
          recordId: omod.id,
          expectedEdid: omod.id,
          expectedSignature: 'OMOD',
          esmRecord: null,
        });
        failed = idFindings.length > 0;
        result.findings.push(...idFindings);
      } else {
        const idFindings = auditIdentity({
          recordId: omod.id,
          expectedEdid: omod.id,
          expectedSignature: 'OMOD',
          esmRecord: rec,
        });
        failed = idFindings.length > 0;
        result.findings.push(...idFindings);
        if (!failed) {
          const container = omod.variantOf ? (variantContainers.get(omod.variantOf) ?? null) : null;
          const expectedName = deriveOmodExpectedName(omod, rec, container);
          const nameFindings = auditDerivedName(omod.id, expectedName, omod.name);
          if (nameFindings.length > 0) failed = true;
          result.findings.push(...nameFindings);
        }
      }
      countResult(result.tier1, failed);
    }

    if (ctx.tiers.has(2) && rec) {
      const source = await extractOmodTier2Source(ctx.client, rec, byFormId);
      const t2 = auditOmodTier2(omod, source);
      result.findings.push(...t2);
      countResult(result.tier2, t2.length > 0);
    }

    if (ctx.tiers.has(3) && rec) {
      const carriers = enumerateOmodCarriers(omod.formId, byFormId);
      const t3 = await auditTier3Carriers(
        omod.id,
        carriers,
        {
          notes: omod.notes ?? [],
          modifiers: omod.modifiers,
          unresolved: ctx.metaUnresolved,
          hasEnchantments: omod.hasEnchantments,
          hasExplosionChase: omod.explosionChase != null,
          hasChainSuppressesExplosion: omod.chainSuppressesExplosion === true,
          procChase: omod.procChase,
        },
        {
          client: ctx.client,
          domain,
          resolveDetail: async (carrier) => {
            if (carrier.detail == null) return undefined;
            try {
              const edid = await ctx.client.resolveEdid(carrier.detail);
              return `${carrier.detail} (${edid})`;
            } catch {
              return carrier.detail;
            }
          },
        },
      );
      result.findings.push(...t3.findings);
      if (Object.keys(t3.info).length > 0) {
        result.tier3Info = result.tier3Info ?? {};
        mergeTier3Info(result.tier3Info, t3.info);
      }
      countResult(result.tier3, t3.findings.length > 0);
    }
  }

  result.findings = sortFindings(result.findings);
  return result;
}

async function auditPerks(ctx: RunContext): Promise<DomainAuditResult> {
  const perks = await readJson<GeneratedPerk[]>(join(ctx.generatedDir, 'perks.json'));
  const result: DomainAuditResult = {
    domain: 'perks',
    tier1: emptyStats(),
    tier2: emptyStats(),
    tier3: emptyStats(),
    findings: [],
    skippedFields: [
      'card.minLevel/raceRestriction — PCRD fields beyond costs (extractor transform)',
      'tier-3 skipped: non-card families with zero extracted modifiers (vendor/ATX/NPC epic perks — extract-perks.ts hasCard gate)',
    ],
  };

  const allFormIds = perks.flatMap((p) => p.formIds);
  const records = await bulkFetchRecords(ctx.client, allFormIds);
  const byFormId = new Map(records);

  let pcrdByFamily = new Map<string, ReturnType<typeof toGeneratedPerkCard>>();
  if (ctx.tiers.has(2)) {
    const pcrdRows = await ctx.client.list('PCRD');
    const pcrdRecords = await bulkFetchRecords(
      ctx.client,
      pcrdRows.map((r) => r.form_id),
    );
    for (const [, rec] of pcrdRecords) {
      const parsed = toGeneratedPerkCard(rec);
      for (const rankIds of parsed.rankPerkFormIds) {
        for (const fid of rankIds) {
          const perkRec = byFormId.get(fid);
          if (!perkRec) continue;
          const family = perkRec.editor_id.replace(/\d+$/, '');
          if (!pcrdByFamily.has(family)) pcrdByFamily.set(family, parsed);
        }
      }
    }
  }

  for (const perk of perks) {
    const rank1 = records.get(perk.formIds[0] ?? '') ?? null;

    if (ctx.tiers.has(1)) {
      let failed = false;
      for (const fid of perk.formIds) {
        const rec = records.get(fid) ?? null;
        const expectedEdid = rec?.editor_id ?? fid;
        const idFindings = auditIdentity({
          recordId: perk.family,
          expectedEdid,
          expectedSignature: 'PERK',
          esmRecord: rec,
        }).filter((f) => f.field !== 'name');
        if (idFindings.length > 0) failed = true;
        result.findings.push(...idFindings);
      }
      if (rank1) {
        const nameFindings = auditIdentity({
          recordId: perk.family,
          expectedEdid: rank1.editor_id,
          expectedName: perk.name,
          expectedSignature: 'PERK',
          esmRecord: rank1,
        }).filter((f) => f.field === 'name');
        if (nameFindings.length > 0) failed = true;
        result.findings.push(...nameFindings);
      }
      countResult(result.tier1, failed);
    }

    if (ctx.tiers.has(2) && rank1) {
      const familyRecords = perk.formIds
        .map((fid) => records.get(fid))
        .filter((r): r is EsmRecord => r != null);
      const parsed = pcrdByFamily.get(perk.family);
      const effectiveMax = effectiveFamilyMaxRank(familyRecords.length, perk.card?.rankSources);
      const t2: AuditFinding[] = [];
      pushFieldMismatch(t2, perk.family, 'maxRank', effectiveMax, perk.maxRank);
      pushFieldMismatch(
        t2,
        perk.family,
        'name',
        (rank1.fields['Name'] as string) ?? perk.family,
        perk.name,
      );
      if (parsed && perk.card) {
        pushFieldMismatch(t2, perk.family, 'card.costs', parsed.card.costs, perk.card.costs);
      }
      result.findings.push(...t2);
      countResult(result.tier2, t2.length > 0);
    }

    if (ctx.tiers.has(3)) {
      const allMods = perk.ranks.flatMap((r) => r.modifiers);
      if (!perk.hasCard && allMods.length === 0) {
        result.tier3.skipped = (result.tier3.skipped ?? 0) + 1;
        continue;
      }
      const carriers: SourceCarrier[] = [];
      const seen = new Set<string>();
      for (const fid of perk.formIds) {
        const rec = records.get(fid);
        if (!rec) continue;
        for (const c of enumeratePerkCarriers(rec)) {
          if (seen.has(c.key)) continue;
          seen.add(c.key);
          carriers.push(c);
        }
      }
      const t3 = await auditTier3Carriers(
        perk.family,
        carriers,
        {
          notes: perk.notes,
          modifiers: allMods,
          unresolved: ctx.metaUnresolved,
        },
        { client: ctx.client },
      );
      result.findings.push(...t3.findings);
      if (Object.keys(t3.info).length > 0) {
        result.tier3Info = result.tier3Info ?? {};
        mergeTier3Info(result.tier3Info, t3.info);
      }
      countResult(result.tier3, t3.findings.length > 0);
    }
  }

  result.findings = sortFindings(result.findings);
  return result;
}

async function auditFormIdList<T extends { id: string; formId: string; name: string }>(
  ctx: RunContext,
  domain: AuditDomain,
  filename: string,
  signature: string,
  tier2?: (item: T, rec: EsmRecord) => AuditFinding[],
): Promise<DomainAuditResult> {
  const items = await readJson<T[]>(join(ctx.generatedDir, filename));
  const result: DomainAuditResult = {
    domain,
    tier1: emptyStats(),
    tier2: emptyStats(),
    tier3: emptyStats(),
    findings: [],
    skippedFields: [],
    tier3Note: ctx.tiers.has(3) ? `tier 3 not implemented for ${domain}` : undefined,
  };

  const records = await bulkFetchRecords(
    ctx.client,
    items.map((i) => i.formId),
  );

  for (const item of items) {
    const rec = records.get(item.formId) ?? null;

    if (ctx.tiers.has(1)) {
      const idFindings = auditIdentity({
        recordId: item.id,
        expectedEdid: item.id,
        expectedName: item.name,
        expectedSignature: signature,
        esmRecord: rec,
      });
      result.findings.push(...idFindings);
      countResult(result.tier1, idFindings.length > 0);
    }

    if (ctx.tiers.has(2) && tier2 && rec) {
      const t2 = tier2(item, rec);
      result.findings.push(...t2);
      countResult(result.tier2, t2.length > 0);
    }

    if (ctx.tiers.has(3)) {
      result.tier3.skipped = (result.tier3.skipped ?? 0) + 1;
    }
  }

  result.findings = sortFindings(result.findings);
  return result;
}

async function auditBuffDomain(
  ctx: RunContext,
  domain: 'mutations' | 'consumables',
  filename: string,
): Promise<DomainAuditResult> {
  const items = await readJson<GeneratedBuff[]>(join(ctx.generatedDir, filename));
  const result: DomainAuditResult = {
    domain,
    tier1: emptyStats(),
    tier2: emptyStats(),
    tier3: emptyStats(),
    findings: [],
    skippedFields: [BUFF_TIER2_SKIPPED],
    tier3Note: ctx.tiers.has(3) ? `tier 3 not implemented for ${domain}` : undefined,
  };

  const records = await bulkFetchRecords(
    ctx.client,
    items.map((i) => i.formId),
  );

  for (const buff of items) {
    const rec = records.get(buff.formId) ?? null;
    const sig = buff.kind === 'mutation' ? 'SPEL' : 'ALCH';

    if (ctx.tiers.has(1)) {
      const idFindings = auditIdentity({
        recordId: buff.id,
        expectedEdid: buff.id,
        expectedName: buff.name,
        expectedSignature: sig,
        esmRecord: rec,
      });
      result.findings.push(...idFindings);
      countResult(result.tier1, idFindings.length > 0);
    }

    if (ctx.tiers.has(2) && rec) {
      const esmName = (rec.fields['Name'] as string) ?? buff.id;
      const t2 = auditBuffTier2(buff, esmName);
      result.findings.push(...t2);
      countResult(result.tier2, t2.length > 0);
    }

    if (ctx.tiers.has(3)) {
      result.tier3.skipped = (result.tier3.skipped ?? 0) + 1;
    }
  }

  result.findings = sortFindings(result.findings);
  return result;
}

async function auditUniques(ctx: RunContext, omods: GeneratedOmod[]): Promise<DomainAuditResult> {
  const uniques = await readJson<GeneratedUnique[]>(join(ctx.generatedDir, 'uniques.json'));
  const omodById = new Map(omods.map((o) => [o.id, o]));
  const result: DomainAuditResult = {
    domain: 'uniques',
    tier1: emptyStats(),
    tier2: emptyStats(),
    tier3: emptyStats(),
    findings: [],
    skippedFields: [
      'preset mod loadout — derived from WEAP Object Template (tier 3)',
      'name — preset display label from Object Template Combination.Name / resolveContainerPresetName (extract-uniques.ts), not identity OMOD Name',
    ],
    tier3Note: ctx.tiers.has(3) ? 'tier 3 not implemented for uniques' : undefined,
  };

  const identityFormIds = uniques.map((u) => {
    const idOmodId = u.mods['ap_customName'] ?? u.mods['ap_Item_Description'] ?? u.id;
    return omodById.get(idOmodId)?.formId ?? null;
  });

  const records = await bulkFetchRecords(
    ctx.client,
    identityFormIds.filter((f): f is string => f != null),
  );

  for (let i = 0; i < uniques.length; i++) {
    const unique = uniques[i]!;
    const idOmodId =
      unique.mods['ap_customName'] ?? unique.mods['ap_Item_Description'] ?? unique.id;
    const omod = omodById.get(idOmodId);
    const rec = omod ? (records.get(omod.formId) ?? null) : null;

    if (ctx.tiers.has(1)) {
      let failed = false;
      if (!omod || !rec) {
        pushIdentity(
          result.findings,
          unique.id,
          'identityOmod',
          idOmodId,
          omod ? 'missing ESM' : 'missing omod',
        );
        failed = true;
      } else {
        const idFindings = auditIdentity({
          recordId: unique.id,
          expectedEdid: omod.id,
          expectedSignature: 'OMOD',
          esmRecord: rec,
        });
        failed = idFindings.length > 0;
        result.findings.push(...idFindings);
      }
      countResult(result.tier1, failed);
    }

    if (ctx.tiers.has(3)) {
      result.tier3.skipped = (result.tier3.skipped ?? 0) + 1;
    }
  }

  result.findings = sortFindings(result.findings);
  return result;
}

async function auditNpcs(ctx: RunContext): Promise<DomainAuditResult> {
  const npcs = await readJson<GeneratedNpc[]>(join(ctx.generatedDir, 'npcs.json'));
  const result: DomainAuditResult = {
    domain: 'npcs',
    tier1: emptyStats(),
    tier2: emptyStats(),
    tier3: emptyStats(),
    findings: [],
    skippedFields: ctx.tiers.has(1)
      ? ['name — curated display label (CURATED_TARGETS), not the NPC_ Name field']
      : [],
    tier3Note: ctx.tiers.has(3) ? 'tier 3 not implemented for npcs' : undefined,
  };

  if (ctx.tiers.has(2)) {
    result.skippedFields.push(NPC_TIER2_SKIPPED);
  }

  const records = await bulkFetchRecords(
    ctx.client,
    npcs.map((n) => n.formId),
  );

  for (const npc of npcs) {
    const rec = records.get(npc.formId) ?? null;

    if (ctx.tiers.has(1)) {
      const idFindings = auditIdentity({
        recordId: npc.id,
        expectedEdid: rec?.editor_id ?? npc.id,
        expectedSignature: 'NPC_',
        esmRecord: rec,
      }).filter((f) => f.field !== 'name' && f.field !== 'edid');
      result.findings.push(...idFindings);
      countResult(result.tier1, idFindings.length > 0);
    }

    if (ctx.tiers.has(2) && rec) {
      const source = await extractNpcTier2Source(ctx.client, rec, npc.id);
      const t2 = auditNpcTier2(npc, source.healthFlat, source.levelMin, source.levelMax);
      result.findings.push(...t2);
      countResult(result.tier2, t2.length > 0);
    }

    if (ctx.tiers.has(3)) {
      result.tier3.skipped = (result.tier3.skipped ?? 0) + 1;
    }
  }

  result.findings = sortFindings(result.findings);
  return result;
}

async function auditHealing(ctx: RunContext): Promise<DomainAuditResult> {
  const items = await readJson<GeneratedHealingItem[]>(
    join(ctx.generatedDir, 'healing-items.json'),
  );
  const result: DomainAuditResult = {
    domain: 'healing',
    tier1: emptyStats(),
    tier2: emptyStats(),
    tier3: emptyStats(),
    findings: [],
    skippedFields: [
      'legs — StimpakRestoreHealth MGEF magnitudes use GLOB/curve resolution when present',
    ],
    tier3Note: ctx.tiers.has(3) ? 'tier 3 not implemented for healing' : undefined,
  };

  const STIMPAK_MGEF = '0x0021DDB8';
  const records = await bulkFetchRecords(
    ctx.client,
    items.map((i) => i.formId),
  );

  for (const item of items) {
    const rec = records.get(item.formId) ?? null;

    if (ctx.tiers.has(1)) {
      const idFindings = auditIdentity({
        recordId: item.id,
        expectedEdid: item.id,
        expectedName: item.name,
        expectedSignature: 'ALCH',
        esmRecord: rec,
      });
      result.findings.push(...idFindings);
      countResult(result.tier1, idFindings.length > 0);
    }

    if (ctx.tiers.has(2) && rec) {
      const effects = parseMagicEffects(rec).filter((e) => e.mgefFormId === STIMPAK_MGEF);
      const sourceLegs = effects.map((e) => ({
        magnitudePctMaxHpPerSec: e.magnitude,
        durationSec: e.duration,
      }));
      const t2: AuditFinding[] = [];
      pushFieldMismatch(t2, item.id, 'legs', sourceLegs, item.legs);
      result.findings.push(...t2);
      countResult(result.tier2, t2.length > 0);
    }

    if (ctx.tiers.has(3)) {
      result.tier3.skipped = (result.tier3.skipped ?? 0) + 1;
    }
  }

  result.findings = sortFindings(result.findings);
  return result;
}

async function runDomain(ctx: RunContext, domain: AuditDomain): Promise<DomainAuditResult> {
  switch (domain) {
    case 'weapons':
      return auditWeapons(ctx);
    case 'omods':
      return auditOmodDomain(ctx, 'omods', 'omods.json');
    case 'armor-omods':
      return auditOmodDomain(ctx, 'armor-omods', 'armor-omods.json');
    case 'perks':
      return auditPerks(ctx);
    case 'mutations':
      return auditBuffDomain(ctx, 'mutations', 'mutations.json');
    case 'consumables':
      return auditBuffDomain(ctx, 'consumables', 'consumables.json');
    case 'addictions':
      return auditFormIdList<GeneratedAddiction>(
        ctx,
        'addictions',
        'addictions.json',
        'SPEL',
        (item, rec) =>
          auditBuffTier2(
            {
              id: item.id,
              formId: item.formId,
              name: item.name,
              kind: 'mutation',
              modifiers: item.modifiers,
              notes: item.notes,
            },
            (rec.fields['Name'] as string) ?? item.id,
          ),
      );
    case 'armor':
      return auditFormIdList<GeneratedArmor>(ctx, 'armor', 'armor.json', 'ARMO');
    case 'bodyparts': {
      const items = await readJson<GeneratedBodyPartRace[]>(
        join(ctx.generatedDir, 'bodyparts.json'),
      );
      const result: DomainAuditResult = {
        domain: 'bodyparts',
        tier1: emptyStats(),
        tier2: emptyStats(),
        tier3: emptyStats(),
        findings: [],
        skippedFields: ['name — curated display label; id may be NPC_ while formId is RACE'],
        tier3Note: ctx.tiers.has(3) ? 'tier 3 not implemented for bodyparts' : undefined,
      };
      const records = await bulkFetchRecords(
        ctx.client,
        items.map((i) => i.formId),
      );
      for (const item of items) {
        const rec = records.get(item.formId) ?? null;
        if (ctx.tiers.has(1)) {
          const idFindings = auditIdentity({
            recordId: item.id,
            expectedEdid: item.raceEdid,
            expectedSignature: 'RACE',
            esmRecord: rec,
          }).filter((f) => f.field !== 'name');
          result.findings.push(...idFindings);
          countResult(result.tier1, idFindings.length > 0);
        }
        if (ctx.tiers.has(3)) {
          result.tier3.skipped = (result.tier3.skipped ?? 0) + 1;
        }
      }
      result.findings = sortFindings(result.findings);
      return result;
    }
    case 'npcs':
      return auditNpcs(ctx);
    case 'healing':
      return auditHealing(ctx);
    case 'uniques': {
      const omods = await readJson<GeneratedOmod[]>(join(ctx.generatedDir, 'omods.json'));
      return auditUniques(ctx, omods);
    }
    default:
      throw new Error(`unknown domain ${domain satisfies never}`);
  }
}

// ── Report ─────────────────────────────────────────────────────────────────

function formatTierStats(stats: TierStats): string {
  const skip = stats.skipped != null ? `, skipped ${stats.skipped}` : '';
  return `checked ${stats.checked}, passed ${stats.passed}, failed ${stats.failed}${skip}`;
}

function formatTier3Info(info: Tier3InfoBuckets | undefined): string[] {
  if (!info) return [];
  const lines: string[] = [];
  if (info['covered-by-note']) {
    lines.push(`- covered-by-note: ${info['covered-by-note']}`);
  }
  if (info.cosmetic) {
    lines.push(`- cosmetic: ${info.cosmetic}`);
  }
  if (info['benign-cosmetic-swap']) {
    lines.push(`- benign-cosmetic-swap: ${info['benign-cosmetic-swap']}`);
  }
  if (info['silent-nondamage']) {
    lines.push(
      `- silent-nondamage: ${info['silent-nondamage'].count} (${info['silent-nondamage'].families.join(', ')})`,
    );
  }
  return lines;
}

export function formatMarkdownReport(summary: AuditSummary): string {
  const lines: string[] = [
    '# ESM record audit',
    '',
    `Mode: **${summary.mode}** · ESM: \`${summary.esmPath}\``,
    `Total findings: **${summary.totalFindings}**`,
    '',
  ];

  for (const domain of summary.domains) {
    lines.push(`## ${domain.domain}`, '');
    if (domain.skippedFields.length > 0) {
      lines.push('**Tier-2 skipped fields:**');
      for (const s of domain.skippedFields) lines.push(`- ${s}`);
      lines.push('');
    }
    if (domain.tier3Note) {
      lines.push(`_${domain.tier3Note}_`, '');
    }
    lines.push(
      `- Tier 1: ${formatTierStats(domain.tier1)}`,
      `- Tier 2: ${formatTierStats(domain.tier2)}`,
      `- Tier 3: ${formatTierStats(domain.tier3)}`,
      '',
    );

    const infoLines = formatTier3Info(domain.tier3Info);
    if (infoLines.length > 0) {
      lines.push('**Tier-3 info (not findings):**');
      lines.push(...infoLines);
      lines.push('');
    }

    if (domain.findings.length === 0) {
      lines.push('_No findings._', '');
      continue;
    }

    lines.push('| Record | Tier | Kind | Field | Expected | Actual |');
    lines.push('| --- | ---: | --- | --- | --- | --- |');
    for (const f of domain.findings) {
      const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\n/g, ' ');
      lines.push(
        `| ${esc(f.recordId)} | ${f.tier} | ${f.kind} | ${esc(f.field)} | ${esc(f.expected)} | ${esc(f.actual)} |`,
      );
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ── CLI ────────────────────────────────────────────────────────────────────

async function main() {
  const { values } = parseArgs({
    options: {
      esm: { type: 'string' },
      mode: { type: 'string', default: 'live' },
      domain: { type: 'string' },
      tier: { type: 'string' },
      json: { type: 'string' },
      out: { type: 'string' },
    },
  });

  const esmPath = values.esm ?? process.env.FO76_ESM_PATH;
  if (!esmPath) {
    console.error(
      'Usage: bun run audit:records [--esm <path>] [--mode live|pts] [--domain weapons,...] [--tier 1,2,3] [--json <path>] [--out <path>]',
    );
    console.error('(or set the FO76_ESM_PATH env var to omit --esm)');
    process.exit(1);
  }
  if (!existsSync(esmPath)) {
    console.error(`ESM path does not exist: ${esmPath}`);
    process.exit(1);
  }

  const mode = values.mode as GameMode;
  if (mode !== 'live' && mode !== 'pts') {
    console.error(`Invalid --mode "${mode}" (expected live or pts)`);
    process.exit(1);
  }

  const domains: AuditDomain[] = values.domain
    ? (values.domain.split(',').map((s) => s.trim()) as AuditDomain[])
    : [...ALL_DOMAINS];
  for (const d of domains) {
    if (!ALL_DOMAINS.includes(d)) {
      console.error(`Unknown --domain "${d}" (known: ${ALL_DOMAINS.join(', ')})`);
      process.exit(1);
    }
  }

  const tiers = new Set<AuditTier>(
    values.tier
      ? (values.tier.split(',').map((s) => Number(s.trim()) as AuditTier) as AuditTier[])
      : [1, 2, 3],
  );
  for (const t of tiers) {
    if (t !== 1 && t !== 2 && t !== 3) {
      console.error(`Invalid --tier "${t}" (expected 1, 2, and/or 3)`);
      process.exit(1);
    }
  }

  const generatedDir = join(repoRoot, 'src/data', mode, 'generated');
  let metaUnresolved: string[] = [];
  const metaPath = join(generatedDir, '_meta.json');
  if (existsSync(metaPath)) {
    const meta = JSON.parse(await readFile(metaPath, 'utf8')) as GeneratedMeta;
    metaUnresolved = meta.unresolved ?? [];
  }

  const client = new EsmClient(esmPath);
  const ctx: RunContext = {
    client,
    mode,
    generatedDir,
    tiers,
    metaUnresolved,
  };

  const domainResults: DomainAuditResult[] = [];
  for (const domain of domains) {
    console.error(`Auditing ${domain}…`);
    domainResults.push(await runDomain(ctx, domain));
  }

  const totalFindings = domainResults.reduce((n, d) => n + d.findings.length, 0);
  const summary: AuditSummary = { mode, esmPath, domains: domainResults, totalFindings };
  const markdown = formatMarkdownReport(summary);

  if (values.out) {
    await writeFile(values.out, markdown);
  } else {
    console.log(markdown);
  }

  if (values.json) {
    await writeFile(
      values.json,
      JSON.stringify(
        {
          ...summary,
          domains: summary.domains.map((d) => ({
            ...d,
            findings: sortFindings(d.findings),
          })),
        },
        null,
        2,
      ),
    );
  }

  process.exitCode = totalFindings > 0 ? 1 : 0;
}

if (import.meta.main) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
