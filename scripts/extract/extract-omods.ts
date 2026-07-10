import type { ExcludedRecordDetail, GeneratedOmod } from '../../src/types/generated';
import type { Bucket, Modifier } from '../../src/types/modifiers';
import { EsmClient, mapPool, type EsmRecord } from './esm-client';
import { buildAvifRoutes, parseMagicEffects, translateMagicEffect, type AvifRoute } from './normalize/mgef';
import { DAMAGE_TYPE_EDID_MAP } from './extract-weapons';
import { ObtainabilityClassifier } from './obtainability';

/**
 * OMOD extraction. A weapon mod's real stats usually live on _PARENT_ template
 * mods referenced through Data.Includes (recursively) — e.g. the Powerful
 * Automatic Receiver itself only ADDs keywords; its +25% DamageBonusMult and
 * SET Speed 0.8248 come from included parents. We flatten the include chain.
 *
 * Compatibility (matched app-side): omod.attachPoint ∈ weapon.attachParentSlots
 * (formids) AND omod.targetKeywords ⊆ weapon.keywords (edids).
 */

interface PropertyMapping {
  bucket: Bucket;
  /** Bucket when the operator is ADD (crit/sneak split base vs bonus). */
  addBucket?: Bucket;
}

/**
 * ActorValues OMOD property → bucket (resolved AV edid → mapping). Anti-Armor
 * carries `ActorValues ADD ArmorPenetration 50.0` — the value lives on the
 * OMOD property, NOT its enchantment. Unmapped AVs are reported so the map
 * grows deliberately.
 */
const ACTOR_VALUE_BUCKETS: Record<string, { bucket: Bucket; scale: number }> = {
  ArmorPenetration: { bucket: 'armorPen', scale: 0.01 }, // 50.0 ⇒ 0.5 (inert until enemy DR lands)
};

/** OMOD Property name → formula bucket. Unknown damage-ish names are reported. */
const PROPERTY_BUCKETS: Record<string, PropertyMapping> = {
  DamageBonusMult: { bucket: 'dbm' },
  CriticalDamageMult: { bucket: 'critDmgBase', addBucket: 'critDmgBonus' },
  SneakAttackMult: { bucket: 'sneakBase', addBucket: 'sneakBonus' },
  Speed: { bucket: 'fireRateSpeed' },
  IsAutomatic: { bucket: 'isAutomatic' },
  NumProjectiles: { bucket: 'projectileCount' },
  CriticalChargeBonus: { bucket: 'critFill' },
  AmmoCapacity: { bucket: 'ammoCapacity' },
  ReloadSpeed: { bucket: 'reloadSpeed' },
};

