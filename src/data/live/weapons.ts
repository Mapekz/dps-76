import type { Weapon, WeaponComponent } from '@/types';
import type { GeneratedWeapon, GeneratedDamageType } from '@/types/generated';
import { isRecordVisible, type VisibilityOverlay } from '../overlay';
import generatedWeapons from './generated/weapons.json';

/**
 * Live weapons — adapted from ESM-extracted data (src/data/live/generated/,
 * produced by `bun run extract`), with hand-maintained overrides from
 * src/data/overrides/corrections.ts layered on top.
 */

const DAMAGE_TYPE_MAP: Record<GeneratedDamageType, WeaponComponent['damageType']> = {
  ballistic: 'ballistic',
  energy: 'energy',
  fire: 'fire',
  cryo: 'cryo',
  poison: 'poison',
  radiation: 'radiation',
  // Launcher payload chase: the projectile EXPL's main physical damage.
  explosive: 'explosive',
  // No dedicated bucket yet — treat as ballistic until one exists.
  unknown: 'ballistic',
};

/**
 * WEAP Data."Weapon Type" name → the numeric anim-type enum GetWeaponAnimType()
 * reads (the esm CLI decodes the value to these names). Verified against the
 * ESM 2026-07-14 by sweeping all 282 roster weapons' raw Data."Weapon Type"
 * values; only these six occur in FO76 (no daggers/axes/bows/staves at 2-4,
 * 7-8 — even Bow/Crossbow WEAPs are 9 "Gun"). Unlisted names map to undefined
 * → anim-gated conditions fail closed.
 */
const ANIM_TYPE_VALUES: Record<string, number> = {
  HandToHandMelee: 0,
  OneHandSword: 1,
  TwoHandSword: 5,
  TwoHandAxe: 6,
  Gun: 9,
  Grenade: 10,
};

function classifyWeaponClass(gw: GeneratedWeapon): Weapon['weaponClass'] {
  const kw = new Set(gw.keywords);
  if (kw.has('WeaponTypeHeavyGun')) return 'heavy';
  if (kw.has('WeaponTypeShotgun')) return 'shotgun';
  if (kw.has('WeaponTypePistol')) return 'pistol';
  if (kw.has('WeaponTypeBow') || kw.has('WeaponTypeCrossbow')) return 'bow';
  if (kw.has('WeaponTypeThrown') || gw.weaponTypeName === 'Grenade') return 'thrown';
  if (kw.has('WeaponTypeUnarmed') || gw.weaponTypeName === 'HandToHandMelee') return 'unarmed';
  if (kw.has('WeaponTypeRifle')) return 'rifle';
  if (
    gw.weaponTypeName === 'OneHandSword' ||
    gw.weaponTypeName === 'TwoHandSword' ||
    kw.has('WeaponTypeMeleeGeneral')
  ) {
    return 'melee';
  }
  // Remaining guns without a class keyword (e.g. some uniques) — treat as rifle.
  return 'rifle';
}

/**
 * Exported for tests that exercise mechanics carried by records hidden from
 * the app (e.g. the unreleased P62 "Splinter" and its built-in Onslaught
 * effect) — the visibility filter below strips them from `weapons`.
 */
