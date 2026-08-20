import type { GeneratedNpcDamageType } from '@/types/generated';
import type { DamageType } from '@/types/modifiers';
import type { ComponentHit, HitBreakdown } from './paper-damage';

/**
 * Enemy-defense mitigation (Phase 2 — Enemy defenses):
 *
 *   Resist = max(0, base − flatDebuff) × (1 − clamp01(armorPenTotal))
 *   mult   = Resist ≤ 0 ? 1 : clamp((damage × 0.15 / Resist)^0.365, 0.01, 0.99)
 *           (radiation: square the whole factor before clamping)
 *
 * `0.365` is the ESM-extracted `f<Type>ArmorDmgReductionExp` GMST value —
 * IDENTICAL for every resist type, including radiation
 * (`fRadsArmorDmgReductionExp` 0x0017D8AB = 0.365, same as
 * `fPhysicalArmorDmgReductionExp` 0x0017D8A9, `fEnergyArmorDmgReductionExp`
 * 0x0017D8A6, etc. — ESM-PROVEN). The sibling `_NORM`-suffixed GMST set
 * (e.g. `fPhysicalArmorDmgReductionExp_NORM` 0x005CF073 = 0.6377,
 * `...ArmorBase_NORM` = 51.0) is a distinct, unused formula variant — not
 * the one this engine draws from.
 *
 * Radiation still bites roughly twice as hard as every other resist type —
 * USER-CONFIRMED, docs/assumptions.md "Resist mitigation" — but that has no
 * GMST backing (the exponent GMST reads 0.365 for radiation too), so it's
 * modeled as squaring the WHOLE mitigation factor for radiation only, after
 * computing it with the shared ESM exponent: `(x^0.365)^2 = x^0.730`, so the
 * observed numbers are unchanged, but the ESM-provable exponent and the
 * empirical radiation correction stay visibly separate instead of being
 * folded into one hardcoded 0.730.
 *
 * `base` is the enemy's resist for THAT component's damage type (`resists`
 * from `src/lib/enemy-defenses.ts`); `flatDebuff` is Taking One for the
 * Team's flat DR reduction, which the ESM shows debuffing DamageResist only
 * (no EnergyResist component) — see the module-level mapping/gating note
 * below. `armorPenTotal` is the folded `armorPen` bucket (a fraction,
 * 0.50 = 50% penetration).
 *
 * Pipeline position — Option A (plan-decided, `docs/assumptions.md` "Resist
 * mitigation"): applied ONCE to each scenario's already-blended
 * `HitBreakdown` (crit-weighted, body-part-blended — `scenarios.ts`), not
 * per raw hit before blending. This is a Jensen's-inequality approximation
 * (mitigation is a concave function of damage, so mitigating an average
 * under-mitigates relative to averaging per-hit-mitigated results) — see
 * `mitigation.test.ts` "Option A divergence" for the measured magnitude
 * against a realistic crit mix, and docs/assumptions.md for the number.
 *
 * DoT and proc streams reuse this same curve via `mitigateDamageAmount`
 * (`scenarios.ts` folds the results into `effective.totalDps`). Each
 * `dotDamage` modifier / proc component is mitigated independently
 * (per-source, before summing) against the resist type its record
 * provenance named; `unresisted: true` bypasses the curve entirely.
 * Per-source is load-bearing: the formula is non-linear, so two simultaneous
 * ticks retain LESS than one combined tick of the same total (Holy Fire +
 * Napalm Tank). docs/assumptions.md "DoT/proc resist provenance".
 */

export interface EnemyDefenses {
  hp: number;
  resists: Partial<Record<GeneratedNpcDamageType, number>>;
}

/**
 * Weapon `DamageType` → the enemy-resist type it draws from. `ballistic` and
 * `explosive` both map to `physical` — NPCs carry no separate "explosive
 * resist" AV (DamageResist is the only physical-family resist extracted;
 * `extract-npcs.ts` RESIST_AVS), and explosive damage is conventionally
 * treated as physical elsewhere in this codebase (paper-damage.ts's
 * explosive carve-outs never introduce a new elemental type). Total map —
 * every `DamageType` union member has an entry, so there is no runtime
 * "unmapped" case today; kept as an explicit Record (not a fallback) so a
 * future `DamageType` addition fails type-checking here instead of silently
 * falling through.
 */
const DAMAGE_TYPE_TO_RESIST_TYPE: Record<DamageType, GeneratedNpcDamageType> = {
  ballistic: 'physical',
  explosive: 'physical',
  energy: 'energy',
  radiation: 'radiation',
  poison: 'poison',
  cryo: 'cryo',
  fire: 'fire',
};

/**
 * ESM-extracted GMST scalars for the mitigation formula — `getMitigationConstants`
 * (`@/data`) resolves the live value via `extract-constants.ts`; real callers
 * (`scenarios.ts`, threaded from `resolveLoadout`) pass it through
 * `ScenarioInput.mitigationConstants`. `DEFAULT_MITIGATION_CONSTANTS` is the
 * fallback for callers without a mode (tests) and the extractor's own
 * dump-too-old case — mirrors `derivePlayerStats`'s `clamp` param
 * (`src/lib/player-stats.ts`).
 */
