import type { EnemyConditions, Weapon, WeaponComponent } from '@/types';
import type { PlayerConditionContext } from '@/types/player';
import type {
  GeneratedDamageComponent,
  GeneratedDamageType,
  GeneratedExplosionSwap,
  GeneratedOmod,
  GeneratedProc,
  GeneratedProcComponent,
} from '@/types/generated';
import type { Bucket, DamageType, Modifier } from '@/types/modifiers';
import type { ProcComponent, ProcSource, ProcTrigger } from '@/types/procs';
import {
  EFFECTIVE_WEAPON_CONSUMED_BUCKETS,
  SUSTAIN_CHANCE_BUCKETS,
  WEAPON_STAT_BUCKETS,
} from '@/types/modifiers';
import { streamConvertingOmodIds } from '@/data/overrides/omod-corrections';
import { streamDeliveryWeaponIds } from '@/data/overrides/weapon-corrections';
import { effectiveValue, foldBucket, foldRegisteredBucket, type ResolveContext } from './resolve';

export { SUSTAIN_CHANCE_BUCKETS, WEAPON_STAT_BUCKETS };

/**
 * Floor for folded animDelaySec. Deliberately far below any real weapon's
 * cadence (not the auto-cycle default ~0.11s) so a `SET animDelaySec 0`
 * OMOD bug (e.g. mod_custom_Doolin / The Dragon) produces an obviously-wrong
 * ~1000/sec fire rate instead of silently passing as a plausible number.
 */
const MIN_ANIM_DELAY_SEC = 0.001;

/**
 * Applies equipped OMODs to a weapon before the engine runs:
 * - keyword ADDs merge into weapon.keywords (WeaponTypeAutomatic, HasSilencer, …
 *   drive perk conditions ONLY — WeaponTypeAutomatic is not a fire-rate signal,
 *   see the isAutomatic note below)
 * - fireRateSpeed / isAutomatic / animDurationSec buckets rewrite the weapon's
 *   speed/auto state/animation-cycle length (auto receivers SET Speed 0.8248 —
 *   the old hardcoded "physical" multiplier; isAutomatic reflects the real
 *   WEAP Data.Flags "Automatic" bit + OMOD `IsAutomatic` property, never a
 *   keyword — some OMODs add WeaponTypeAutomatic without the weapon actually
 *   being full-auto, e.g. Combat Shotgun's Automatic Receiver)
 * - `baseDamage` modifiers scoped to a damage type the weapon doesn't already
 *   deal materialize a new `WeaponComponent` for that type (Tesla Coil
 *   Capacitor's +0.5 energy on the ballistic-only Gauss Minigun) —
 *   `materializeDamageTypeComponents` below
 * - an equipped OMOD's `explosionChase` (its `OverrideProjectile` → EXPL
 *   chase result) either REPLACES the weapon's own `fromExplosion`
 *   component(s) (Hellstorm's Napalm/Cryo/Plasma tube barrels — the
 *   baseline never detonates once the projectile is swapped) or ADDS one to
 *   a weapon with none (Polar Lobber Barrel, Nitro's, Explosive
 *   Arrows/Frame, Firework Frame, Signal Dish Barrel) — decided per-weapon
 *   right here, see the `explosionChase`/`baseComponents` block below
 *   (docs/assumptions.md "OMOD-chased launcher payloads")
 * - remaining modifiers (dbm, critDmgBase, sneakBase, …) feed the resolver
 * - weapon-stat buckets from LOADOUT sources (perks/mutations/consumables —
 *   Guerrilla Expert's reload, Speed Demon's reload) fold in alongside the
 *   OMOD ones via the `loadoutModifiers` parameter
 */
export interface EffectiveWeapon {
  weapon: Weapon;
  modifiers: Modifier[];
}

// WEAPON_STAT_BUCKETS (buckets that rewrite effective-weapon fields rather
// than feeding the resolver — folded here from OMOD *and* loadout
// (perk/mutation/consumable) modifiers, then dropped from the downstream
// modifier list) is derived from BUCKET_REGISTRY (@/types/modifiers) and
// re-exported above, not hand-maintained here.

// Mirrors src/data/live/weapons.ts's adaptWeapon damage-type/component
// mapping — duplicated here (rather than imported) because the engine must
// stay live/pts-mode-agnostic and never reaches into a mode-specific data
// adapter. Keep both in sync if a new GeneratedDamageType is ever added.
const EXPLOSION_SWAP_DAMAGE_TYPE_MAP: Record<GeneratedDamageType, WeaponComponent['damageType']> = {
  ballistic: 'ballistic',
  energy: 'energy',
  fire: 'fire',
  cryo: 'cryo',
  poison: 'poison',
  radiation: 'radiation',
  explosive: 'explosive',
  unknown: 'ballistic',
};

