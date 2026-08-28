import type {
  GeneratedAura,
  GeneratedExplosionSwap,
  GeneratedProc,
} from '../../src/types/generated';
import type { Modifier } from '../../src/types/modifiers';
import type { EsmRecord, EsmSource } from './esm-client';
import {
  collapseRustyKnucklesBleedTiers,
  translateEnchantment,
  type MgefTranslationDeps,
} from './normalize/mgef';
import {
  decodeExplosionDamage,
  explosionComponents,
  explosionIsChain,
  projectileExplosionFormId,
} from './normalize/explosion';

export interface ProjectileChaseDeps {
  client: EsmSource;
  mgefDeps: MgefTranslationDeps;
}

/**
 * Returns the ENCH's own classified procs (issue #42 — PROC_DAMAGE_PLAN.md;
 * Electrician's/Fracturer's/Circuit Breaker) for the caller to attach as
 * `GeneratedOmod.procChase` — empty when the ENCH chased none.
 */
export async function enchantmentModifiers(
  enchFormId: string,
  source: Modifier['source'],
  into: Modifier[],
  modNotes: Set<string>,
  deps: ProjectileChaseDeps,
): Promise<{ procs: GeneratedProc[]; auras: GeneratedAura[] }> {
  const {
    modifiers: rawModifiers,
    notes,
    targetType,
    effectiveTargetType,
    procs,
    auras,
  } = await translateEnchantment(deps.mgefDeps, enchFormId);
  notes.forEach((n) => modNotes.add(n));
  // Rusty Knuckles' AV==9/18 tier rows arrive here with the tier gates still
  // raw (the perk-chase sites don't cover the ENCH-chase path — live-fail
  // 2026-08-28); collapse them into the wornPieces curve at this chokepoint.
  const modifiers = collapseRustyKnucklesBleedTiers(rawModifiers);
  const deliveryForGate = effectiveTargetType ?? targetType;
  for (const fragment of modifiers) {
    // A Self-delivery ENCH applies to the WIELDER, so a damage-dealing
    // fragment there is self-damage — never weapon output. Xerxos
    // (EnchXerxos → SelfRadDamage, "Emits Radiation", 20260717) is the
    // first such case: without this gate its 3 rad/s self-irradiation
    // lands as a +3 radiation DoT dealt to enemies. Buff-shaped fragments
    // (dbm MUL_ADDs like Voice of Set's +20% ballistic) stay — Self
    // delivery is the NORMAL shape for granted legendary buffs. Enemy-directed
    // dotDamage from a Self-delivery ENCH → Script perk chase (Voice of Set's
    // robot shock proc — docs/assumptions.md "Voice of Set robot shock proc")
    // carries enemyType conditions — do NOT drop those. When the innermost
    // chased SPEL is Contact (Rusty Knuckles bleed via PA_CommonArmPerk),
    // `effectiveTargetType` overrides the outer Self delivery — see
    // `chaseGrantedSpell`'s `deliveryTargetType` propagation (esm-walk
    // 2026-08-28).
    if (
      deliveryForGate === 'Self' &&
      fragment.bucket === 'dotDamage' &&
      fragment.op === 'ADD' &&
      !fragment.conditions.some((c) => c.kind === 'enemyType' || c.kind === 'enemyTypeAny')
    ) {
      modNotes.add(`self-targeted damage (hits the wielder, not enemies) — note-only`);
      continue;
    }
    into.push({ id: `${source.formId}:ench:${into.length}`, source, ...fragment });
  }
  return { procs, auras };
}

/**
 * The lingering hazard field's own tick damage: HAZD.Effect (SPEL) →
 * Damage-archetype MGEF magnitude/curve/damage-type, landed as `dotDamage`
 * (docs/assumptions.md "OMOD-chased launcher payloads" — the HAZD's Target
 * Interval/tick semantics are folded into the engine's existing
 * refresh-only DoT convention, not separately modeled). `durationSec` is
 * overridden with the HAZD's own Lifetime (how long the lingering field
 * persists) rather than the SPEL's own per-tick Effect Item Data duration —
 * inert metadata either way (Modifier.durationSec is not read by the
 * engine today), but Lifetime is the more honest "how long this dot-like
 * field lasts" reading. Shared by every `overrideProjectileModifiers` call
 * whose EXPL carries a hazard, unconditional on the target weapon.
 *
 * Exported for direct testing; `overrideProjectileModifiers` is the sole caller.
 */
