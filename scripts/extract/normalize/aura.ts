import type { GeneratedAura } from '../../../src/types/generated';
import type { Condition } from '../../../src/types/modifiers';
import type { EsmRecord } from '../esm-client';
import { translateConditions } from './conditions';
import {
  getMgefInfo,
  parseMagicEffects,
  RESIST_AV_DAMAGE_TYPES,
  type MgefInfo,
  type MgefTranslationDeps,
  type SpellEffect,
} from './mgef';
import type { ConditionTranslationContext } from './conditions';

function contactCarrierContext(record: EsmRecord): Partial<ConditionTranslationContext> {
  const effectData = (record.fields['Effect Data'] ?? record.fields['Data'] ?? {}) as Record<
    string,
    unknown
  >;
  const targetType =
    ((effectData['Target Type'] as Record<string, unknown> | undefined)?.['name'] as string) ?? '';
  return targetType === 'Contact' ? { subjectIsTarget: true } : {};
}

/**
 * Aura-damage decode primitives — shared by `translateMagicEffect`'s Cloak-
 * archetype branch (Tesla Coils, Miasma, Plague Walker). Kept separate from
 * proc.ts because auras are tick-based continuous streams, not one-shot
 * detonations or magazine-cadence procs.
 */

function readAssocItem(record: EsmRecord): string | null {
  const data = ((record.fields['Magic Effect Data'] as Record<string, unknown> | undefined)?.[
    'Data'
  ] ?? {}) as Record<string, unknown>;
  const assoc = data['Assoc. Item'];
  return typeof assoc === 'string' && assoc !== '0x00000000' ? assoc : null;
}

function isMiasmaCloak(edid: string): boolean {
  return edid.includes('Miasma') && edid.includes('Cloak');
}

async function resolveEffectConditions(
  deps: MgefTranslationDeps,
  effect: SpellEffect,
  mgef: MgefInfo,
  inherited: Condition[],
  conditionCtx: Partial<ConditionTranslationContext> = {},
): Promise<Condition[] | null> {
  const rows = [...mgef.conditionRows, ...effect.conditionRows];
  for (const row of rows) {
    const p = row['Parameter 1'];
    if (typeof p === 'string' && p.startsWith('0x') && !deps.edidByFormId.has(p)) {
      deps.edidByFormId.set(p, await deps.client.resolveEdid(p));
    }
  }
  const { conditions } = translateConditions(rows, {
    edidByFormId: deps.edidByFormId,
    crossFamilyRank: deps.crossFamilyRank,
    ...conditionCtx,
  });
  if (conditions === null) return null;
  return [...inherited, ...conditions];
}

function decodeDamageAura(
  mgef: MgefInfo,
  effect: SpellEffect,
  conditions: Condition[],
  edidByFormId: Map<string, string>,
): GeneratedAura | null {
  // Concentration Contact ticks often carry Duration 0 on the effect row — 1s
  // matches the live Tesla/Plague-Walker cadence and Miasma's pending fallback.
  const tickSec = effect.duration > 0 ? effect.duration : 1;

  const resistEdid = mgef.resistValue
    ? (edidByFormId.get(mgef.resistValue) ?? mgef.resistValue)
    : null;
  const damageType = resistEdid ? RESIST_AV_DAMAGE_TYPES[resistEdid] : undefined;
  const unresisted = mgef.resistValue === null;

  if (isMiasmaCloak(mgef.edid) || (effect.magnitude === 0 && !effect.curvePoints)) {
    return {
      damageType: damageType ?? 'poison',
      damageTypeEdid: resistEdid,
      magnitudePending: true,
      tickSec,
      ...(effect.area != null && effect.area > 0 ? { area: effect.area } : {}),
      conditions,
      ...(unresisted ? { unresisted: true as const } : {}),
    };
  }

  if (!damageType && !unresisted) return null;

  let curve = effect.curvePoints;
  let amount = effect.magnitude;
  if (curve && curve.length === 1) {
    amount = curve[0].y;
    curve = null;
  }

  return {
    damageType: damageType ?? 'unknown',
    damageTypeEdid: resistEdid,
    // Multi-point curves override magnitude (same contract as dotDamage /
    // ModifierValue — interpolate Y × curveScale, never magnitude × curve).
    ...(curve && curve.length > 0 ? { curve, curveScale: 1 } : { amount }),
    tickSec,
    ...(effect.area != null && effect.area > 0 ? { area: effect.area } : {}),
    conditions,
    ...(unresisted ? { unresisted: true as const } : {}),
  };
}