/** Converts an `explosionChase`'s extractor-shaped components to engine-shaped `WeaponComponent`s. */
function explosionSwapComponents(
  components: readonly GeneratedDamageComponent[],
  levelCap: number,
): WeaponComponent[] {
  return components.map((c) => ({
    damageType: EXPLOSION_SWAP_DAMAGE_TYPE_MAP[c.damageType],
    tier: c.tier ?? -1,
    levelCap,
    // Flat-amount components (no tier, no curve) become a constant
    // one-point curve — same convention as adaptWeapon.
    curvePoints: c.curve ?? (c.tier == null ? [{ x: 1, y: c.amount }] : undefined),
    fromExplosion: true,
  }));
}

/** `GeneratedProc.trigger` → the engine-shaped discriminated union (procs.ts). */
function procTriggerFromGenerated(proc: GeneratedProc): ProcTrigger {
  switch (proc.trigger) {
    case 'reloadCycle':
      return { kind: 'reloadCycle' };
    case 'lastRound':
      return { kind: 'lastRound' };
    case 'onCripple':
      return { kind: 'onCripple', cooldownSec: proc.cooldownSec ?? 0 };
  }
}

/** Converts a `GeneratedProc`'s components to engine-shaped `ProcComponent`s — same damage-type map explosionSwapComponents uses (procs.ts's `DamageType` and `WeaponComponent['damageType']` are the same union). */
function procComponentsFromGenerated(
  components: readonly GeneratedProcComponent[],
): ProcComponent[] {
  return components.map((c) => ({
    damageType: EXPLOSION_SWAP_DAMAGE_TYPE_MAP[c.damageType],
    // itemLevel-keyed inline points (authoritative when present, procs.ts's
    // ProcComponent.curve doc comment) — flat `amount` fallback otherwise.
    curve: c.curve ? { input: 'itemLevel' as const, points: c.curve } : undefined,
    value: c.curve ? undefined : c.amount,
    isAoe: c.isAoe,
  }));
}

/**
 * Proc-triggered damage (issue #42, PROC_DAMAGE_PLAN.md commit 6): collects
 * `procChase` across ALL equipped OMODs — unlike `explosionChase`'s
 * last-equipped-wins convention, a weapon can plausibly carry more than one
 * genuinely distinct proc source at once.
 *
 * Dedup investigation (2026-08-19): Circuit Breaker's `procChase` appears on
 * BOTH its identity mod (`mod_Custom_CircuitBreaker`, ap_customName, listed
 * in `defaultModFormIds`) and the OMOD its Includes chain pulls in
 * (`mod_Custom_CircuitBreaker_Effect`, ap_Legendary3) — the extractor chases
 * each OMOD record's own Enchantments/AttachedPerk property independently,
 * so both end up carrying byte-identical `procChase` entries for the same
 * underlying PERK/SPEL chain. Traced how equipped omods materialize
 * (`equippedOmodsFor` in loadout-memo-wrappers.ts, `getDefaultOmods` in
 * data/omods.ts, `isOmodEligibleForWeapon` in omod-eligibility.ts): the
 * effect mod is in neither `defaultModFormIds` nor `templateModFormIds` for
 * Circuit Breaker (or any other weapon), and its empty `targetKeywords`
 * makes Branch 2 of the eligibility predicate require template membership or
 * an explicit `restrictedToWeaponIds` rescue — neither is set — so under
 * today's data the effect mod can never itself land in `equippedOmods`; only
 * the identity mod's copy is ever seen. Still dedupe defensively by
 * structural content (JSON-equal trigger+components) rather than trust that
 * invariant to hold forever — a future rescue-list entry or corrections.ts
 * change could put both in the same equipped set.
 */
function resolveGeneratedProcs(equippedOmods: readonly GeneratedOmod[]): ProcSource[] {
  const procs: ProcSource[] = [];
  const seen = new Set<string>();
  for (const omod of equippedOmods) {
    (omod.procChase ?? []).forEach((proc, i) => {
      const key = JSON.stringify(proc);
      if (seen.has(key)) return;
      seen.add(key);
      procs.push({
        id: `${omod.formId}:proc:${i}`,
        source: { kind: 'omod', formId: omod.formId, edid: omod.id, name: omod.name },
        trigger: procTriggerFromGenerated(proc),
        components: procComponentsFromGenerated(proc.components),
        conditions: [],
      });
    });
  }
  return procs;
}