export async function hazardModifiers(
  hazdFormId: string,
  source: Modifier['source'],
  into: Modifier[],
  modNotes: Set<string>,
  deps: ProjectileChaseDeps,
): Promise<void> {
  let hazd: EsmRecord;
  try {
    hazd = await deps.client.get(hazdFormId);
  } catch {
    modNotes.add(`OverrideProjectile hazard ${hazdFormId} not found`);
    return;
  }
  const hazdData = (hazd.fields['Data'] ?? {}) as Record<string, unknown>;
  const lifetime =
    typeof hazdData['Lifetime'] === 'number' ? (hazdData['Lifetime'] as number) : undefined;
  const spelFormId = hazdData['Effect'] as string | null;
  if (!spelFormId || spelFormId === '0x00000000') return;

  const { modifiers: hazardFragments, notes: hazardNotes } = await translateEnchantment(
    deps.mgefDeps,
    spelFormId,
  );
  hazardNotes.forEach((n) => modNotes.add(n));
  for (const fragment of hazardFragments) {
    into.push({
      id: `${source.formId}:${into.length}`,
      source,
      ...fragment,
      ...(fragment.bucket === 'dotDamage' && lifetime !== undefined
        ? { durationSec: lifetime }
        : {}),
    });
  }
}

/**
 * OMOD `OverrideProjectile` chase: PROJ (require the Explosion flag — the
 * same gate `chaseExplosion`, extract-weapons.ts, uses) → EXPL. ONE
 * unified shape, unconditional on which weapon the OMOD targets
 * (redesigned 2026-07-30 — see below for what this replaced):
 *
 * - **Direct damage** (main curve/flat AND any typed `Damage Types`
 *   entries) materializes UNCONDITIONALLY, via `explosionComponents()` —
 *   the SAME helper the WEAP-level `chaseExplosion` uses — into a
 *   `GeneratedOmod.explosionChase` the engine (`buildEffectiveWeapon`,
 *   effective-weapon.ts) turns into real `fromExplosion` WeaponComponents.
 *   Whether that REPLACES an existing baseline or simply ADDS is decided
 *   there, per the ACTUAL weapon being built, by checking whether it
 *   already has a `fromExplosion` component — never at extraction time.
 *   This is deliberately NOT a plain `baseDamage` modifier: see
 *   `materializeDamageTypeComponents`'s doc comment (effective-weapon.ts)
 *   for why a literal `damageTypeScope: ['explosive']` modifier would
 *   silently never materialize (caught 2026-07-30 before shipping).
 * - **EXPL "Base Weapon Damage Mult"** is extracted (audit note only, see
 *   below) but never consumed here: whenever direct component damage is
 *   present, it's authoritative and the mult is superseded — the same
 *   "curve is authoritative" rule every other damage field follows,
 *   generalized: a Projectile-Scaling Explosion (Gauss/Tesla) uses the
 *   mult ONLY because it has no curve/typed damage of its own; once an
 *   EXPL states real damage explicitly, there's nothing left for the mult
 *   to add (Polar Lobber's `Base Weapon Damage Mult: 1.0` is exactly this
 *   — its typed cryo curve is the complete, authoritative explosion
 *   damage, and the mult is simply unused, not "modeled elsewhere").
 * - **EXPL "Placed Object" → HAZD tick damage** and **EXPL "Enchantment"**
 *   (Napalm's ground fire / on-hit fire DoT) are INDEPENDENT bonus effects
 *   layered on top of the direct damage above, chased UNCONDITIONALLY
 *   whenever present — never a gate on whether direct damage materializes
 *   (a hazard is just an optional add-on effect, not a signal of anything).
 *
 * Unconditional on target-weapon-family keyword by design, not just by
 * simplification: a keyword-gated REPLACE-vs-additive split is unsound for
 * identity/customName mods (`ap_customName` — a unique weapon's own
 * dedicated skin/name mod), which carry no `Target OMOD Keywords` at all —
 * their binding to a base weapon lives in the separate Combination
 * mechanism `extract-uniques.ts` reads, structurally invisible to a
 * keyword gate at OMOD-extraction time.
 *
 * The overwhelming majority of the 154 weapon OMODs carrying
 * OverrideProjectile are cosmetic (suppressors, focusers) whose PROJ/EXPL
 * carry no damage — this chase must materialize nothing for those, with at
 * most one note when a chased PROJ has the Explosion flag but no decodable
 * damage.
 *
 * A narrower, distinct shape: the swapped PROJ's EXPL is `Chain`-flagged
 * (Tesla Cannon's Alternate Current muzzle → `ProjectileTeslaBeam_Chain` →
 * `SCORE_S19_Chainlightning_TeslaCannon`) — chain lightning, not an
 * explosion at all. Its bounce damage is engine-native (no ESM
 * representation), so it must SUPPRESS the weapon's own
 * `explosionBaseWeaponDamageMult` rather than be chased for damage —
 * reported via `chainSuppressesExplosion` instead of a `chase`.
 */