/** Property names that never affect the damage formula — skipped without reporting. */
const PROPERTY_IGNORED = new Set([
  'Weight', 'Value', 'Health', 'Ammo', 'Reach', 'MinRange', 'MaxRange',
  'AttackActionPointCost', 'AimModelBaseStability', 'AimModelRecoilMaxDegPerShot',
  // NOTE: 'AttackDamage' and 'DamageTypeValues' are handled explicitly below
  // (they scale component base damage), not ignored.
  'AimModelRecoilMinDegPerShot', 'AimModelRecoilArcDeg', 'AimModelRecoilArcRotateDeg',
  'AimModelConeIronSightsMultiplier', 'AimModelMinConeDegrees', 'AimModelMaxConeDegrees',
  'AimModelConeSneakMultiplier', 'AimModelConeIncreasePerShot', 'AimModelConeDecreasePerSec',
  'ZoomDataFOVMult', 'ZoomDataOverlay', 'ZoomDataIsModFormID', 'HitBehavior', 'Rank',
  'ColorRemappingIndex', 'MaterialSwaps', 'ModelSection', 'SoundLevel', 'NPCsUseAmmo',
  'AttackDelaySec', 'OutOfRangeDamageMult', 'ActionPointCost', 'FullPowerSeconds',
  'MinPowerPerShot', 'Stagger', 'SightedTransitionSeconds', 'AccuracyBonus',
  'HasScope', 'BoltAction', 'BashImpactDataSet', 'BlockMaterial', 'EnableMarts',
  'VerticalRecoilMult', 'HorizontalRecoilMult', 'ConditionDamageScale', 'DisableSighted',
  'AimAssistModel', 'AimModel', 'AimModelConeDecreaseDelayMs',
  'AimModelRecoilDiminishSightsMult', 'AimModelRecoilDiminishSpringForce', 'AimModelRecoilHipMult',
  'AimModelRecoilShotsForRunaway', 'AmmoConsumption', 'AttackSound', 'CritEffect', 'Durability',
  'EquipSlot', 'EquipSound', 'FastEquipSound', 'HasAlternateRumble', 'HasRepeatableSingleFire',
  'HitBehaviour', 'HoldInputToPower', 'IdleSound', 'ImpactDataSet', 'MinWeaponDrawTime',
  'ModelSwap', 'NPCAmmoList', 'OverheatRateDown', 'OverheatRateUp', 'OverrideProjectile',
  'SecondaryDamage', 'SoundTagSet', 'UnEquipSound', 'Unknown', 'UnsightedTransitionSeconds',
  'WeightMult', 'ZoomData', 'ZoomDataCameraOffsetX', 'ZoomDataCameraOffsetY', 'ZoomDataCameraOffsetZ',
]);

// Dev/dead-record prefixes that never reach players (case-insensitive; the
// weapon extractor has its own copy tuned for WEAP naming). Cheap pre-filter
// only — obtainability derivation is the real gate.
const OMOD_JUNK_EDID_RE = /^(zzz|del_|deleted|debug|cut_|test|wip|post_|hto_|sdow_|p62_|mtnm|xpd_)/i;

/** Exposed for tests: does the pre-filter drop this editor_id? */
export function isExcludedOmodEdid(edid: string): boolean {
  return OMOD_JUNK_EDID_RE.test(edid);
}

interface RawProperty {
  functionType: 'SET' | 'MUL_ADD' | 'ADD' | string;
  property: string;
  value1: unknown;
  value2: unknown;
  /** When a property carries a curve table, the curve OVERRIDES the hardcoded value (user-confirmed). */
  hasCurveTable: boolean;
  /** Inline curve points (Y by item level) when the curve table parses — feeds itemLevel-input curve modifiers. */
  curvePoints: Array<{ x: number; y: number }> | null;
}

function parseProperties(data: Record<string, unknown>): RawProperty[] {
  const props = data['Properties'];
  if (!Array.isArray(props)) return [];
  return (props as Array<Record<string, unknown>>).map(p => {
    const curveNode = p['Curve Table'] as { curve?: Array<{ x: number; y: number }> } | null | undefined;
    return {
      functionType: (((p['Function Type'] as Record<string, unknown>)?.['name'] as string) ?? 'SET').replace('MUL+ADD', 'MUL_ADD'),
      property: ((p['Property'] as Record<string, unknown>)?.['name'] as string) ?? 'Unknown',
      value1: p['Value 1'],
      value2: p['Value 2'],
      hasCurveTable: p['Curve Table'] != null,
      curvePoints: Array.isArray(curveNode?.curve) && curveNode.curve.length > 0 ? curveNode.curve : null,
    };
  });
}

function omodData(record: EsmRecord): Record<string, unknown> {
  return (record.fields['Data'] ?? {}) as Record<string, unknown>;
}

function includeFormIds(data: Record<string, unknown>): string[] {
  const includes = data['Includes'];
  if (!Array.isArray(includes)) return [];
  return (includes as Array<Record<string, unknown>>)
    .map(i => i['Mod'])
    .filter((m): m is string => typeof m === 'string');
}

export interface ExtractOmodsResult {
  omods: GeneratedOmod[];
  excluded: Record<string, string[]>;
  excludedDetailed: Record<string, ExcludedRecordDetail[]>;
  unknownProperties: string[];
  notes: string[];
}

