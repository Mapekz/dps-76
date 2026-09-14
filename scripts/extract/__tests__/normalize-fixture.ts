import type { EsmRecord, EsmSource } from '../esm-client';
import { createInMemoryEsmSource } from '../esm-source-fake';
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
