import type { Bucket, Condition, CurveInput, Modifier, ModifierFragment, ModifierSource, ValueCurve } from '../../../src/types/modifiers';
import type { EsmClient, EsmRecord } from '../esm-client';
import {
  flattenConditionRows,
  flattenPerkConditionRows,
  translateConditions,
  type ConditionTranslationContext,
  type RawCondition,
} from './conditions';

/**
 * Shared MGEF → Modifier translation, driven by the hidden engine "plumbing"
 * perks (STAT_DamagePerk & co.) that define how each STAT_* actor value feeds
 * the damage formula. Used by perk, legendary, mutation, and consumable
 * extraction.
 */

/** Entry-point name → formula bucket (plumbing perks + direct perk entry points). */
export const ENTRY_POINT_BUCKETS: Record<string, Bucket> = {
  'Mod Weapon DMG Bonus Mult': 'dbm',
  'Mod My Critical Hit Damage Mult': 'critDmgBonus',
  'Mod Sneak Attack Mult': 'sneakBonus',
  'Mod Weak Body Part Damage Mult': 'weakpointBonus',
  'Mod Outgoing Limb Damage': 'limbDamage',
  'Mod Player Explosion Damage': 'explosionMult',
  'Mod Power Attack Damage': 'powerAttackBonus',
  // Percent-of-meter semantics (Critical Savvy SETs 85/70/55); see crit-meter.ts.
  'Mod VATS Critical Cost': 'critConsumption',
  'Mod VATS Critical Charge': 'critFill',
};

/** Fallback AVIF routes for stats consumed outside the plumbing perks (DFOBs etc.). */
export const FALLBACK_AVIF_ROUTES: Record<string, { bucket: Bucket; scale: number; conditions?: Condition[] }> = {
  STAT_SneakAttackBonus: { bucket: 'sneakBonus', scale: 0.01 },
  STAT_DmgPowerAttack: { bucket: 'powerAttackBonus', scale: 0.01 },
  // Read directly by DamageVsNonWeakpoint_DO in the damage formula.
  STAT_DmgVsTorso: { bucket: 'dbm', scale: 0.01, conditions: [{ kind: 'bodyPart', part: 'torso' }] },
};

export interface AvifRoute {
  bucket: Bucket;
  scale: number;
  rawConditions: RawCondition[];
}

const PLUMBING_PERKS = ['STAT_DamagePerk', 'STAT_CritDamagePerk', 'STAT_DamageVsPerk'];

export function collectConditionFormIds(rows: RawCondition[], into: Set<string>): void {
  for (const row of rows) {
    const p = row['Parameter 1'];
    if (typeof p === 'string' && p.startsWith('0x')) into.add(p);
  }
}

export async function buildAvifRoutes(client: EsmClient, formIdPool: Set<string>): Promise<Map<string, AvifRoute[]>> {
  const routes = new Map<string, AvifRoute[]>();
  for (const edid of PLUMBING_PERKS) {
    const record = await client.get(edid);
    const effects = record.fields['Effects'];
    if (!Array.isArray(effects)) continue;
    for (const item of effects as Array<Record<string, unknown>>) {
      const e = item['Effect'] as Record<string, unknown>;
      const ep = (e['Entry Point'] ?? {}) as Record<string, unknown>;
      const name = ((ep['Entry Point'] as Record<string, unknown> | undefined)?.['name'] as string) ?? '';
      const bucket = ENTRY_POINT_BUCKETS[name];
      const actorValue = e['Function Parameter 3 (Actor Value)'] as string | undefined;
      if (!bucket || !actorValue) continue;

      const rawConditions = flattenPerkConditionRows(e['Perk Conditions']);
      collectConditionFormIds(rawConditions, formIdPool);
      const list = routes.get(actorValue) ?? [];
      list.push({ bucket, scale: typeof e['Float'] === 'number' ? (e['Float'] as number) : 0.01, rawConditions });
      routes.set(actorValue, list);
    }
  }
  return routes;
}

/**
 * Curve input axes: the effect-level "Actor Value" on curve-bearing effects
 * names the player stat the curve X is read from. These low engine AVs have
 * no ESM records, so they're mapped by formid constant.
 */