export async function extractOmods(
  client: EsmClient,
  /** Formids of obtainable weapons (from the weapons pass) — an OMOD referenced by one rides along. */
  obtainableWeaponFormIds: ReadonlySet<string>
): Promise<ExtractOmodsResult> {
  const rows = await client.list('OMOD');
  const records = await mapPool(rows, 8, r => client.get(r.form_id));
  const byFormId = new Map(records.map(r => [r.header.form_id, r]));

  const unknownProperties = new Set<string>();
  const notes = new Set<string>();

  // Legendary effects carry their stats via ADD Enchantments → ENCH → MGEF.
  const routePool = new Set<string>();
  const avifRoutes: Map<string, AvifRoute[]> = await buildAvifRoutes(client, routePool);
  const edidByFormId = new Map<string, string>();
  for (const id of routePool) edidByFormId.set(id, await client.resolveEdid(id));

  async function enchantmentModifiers(
    enchFormId: string,
    source: Modifier['source'],
    into: Modifier[],
    modNotes: Set<string>
  ): Promise<void> {
    let ench: EsmRecord;
    try {
      ench = await client.get(enchFormId);
    } catch {
      modNotes.add(`enchantment ${enchFormId} not found`);
      return;
    }
    for (const effect of parseMagicEffects(ench)) {
      const result = await translateMagicEffect(
        { client, routes: avifRoutes, edidByFormId, timedIsActive: true, noteUnroutedAvs: true },
        effect
      );
      result.notes.forEach(n => modNotes.add(n));
      for (const fragment of result.modifiers) {
        into.push({ id: `${source.formId}:ench:${into.length}`, source, ...fragment });
      }
    }
  }

  /** Recursively collect properties from an OMOD and its include chain. */
  function collectProperties(formId: string, seen: Set<string>): RawProperty[] {
    if (seen.has(formId)) return [];
    seen.add(formId);
    const record = byFormId.get(formId);
    if (!record) return [];
    const data = omodData(record);
    const own = parseProperties(data);
    const inherited = includeFormIds(data).flatMap(id => collectProperties(id, seen));
    // Parents first: a child's SET should win over an included parent's.
    return [...inherited, ...own];
  }

  const excluded: Record<string, string[]> = { omodJunkEdid: [] };
  const named = records.filter(r => {
    const data = omodData(r);
    const formType = ((data['Form Type'] as Record<string, unknown>)?.['name'] as string) ?? '';
    if (formType !== 'Weapon' || !r.fields['Name']) return false;
    // Authoring templates (_PARENT_ records, "TEMPLATE:"-named) carry the stats
    // real mods include via their Includes chain — collectProperties reads them
    // from byFormId (all records), so they need not be emitted at all.
    if (r.editor_id.startsWith('_PARENT_') || (r.fields['Name'] as string).startsWith('TEMPLATE')) return false;
    if (isExcludedOmodEdid(r.editor_id)) {
      excluded.omodJunkEdid.push(r.editor_id);
      return false;
    }
    return true;
  });

  const omods: GeneratedOmod[] = [];
  for (const record of named) {
    const data = omodData(record);
    const attachPoint = (data['Attach Point'] as string) ?? null;
    if (!attachPoint) continue;

    const properties = collectProperties(record.header.form_id, new Set());
    const modifiers: Modifier[] = [];
    const addedKeywords: string[] = [];
    const modNotes = new Set<string>();
    let hasEnchantments = false;
    const source: Modifier['source'] = {
      kind: 'omod',
      formId: record.header.form_id,
      edid: record.editor_id,
      name: record.fields['Name'] as string,
    };

    for (const prop of properties) {
      if (prop.property === 'Keywords') {
        if (prop.functionType === 'ADD' && typeof prop.value1 === 'string') {
          addedKeywords.push(await client.resolveEdid(prop.value1));
        }
        continue;
      }
      if (prop.property === 'Enchantments') {
        hasEnchantments = true;
        if (typeof prop.value1 === 'string') {
          await enchantmentModifiers(prop.value1, source, modifiers, modNotes);
        }
        continue;
      }
      if (prop.property === 'ActorValues') {
        // Value 1 = AV formid, Value 2 = amount (Anti-Armor: ArmorPenetration 50.0).
        if (typeof prop.value1 === 'string' && typeof prop.value2 === 'number') {
          const avEdid = await client.resolveEdid(prop.value1);
          const avMapping = ACTOR_VALUE_BUCKETS[avEdid];
          if (avMapping) {
            modifiers.push({
              id: `${record.header.form_id}:${modifiers.length}`,
              source,
              bucket: avMapping.bucket,
              op: prop.functionType === 'MUL_ADD' ? 'MUL_ADD' : 'ADD',
              value: prop.value2 * avMapping.scale,
              conditions: [],
            });
          } else {
            modNotes.add(`ActorValues on ${avEdid} — unmapped`);
          }
        }
        continue;
      }
      // Base-damage scaling (user-confirmed): MUL+ADDs on AttackDamage /
      // DamageTypeValues multiply the component's BASE damage before the dbm
      // parenthesis (automatic receivers: −30% on phys and every damage type).
      // A curve table OVERRIDES the flat value: Y at X = item level (heated
      // melee mods) — emitted as itemLevel-input curve modifiers.
      // Note: DamageTypeValues on dtPhysical ≡ AttackDamage (both phys-only).
      if (prop.property === 'AttackDamage') {
        const curved = prop.curvePoints != null;
        if ((curved || typeof prop.value1 === 'number') && prop.functionType !== 'SET') {
          const op = prop.functionType === 'MUL_ADD' ? ('MUL_ADD' as const) : ('ADD' as const);
          const conditions: Modifier['conditions'] = [{ kind: 'damageTypeScope', types: ['ballistic'] }];
          modifiers.push(
            curved
              ? {
                  id: `${record.header.form_id}:${modifiers.length}`, source, bucket: 'baseDamage', op,
                  curve: { input: 'itemLevel', points: prop.curvePoints! }, curveScale: 1, conditions,
                }
              : {
                  id: `${record.header.form_id}:${modifiers.length}`, source, bucket: 'baseDamage', op,
                  value: prop.value1 as number, conditions,
                }
          );
        } else if (prop.hasCurveTable && !curved) {
          modNotes.add(`AttackDamage carries an unparsed curve table — not modeled`);
        } else {
          modNotes.add(`AttackDamage ${prop.functionType} with value ${JSON.stringify(prop.value1)} — unhandled`);
        }
        continue;
      }
      if (prop.property === 'DamageTypeValues') {
        // Value 1 = damage-type formid, Value 2 = multiplier (MUL_ADD case);
        // a curve table overrides Value 2.
        if (prop.functionType === 'MUL_ADD' && typeof prop.value1 === 'string') {
          const dtEdid = await client.resolveEdid(prop.value1);
          const damageType = DAMAGE_TYPE_EDID_MAP[dtEdid];
          const curved = prop.curvePoints != null;
          if (damageType && damageType !== 'unknown' && (curved || typeof prop.value2 === 'number')) {
            const conditions: Modifier['conditions'] = [{ kind: 'damageTypeScope', types: [damageType] }];
            modifiers.push(
              curved
                ? {
                    id: `${record.header.form_id}:${modifiers.length}`, source, bucket: 'baseDamage', op: 'MUL_ADD',
                    curve: { input: 'itemLevel', points: prop.curvePoints! }, curveScale: 1, conditions,
                  }
                : {
                    id: `${record.header.form_id}:${modifiers.length}`, source, bucket: 'baseDamage', op: 'MUL_ADD',
                    value: prop.value2 as number, conditions,
                  }
            );
          } else {
            modNotes.add(`DamageTypeValues MUL_ADD on unmapped type ${dtEdid}`);
          }
        } else {
          // ADD/SET add or replace typed components — needs the
          // addDamageComponent work; flagged so it isn't silently wrong.
          modNotes.add(`DamageTypeValues ${prop.functionType} — component change not yet modeled`);
        }
        continue;
      }

      const mapping = PROPERTY_BUCKETS[prop.property];
      if (!mapping) {
        if (!PROPERTY_IGNORED.has(prop.property)) unknownProperties.add(prop.property);
        continue;
      }
      if (prop.curvePoints) {
        // A curve table overrides the hardcoded value: Y at X = item level.
        const op = prop.functionType === 'SET' ? 'SET' : prop.functionType === 'MUL_ADD' ? 'MUL_ADD' : 'ADD';
        const bucket = op === 'ADD' && mapping.addBucket ? mapping.addBucket : mapping.bucket;
        modifiers.push({
          id: `${record.header.form_id}:${modifiers.length}`,
          source,
          bucket,
          op,
          curve: { input: 'itemLevel', points: prop.curvePoints },
          curveScale: 1,
          conditions: [],
        });
        continue;
      }
      if (prop.hasCurveTable) {
        modNotes.add(`${prop.property} carries an unparsed curve table — not modeled`);
        continue;
      }

      let value: number;
      if (typeof prop.value1 === 'number') {
        value = prop.value1;
      } else if (typeof prop.value1 === 'boolean') {
        value = prop.value1 ? 1 : 0;
      } else if (prop.value1 && typeof prop.value1 === 'object' && 'value' in (prop.value1 as object)) {
        value = ((prop.value1 as Record<string, unknown>)['value'] as number) ?? 0;
      } else {
        notes.add(`${record.editor_id}: ${prop.property} has non-numeric value`);
        continue;
      }

      const op = prop.functionType === 'SET' ? 'SET' : prop.functionType === 'MUL_ADD' ? 'MUL_ADD' : 'ADD';
      const bucket = op === 'ADD' && mapping.addBucket ? mapping.addBucket : mapping.bucket;
      modifiers.push({
        id: `${record.header.form_id}:${modifiers.length}`,
        source,
        bucket,
        op,
        value,
        conditions: [],
      });
    }

    for (const note of modNotes) notes.add(`${record.editor_id}: ${note}`);
    omods.push({
      id: record.editor_id,
      formId: record.header.form_id,
      name: record.fields['Name'] as string,
      description: (record.fields['Description'] as string) ?? '',
      attachPointFormId: attachPoint,
      attachPointEdid: await client.resolveEdid(attachPoint),
      targetKeywords: await Promise.all(
        (Array.isArray(record.fields['Target OMOD Keywords']) ? (record.fields['Target OMOD Keywords'] as string[]) : []).map(
          k => client.resolveEdid(k)
        )
      ),
      modifiers,
      addedKeywords,
      hasEnchantments,
      notes: [...modNotes].sort(),
    });
  }

  // Obtainability derivation (see extract-weapons.ts for the flag semantics:
  // failures stay in the data as obtainable:false for app-side hiding/rescue).
  const classifier = new ObtainabilityClassifier(client, obtainableWeaponFormIds);
  const verdicts = await classifier.classify(omods.map(o => ({ formId: o.formId, edid: o.id })));
  const excludedDetailed: Record<string, ExcludedRecordDetail[]> = { omodUnobtainable: [] };
  for (const omod of omods) {
    const verdict = verdicts.get(omod.formId);
    omod.obtainable = verdict?.obtainable ?? false;
    if (!omod.obtainable) {
      (excluded.omodUnobtainable ??= []).push(omod.id);
      excludedDetailed.omodUnobtainable.push({ id: omod.id, name: omod.name, signals: verdict?.signals });
    }
  }

  omods.sort((a, b) => a.id.localeCompare(b.id));
  return { omods, excluded, excludedDetailed, unknownProperties: [...unknownProperties].sort(), notes: [...notes] };
}
