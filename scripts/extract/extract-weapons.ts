import type {
  CurvePoint,
  ExcludedRecordDetail,
  GeneratedDamageComponent,
  GeneratedDamageType,
  GeneratedWeapon,
} from '../../src/types/generated';
import { EsmClient, mapPool, type EsmRecord } from './esm-client';
import { ObtainabilityClassifier } from './obtainability';

// EDID patterns for records that are never player weapons (creature attacks,
// deleted/deprecated content, turrets, event-NPC gear...). This is only a
// cheap pre-filter — real gating is the obtainability derivation below.
// The creature prefix is 'cr' followed by an uppercase letter and must stay
// case-SENSITIVE: plain prefix matching would swallow 'crossbow'.
// Stragglers are handled per-edid in src/data/overrides/corrections.ts.
// atx_ (Atomic Shop) is deliberately NOT excluded: shop weapons players can
// own are real picker entries — obtainability derivation gates them
// per-record instead (user decision, 2026-07-10 review).
const EXCLUDED_EDID_PATTERNS = [
  /^zzz/i, /^del_/i, /^deleted/i, /^deprecated/i, /^cr[^a-z]/, /^hto_/i, /^xpd_/i,
  /^post_/i, /^test/i, /^debug/i, /^gastrap/i, /^workshopturret/i,
  /^trapturret/i, /^mtnm/i, /^survival_/i, /NONPLAYABLE/i,
];

/** Exposed for tests: does the pre-filter drop this editor_id? */
export function isExcludedWeaponEdid(edid: string): boolean {
  return EXCLUDED_EDID_PATTERNS.some(p => p.test(edid));
}

export const DAMAGE_TYPE_EDID_MAP: Record<string, GeneratedDamageType> = {
  dtPhysical: 'ballistic',
  dtEnergy: 'energy',
  dtFire: 'fire',
  dtCryo: 'cryo',
  dtPoison: 'poison',
  dtRadiationExposure: 'radiation',
  dtRadiation: 'radiation',
};

const TIER_RE = /Damage_Universal_Tier(\d+)/i;

interface ExtractWeaponsResult {
  weapons: GeneratedWeapon[];
  excluded: Record<string, string[]>;
  excludedDetailed: Record<string, ExcludedRecordDetail[]>;
  unresolved: string[];
  /** Formids of obtainable weapons — feeds the OMOD obtainability pass. */
  obtainableFormIds: Set<string>;
}

function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function parseCurve(node: unknown): { tier: number | null; curve: CurvePoint[] | null } {
  if (!node || typeof node !== 'object') return { tier: null, curve: null };
  const obj = node as { curve_path?: string; curve?: CurvePoint[] };
  const match = obj.curve_path ? TIER_RE.exec(obj.curve_path) : null;
  return {
    tier: match ? Number(match[1]) : null,
    curve: Array.isArray(obj.curve) && obj.curve.length > 0 ? obj.curve : null,
  };
}

async function buildComponents(
  client: EsmClient,
  fields: Record<string, unknown>,
  unresolved: string[]
): Promise<GeneratedDamageComponent[]> {
  const components: GeneratedDamageComponent[] = [];
  const data = (fields['Data'] ?? {}) as Record<string, unknown>;
  const baseDamage = asNumber(data['Base Damage']);
  const damageTypes = fields['Damage Types'];
  const typedEntries = Array.isArray(damageTypes) ? (damageTypes as Array<Record<string, unknown>>) : [];

  // Physical component semantics (user-confirmed against Fixer/MG42/Shishkebab/
  // plasma vs laser records): each component's damage = its own curve evaluated
  // at item level, and a physical component exists IFF the weapon has a main
  // "Damage Curve" — regardless of the legacy "Base Damage" field.
  //   Fixer/MG42/pickaxe: main curve, no typed entries → pure physical.
  //   Shishkebab: main curve + dtFire → phys + fire.
  //   Gatling Plasma: main curve (Base Damage 0!) + dtEnergy → phys + energy
  //   (all plasma weapons deal both; the energy entry reuses the same curve table).
  //   Laser Gun / Gatling Laser / Flamer: NO main curve → typed damage only.
  const mainCurve = parseCurve(fields['Damage Curve']);
  if (mainCurve.curve) {
    components.push({ damageType: 'ballistic', damageTypeEdid: null, amount: baseDamage, ...mainCurve });
  } else if (typedEntries.length === 0 && baseDamage > 0) {
    // Legacy flat-damage record with neither curve nor typed entries.
    components.push({ damageType: 'ballistic', damageTypeEdid: null, amount: baseDamage, tier: null, curve: null });
  }

  // Typed components (energy/fire/...): each entry carries its own curve.
  for (const entry of typedEntries) {
    const typeFormId = entry['Type'] as string;
    const edid = await client.resolveEdid(typeFormId);
    const damageType = DAMAGE_TYPE_EDID_MAP[edid];
    if (!damageType) unresolved.push(`damage type ${edid} (${typeFormId})`);
    const { tier, curve } = parseCurve(entry['Curve Table']);
    components.push({
      damageType: damageType ?? 'unknown',
      damageTypeEdid: edid,
      amount: asNumber(entry['Amount']),
      tier,
      curve,
    });
  }

  return components;
}