const CURVE_INPUT_AVS: Record<string, CurveInput> = {
  '0x00000392': 'healthFraction', // current HP / max HP (Bloodied, Nerd Rage)
  '0x00000393': 'capsOnHand', // Aristocrat's
  '0x00000399': 'killStreak', // Adrenal Reaction
  '0x001EB998': 'addictionCount', // Junkie's
  '0x006C3172': 'consecutiveHits', // Furious
};

export interface SpellEffect {
  mgefFormId: string;
  magnitude: number;
  duration: number;
  conditionRows: RawCondition[];
  /** Value curve: Y at X = effect-level input Actor Value (overrides magnitude). */
  curvePoints: Array<{ x: number; y: number }> | null;
  curveInputAv: string | null;
}

/** Parse the Effects list of a SPEL/ENCH/ALCH record. */
export function parseMagicEffects(record: EsmRecord): SpellEffect[] {
  const effects = record.fields['Effects'];
  if (!Array.isArray(effects)) return [];
  const out: SpellEffect[] = [];
  for (const item of effects as Array<Record<string, unknown>>) {
    const e = item['Effect'] as Record<string, unknown> | undefined;
    if (!e) continue;
    const data = (e['Effect Item Data'] ?? {}) as Record<string, unknown>;
    const curveTable = e['Curve Table'] as { curve?: Array<{ x: number; y: number }> } | undefined;
    out.push({
      mgefFormId: (e['Base Effect'] as string) ?? '',
      magnitude: (data['Magnitude'] as number) ?? 0,
      duration: (data['Duration'] as number) ?? 0,
      conditionRows: flattenConditionRows(e['Conditions']),
      curvePoints: Array.isArray(curveTable?.curve) && curveTable.curve.length > 0 ? curveTable.curve : null,
      curveInputAv: (e['Actor Value'] as string) ?? null,
    });
  }
  return out;
}

export interface MgefInfo {
  edid: string;
  name: string;
  archetype: string;
  actorValue: string | null;
}