function foldChanceUnion(modifiers: Modifier[], bucket: Bucket, ctx: ResolveContext): number {
  let survive = 1;
  for (const m of modifiers) {
    if (m.bucket !== bucket) continue;
    const v = effectiveValue(m, ctx);
    if (v !== null) survive *= 1 - Math.min(Math.max(v, 0), 1);
  }
  return Math.min(1 - survive, 0.99);
}

/**
 * DamageTypeValues/AttackDamage OMOD conversion (2026-07-13 user-confirmed
 * semantics, docs/assumptions.md "Mixed damage-type OMOD conversion"): a
 * `baseDamage` modifier scoped to a damage type the weapon doesn't already
 * deal would otherwise silently no-op — paper-damage.ts only folds
 * `baseDamage` per EXISTING component (the Tesla Coil Capacitor's +0.5
 * energy MUL_ADD on the ballistic-only Gauss Minigun has no energy
 * component to apply to). This synthesizes the missing component so the
 * fold has somewhere to land.
 *
 * - `scale` = Σ POSITIVE MUL_ADD values only. A negative MUL_ADD on a missing
 *   type multiplies that type's own (zero) base and contributes nothing — it
 *   is DROPPED per-modifier, NOT netted against positives. This is what
 *   keeps the ~54 blanket "−30% on all six damage types" automatic-receiver/
 *   barrel OMODs (Powerful Automatic Receiver et al. — verified 344 such
 *   values in omods.json) from spawning five phantom components on e.g. the
 *   ballistic-only Fixer: every non-ballistic type sees ONLY a dropped
 *   negative, so scale and flatBonus both stay 0 and nothing materializes.
 * - `flatBonus` = (last SET ?? 0) + Σ ADD — flat and absolute, no
 *   weapon-level curve scaling (SET/ADD-shaped `DamageTypeValues` properties).
 * - Materializes only when `scale > 0 || flatBonus > 0`.
 * - The new component borrows its curve (tier/levelCap/curvePoints) from the
 *   FALLBACK — the weapon's first non-`fromExplosion` ballistic component,
 *   else its first non-`fromExplosion` component (never `weapon.damageType`,
 *   which would misroute explosive-first launchers). `fromExplosion`
 *   components (launcher EXPL payloads) never serve as the fallback base or
 *   as a "the weapon already deals this" target — they're a separate damage
 *   stream. A weapon with no eligible fallback (Gamma-Gun-shaped, all
 *   `fromExplosion`) materializes nothing.
 * - Every `baseDamage` modifier that fed a materialized type's scale/
 *   flatBonus — including its dropped negatives — is consumed (its id
 *   returned for the caller to filter out), so paper-damage's ordinary
 *   per-component fold can't apply it a second time. Modifiers scoped to
 *   types the weapon ALREADY deals are left untouched: the existing
 *   per-component fold in paper-damage.ts already handles boost/ADD/SET/
 *   clamp correctly for those, and types that end up NOT materializing
 *   (all-dropped-negative groups) are also left alone — harmless, since no
 *   component of that type exists for them to match against.
 *
 * A second, independent pass (issue #83) covers `dotDamage`-scoped foreign
 * types the same way: `computeDotDps` (paper-damage.ts) only iterates
 * `weapon.components`' damage types, so an OMOD/legendary `dotDamage`
 * modifier scoped to a type the weapon doesn't otherwise deal (Camden
 * Whacker's Poison/Fire/Radiation variants — real ESM flat-amount DoT
 * enchantments with no accompanying `baseDamage` property) would silently
 * fold to 0. That pass materializes a component with `scale: 0, flatBonus: 0`
 * — a ZERO base-damage contribution BY CONSTRUCTION (`componentBase` in
 * paper-damage.ts computes `curveBase * scale + flatBonus`, so the borrowed
 * curve's actual values never matter) — purely so the type exists for
 * `computeDotDps`'s per-type fold and the ordinary per-hit component loop to
 * iterate, contributing exactly 0 damage there. It never consumes any
 * modifier id: the `dotDamage` modifiers still need to fold in
 * `computeDotDps`'s own pass, and a `baseDamage` modifier that happens to
 * share the same type stays exactly as inert against a 0-damage component as
 * it already is against a real one. Skips any type the `baseDamage` pass
 * above already materialized, so a type never gets two components (which
 * would double-count its per-hit row).
 */
