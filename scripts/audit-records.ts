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
import { parseMagicEffects, ENTRY_POINT_BUCKETS } from './extract/normalize/mgef';
import { ACTOR_VALUE_BUCKETS } from './extract/extract-omods';
import { collectProperties } from './extract/omod-properties';
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

export interface DomainAuditResult {
  domain: AuditDomain;
  tier1: TierStats;
  tier2: TierStats;
  tier3: TierStats;
  findings: AuditFinding[];
  skippedFields: string[];
  tier3Note?: string;
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
  const properties = collectProperties(record.header.form_id, byFormId);
  const addedKeywords: string[] = [];
  let hasEnchantments = false;
  for (const prop of properties) {
    if (
      prop.property === 'Keywords' &&
      prop.functionType === 'ADD' &&
      typeof prop.value1 === 'string'
    ) {
      addedKeywords.push(await client.resolveEdid(prop.value1));
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
    carriers.push({ key, label: prop.property });
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

export function isCarrierAccounted(
  recordKey: string,
  carrier: SourceCarrier,
  generatedNotes: readonly string[],
  generatedModifiers: readonly Modifier[],
  unresolved: readonly string[],
): boolean {
  const needles = [carrier.key, carrier.label, carrier.label.split(' ')[0] ?? carrier.label];
  const haystacks = [...generatedNotes, ...unresolved];
  if (haystacks.some((h) => h.includes(recordKey) && needles.some((n) => h.includes(n)))) {
    return true;
  }
  if (carrier.key.startsWith('property:')) {
    const prop = carrier.label;
    if (unresolved.some((u) => u.includes(`unknown OMOD property: ${prop}`))) return true;
  }
  if (carrier.key.startsWith('entryPoint:')) {
    if (unresolved.some((u) => u.includes(`unknown entry point: ${carrier.label}`))) return true;
  }
  if (generatedModifiers.length > 0 && carrier.key.startsWith('property:')) {
    return true;
  }
  if (
    generatedModifiers.length > 0 &&
    (carrier.key.startsWith('enchantment:') || carrier.key.startsWith('ability:'))
  ) {
    return true;
  }
  return false;
}

export function auditTier3Carriers(
  recordId: string,
  carriers: SourceCarrier[],
  generatedNotes: readonly string[],
  generatedModifiers: readonly Modifier[],
  unresolved: readonly string[],
): AuditFinding[] {
  const findings: AuditFinding[] = [];
  for (const carrier of carriers) {
    if (isCarrierAccounted(recordId, carrier, generatedNotes, generatedModifiers, unresolved))
      continue;
    findings.push({
      kind: 'silent-drop',
      tier: 3,
      recordId,
      field: carrier.label,
      expected: 'modifier, note, or unresolved entry',
      actual: 'none',
    });
  }
  return findings;
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
      const t3 = auditTier3Carriers(
        weapon.id,
        carriers,
        [],
        weapon.modifiers,
        ctx.metaUnresolved.filter((u) => u.includes(weapon.id)),
      );
      result.findings.push(...t3);
      countResult(result.tier3, t3.length > 0);
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
  const byFormId = new Map(records);

  for (const omod of omods) {
    const rec = records.get(omod.formId) ?? null;

    if (ctx.tiers.has(1)) {
      const idFindings = auditIdentity({
        recordId: omod.id,
        expectedEdid: omod.id,
        expectedName: omod.name,
        expectedSignature: 'OMOD',
        esmRecord: rec,
      });
      result.findings.push(...idFindings);
      countResult(result.tier1, idFindings.length > 0);
    }

    if (ctx.tiers.has(2) && rec) {
      const source = await extractOmodTier2Source(ctx.client, rec, byFormId);
      const t2 = auditOmodTier2(omod, source);
      result.findings.push(...t2);
      countResult(result.tier2, t2.length > 0);
    }

    if (ctx.tiers.has(3) && rec) {
      const carriers = enumerateOmodCarriers(omod.formId, byFormId);
      const notes = (omod as GeneratedOmod & { notes?: string[] }).notes ?? [];
      const t3 = auditTier3Carriers(omod.id, carriers, notes, omod.modifiers, ctx.metaUnresolved);
      result.findings.push(...t3);
      countResult(result.tier3, t3.length > 0);
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
      const allMods = perk.ranks.flatMap((r) => r.modifiers);
      const t3 = auditTier3Carriers(perk.family, carriers, perk.notes, allMods, ctx.metaUnresolved);
      result.findings.push(...t3);
      countResult(result.tier3, t3.length > 0);
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
    skippedFields: ['preset mod loadout — derived from WEAP Object Template (tier 3)'],
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
          expectedName: omod.name,
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
      // Minimal HP/level spot check — flat health Properties row only.
      const props = (rec.fields['Properties'] as Array<Record<string, unknown>> | undefined) ?? [];
      let healthFlat = 0;
      for (const row of props) {
        const av = row['Actor Value'] as Record<string, unknown> | undefined;
        if (av?.['value'] === 0x2d4 || av?.['name'] === 'Health') {
          healthFlat = asNumber(row['Value']);
        }
      }
      const scaling = (rec.fields['Actor Scaling Info'] ?? {}) as Record<string, unknown>;
      const t2 = auditNpcTier2(npc, healthFlat, null, null);
      void scaling;
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
