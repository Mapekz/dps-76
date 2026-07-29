import type {
  CurvePoint,
  GeneratedDamageComponent,
  GeneratedDamageType,
} from '../../../src/types/generated';
import type { EsmClient, EsmRecord } from '../esm-client';

/**
 * Shared PROJ → EXPL field decoding, used by BOTH the WEAP-level launcher
 * chase (extract-weapons.ts's `chaseExplosion` — RGW3 "Override Projectile" ??
 * AMMO fallback) and the OMOD-level `OverrideProjectile` property chase
 * (extract-omods.ts — Lobber Barrel / Polar Lobber). Factored out so the two
 * callers don't duplicate the EXPL field set (docs/assumptions.md "Launcher
 * explosion damage", "OMOD-chased launcher payloads").
 */

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

export function asNumber(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

export function parseCurve(node: unknown): { tier: number | null; curve: CurvePoint[] | null } {
  if (!node || typeof node !== 'object') return { tier: null, curve: null };
  const obj = node as { curve_path?: string; curve?: CurvePoint[] };
  const match = obj.curve_path ? TIER_RE.exec(obj.curve_path) : null;
  return {
    tier: match ? Number(match[1]) : null,
    curve: Array.isArray(obj.curve) && obj.curve.length > 0 ? obj.curve : null,
  };
}

/**
 * PROJ → EXPL gate: the PROJ Data.Flags "Explosion" bit gates whether its
 * `Data.Explosion` formid actually detonates — several projectiles carry a
 * stale Explosion formid that never fires (see extract-weapons.ts's
 * `chaseExplosion` doc comment). Beware: a PROJ's Destructible-stage
 * Explosion (the shot-down fallback) is a DIFFERENT field and must never be
 * chased here.
 */
export async function projectileExplosionFormId(
  client: EsmClient,
  projFormId: string,
): Promise<string | null> {
  const proj = await client.get(projFormId);
  const projData = (proj.fields['Data'] ?? {}) as Record<string, unknown>;
  const projFlags = ((projData['Flags'] ?? {}) as Record<string, unknown>)['flags'];
  if (!Array.isArray(projFlags) || !projFlags.includes('Explosion')) return null;
  const explFormId = projData['Explosion'] as string | null;
  return explFormId && explFormId !== '0x00000000' ? explFormId : null;
}

export interface DecodedExplosionDamage {
  /** Main physical explosion damage (WEAP "Damage Curve"-shaped) — null when absent (no curve, no flat Damage). */
  main: { tier: number | null; curve: CurvePoint[] | null; amount: number } | null;
  /** Typed entries (Cremator fire, Gamma Gun radiation, Polar Lobber cryo) — WEAP "Damage Types"-shaped. */
  typed: Array<{
    damageType: GeneratedDamageType;
    damageTypeEdid: string;
    amount: number;
    tier: number | null;
    curve: CurvePoint[] | null;
  }>;
  /** EXPL "Base Weapon Damage Mult" (Gauss family: 0.15) — 0 when absent. */
  baseWeaponDamageMult: number;
}

/** Decode an already-fetched EXPL record's damage fields (main curve / flat Damage / typed Damage Types / Base Weapon Damage Mult). */
export async function decodeExplosionDamage(
  client: EsmClient,
  expl: EsmRecord,
  unresolved: string[],
): Promise<DecodedExplosionDamage> {
  const explData = (expl.fields['Data'] ?? {}) as Record<string, unknown>;

  const mainCurve = parseCurve(explData['Damage Curve Table']);
  const flatDamage = asNumber(explData['Damage']);
  const main =
    mainCurve.curve || flatDamage > 0
      ? { tier: mainCurve.tier, curve: mainCurve.curve, amount: flatDamage }
      : null;

  const typedEntries = Array.isArray(expl.fields['Damage Types'])
    ? (expl.fields['Damage Types'] as Array<Record<string, unknown>>)
    : [];
  const typed: DecodedExplosionDamage['typed'] = [];
  for (const entry of typedEntries) {
    const typeFormId = entry['Type'] as string;
    const typeEdid = await client.resolveEdid(typeFormId);
    const damageType = DAMAGE_TYPE_EDID_MAP[typeEdid];
    if (!damageType) unresolved.push(`damage type ${typeEdid} (${typeFormId})`);
    const { tier, curve } = parseCurve(entry['Curve Table']);
    typed.push({
      damageType: damageType ?? 'unknown',
      damageTypeEdid: typeEdid,
      tier,
      curve,
      amount: asNumber(entry['Amount']),
    });
  }

  return { main, typed, baseWeaponDamageMult: asNumber(explData['Base Weapon Damage Mult']) };
}

/**
 * Turn a decoded EXPL's damage into `fromExplosion`-flagged components — the
 * WEAP-identical shape both callers need: extract-weapons.ts's `chaseExplosion`
 * (the weapon's own baseline explosion) and extract-omods.ts's launcher-family
 * `explosionSwap` (a barrel's OverrideProjectile detonating a DIFFERENT EXPL —
 * docs/assumptions.md "OMOD-chased launcher payloads" § Launcher-family
 * replacement). Factored out so the two can't drift: main curve → physical
 * `'explosive'` damage; each typed entry → its own elemental type. No
 * filtering (an `'unknown'`/zero-curve typed entry still becomes a
 * component) — callers gate on `decodeExplosionDamage`'s output themselves
 * before calling this.
 */
export function explosionComponents(decoded: DecodedExplosionDamage): GeneratedDamageComponent[] {
  const components: GeneratedDamageComponent[] = [];

  if (decoded.main) {
    components.push({
      damageType: 'explosive',
      damageTypeEdid: null,
      amount: decoded.main.amount,
      tier: decoded.main.tier,
      curve: decoded.main.curve,
      fromExplosion: true,
    });
  }

  for (const entry of decoded.typed) {
    components.push({
      damageType: entry.damageType,
      damageTypeEdid: entry.damageTypeEdid,
      amount: entry.amount,
      tier: entry.tier,
      curve: entry.curve,
      fromExplosion: true,
    });
  }

  return components;
}