function materializeDamageTypeComponents(
  weapon: Weapon,
  modifiers: Modifier[],
  ctx: ResolveContext,
): { components: WeaponComponent[]; consumedIds: Set<string> } {
  const existingTypes = new Set(
    (weapon.components ?? []).filter((c) => !c.fromExplosion).map((c) => c.damageType),
  );
  const fallback =
    (weapon.components ?? []).find((c) => !c.fromExplosion && c.damageType === 'ballistic') ??
    (weapon.components ?? []).find((c) => !c.fromExplosion);
  if (!fallback) return { components: [], consumedIds: new Set() };

  const candidateTypes = new Set<DamageType>();
  for (const m of modifiers) {
    if (m.bucket !== 'baseDamage') continue;
    for (const cond of m.conditions) {
      if (cond.kind !== 'damageTypeScope') continue;
      for (const t of cond.types) {
        if (t !== 'explosive' && !existingTypes.has(t)) candidateTypes.add(t);
      }
    }
  }

  const components: WeaponComponent[] = [];
  const consumedIds = new Set<string>();
  const materializedTypes = new Set<DamageType>();
  for (const type of candidateTypes) {
    const typeCtx: ResolveContext = { ...ctx, componentType: type, componentIsExplosion: false };
    const matching = modifiers
      .filter((m) => m.bucket === 'baseDamage')
      .map((m) => ({ mod: m, value: effectiveValue(m, typeCtx) }))
      .filter((e): e is { mod: Modifier; value: number } => e.value !== null);
    if (matching.length === 0) continue;

    let scale = 0;
    let setValue: number | null = null;
    let addSum = 0;
    for (const { mod: m, value } of matching) {
      if (m.op === 'MUL_ADD') {
        if (value > 0) scale += value;
      } else if (m.op === 'SET') {
        setValue = value;
      } else {
        addSum += value;
      }
    }
    const flatBonus = (setValue ?? 0) + addSum;
    if (scale <= 0 && flatBonus <= 0) continue;

    components.push({
      damageType: type,
      tier: fallback.tier,
      levelCap: fallback.levelCap,
      curvePoints: fallback.curvePoints,
      scale,
      flatBonus,
    });
    materializedTypes.add(type);
    for (const { mod: m } of matching) consumedIds.add(m.id);
  }

  // DoT-only foreign types (issue #83) — see doc comment above.
  for (const m of modifiers) {
    if (m.bucket !== 'dotDamage') continue;
    for (const cond of m.conditions) {
      if (cond.kind !== 'damageTypeScope') continue;
      for (const t of cond.types) {
        if (t === 'explosive' || existingTypes.has(t) || materializedTypes.has(t)) continue;
        materializedTypes.add(t);
        components.push({
          damageType: t,
          tier: fallback.tier,
          levelCap: fallback.levelCap,
          curvePoints: fallback.curvePoints,
          scale: 0,
          flatBonus: 0,
        });
      }
    }
  }

  return { components, consumedIds };
}