export interface MitigationConstants {
  /** `f<Type>ArmorDmgReductionExp` GMST — 0.365 for every resist type. */
  resistExponent: number;
  /** `f<Type>DamageFactor` GMST — 0.15 for every resist type. */
  damageFactor: number;
  /** `f<Type>MinDamageReduction` GMST — 0.01 (Rads/Poison have no dedicated GMST; the clamp floor is one shared scalar, not per-type). */
  minReduction: number;
  /** `f<Type>MaxDamageReduction` GMST — 0.99 for every resist type. */
  maxReduction: number;
}

/**
 * Pre-extraction hardcodes, verified against the 20260717 dump:
 * `fPhysicalArmorDmgReductionExp` 0x0017D8A9, `fRadsArmorDmgReductionExp`
 * 0x0017D8AB, `fEnergyArmorDmgReductionExp` 0x0017D8A6,
 * `fFireArmorDmgReductionExp` 0x0017D8A7, `fFrostArmorDmgReductionExp`
 * 0x0017D8A8, `fPoisonArmorDmgReductionExp` 0x0017D8AA,
 * `fShockArmorDmgReductionExp` 0x0017D8AC all read 0.365; the 7
 * `f<Type>DamageFactor` GMSTs all read 0.15; the 7 `f<Type>MaxDamageReduction`
 * GMSTs all read 0.99; the 5 `f<Type>MinDamageReduction` GMSTs that exist
 * (Rads/Poison have none) all read 0.01. The sibling `_NORM` exponent set
 * (e.g. `fPhysicalArmorDmgReductionExp_NORM` 0x005CF073 = 0.6377) is a
 * distinct, unused formula variant — not this one.
 */
export const DEFAULT_MITIGATION_CONSTANTS: MitigationConstants = {
  resistExponent: 0.365,
  damageFactor: 0.15,
  minReduction: 0.01,
  maxReduction: 0.99,
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

/**
 * One component's post-mitigation multiplier. `Resist ≤ 0` (no base resist,
 * or the flat debuff/armor-pen fully strips it) fully penetrates — mult 1,
 * the formula's own documented edge case, not a clamp artifact.
 */
function componentMitigationMult(
  damage: number,
  resist: number,
  resistType: GeneratedNpcDamageType,
  constants: MitigationConstants,
): number {
  if (resist <= 0) return 1;
  const factor = Math.pow((damage * constants.damageFactor) / resist, constants.resistExponent);
  const mitigated = resistType === 'radiation' ? factor * factor : factor;
  return Math.min(constants.maxReduction, Math.max(constants.minReduction, mitigated));
}

/**
 * Mitigate a finished `HitBreakdown` against one enemy's defenses. Returns
 * the SAME breakdown unchanged (identity, no clamping surprises) when
 * `defenses` is undefined (no target selected) — every component's `base`
 * resist would resolve to 0 anyway, which the formula already treats as full
 * penetration (mult 1), so skipping is a pure short-circuit, not a
 * behavioral branch.
 *
 * `flatResistDebuffPhysical` (Taking One for the Team, `armorPenFlat` bucket)
 * applies ONLY to components whose resist type resolves to `'physical'` —
 * the mechanism note in the `armorPenFlat` Bucket doc comment
 * (src/types/modifiers.ts): the modifier itself is unconditioned (folded
 * once per scenario, no per-component `damageTypeScope` gate — the bootstrap
 * fold context has no `componentType` to gate against), so the physical-only
 * restriction is enforced HERE, consumer-side, rather than on the modifier.
 *
 * `constants` defaults to `DEFAULT_MITIGATION_CONSTANTS` — real callers pass
 * the ESM-extracted live value (`getMitigationConstants`, threaded via
 * `ScenarioInput.mitigationConstants`); see `MitigationConstants`'s doc-comment.
 */
export function applyMitigation(
  hit: HitBreakdown,
  defenses: EnemyDefenses | undefined,
  armorPenTotal: number,
  flatResistDebuffPhysical: number,
  constants: MitigationConstants = DEFAULT_MITIGATION_CONSTANTS,
): HitBreakdown {
  if (!defenses) return hit;

  const armorPenFactor = 1 - clamp01(armorPenTotal);
  const components: ComponentHit[] = hit.components.map((c) => {
    const resistType = DAMAGE_TYPE_TO_RESIST_TYPE[c.damageType];
    const base = defenses.resists[resistType] ?? 0;
    const flatDebuff = resistType === 'physical' ? flatResistDebuffPhysical : 0;
    const resist = Math.max(0, base - flatDebuff) * armorPenFactor;
    const mult = componentMitigationMult(c.damage, resist, resistType, constants);
    return { ...c, damage: c.damage * mult };
  });

  return { components, total: components.reduce((sum, c) => sum + c.damage, 0) };
}

/**
 * Mitigate one damage amount of a given type — the same resist-curve path
 * `applyMitigation` uses per component, reused for DoT/proc streams so the
 * formula cannot drift. `unresisted` (docs/assumptions.md "DoT/proc resist
 * provenance") bypasses the curve entirely and returns `damage` unchanged.
 */
export function mitigateDamageAmount(
  damage: number,
  damageType: DamageType,
  unresisted: boolean | undefined,
  defenses: EnemyDefenses,
  armorPenTotal: number,
  flatResistDebuffPhysical: number,
  constants: MitigationConstants = DEFAULT_MITIGATION_CONSTANTS,
): number {
  if (unresisted) return damage;
  return applyMitigation(
    { components: [{ damageType, base: damage, damage }], total: damage },
    defenses,
    armorPenTotal,
    flatResistDebuffPhysical,
    constants,
  ).total;
}
