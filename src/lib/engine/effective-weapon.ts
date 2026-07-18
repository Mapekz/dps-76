import type { EnemyConditions, PlayerConditions, Weapon, WeaponComponent } from '@/types';
import { createDefaultEnemyConditions, createDefaultPlayerConditions } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import type { Bucket, DamageType, ModOp, Modifier } from '@/types/modifiers';
import { SUSTAIN_CHANCE_BUCKETS, WEAPON_STAT_BUCKETS } from '@/types/modifiers';
import { effectiveValue, foldOps, type ResolveContext } from './resolve';

export { SUSTAIN_CHANCE_BUCKETS, WEAPON_STAT_BUCKETS };

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

// Weapon-stat OMODs are USUALLY unconditional (receiver stats apply for as
// long as the mod is equipped), but Thrill-Seeker's (Stage C3) proves a
// conditioned case: its fireRateSpeed/reloadSpeed tiers gate on an exact
// killStreakCount, so this fold must evaluate conditions like foldBucket
// does — hence sharing `effectiveValue` (condition scale + curve/plain value)
// rather than reading `m.value`/`m.curve` directly. `ctx` supplies whatever
// player/enemy state those conditions read (itemLevel curves — level-scaled
// Speed on heated melee mods — read `ctx.itemLevel`).
function foldWeaponStat(modifiers: Modifier[], bucket: Bucket, base: number, ctx: ResolveContext): number {
  const entries: Array<{ op: ModOp; value: number }> = [];
  for (const m of modifiers) {
    if (m.bucket !== bucket) continue;
    const value = effectiveValue(m, ctx);
    if (value !== null) entries.push({ op: m.op, value });
  }
  return foldOps(entries, base);
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
 * deal used to silently no-op — paper-damage.ts only folds `baseDamage` per
 * EXISTING component (the Tesla Coil Capacitor's +0.5 energy MUL_ADD on the
 * ballistic-only Gauss Minigun had no energy component to apply to). This
 * synthesizes the missing component so the fold has somewhere to land.
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
 */
function materializeDamageTypeComponents(
  weapon: Weapon,
  modifiers: Modifier[],
  ctx: ResolveContext
): { components: WeaponComponent[]; consumedIds: Set<string> } {
  const existingTypes = new Set((weapon.components ?? []).filter(c => !c.fromExplosion).map(c => c.damageType));
  const fallback =
    (weapon.components ?? []).find(c => !c.fromExplosion && c.damageType === 'ballistic') ??
    (weapon.components ?? []).find(c => !c.fromExplosion);
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
  for (const type of candidateTypes) {
    const typeCtx: ResolveContext = { ...ctx, componentType: type, componentIsExplosion: false };
    const matching = modifiers
      .filter(m => m.bucket === 'baseDamage')
      .map(m => ({ mod: m, value: effectiveValue(m, typeCtx) }))
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
    for (const { mod: m } of matching) consumedIds.add(m.id);
  }

  return { components, consumedIds };
}

export function buildEffectiveWeapon(
  weapon: Weapon,
  equippedOmods: GeneratedOmod[],
  itemLevel = 50,
  player: PlayerConditions = createDefaultPlayerConditions(),
  enemy: EnemyConditions = createDefaultEnemyConditions(),
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
  enemyTypeIds: readonly string[] = []
): EffectiveWeapon {
  const loadoutStatModifiers = loadoutModifiers.filter(
    m => WEAPON_STAT_BUCKETS.has(m.bucket) || SUSTAIN_CHANCE_BUCKETS.has(m.bucket)
  );
  if (equippedOmods.length === 0 && loadoutStatModifiers.length === 0) return { weapon, modifiers: [] };

  const allOmodModifiers = equippedOmods.flatMap(o => o.modifiers);

  const keywords = [...new Set([...(weapon.keywords ?? []), ...equippedOmods.flatMap(o => o.addedKeywords)])];
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
  const onslaughtMaxStacks = foldWeaponStat(
    [...allOmodModifiers, ...loadoutModifiers], 'onslaughtMaxStacks', 0, baseCtx
  );
  // Bullet-Storm-stack curves on weapon-stat buckets (Bullet Storm's own
  // reload-speed curve, cross-family-gated on Lock and Load) read the
  // equipped stack cap/floor — bootstrap-fold both exactly like Onslaught
  // above (cap/floor modifiers are themselves never Bullet-Storm-gated, so
  // folding with cap/floor 0 is exact).
  const bulletStormMaxStacks = foldWeaponStat(
    [...allOmodModifiers, ...loadoutModifiers], 'bulletStormMaxStacks', 0, baseCtx
  );
  const bulletStormMinStacks = foldWeaponStat(
    [...allOmodModifiers, ...loadoutModifiers], 'bulletStormMinStacks', 0, baseCtx
  );
  // Bonus-move-speed fraction for the moveSpeedBonus curve input (Fast
  // Fighter's reload conversion) — same bootstrap pattern: fold once from the
  // FULL modifier list (Speed Demon's source is a mutation, not a weapon-stat
  // modifier), thread on the ctx every weapon-stat fold below sees.
  const moveSpeedBonus = foldWeaponStat(
    [...allOmodModifiers, ...loadoutModifiers], 'moveSpeedBonus', 0, baseCtx
  );
  const ctx: ResolveContext = {
    ...baseCtx,
    onslaughtMaxStacks,
    moveSpeedBonus,
    bulletStormMaxStacks,
    bulletStormMinStacks,
  };

  const statModifiers = [...allOmodModifiers, ...loadoutStatModifiers];
  const speed = foldWeaponStat(statModifiers, 'fireRateSpeed', weapon.speed ?? 1.0, ctx);
  // NOTE (2026-07-13, user-confirmed): `WeaponTypeAutomatic` is a perk-condition
  // keyword only, not a real fire-mode signal — some OMODs add it without the
  // weapon actually firing full-auto (Combat Shotgun's Automatic Receiver sets
  // `HasRepeatableSingleFire`, not `IsAutomatic`). The `isAutomatic` bucket
  // (folded from the base weapon's real WEAP Data.Flags "Automatic" bit, SET
  // by OMODs that carry an explicit `IsAutomatic` property) is the only
  // correct signal — do not OR in a keyword check here.
  const isAutomatic = foldWeaponStat(statModifiers, 'isAutomatic', weapon.isAutomatic ? 1 : 0, ctx) > 0;
  const animDurationSec = foldWeaponStat(statModifiers, 'animDurationSec', weapon.animDurationSec ?? 0.11, ctx);
  // Semi-auto attack-delay rewrite (OMOD AttackDelaySec MUL_ADD — Salt of the
  // Earth's delay penalty, 2026-07-15 audit). weapon.animDelaySec is
  // undefined for automatic-only weapons (fire-rate.ts never reads it then),
  // so fold over 0.5 (fire-rate.ts's own fallback) only when the base weapon
  // actually carries the stat, same `?? undefined` shape as the base type.
  const animDelaySec =
    weapon.animDelaySec !== undefined || statModifiers.some(m => m.bucket === 'animDelaySec')
      ? foldWeaponStat(statModifiers, 'animDelaySec', weapon.animDelaySec ?? 0.5, ctx)
      : undefined;
  // NOTE: projectileCount folds into the effective weapon but NO damage term
  // consumes it yet — per-projectile/pellet modeling is deferred (with the
  // DoT engine work). Two Shot's damage today is only its extracted dbm.
  const projectileCount = foldWeaponStat(statModifiers, 'projectileCount', weapon.projectileCount ?? 1, ctx);
  const capacity = foldWeaponStat(statModifiers, 'ammoCapacity', weapon.capacity ?? 0, ctx);
  const reloadSpeed = foldWeaponStat(statModifiers, 'reloadSpeed', weapon.reloadSpeed ?? 1.0, ctx);
  const reloadSkipChance = foldChanceUnion(statModifiers, 'reloadSkipChance', ctx);
  const ammoFreeChance = foldChanceUnion(statModifiers, 'ammoFreeChance', ctx);
  // V.A.T.S. Optimized (Stage B): MUL_ADD −0.35 on the weapon's per-shot VATS
  // AP cost, same fold pattern as ammoCapacity/reloadSpeed above.
  const apCost = foldWeaponStat(statModifiers, 'vatsApCost', weapon.apCost ?? 0, ctx);
  // Charging (tesla/gamma/laser charging-barrel OMODs turn charging ON via a
  // SET FullPowerSeconds/FullPowerDamageMult; Gauss-family barrels retune an
  // existing pair) — same fold pattern as ammoCapacity/reloadSpeed/apCost.
  // weaponCharges() (src/lib/charge.ts) treats 0 as "doesn't charge", so
  // folding over `?? 0` is neutral for weapons with no charge fields at all.
  const fullPowerSeconds = foldWeaponStat(statModifiers, 'chargeFullPowerSec', weapon.fullPowerSeconds ?? 0, ctx);
  const fullPowerDamageMult = foldWeaponStat(
    statModifiers, 'chargeFullPowerDamageMult', weapon.fullPowerDamageMult ?? 0, ctx
  );
  // Range/falloff (Phase 1 engine half): barrels mostly (long-range barrels
  // MUL_ADD 0.5 on both min/max; one SET on weaponOutOfRangeMult, the Abraxo
  // Barrel). Same fold pattern as ammoCapacity/reloadSpeed above — 0 is a
  // real value (melee weapons carry minRange/maxRange 0), so fold over
  // `?? 0` exactly like the base Weapon fields' own "0 is real" convention
  // (src/types/index.ts). outOfRangeDamageMult falls back to 1.0 (neutral —
  // no falloff) only when the base weapon field itself is absent, which
  // extraction never leaves unset for a real ranged weapon.
  const minRange = foldWeaponStat(statModifiers, 'weaponMinRange', weapon.minRange ?? 0, ctx);
  const maxRange = foldWeaponStat(statModifiers, 'weaponMaxRange', weapon.maxRange ?? 0, ctx);
  const outOfRangeDamageMult = foldWeaponStat(
    statModifiers, 'weaponOutOfRangeMult', weapon.outOfRangeDamageMult ?? 1.0, ctx
  );

  const modifiers = allOmodModifiers.filter(
    m => !WEAPON_STAT_BUCKETS.has(m.bucket) && !SUSTAIN_CHANCE_BUCKETS.has(m.bucket)
  );
  const { components: materialized, consumedIds } = materializeDamageTypeComponents(weapon, modifiers, ctx);

  return {
    weapon: {
      ...weapon,
      keywords,
      speed,
      isAutomatic,
      animDurationSec,
      animDelaySec,
      projectileCount,
      capacity,
      reloadSpeed,
      reloadSkipChance,
      ammoFreeChance,
      apCost,
      fullPowerSeconds,
      fullPowerDamageMult,
      minRange,
      maxRange,
      outOfRangeDamageMult,
      components: [...weapon.components, ...materialized],
    },
    modifiers: modifiers.filter(m => !consumedIds.has(m.id)),
  };
}
