import type { GeneratedProcComponent } from '../../../src/types/generated';
import type { EsmSource } from '../esm-client';
import { RESIST_AV_DAMAGE_TYPES, type MgefInfo, type SpellEffect } from './mgef';
import { decodeExplosionDamage, explosionComponents } from './explosion';

/**
 * Proc-damage decode primitives (issue #42 — PROC_DAMAGE_PLAN.md), shared by
 * `translateMagicEffect`'s explosion-chase branch (Electrician's/Fracturer's)
 * and `chaseGrantedSpell`'s Circuit-Breaker-shape branch (mgef.ts). Kept in
 * their own module because neither reads or writes the Modifier IR — both
 * produce `GeneratedProcComponent`s, a sibling shape to
 * `GeneratedDamageComponent` with no `fromExplosion`/conditions.
 */

/**
 * Chase a Script- or Damage-archetype MGEF's `Explosion` field into proc
 * damage components — reuses the SAME EXPL decode `overrideProjectileModifiers`
 * (omod-projectile-chase.ts) and `chaseExplosion` (extract-weapons.ts) use, so
 * the three EXPL-chase call sites in the codebase can never drift on what
 * counts as "real" damage. Returns an empty array (never throws) when the
 * EXPL isn't found or carries no direct damage (VFX-only detonations, e.g.
 * Circuit Breaker's stun-cast spell) — the caller decides what an empty
 * result means (fall through vs. note).
 */
export async function decodeProcComponentsFromExpl(
  client: EsmSource,
  explFormId: string,
  unresolved: string[],
): Promise<GeneratedProcComponent[]> {
  let expl;
  try {
    expl = await client.get(explFormId);
  } catch {
    unresolved.push(`Explosion ${explFormId} not found`);
    return [];
  }

  const decoded = await decodeExplosionDamage(client, expl, unresolved);
  const hasDirectDamage =
    decoded.main != null ||
    decoded.typed.some((t) => t.damageType !== 'unknown' && (t.curve || t.amount > 0));
  if (!hasDirectDamage) return [];

  return explosionComponents(decoded).map((c) => ({
    damageType: c.damageType,
    damageTypeEdid: c.damageTypeEdid,
    amount: c.amount,
    tier: c.tier,
    curve: c.curve,
  }));
}

/**
 * Decode the "Circuit Breaker shape": a Damage-archetype effect with NO
 * `Explosion` field and `Duration: 0` — a one-shot Contact hit, not a
 * refresh-only DoT (`translate()`'s Damage-archetype branch would otherwise
 * misread it as one). The element comes off the MGEF's `Resist Value` AV via
 * `RESIST_AV_DAMAGE_TYPES` (the same map `translate()`'s DoT branch uses),
 * resolved through `edidByFormId` by the caller (`chaseGrantedSpell`, which
 * already has async access to pre-resolve it) — kept sync/pure here to match
 * `decodeProcComponentsFromExpl`'s no-throw contract and the rest of this
 * module's testing style.
 *
 * Resist provenance (docs/assumptions.md "DoT/proc resist provenance",
 * user-decided 2026-08-20): NO Resist Value AV at all (`mgef.resistValue`
 * null) is mechanically unresisted, same rule as `translate()`'s DoT branch —
 * the component still materializes (`unresisted: true`, `damageType`
 * `'unknown'`) rather than silently vanishing, which is what this function
 * did before 2026-08-20 (a real, if so-far-unobserved, damage-loss risk: no
 * currently-extracted Circuit-Breaker-shaped effect hits this branch — see
 * the commit's ESM sweep — so this is a latent-gap fix, not a regenerated-
 * value change). A Resist Value that's PRESENT but unmapped stays a silent
 * `null` drop — a narrower, different gap (real resist data our map doesn't
 * cover yet), left as-is.
 */
export function decodeInstantDamageComponent(
  mgef: MgefInfo,
  effect: SpellEffect,
  edidByFormId: Map<string, string>,
): GeneratedProcComponent | null {
  const hasDamage = (effect.curvePoints && effect.curvePoints.length > 0) || effect.magnitude > 0;
  if (!hasDamage) return null;

  if (!mgef.resistValue) {
    return {
      damageType: 'unknown',
      damageTypeEdid: null,
      amount: effect.magnitude,
      tier: null,
      curve: effect.curvePoints,
      isAoe: (effect.area ?? 0) > 0,
      unresisted: true,
    };
  }

  const resistEdid = edidByFormId.get(mgef.resistValue) ?? mgef.resistValue;
  const damageType = RESIST_AV_DAMAGE_TYPES[resistEdid];
  if (!damageType) return null;

  return {
    damageType,
    damageTypeEdid: resistEdid,
    amount: effect.magnitude,
    tier: null,
    curve: effect.curvePoints,
    isAoe: (effect.area ?? 0) > 0,
  };
}