function templateCombinationItems(fields: Record<string, unknown>): Array<Record<string, unknown>> {
  const template = fields['Object Template'] as Record<string, unknown> | undefined;
  const combinations = template?.['Combinations'];
  if (!Array.isArray(combinations)) return [];
  return (combinations as Array<Record<string, unknown>>)
    .map(
      combo =>
        (combo['Combination'] as Record<string, unknown> | undefined)?.['Object Mod Template Item'] as
          | Record<string, unknown>
          | undefined
    )
    .filter((item): item is Record<string, unknown> => item !== undefined);
}

function flattenIncludes(items: Array<Record<string, unknown>>): string[] {
  const modIds = new Set<string>();
  for (const item of items) {
    const includes = item['Includes'];
    if (!Array.isArray(includes)) continue;
    for (const inc of includes as Array<Record<string, unknown>>) {
      if (typeof inc['Mod'] === 'string') modIds.add(inc['Mod'] as string);
    }
  }
  return [...modIds];
}

function extractTemplateModFormIds(fields: Record<string, unknown>): string[] {
  return flattenIncludes(templateCombinationItems(fields));
}

/**
 * The weapon's standard parts: the Default=True combination's includes.
 * Some records leave the flag unset — a combination NAMED "Default"
 * (CombatRifle) or a sole combination (unique weapons like the Fixer) is
 * still authoritative. Multiple combos with neither signal is an authoring
 * state we refuse to guess at (never index 0): log and emit [].
 */
function extractDefaultModFormIds(
  fields: Record<string, unknown>,
  edid: string,
  unresolved: string[]
): string[] {
  const template = fields['Object Template'] as Record<string, unknown> | undefined;
  const combinations = template?.['Combinations'];
  const combos = Array.isArray(combinations) ? (combinations as Array<Record<string, unknown>>) : [];
  if (combos.length === 0) return [];
  const itemOf = (combo: Record<string, unknown>) =>
    (combo['Combination'] as Record<string, unknown> | undefined)?.['Object Mod Template Item'] as
      | Record<string, unknown>
      | undefined;
  const items = (predicate: (combo: Record<string, unknown>) => boolean) =>
    combos.filter(predicate).map(itemOf).filter((i): i is Record<string, unknown> => i !== undefined);

  const flagged = items(c => (itemOf(c)?.['Default'] as Record<string, unknown> | undefined)?.['value'] === 1);
  if (flagged.length > 0) return flattenIncludes(flagged);
  const named = items(c => (c['Combination'] as Record<string, unknown>)?.['Name'] === 'Default');
  if (named.length > 0) return flattenIncludes(named);
  if (combos.length === 1) return flattenIncludes(items(() => true));
  unresolved.push(`no Default combination for ${edid} (${combos.length} combos)`);
  return [];
}