export async function overrideProjectileModifiers(
  projFormId: string,
  source: Modifier['source'],
  into: Modifier[],
  modNotes: Set<string>,
  deps: ProjectileChaseDeps,
): Promise<{
  chase: GeneratedExplosionSwap | null;
  chainSuppressesExplosion: boolean;
}> {
  const unresolved: string[] = [];
  let explFormId: string | null;
  try {
    explFormId = await projectileExplosionFormId(deps.client, projFormId);
  } catch (err) {
    modNotes.add(
      `OverrideProjectile ${projFormId}: ${err instanceof Error ? err.message : String(err)}`,
    );
    return { chase: null, chainSuppressesExplosion: false };
  }
  if (!explFormId) return { chase: null, chainSuppressesExplosion: false }; // no Explosion flag / no Explosion formid — cosmetic mod, nothing to chase.

  let expl: EsmRecord;
  try {
    expl = await deps.client.get(explFormId);
  } catch {
    modNotes.add(`OverrideProjectile explosion ${explFormId} not found`);
    return { chase: null, chainSuppressesExplosion: false };
  }

  if (explosionIsChain(expl)) {
    modNotes.add(
      `OverrideProjectile ${expl.editor_id}: Chain-flagged explosion (chain lightning, not an explosion) — suppresses explosionBaseWeaponDamageMult and the Explosive 2★ payload`,
    );
    return { chase: null, chainSuppressesExplosion: true };
  }

  const decoded = await decodeExplosionDamage(deps.client, expl, unresolved);
  unresolved.forEach((u) => modNotes.add(u));

  const explData = (expl.fields['Data'] ?? {}) as Record<string, unknown>;
  const hazdFormId = explData['Placed Object'] as string | null;
  const hasHazard = !!hazdFormId && hazdFormId !== '0x00000000';
  const hasDirectDamage =
    decoded.main != null ||
    decoded.typed.some((t) => t.damageType !== 'unknown' && (t.curve || t.amount > 0));

  let chase: GeneratedExplosionSwap | null = null;
  if (hasDirectDamage) {
    chase = {
      explEdid: expl.editor_id,
      components: explosionComponents(decoded),
      baseWeaponDamageMult: decoded.baseWeaponDamageMult,
    };
  }
  if (decoded.baseWeaponDamageMult > 0) {
    // Audit note only — see the doc comment above for why this is never
    // consumed: whenever direct component damage is present it's
    // authoritative, and the mult is superseded, not "modeled elsewhere".
    modNotes.add(
      `EXPL ${expl.editor_id} Base Weapon Damage Mult ${decoded.baseWeaponDamageMult} — superseded by the EXPL's own direct damage above, not consumed`,
    );
  }

  // EXPL "Enchantment" (top-level field, sibling of "Data" — NOT nested
  // inside it): the explosion's own on-hit proc (Napalm's fire DoT,
  // FXEnchFireHitBOSLauncher_Napalm). Reuses `enchantmentModifiers` — same
  // translateEnchantment path + Self-delivery self-damage guard an OMOD's
  // own `Enchantments` property uses; nothing to do when absent (most
  // EXPLs carry no Enchantment field). An independent bonus effect, not
  // gated on `hasDirectDamage` or `hasHazard`.
  const enchFormId = (expl.fields['Enchantment'] as string | null) ?? null;
  if (enchFormId && enchFormId !== '0x00000000') {
    await enchantmentModifiers(enchFormId, source, into, modNotes, deps);
  }
  // EXPL "Placed Object" → HAZD lingering tick damage (Napalm's ground
  // fire, Polar Lobber's cryo field): ALSO an independent bonus effect on
  // top of the direct damage above, not a gate on it.
  if (hasHazard) {
    await hazardModifiers(hazdFormId!, source, into, modNotes, deps);
  }
  return { chase, chainSuppressesExplosion: false };
}