export function buildEffectiveWeapon(
  weapon: Weapon,
  equippedOmods: GeneratedOmod[],
  itemLevel: number,
  player: PlayerConditionContext,
  enemy: EnemyConditions,
  // Loadout (perk/legendary-perk/mutation/consumable) modifiers: ONLY their
  // weapon-stat buckets fold here (Guerrilla Expert's reload, Speed Demon's
  // reload, Martial Artist's speed — the perk weapon-stat fold gap). They
  // never feed keyword merging or component materialization, and the caller
  // keeps ownership of the list: `assemble` (src/lib/loadout.ts) drops the
  // weapon-stat buckets from the downstream modifier list, mirroring the
  // OMOD filter below.
  loadoutModifiers: Modifier[] = [],
  // Enemy-type identifiers of the selected target (see ResolveContext) — lets
  // enemy-type-gated weapon-stat modifiers resolve, and keeps every root
  // context builder consistent.
  enemyTypeIds: readonly string[] = [],
): EffectiveWeapon {
  const loadoutStatModifiers = loadoutModifiers.filter(
    (m) => WEAPON_STAT_BUCKETS.has(m.bucket) || SUSTAIN_CHANCE_BUCKETS.has(m.bucket),
  );
  if (equippedOmods.length === 0 && loadoutStatModifiers.length === 0)
    return { weapon, modifiers: [] };

  const allOmodModifiers = equippedOmods.flatMap((o) => o.modifiers);

  const keywords = [
    ...new Set([...(weapon.keywords ?? []), ...equippedOmods.flatMap((o) => o.addedKeywords)]),
  ];
  // A neutral scenario (no VATS/sneak/crit/power-attack flags): weapon-stat
  // conditions seen so far (killStreakCount) are scenario-independent, and
  // this fold runs once per resolveLoadout call, before scenario branching.
  const baseCtx: ResolveContext = {
    weapon: { ...weapon, keywords },
    player,
    enemy,
    scenario: { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false },
    itemLevel,
    enemyTypeIds,
  };
  // Onslaught-stack curves on weapon-stat buckets (Guerrilla Expert's reload)
  // read the equipped stack cap — bootstrap-fold it exactly like scenarios.ts
  // does per scenario input (cap modifiers are themselves never
  // onslaught-gated, so folding with cap 0 is exact).
  const onslaughtMaxStacks = foldRegisteredBucket(
    [...allOmodModifiers, ...loadoutModifiers],
    'onslaughtMaxStacks',
    baseCtx,
  );
  // Bullet-Storm-stack curves on weapon-stat buckets (Bullet Storm's own
  // reload-speed curve, cross-family-gated on Lock and Load) read the
  // equipped stack cap/floor — bootstrap-fold both exactly like Onslaught
  // above (cap/floor modifiers are themselves never Bullet-Storm-gated, so
  // folding with cap/floor 0 is exact).
  const bulletStormMaxStacks = foldRegisteredBucket(
    [...allOmodModifiers, ...loadoutModifiers],
    'bulletStormMaxStacks',
    baseCtx,
  );
  const bulletStormMinStacks = foldRegisteredBucket(
    [...allOmodModifiers, ...loadoutModifiers],
    'bulletStormMinStacks',
    baseCtx,
  );
  // Bonus-move-speed fraction for the moveSpeedBonus curve input (Fast
  // Fighter's reload conversion) — same bootstrap pattern: fold once from the
  // FULL modifier list (Speed Demon's source is a mutation, not a weapon-stat
  // modifier), thread on the ctx every weapon-stat fold below sees.
  const moveSpeedBonus = foldRegisteredBucket(
    [...allOmodModifiers, ...loadoutModifiers],
    'moveSpeedBonus',
    baseCtx,
  );
  // Bunker Buster (mod_Custom_BunkerBuster): converts the player's
  // accumulated explosive-radius bonus (Grenadier +50%/+100%) into damage
  // instead. Both buckets bootstrap-fold once here — same pattern as
  // onslaughtMaxStacks/moveSpeedBonus above — because the conversion needs
  // the OMOD's flag (explosionRadiusToDamage) and the player's perk-sourced
  // bonus (explosionRadiusBonus) combined into ONE synthesized modifier,
  // not threaded through ResolveContext.
  const explosionRadiusBonus = foldRegisteredBucket(
    [...allOmodModifiers, ...loadoutModifiers],
    'explosionRadiusBonus',
    baseCtx,
  );
  const explosionRadiusToDamage = foldRegisteredBucket(
    [...allOmodModifiers, ...loadoutModifiers],
    'explosionRadiusToDamage',
    baseCtx,
  );
  const ctx: ResolveContext = {
    ...baseCtx,
    onslaughtMaxStacks,
    moveSpeedBonus,
    bulletStormMaxStacks,
    bulletStormMinStacks,
  };

  const statModifiers = [...allOmodModifiers, ...loadoutStatModifiers];
  const speed = foldBucket(statModifiers, 'fireRateSpeed', weapon.speed ?? 1.0, ctx);
  // NOTE (2026-07-13, user-confirmed): `WeaponTypeAutomatic` is a perk-condition
  // keyword only, not a real fire-mode signal — some OMODs add it without the
  // weapon actually firing full-auto (Combat Shotgun's Automatic Receiver sets
  // `HasRepeatableSingleFire`, not `IsAutomatic`). The `isAutomatic` bucket
  // (folded from the base weapon's real WEAP Data.Flags "Automatic" bit, SET
  // by OMODs that carry an explicit `IsAutomatic` property) is the only
  // correct signal — do not OR in a keyword check here.
  const isAutomatic = foldBucket(statModifiers, 'isAutomatic', weapon.isAutomatic ? 1 : 0, ctx) > 0;
  const animDurationSec = foldBucket(
    statModifiers,
    'animDurationSec',
    weapon.animDurationSec ?? 0.11,
    ctx,
  );
  // Semi-auto attack-delay rewrite (OMOD AttackDelaySec MUL_ADD — Salt of the
  // Earth's delay penalty, 2026-07-15 audit). weapon.animDelaySec is
  // undefined for automatic-only weapons (fire-rate.ts never reads it then),
  // so fold over 0.5 (fire-rate.ts's own fallback) only when the base weapon
  // actually carries the stat, same `?? undefined` shape as the base type.
  const animDelaySec =
    weapon.animDelaySec !== undefined || statModifiers.some((m) => m.bucket === 'animDelaySec')
      ? Math.max(
          MIN_ANIM_DELAY_SEC,
          foldBucket(statModifiers, 'animDelaySec', weapon.animDelaySec ?? 0.5, ctx),
        )
      : undefined;
  // NOTE: projectileCount folds into the effective weapon but NO damage term
  // consumes it yet — per-projectile/pellet modeling is deferred (with the
  // DoT engine work). Two Shot's damage today is only its extracted dbm.
  const projectileCount = foldBucket(
    statModifiers,
    'projectileCount',
    weapon.projectileCount ?? 1,
    ctx,
  );
  const capacity = foldBucket(statModifiers, 'ammoCapacity', weapon.capacity ?? 0, ctx);
  const reloadSpeed = foldBucket(statModifiers, 'reloadSpeed', weapon.reloadSpeed ?? 1.0, ctx);
  const reloadSkipChance = foldChanceUnion(statModifiers, 'reloadSkipChance', ctx);
  // Bash-triggered channel (Battle-Loader's), separate from the passive
  // reloadSkipChance above — same foldChanceUnion fold, distinct bucket
  // (docs/assumptions.md "Reload-skip & free-ammo expected value").
  const reloadSkipChanceBash = foldChanceUnion(statModifiers, 'reloadSkipChanceBash', ctx);
  const ammoFreeChance = foldChanceUnion(statModifiers, 'ammoFreeChance', ctx);
  // Last Shot's per-magazine proc chance (EP-198) — same foldChanceUnion as
  // the reload/ammo chances above; read by resolve.ts's `lastRound` condition
  // rather than by sustain.ts.
  const lastShotChance = foldChanceUnion(statModifiers, 'lastShotChance', ctx);
  // VATS AP cost (Stage B): foldBucket Σ MUL_ADD on WEAP Action Point Cost
  // (V.A.T.S. Optimized −0.35, plasma barrel/stock/capacitor, …). Keep the
  // RAW float — Pip-Boy shows round(cost); do not round here
  // (docs/assumptions.md "VATS AP economy").
  const apCost = foldBucket(statModifiers, 'vatsApCost', weapon.apCost ?? 0, ctx);
  // Charging (tesla/gamma/laser charging-barrel OMODs turn charging ON via a
  // SET FullPowerSeconds/FullPowerDamageMult; Gauss-family barrels retune an
  // existing pair) — same fold pattern as ammoCapacity/reloadSpeed/apCost.
  // weaponCharges() (src/lib/charge.ts) treats 0 as "doesn't charge", so
  // folding over `?? 0` is neutral for weapons with no charge fields at all.
  const fullPowerSeconds = foldBucket(
    statModifiers,
    'chargeFullPowerSec',
    weapon.fullPowerSeconds ?? 0,
    ctx,
  );
  const fullPowerDamageMult = foldBucket(
    statModifiers,
    'chargeFullPowerDamageMult',
    weapon.fullPowerDamageMult ?? 0,
    ctx,
  );
  // Range/falloff (Phase 1 engine half): barrels mostly (long-range barrels
  // MUL_ADD 0.5 on both min/max; one SET on weaponOutOfRangeMult, the Abraxo
  // Barrel). Same fold pattern as ammoCapacity/reloadSpeed above — 0 is a
  // real value (melee weapons carry minRange/maxRange 0), so fold over
  // `?? 0` exactly like the base Weapon fields' own "0 is real" convention
  // (src/types/index.ts). outOfRangeDamageMult falls back to 1.0 (neutral —
  // no falloff) only when the base weapon field itself is absent, which
  // extraction never leaves unset for a real ranged weapon.
  const minRange = foldBucket(statModifiers, 'weaponMinRange', weapon.minRange ?? 0, ctx);
  const maxRange = foldBucket(statModifiers, 'weaponMaxRange', weapon.maxRange ?? 0, ctx);
  const outOfRangeDamageMult = foldBucket(
    statModifiers,
    'weaponOutOfRangeMult',
    weapon.outOfRangeDamageMult ?? 1.0,
    ctx,
  );

  const modifiers = allOmodModifiers.filter(
    (m) =>
      !WEAPON_STAT_BUCKETS.has(m.bucket) &&
      !SUSTAIN_CHANCE_BUCKETS.has(m.bucket) &&
      !EFFECTIVE_WEAPON_CONSUMED_BUCKETS.has(m.bucket),
  );

  // Chain-lightning suppression (Tesla Cannon's Alternate Current muzzle):
  // an equipped OMOD's OverrideProjectile can resolve to a Chain-flagged
  // EXPL — chain lightning, not a real explosion (GeneratedOmod.
  // chainSuppressesExplosion, scripts/extract/extract-omods.ts /
  // normalize/explosion.ts's `explosionIsChain`). Its bounce falloff is
  // engine-native with no ESM representation, so the weapon's own explosion
  // (Curve-Table OR Projectile-Scaling — CONTEXT.md) must be treated as
  // absent entirely: see hasCurveExplosion/explosionBaseWeaponDamageMult and
  // the Explosive 2★ branch below.
  const chainSuppressesExplosion = equippedOmods.some((o) => o.chainSuppressesExplosion);
  // Stream-delivery suppression (USER-CONFIRMED 2026-08-15, not ESM-provable
  // — see streamDeliveryWeaponIds/streamConvertingOmodIds' own doc comments):
  // a continuous stream (Cryolator's beam, Flamer's flame, Plasma Gun/Gatling
  // Plasma with a Thrower Barrel/Nozzle equipped) has no discrete projectile
  // impact to trigger an explosion — same dead-legendary outcome as chain
  // suppression, folded into the same `explosionSuppressed` flag below so it
  // wins over any residual explosion data on the weapon's own base record
  // too. Lifted only by a REAL explosive-conversion OMOD (`explosionChase`,
  // e.g. Cryolator's Polar Lobber Barrel) — checked together below.
  const streamSuppressesExplosion =
    streamDeliveryWeaponIds.has(weapon.id) ||
    equippedOmods.some((o) => streamConvertingOmodIds.has(o.id));

  // OMOD `OverrideProjectile` chase (docs/assumptions.md "OMOD-chased
  // launcher payloads"): an equipped OMOD's EXPL chase can REPLACE the
  // weapon's own baseline `fromExplosion` component(s) (Hellstorm's
  // Napalm/Cryo/Plasma tube barrels — the baseline never detonates once the
  // projectile is swapped) or ADD a genuine new one to a weapon that has
  // none (Polar Lobber Barrel, Nitro's, Explosive Arrows/Frame, Firework
  // Frame, Signal Dish Barrel). Both are the SAME expression: filtering out
  // any existing `fromExplosion` component(s) before appending the chase's
  // own is a no-op when none existed (ADD) and a real replacement when they
  // did (REPLACE) — redesigned 2026-07-30, no target-weapon classification
  // needed at extraction time (`GeneratedExplosionSwap`'s doc comment). Only
  // the last equipped OMOD carrying a chase wins, same single-slot-override
  // convention as every other OMOD stat.
  const explosionChase = equippedOmods.reduce<GeneratedExplosionSwap | undefined>(
    (found, o) => o.explosionChase ?? found,
    undefined,
  );
  // Combined suppression: chain lightning always wins; stream-delivery only
  // wins while no real explosive-conversion chase is equipped (that chase IS
  // the "explosive-capable barrel" that legitimately turns a stream weapon
  // explosive — Cryolator's Polar Lobber Barrel).
  const explosionSuppressed =
    chainSuppressesExplosion || (streamSuppressesExplosion && !explosionChase);
  const baseComponents = explosionSuppressed
    ? (weapon.components ?? []).filter((c) => !c.fromExplosion)
    : explosionChase
      ? [
          ...(weapon.components ?? []).filter((c) => !c.fromExplosion),
          ...explosionSwapComponents(
            explosionChase.components,
            weapon.components?.[0]?.levelCap ?? 50,
          ),
        ]
      : (weapon.components ?? []);
  const weaponForMaterialization =
    baseComponents === weapon.components ? weapon : { ...weapon, components: baseComponents };
  // Post-chase/post-suppression Curve-Table Explosion check (CONTEXT.md) —
  // used by the Explosive 2★ branch below, evaluated on the EFFECTIVE
  // components so an explosionChase or chain suppression is accounted for.
  const hasCurveExplosion = baseComponents.some((c) => c.fromExplosion);

  const { components: materialized, consumedIds } = materializeDamageTypeComponents(
    weaponForMaterialization,
    modifiers,
    ctx,
  );

  const resolvedModifiers = modifiers.filter((m) => !consumedIds.has(m.id));

  // Synthesize the converted DBM: additive inside the dbm parenthesis
  // (matches the June-2026 "explosion bonuses are ADDITIVE dbm" precedent —
  // Demolition Expert / SCAV! route the same way), explosive-scoped so only
  // fromExplosion components / Explosive-legendary twins pick it up
  // (ResolveContext.componentIsExplosion, resolve.ts) — the weapon's own
  // ballistic impact token is untouched. Reuses the explosionRadiusToDamage
  // modifier's own `source` so BreakdownPanel/MultiplierChainTable attribute
  // the bonus to the OMOD that carries the flag (Bunker Buster), not a
  // synthetic source.
  if (explosionRadiusBonus > 0 && explosionRadiusToDamage > 0) {
    const sourceModifier = [...allOmodModifiers, ...loadoutModifiers].find(
      (m) => m.bucket === 'explosionRadiusToDamage',
    );
    if (sourceModifier) {
      resolvedModifiers.push({
        id: `${sourceModifier.id}:explosionRadiusConversion`,
        source: sourceModifier.source,
        bucket: 'dbm',
        op: 'ADD',
        value: explosionRadiusBonus * explosionRadiusToDamage,
        conditions: [{ kind: 'damageTypeScope', types: ['explosive'] }],
      });
    }
  }

  // Explosive 2★ (`explosivePayload`): the legendary always contributes
  // +20% as BASE damage, pre-DBM (user-confirmed 2026-07-30) — WHICH base it
  // attaches to depends on the weapon's explosion kind (CONTEXT.md):
  //  - Projectile-Scaling Explosion (Gauss/Tesla explosionBaseWeaponDamageMult):
  //    untouched here — paper-damage.ts's own explosivePayload fold already
  //    adds the legendary's fraction straight onto the intrinsic mult
  //    (0.15 + 0.20 = 0.35), matching the measured in-game behavior.
  //  - Curve-Table Explosion (fromExplosion components — launchers, Gamma
  //    Gun, Cremator): rewritten HERE into an explosive-scoped `baseDamage`
  //    MUL_ADD (folds pre-DBM, paper-damage.ts's dbm parenthesis never sees
  //    it as a separate term) and stripped from the returned modifiers, so
  //    paper-damage.ts's explosivePayload twin fold never runs for this
  //    weapon — no twin off the direct-impact token either (decided: the 20%
  //    goes entirely into the explosion's own base, nowhere else).
  //  - Chain-suppressed (Tesla + AC muzzle — chain lightning, not an
  //    explosion) OR stream-suppressed (Cryolator/Flamer/thrower-barrel
  //    Plasma weapons — no discrete impact to detonate): the legendary is
  //    dead weight — stripped outright, no twin, no base boost
  //    (chain: user-confirmed 2026-07-30; stream: user-confirmed 2026-08-15).
  if (explosionSuppressed || hasCurveExplosion) {
    const payloadSource = [...allOmodModifiers, ...loadoutModifiers].find(
      (m) => m.bucket === 'explosivePayload',
    );
    const payload = payloadSource
      ? foldBucket([...allOmodModifiers, ...loadoutModifiers], 'explosivePayload', 0, baseCtx)
      : 0;
    for (let i = resolvedModifiers.length - 1; i >= 0; i--) {
      if (resolvedModifiers[i].bucket === 'explosivePayload') resolvedModifiers.splice(i, 1);
    }
    if (hasCurveExplosion && !explosionSuppressed && payload > 0 && payloadSource) {
      resolvedModifiers.push({
        id: `${payloadSource.id}:explosiveBaseDamage`,
        source: payloadSource.source,
        bucket: 'baseDamage',
        op: 'MUL_ADD',
        value: payload,
        conditions: [{ kind: 'damageTypeScope', types: ['explosive'] }],
      });
    }
  }

  const procs = resolveGeneratedProcs(equippedOmods);

  return {
    weapon: {
      ...weapon,
      keywords,
      ...(procs.length > 0 && { procs }),
      speed,
      isAutomatic,
      animDurationSec,
      animDelaySec,
      projectileCount,
      capacity,
      reloadSpeed,
      reloadSkipChance,
      reloadSkipChanceBash,
      ammoFreeChance,
      lastShotChance,
      apCost,
      fullPowerSeconds,
      fullPowerDamageMult,
      minRange,
      maxRange,
      outOfRangeDamageMult,
      // Cleared whenever chain/stream-suppressed OR an OMOD chase applies:
      // in either case the weapon's intrinsic mult-based explosivePayload
      // twin mechanic (paper-damage.ts) would be redundant with — or simply
      // wrong alongside — the chase's own real components/suppression; the
      // mult is never itself carried over from a chase (curve/typed damage
      // supersedes it — GeneratedExplosionSwap's doc comment).
      ...(explosionSuppressed || explosionChase ? { explosionBaseWeaponDamageMult: 0 } : {}),
      components: [...baseComponents, ...materialized],
    },
    modifiers: resolvedModifiers,
  };
}