export async function toGeneratedWeapon(
  client: EsmClient,
  record: EsmRecord,
  unresolved: string[]
): Promise<GeneratedWeapon> {
  const fields = record.fields;
  const data = (fields['Data'] ?? {}) as Record<string, unknown>;
  const rgw3 = (fields['RGW3'] ?? {}) as Record<string, unknown>;
  const crit = (fields['Critical Data'] ?? {}) as Record<string, unknown>;
  const flagsNode = (data['Flags'] ?? {}) as Record<string, unknown>;
  const flagNames = Array.isArray(flagsNode['flags']) ? (flagsNode['flags'] as string[]) : [];
  const keywordsNode = (fields['Keywords'] ?? {}) as Record<string, unknown>;
  const keywordFormIds: string[] = Array.isArray(keywordsNode['Keywords'])
    ? (keywordsNode['Keywords'] as string[])
    : [];
  const keywords = await Promise.all(keywordFormIds.map(id => client.resolveEdid(id)));
  const weaponTypeName =
    ((data['Weapon Type'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown';

  return {
    id: record.editor_id,
    formId: record.header.form_id,
    name: (fields['Name'] as string) ?? record.editor_id,
    weaponTypeName,
    keywords,
    isAutomaticFlag: flagNames.includes('Automatic'),
    components: await buildComponents(client, fields, unresolved),
    critDamageMult: asNumber(crit['Crit Damage Mult'], 1.0),
    critChargeBonus: asNumber(crit['Crit Charge Bonus'], 1.0),
    sneakAttackMult: asNumber(fields['Sneak Attack Multiplier'], 2.0),
    speed: asNumber(data['Speed'], 1.0),
    attackDelaySec: asNumber(data['Attack Delay Seconds']),
    animationAttackSec: asNumber(data['Animation Attack Seconds']),
    animationFireSec: asNumber(rgw3['Animation Fire Seconds']),
    reloadSpeed: asNumber(data['Reload Speed'], 1.0),
    animationReloadSec: asNumber(rgw3['Animation Reload Seconds']),
    capacity: asNumber(data['Capacity']),
    ammoPerShot: asNumber(data['Ammo used per shot'], 1),
    actionPointCost: asNumber(data['Action Point Cost']),
    projectileCount: asNumber(rgw3['# Projectiles'], 1),
    reach: asNumber(data['Reach'], 1.0),
    secondaryDamage: asNumber(data['Secondary Damage']),
    damageBonusMult: asNumber(rgw3['Damage Bonus Multiplier'], 1.0),
    eligibleLevels: Array.isArray(fields['Eligible Levels']) ? (fields['Eligible Levels'] as number[]) : [],
    templateModFormIds: extractTemplateModFormIds(fields),
    defaultModFormIds: extractDefaultModFormIds(fields, record.editor_id, unresolved),
    attachParentSlots: Array.isArray(fields['Attach Parent Slots'])
      ? (fields['Attach Parent Slots'] as string[])
      : [],
  };
}

export async function extractWeapons(client: EsmClient): Promise<ExtractWeaponsResult> {
  const named = await client.search('*', { type: 'WEAP', searchIn: 'name' });

  const excluded: Record<string, string[]> = { prefix: [], noDamage: [] };
  const candidates = named.filter(row => {
    if (isExcludedWeaponEdid(row.editor_id)) {
      excluded.prefix.push(row.editor_id);
      return false;
    }
    return true;
  });

  const unresolved: string[] = [];
  const weapons: GeneratedWeapon[] = [];

  const records = await mapPool(candidates, 8, row => client.get(row.form_id));
  for (const record of records) {
    const weapon = await toGeneratedWeapon(client, record, unresolved);
    // Playable heuristic: must deal curve-scaled damage on the WEAP itself.
    // Grenades/mines carry damage on their projectile's explosion instead —
    // deferred until the EXPL-chase work (tracked separately from junk).
    if (weapon.components.length === 0) {
      const rgw3 = (record.fields['RGW3'] ?? {}) as Record<string, unknown>;
      const isProjectileOnly = rgw3['Override Projectile'] != null || weapon.weaponTypeName === 'Grenade';
      (excluded[isProjectileOnly ? 'projectileOnly' : 'noDamage'] ??= []).push(weapon.id);
      continue;
    }
    weapons.push(weapon);
  }

  // Obtainability derivation: reverse-reference each surviving weapon. Weapons
  // that fail stay in the generated data flagged obtainable:false (the app
  // hides them; corrections.ts forceVisibleWeaponIds rescues false negatives
  // without a re-extract), and every failure lands in excludedDetailed with
  // its evidence for post-run review.
  const classifier = new ObtainabilityClassifier(client);
  const verdicts = await classifier.classify(weapons.map(w => ({ formId: w.formId, edid: w.id })));
  const excludedDetailed: Record<string, ExcludedRecordDetail[]> = { weaponUnobtainable: [] };
  const obtainableFormIds = new Set<string>();
  for (const weapon of weapons) {
    const verdict = verdicts.get(weapon.formId);
    weapon.obtainable = verdict?.obtainable ?? false;
    if (weapon.obtainable) {
      obtainableFormIds.add(weapon.formId);
    } else {
      (excluded.unobtainable ??= []).push(weapon.id);
      excludedDetailed.weaponUnobtainable.push({ id: weapon.id, name: weapon.name, signals: verdict?.signals });
    }
  }

  weapons.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { weapons, excluded, excludedDetailed, unresolved: [...new Set(unresolved)], obtainableFormIds };
}