export async function getMgefInfo(client: EsmClient, formId: string): Promise<MgefInfo> {
  const record = await client.get(formId);
  const data = ((record.fields['Magic Effect Data'] as Record<string, unknown> | undefined)?.['Data'] ?? {}) as Record<string, unknown>;
  return {
    edid: record.editor_id,
    name: (record.fields['Name'] as string) ?? record.editor_id,
    archetype: ((data['Archetype'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown',
    actorValue: (data['Actor Value'] as string) ?? null,
  };
}

export interface MgefTranslationDeps {
  client: EsmClient;
  routes: Map<string, AvifRoute[]>;
  edidByFormId: Map<string, string>;
  /**
   * Treat duration > 0 as always-active instead of flagging it: consumables
   * and equipped legendary effects are timed by nature — selecting them IS
   * the toggle. Perk proc-buffs keep the flag.
   */
  timedIsActive?: boolean;
}

export interface MgefTranslationResult {
  modifiers: ModifierFragment[];
  notes: string[];
  unmappedAvifs: string[];
}

export interface TranslateOptions {
  timedIsActive?: boolean;
  conditionCtx?: Partial<ConditionTranslationContext>;
}

/**
 * Pure MGEF → IR translation. Every ESM lookup the effect needs must already
 * be resolved into `edidByFormId` (condition params + the MGEF's actor value) —
 * see `translateMagicEffect` for the async gather. A value curve overrides the
 * magnitude: effective value = interpolate(curve, input) × route scale. Non-stat
 * archetypes and unmapped damage AVIFs come back as notes for the overrides layer.
 */
export function translate(
  mgef: MgefInfo,
  effect: SpellEffect,
  routes: Map<string, AvifRoute[]>,
  edidByFormId: Map<string, string>,
  opts: TranslateOptions = {}
): MgefTranslationResult {
  const result: MgefTranslationResult = { modifiers: [], notes: [], unmappedAvifs: [] };

  const { conditions: effectConds, unresolved } = translateConditions(effect.conditionRows, {
    edidByFormId,
    ...opts.conditionCtx,
  });
  if (effectConds === null) return result;
  unresolved.forEach(u => result.notes.push(`condition: ${u}`));

  if (mgef.archetype !== 'Peak Value Modifier' && mgef.archetype !== 'Value Modifier') {
    if (effect.magnitude !== 0 || mgef.archetype === 'Script') {
      result.notes.push(`MGEF ${mgef.edid} archetype ${mgef.archetype} — needs override`);
    }
    return result;
  }
  if (!mgef.actorValue) return result;

  // Value curve (Bloodied, Nerd Rage...): Y at X = input AV; overrides magnitude.
  let curve: ValueCurve | undefined;
  if (effect.curvePoints) {
    const input = effect.curveInputAv ? CURVE_INPUT_AVS[effect.curveInputAv] : undefined;
    if (input) {
      curve = { input, points: effect.curvePoints };
    } else {
      result.notes.push(`${mgef.edid}: curve with unmapped input AV ${effect.curveInputAv} — needs override`);
      return result;
    }
  } else if (effect.magnitude === 0) {
    result.notes.push(`MGEF ${mgef.edid}: zero magnitude, no curve — script/scaled, needs override`);
    return result;
  }

  const avifEdid = edidByFormId.get(mgef.actorValue) ?? mgef.actorValue;

  const allConds = [...effectConds];
  if (effect.duration > 0 && !opts.timedIsActive) {
    const raw = `timedBuff(${effect.duration}s)`;
    allConds.push({ kind: 'unresolved', raw });
    result.notes.push(`${mgef.edid}: ${raw} — needs toggle override`);
  }

  const push = (bucket: Bucket, scale: number, conditions: Condition[]) => {
    // With a curve, the scale is `curveScale` (applied to the interpolated Y);
    // otherwise it multiplies the flat magnitude.
    result.modifiers.push(
      curve
        ? { bucket, op: 'ADD', curve, curveScale: scale, conditions }
        : { bucket, op: 'ADD', value: effect.magnitude * scale, conditions }
    );
  };

  const avifRoutes = routes.get(mgef.actorValue);
  const fallback = FALLBACK_AVIF_ROUTES[avifEdid];
  if (avifRoutes) {
    for (const route of avifRoutes) {
      const { conditions: routeConds, unresolved: routeUnresolved } = translateConditions(route.rawConditions, { edidByFormId });
      if (routeConds === null) continue;
      routeUnresolved.forEach(u => result.notes.push(`route(${avifEdid}): ${u}`));
      push(route.bucket, route.scale, [...allConds, ...routeConds]);
    }
  } else if (fallback) {
    push(fallback.bucket, fallback.scale, [...allConds, ...(fallback.conditions ?? [])]);
  } else if (avifEdid.startsWith('STAT_Dmg') || avifEdid.startsWith('STAT_Crit') || avifEdid.startsWith('STAT_Sneak')) {
    result.unmappedAvifs.push(avifEdid);
  }

  return result;
}

/**
 * Async gather + `translate`: fetches the MGEF record and pre-resolves every
 * edid the pure translation reads (condition params + the actor value), then
 * delegates to the synchronous core.
 */
export async function translateMagicEffect(
  deps: MgefTranslationDeps,
  effect: SpellEffect,
  conditionCtx?: Partial<ConditionTranslationContext>
): Promise<MgefTranslationResult> {
  const { client, edidByFormId } = deps;
  const mgef = await getMgefInfo(client, effect.mgefFormId);

  for (const row of effect.conditionRows) {
    const p = row['Parameter 1'];
    if (typeof p === 'string' && p.startsWith('0x') && !edidByFormId.has(p)) {
      edidByFormId.set(p, await client.resolveEdid(p));
    }
  }
  // Only value-modifier archetypes read the actor value; skip the resolve for
  // the archetypes translate() discards (matches the old lazy resolution).
  const isValueArchetype = mgef.archetype === 'Peak Value Modifier' || mgef.archetype === 'Value Modifier';
  if (isValueArchetype && mgef.actorValue && !edidByFormId.has(mgef.actorValue)) {
    edidByFormId.set(mgef.actorValue, await client.resolveEdid(mgef.actorValue));
  }

  return translate(mgef, effect, deps.routes, edidByFormId, { timedIsActive: deps.timedIsActive, conditionCtx });
}

/** Attach source identity + ids to bucket-level modifier fragments. */
export function withSource(fragments: ModifierFragment[], source: ModifierSource, idPrefix: string): Modifier[] {
  return fragments.map((f, i) => ({ id: `${idPrefix}:${i}`, source, ...f }));
}
