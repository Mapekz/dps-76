import type {
  CurvePoint,
  GeneratedDamageComponent,
  GeneratedDamageType,
  GeneratedWeapon,
} from '../../src/types/generated';
import { EsmClient, mapPool, type EsmRecord } from './esm-client';

// EDID patterns for records that are never player weapons (creature attacks,
// deleted/deprecated content, turrets, event-NPC gear...). The creature prefix
// is 'cr' followed by an uppercase letter — plain prefix matching would
// swallow real weapons like 'crossbow'.
// Stragglers are handled per-edid in src/data/overrides/corrections.ts.
const EXCLUDED_EDID_PATTERNS = [
  // 'cr' + non-lowercase = creature weapon (crFanatic..., cr44) — but keep 'crossbow'.
  /^zzz/, /^DEL_/, /^DELETED/, /^DEPRECATED/, /^cr[^a-z]/, /^HTO_/, /^XPD_/,
  /^POST_/, /^ATX_/, /^Test/, /^TEST/, /^Debug/, /^GasTrap/, /^WorkshopTurret/,
  /^TrapTurret/, /^MTNM/, /^Survival_/, /NONPLAYABLE/i,
];

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
  unresolved: string[];
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

function extractTemplateModFormIds(fields: Record<string, unknown>): string[] {
  const template = fields['Object Template'] as Record<string, unknown> | undefined;
  const combinations = template?.['Combinations'];
  if (!Array.isArray(combinations)) return [];
  const modIds = new Set<string>();
  for (const combo of combinations as Array<Record<string, unknown>>) {
    const item = (combo['Combination'] as Record<string, unknown> | undefined)?.['Object Mod Template Item'] as
      | Record<string, unknown>
      | undefined;
    const includes = item?.['Includes'];
    if (!Array.isArray(includes)) continue;
    for (const inc of includes as Array<Record<string, unknown>>) {
      if (typeof inc['Mod'] === 'string') modIds.add(inc['Mod'] as string);
    }
  }
  return [...modIds];
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
    attachParentSlots: Array.isArray(fields['Attach Parent Slots'])
      ? (fields['Attach Parent Slots'] as string[])
      : [],
  };
}

export async function extractWeapons(client: EsmClient): Promise<ExtractWeaponsResult> {
  const named = await client.search('*', { type: 'WEAP', searchIn: 'name' });

  const excluded: Record<string, string[]> = { prefix: [], noDamage: [] };
  const candidates = named.filter(row => {
    if (EXCLUDED_EDID_PATTERNS.some(p => p.test(row.editor_id))) {
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

  weapons.sort((a, b) => a.name.localeCompare(b.name) || a.id.localeCompare(b.id));
  return { weapons, excluded, unresolved: [...new Set(unresolved)] };
}