export function adaptWeapon(
  gw: GeneratedWeapon,
  corrections: Readonly<Record<string, Partial<Weapon>>> = {},
): Weapon {
  const levelCap = gw.eligibleLevels.length > 0 ? Math.min(50, Math.max(...gw.eligibleLevels)) : 50;
  const components = gw.components.map((c) => ({
    damageType: DAMAGE_TYPE_MAP[c.damageType],
    tier: c.tier ?? -1,
    levelCap,
    // Flat-amount components (no tier, no curve — launcher token impact
    // damage, e.g. Fat Man's 5) become a constant one-point curve; the old
    // tier -1 lookup warned and computed 0.
    curvePoints: c.curve ?? (c.tier == null ? [{ x: 1, y: c.amount }] : undefined),
    fromExplosion: c.fromExplosion,
  }));
  // Legacy single-type routing field; the ballistic component (when present)
  // is always first, so this is phys for mixed weapons, elemental for pure.
  // 'explosive' payloads route as physical here (explosion damage resists as
  // ballistic; the fromExplosion flag carries the explosion semantics).
  const first = components[0]?.damageType ?? 'ballistic';
  const primary: Weapon['damageType'] = first === 'explosive' ? 'ballistic' : first;
  const weaponClass = classifyWeaponClass(gw);
  const animDelaySec =
    weaponClass === 'melee' || weaponClass === 'unarmed'
      ? gw.animationAttackSec
      : gw.attackDelaySec > 0
        ? gw.attackDelaySec
        : undefined;

  return {
    id: gw.id,
    name: gw.name,
    components,
    damageType: primary,
    weaponClass,
    animType: ANIM_TYPE_VALUES[gw.weaponTypeName],
    speed: gw.speed,
    isAutomatic: gw.isAutomaticFlag,
    isPhysical: components[0]?.damageType === 'ballistic',
    animDelaySec,
    capacity: gw.capacity,
    ammoPerShot: gw.ammoPerShot,
    reloadSpeed: gw.reloadSpeed,
    animationReloadSec: gw.animationReloadSec,
    // Per-shell reload animation (lever/pump/single-action) — sustain.ts
    // multiplies animationReloadSec by shotsPerMag; weaponCorrections below
    // can override either direction if measurement disproves the keyword.
    reloadPerShell: gw.keywords.includes('AnimsSequentialReload'),
    apCost: gw.actionPointCost,
    formId: gw.formId,
    eligibleLevels: gw.eligibleLevels,
    keywords: gw.keywords,
    attachParentSlots: gw.attachParentSlots,
    templateModFormIds: gw.templateModFormIds,
    defaultModFormIds: gw.defaultModFormIds,
    critDamageMult: gw.critDamageMult,
    critChargeBonus: gw.critChargeBonus,
    sneakAttackMult: gw.sneakAttackMult,
    projectileCount: gw.projectileCount,
    damageBonusMult: gw.damageBonusMult,
    explosionBaseWeaponDamageMult: gw.explosionBaseWeaponDamageMult,
    // Charging (Gauss family, bows, tesla/gamma/laser barrels): 0/absent in
    // the generated data ⇒ the weapon doesn't charge — Weapon's "0/undefined
    // = doesn't charge" convention (src/types/index.ts, gated by
    // weaponCharges() in src/lib/charge.ts).
    fullPowerSeconds: (gw.fullPowerSeconds ?? 0) > 0 ? gw.fullPowerSeconds : undefined,
    fullPowerDamageMult: (gw.fullPowerDamageMult ?? 0) > 0 ? gw.fullPowerDamageMult : undefined,
    minimumChargeTime: (gw.minimumChargeTime ?? 0) > 0 ? gw.minimumChargeTime : undefined,
    // Range/falloff (Phase 1 extraction half): 0 is a real value (melee
    // weapons), so map unconditionally — NOT the charging fields' "0/absent
    // = doesn't apply" convention above.
    minRange: gw.minRange,
    maxRange: gw.maxRange,
    outOfRangeDamageMult: gw.outOfRangeDamageMult,
    modifiers: gw.modifiers,
    ...corrections[gw.id],
  };
}

/** The classic drop grid — fallback stops for weapons with no Eligible Levels data. */
export const DEFAULT_LEVEL_STOPS: readonly number[] = [1, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50];

/**
 * The item-level slider's stops for a weapon: its real Eligible Levels
 * (clamped to 1–50, sorted), falling back to the full drop grid when the
 * record ships none (~44 weapons carry `[]`).
 */
export function weaponLevelStops(weapon: Weapon | undefined): readonly number[] {
  const eligible = (weapon?.eligibleLevels ?? []).filter((l) => l >= 1 && l <= 50);
  if (eligible.length === 0) return DEFAULT_LEVEL_STOPS;
  return [...new Set(eligible)].sort((a, b) => a - b);
}

/** Highest obtainable level — the select-time itemLevel default. */
export function maxEligibleLevel(weapon: Weapon | undefined): number {
  const stops = weaponLevelStops(weapon);
  return stops[stops.length - 1];
}

/**
 * Raw generated weapons, pre-visibility-filter — the id space the overlay
 * reviewer (`getUnresolvedOverrideKeys` in dataset.ts) validates weapon-keyed
 * overlay tables against. Hidden records must still resolve here so the
 * reviewer can tell "this key targets a real, now-hidden record" apart from
 * "this key never matched anything."
 */
export const generatedWeaponsRaw = generatedWeapons as GeneratedWeapon[];

export function buildWeapons(
  generated: GeneratedWeapon[],
  visibility: VisibilityOverlay,
  corrections: Readonly<Record<string, Partial<Weapon>>>,
): Record<string, Weapon> {
  return Object.fromEntries(
    generated
      // Obtainability verdicts ride the generated data (obtainable: false =
      // no player-reachable ESM reference); corrections.ts rescues false
      // negatives and hides false positives. Unlike omods/consumables, hidden
      // weapon records are dropped from the dataset entirely (not just the
      // picker) — hiddenWeaponIds targets records that were never real player
      // weapons in the first place (dev items, workshop objects, NPC
      // duplicates), not real content a stale build might still reference.
      .filter((gw) => isRecordVisible(gw, visibility))
      .map((gw) => [gw.id, adaptWeapon(gw, corrections)]),
  );
}
