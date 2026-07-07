import type { GeneratedOmod } from '../../src/types/generated';
import type { Bucket, Modifier } from '../../src/types/modifiers';
import { EsmClient, mapPool, type EsmRecord } from './esm-client';
import { buildAvifRoutes, parseMagicEffects, translateMagicEffect, type AvifRoute } from './normalize/mgef';
import { DAMAGE_TYPE_EDID_MAP } from './extract-weapons';

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

/** OMOD Property name → formula bucket. Unknown damage-ish names are reported. */
const PROPERTY_BUCKETS: Record<string, PropertyMapping> = {
  DamageBonusMult: { bucket: 'dbm' },
  CriticalDamageMult: { bucket: 'critDmgBase', addBucket: 'critDmgBonus' },
  SneakAttackMult: { bucket: 'sneakBase', addBucket: 'sneakBonus' },
  Speed: { bucket: 'fireRateSpeed' },
  IsAutomatic: { bucket: 'isAutomatic' },
  NumProjectiles: { bucket: 'projectileCount' },
  CriticalChargeBonus: { bucket: 'critFill' },
};

/** Property names that never affect the damage formula — skipped without reporting. */
const PROPERTY_IGNORED = new Set([
  'Weight', 'Value', 'Health', 'Ammo', 'AmmoCapacity', 'Reach', 'MinRange', 'MaxRange',
  'AttackActionPointCost', 'ReloadSpeed', 'AimModelBaseStability', 'AimModelRecoilMaxDegPerShot',
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
  'ActorValues', 'AimAssistModel', 'AimModel', 'AimModelConeDecreaseDelayMs',
  'AimModelRecoilDiminishSightsMult', 'AimModelRecoilDiminishSpringForce', 'AimModelRecoilHipMult',
  'AimModelRecoilShotsForRunaway', 'AmmoConsumption', 'AttackSound', 'CritEffect', 'Durability',
  'EquipSlot', 'EquipSound', 'FastEquipSound', 'HasAlternateRumble', 'HasRepeatableSingleFire',
  'HitBehaviour', 'HoldInputToPower', 'IdleSound', 'ImpactDataSet', 'MinWeaponDrawTime',
  'ModelSwap', 'NPCAmmoList', 'OverheatRateDown', 'OverheatRateUp', 'OverrideProjectile',
  'SecondaryDamage', 'SoundTagSet', 'UnEquipSound', 'Unknown', 'UnsightedTransitionSeconds',
  'WeightMult', 'ZoomData', 'ZoomDataCameraOffsetX', 'ZoomDataCameraOffsetY', 'ZoomDataCameraOffsetZ',
]);

interface RawProperty {
  functionType: 'SET' | 'MUL_ADD' | 'ADD' | string;
  property: string;
  value1: unknown;
  value2: unknown;
  /** When a property carries a curve table, the curve OVERRIDES the hardcoded value (user-confirmed). */
  hasCurveTable: boolean;
}

function parseProperties(data: Record<string, unknown>): RawProperty[] {
  const props = data['Properties'];
  if (!Array.isArray(props)) return [];
  return (props as Array<Record<string, unknown>>).map(p => ({
    functionType: (((p['Function Type'] as Record<string, unknown>)?.['name'] as string) ?? 'SET').replace('MUL+ADD', 'MUL_ADD'),
    property: ((p['Property'] as Record<string, unknown>)?.['name'] as string) ?? 'Unknown',
    value1: p['Value 1'],
    value2: p['Value 2'],
    hasCurveTable: p['Curve Table'] != null,
  }));
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
  unknownProperties: string[];
  notes: string[];
}

export async function extractOmods(client: EsmClient): Promise<ExtractOmodsResult> {
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
      const result = await translateMagicEffect({ client, routes: avifRoutes, edidByFormId, timedIsActive: true }, effect);
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

  const named = records.filter(r => {
    const data = omodData(r);
    const formType = ((data['Form Type'] as Record<string, unknown>)?.['name'] as string) ?? '';
    return formType === 'Weapon' && r.fields['Name'];
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
      if (prop.hasCurveTable && (prop.property === 'AttackDamage' || prop.property === 'DamageTypeValues')) {
        modNotes.add(`${prop.property} carries a curve table (overrides value) — not modeled`);
        continue;
      }

      // Base-damage scaling (user-confirmed): MUL+ADDs on AttackDamage /
      // DamageTypeValues multiply the component's BASE damage before the dbm
      // parenthesis (automatic receivers: −30% on phys and every damage type).
      // Note: DamageTypeValues on dtPhysical ≡ AttackDamage (both phys-only).
      if (prop.property === 'AttackDamage') {
        if (typeof prop.value1 === 'number' && prop.functionType !== 'SET') {
          modifiers.push({
            id: `${record.header.form_id}:${modifiers.length}`,
            source,
            bucket: 'baseDamage',
            op: prop.functionType === 'MUL_ADD' ? 'MUL_ADD' : 'ADD',
            value: prop.value1,
            conditions: [{ kind: 'damageTypeScope', types: ['ballistic'] }],
          });
        } else {
          modNotes.add(`AttackDamage ${prop.functionType} with value ${JSON.stringify(prop.value1)} — unhandled`);
        }
        continue;
      }
      if (prop.property === 'DamageTypeValues') {
        // Value 1 = damage-type formid, Value 2 = multiplier (MUL_ADD case).
        if (prop.functionType === 'MUL_ADD' && typeof prop.value1 === 'string' && typeof prop.value2 === 'number') {
          const dtEdid = await client.resolveEdid(prop.value1);
          const damageType = DAMAGE_TYPE_EDID_MAP[dtEdid];
          if (damageType && damageType !== 'unknown') {
            modifiers.push({
              id: `${record.header.form_id}:${modifiers.length}`,
              source,
              bucket: 'baseDamage',
              op: 'MUL_ADD',
              value: prop.value2,
              conditions: [{ kind: 'damageTypeScope', types: [damageType] }],
            });
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
      if (prop.hasCurveTable) {
        // A curve table overrides the hardcoded value — level-scaled property
        // values are not modeled yet; flag instead of extracting a wrong flat value.
        modNotes.add(`${prop.property} carries a curve table (overrides value) — not modeled`);
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
    });
  }

  omods.sort((a, b) => a.id.localeCompare(b.id));
  return { omods, unknownProperties: [...unknownProperties].sort(), notes: [...notes] };
}