async function chaseAuraCarrier(
  deps: MgefTranslationDeps,
  formId: string,
  inheritedConditions: Condition[],
  notes: string[],
  depth = 0,
  conditionCtx: Partial<ConditionTranslationContext> = {},
): Promise<GeneratedAura[]> {
  if (depth > 4) return [];
  let record: EsmRecord;
  try {
    record = await deps.client.get(formId);
  } catch {
    notes.push(`aura carrier ${formId} not found`);
    return [];
  }

  const carrierCtx = { ...conditionCtx, ...contactCarrierContext(record) };
  const auras: GeneratedAura[] = [];
  for (const effect of parseMagicEffects(record)) {
    const mgef = await getMgefInfo(deps.client, effect.mgefFormId);
    const conditions = await resolveEffectConditions(
      deps,
      effect,
      mgef,
      inheritedConditions,
      carrierCtx,
    );
    if (conditions === null) continue;

    if (mgef.archetype === 'Cloak') {
      const nested = await decodeAuraFromCloakMgef(deps, mgef, effect, conditions, notes);
      auras.push(...nested);
      continue;
    }

    if (mgef.archetype === 'Damage') {
      if (mgef.resistValue && !deps.edidByFormId.has(mgef.resistValue)) {
        deps.edidByFormId.set(mgef.resistValue, await deps.client.resolveEdid(mgef.resistValue));
      }
      const aura = decodeDamageAura(mgef, effect, conditions, deps.edidByFormId);
      if (aura) auras.push(aura);
    }
  }
  return auras;
}

/**
 * Decode a Cloak-archetype MGEF into zero or more `GeneratedAura`s by chasing
 * its Assoc. Item ENCH/SPEL chain for tick-based Damage effects. Returns an
 * empty array when the cloak is utility-only (Targeting HUD, Conductor's, …)
 * so the caller can fall through to the legacy "needs override" note.
 */
export async function decodeAuraFromCloakMgef(
  deps: MgefTranslationDeps,
  mgef: MgefInfo,
  effect: SpellEffect,
  inheritedConditions: Condition[],
  notes: string[] = [],
): Promise<GeneratedAura[]> {
  let mgefRecord: EsmRecord;
  try {
    mgefRecord = await deps.client.get(effect.mgefFormId);
  } catch {
    notes.push(`MGEF ${mgef.edid}: record not found for cloak chase`);
    return [];
  }

  const conditions = await resolveEffectConditions(deps, effect, mgef, inheritedConditions);
  if (conditions === null) return [];

  const assocItem = readAssocItem(mgefRecord);
  if (!assocItem) {
    if (isMiasmaCloak(mgef.edid)) {
      return [
        {
          damageType: 'poison',
          damageTypeEdid: null,
          magnitudePending: true,
          tickSec: 1,
          conditions,
        },
      ];
    }
    return [];
  }

  const auras = await chaseAuraCarrier(
    deps,
    assocItem,
    conditions,
    notes,
    0,
    contactCarrierContext(mgefRecord),
  );
  if (auras.length === 0 && isMiasmaCloak(mgef.edid)) {
    return [
      {
        damageType: 'poison',
        damageTypeEdid: null,
        magnitudePending: true,
        tickSec: 1,
        conditions,
      },
    ];
  }
  return auras;
}
