import type { EsmRecord } from './esm-client';

export interface RawProperty {
  functionType: 'SET' | 'MUL_ADD' | 'ADD' | string;
  property: string;
  value1: unknown;
  value2: unknown;
  /** When a property carries a curve table, the curve OVERRIDES the hardcoded value (user-confirmed). */
  hasCurveTable: boolean;
  /** Inline curve points (Y by item level) when the curve table parses — feeds itemLevel-input curve modifiers. */
  curvePoints: Array<{ x: number; y: number }> | null;
}

/**
 * Property values that arrive as a bare number instead of the usual
 * `{value,name}` join (verified 2026-07-13 on mod_Custom_UnstoppableMonster /
 * WhistleInTheDark / SoleSurvivor): 116 = "attach this PERK to the wielder"
 * (Value 1 = PERK formid, Value 2 = 1, ADD — the unique-mod rework's
 * mechanism for granting a perk from gear, decoded below as 'AttachedPerk').
 * Other raw numbers are unmapped today.
 */
const RAW_NUMERIC_PROPERTIES: Record<number, string> = {
  116: 'AttachedPerk',
};

/**
 * Property-name spellings that differ between the WEAPON and ARMOR OMOD
 * property enums despite meaning the same thing (verified 2026-07-18, Phase
 * 3 armor pipeline full-extraction sweep: armor's enum consistently spells
 * out multi-word names the weapon enum concatenates — "Actor Values" vs
 * "ActorValues", "Color Remapping Index" vs "ColorRemappingIndex", "Material
 * Swaps" vs "MaterialSwaps", "Model Swap" vs "ModelSwap"; "Enchantments"/
 * "Keywords" carry different numeric `value`s too but the SAME string name
 * across both enums, so no alias needed there). Normalized here so every
 * downstream `prop.property === 'ActorValues'`-style check (and
 * PROPERTY_BUCKETS/PROPERTY_IGNORED lookups) works uniformly regardless of
 * which enum the record used — a real, not-yet-seen weapon/armor spelling
 * split would otherwise surface silently as an `unknownProperties` entry
 * needing its own aliasing.
 */
const PROPERTY_NAME_ALIASES: Record<string, string> = {
  'Actor Values': 'ActorValues',
  'Color Remapping Index': 'ColorRemappingIndex',
  'Material Swaps': 'MaterialSwaps',
  'Model Swap': 'ModelSwap',
  // Property 116: unique-mod perk grant. Older `esm` dumps surfaced it as a bare
  // number (→ RAW_NUMERIC_PROPERTIES); current dumps use the enum name "Perk".
  Perk: 'AttachedPerk',
};

/** Exposed for tests: resolve a raw `Property` field to its name. */
export function propertyName(raw: unknown): string {
  if (typeof raw === 'number') return RAW_NUMERIC_PROPERTIES[raw] ?? `Property#${raw}`;
  const named = (raw as Record<string, unknown> | null | undefined)?.['name'];
  if (typeof named !== 'string') return 'Unknown';
  return PROPERTY_NAME_ALIASES[named] ?? named;
}

export function parseProperties(data: Record<string, unknown>): RawProperty[] {
  const props = data['Properties'];
  if (!Array.isArray(props)) return [];
  return (props as Array<Record<string, unknown>>).map((p) => {
    const curveNode = p['Curve Table'] as
      | { curve?: Array<{ x: number; y: number }> }
      | null
      | undefined;
    return {
      functionType: (
        ((p['Function Type'] as Record<string, unknown>)?.['name'] as string) ?? 'SET'
      ).replace('MUL+ADD', 'MUL_ADD'),
      property: propertyName(p['Property']),
      value1: p['Value 1'],
      value2: p['Value 2'],
      hasCurveTable: p['Curve Table'] != null,
      curvePoints:
        Array.isArray(curveNode?.curve) && curveNode.curve.length > 0 ? curveNode.curve : null,
    };
  });
}

export function omodData(record: EsmRecord): Record<string, unknown> {
  return (record.fields['Data'] ?? {}) as Record<string, unknown>;
}

export function includeFormIds(data: Record<string, unknown>): string[] {
  const includes = data['Includes'];
  if (!Array.isArray(includes)) return [];
  return (includes as Array<Record<string, unknown>>)
    .map((i) => i['Mod'])
    .filter((m): m is string => typeof m === 'string');
}

/** Recursively collect properties from an OMOD and its include chain. */
export function collectProperties(
  formId: string,
  byFormId: ReadonlyMap<string, EsmRecord>,
  seen: Set<string> = new Set(),
): RawProperty[] {
  if (seen.has(formId)) return [];
  seen.add(formId);
  const record = byFormId.get(formId);
  if (!record) return [];
  const data = omodData(record);
  const own = parseProperties(data);
  const inherited = includeFormIds(data).flatMap((id) => collectProperties(id, byFormId, seen));
  // Parents first: a child's SET should win over an included parent's.
  return [...inherited, ...own];
}
