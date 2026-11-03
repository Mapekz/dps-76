import type { EsmRecord, EsmSource } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';
import type { RawCondition } from '../normalize/conditions';
import type { MgefInfo, SpellEffect } from '../normalize/mgef';

// Shared plain-fixture builders for the normalize/* tests. Every call returns
// a fresh object — translation code mutates deps maps, never share one.

export function mgef(overrides: Partial<MgefInfo> = {}): MgefInfo {
  return {
    edid: 'TestMgef',
    name: 'Test',
    archetype: 'Value Modifier',
    actorValue: '0xAV',
    resistValue: null,
    perkToApply: null,
    explosion: null,
    keywords: [],
    dispelWithKeywords: false,
    detrimental: false,
    conditionRows: [],
    ...overrides,
  };
}

export function effect(overrides: Partial<SpellEffect> = {}): SpellEffect {
  return {
    mgefFormId: '0xM',
    magnitude: 0,
    duration: 0,
    conditionRows: [],
    curvePoints: null,
    curveInputAv: null,
    magnitudeGlobal: null,
    cooldownDurationSec: null,
    area: null,
    ...overrides,
  };
}

/** One `Equal To` condition row; `extra` adds or overrides fields. */
export function eq(fn: string, cmp: number, extra: Partial<RawCondition> = {}): RawCondition {
  return { Function: fn, 'Comparison Value': cmp, Operator: 'Equal To', ...extra };
}

/** One PERK `Effects[].Effect` entry point; `fields` adds Float, Curve Table, conditions, …. */
export function entryPointEffect(
  epName: string,
  functionName: string,
  fields: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    'Effect Header': { 'Effect Type': { name: 'Entry Point' } },
    'Entry Point': { 'Entry Point': { name: epName }, Function: { name: functionName } },
    ...fields,
  };
}

/** Raw ESM `Conditions` node: `{ Conditions: [{ Condition: { 'Condition Data': row } }] }`. */
export function esmEffectConditions(rows: object[]) {
  return {
    Conditions: rows.map((data) => ({ Condition: { 'Condition Data': data } })),
  };
}

/**
 * In-memory source over `records`; `resolveEdid` misses fall back to `edids`
 * (a map or function), else to the formid itself.
 */
export function fixtureClient(
  records: Record<string, unknown>,
  edids?: Map<string, string> | ((formId: string) => string),
): EsmSource {
  return createInMemoryEsmSource({
    records: Object.fromEntries(
      Object.entries(records).map(([k, v]) => [k, v as unknown as EsmRecord]),
    ),
    resolveEdidFallback:
      typeof edids === 'function' ? edids : (formId) => edids?.get(formId) ?? formId,
  });
}
