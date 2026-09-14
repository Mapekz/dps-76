import { createDefaultEnemyConditions, type Weapon } from '@/types';
import type { GeneratedOmod } from '@/types/generated';
import type { Bucket, Condition, ModOp, Modifier, ModifierSource } from '@/types/modifiers';
import type { PlayerConditionContext } from '@/types/player';
import { buildEffectiveWeapon } from '@/lib/engine/effective-weapon';
import { computePaperDamage, type PaperDamageInput } from '@/lib/engine/paper-damage';
import type { ResolveContext } from '@/lib/engine/resolve';
import type { ScenarioInput } from '@/lib/engine/scenarios';
import { makeResolvedPlayer } from './resolved-player-fixture';

// Synthetic engine inputs with hand-computable base damage.
export const FLAT_100 = [
  { x: 1, y: 100 },
  { x: 50, y: 100 },
];

export const FLAT_10 = [
  { x: 1, y: 10 },
  { x: 50, y: 10 },
];

export function makeWeapon(overrides: Partial<Weapon> = {}): Weapon {
  return {
    id: 'test_rifle',
    name: 'Test Rifle',
    components: [{ damageType: 'ballistic', tier: -1, levelCap: 50, curvePoints: FLAT_100 }],
    damageType: 'ballistic',
    weaponClass: 'rifle',
    isAutomatic: false,
    isPhysical: true,
    critDamageMult: 2.0,
    critChargeBonus: 1.0,
    sneakAttackMult: 2.0,
    damageBonusMult: 1.0,
    ...overrides,
  };
}

/** 20-round magazine, 1 shot/s, 4 s reload: magDumpSec 20, reloadSec 4. */
export function makeMagazineWeapon(overrides: Partial<Weapon> = {}): Weapon {
  return makeWeapon({
    animDelaySec: 1.0,
    isPhysical: false,
    capacity: 20,
    ammoPerShot: 1,
    reloadSpeed: 1.0,
    animationReloadSec: 4.0,
    ...overrides,
  });
}

/** Launcher shape: flat 5 ballistic impact + a flat 100 fromExplosion payload. */
export function makeLauncher(overrides: Partial<Weapon> = {}): Weapon {
  return makeWeapon({
    components: [
      { damageType: 'ballistic', tier: -1, levelCap: 50, curvePoints: [{ x: 1, y: 5 }] },
      {
        damageType: 'explosive',
        tier: -1,
        levelCap: 50,
        curvePoints: FLAT_100,
        fromExplosion: true,
      },
    ],
    ...overrides,
  });
}

export function mod(partial: {
  bucket: Bucket;
  op: ModOp;
  value: number;
  id?: string;
  conditions?: Condition[];
  source?: ModifierSource;
}): Modifier {
  return {
    id: partial.id ?? 'test-mod',
    source: partial.source ?? {
      kind: 'perk',
      formId: '0x0',
      edid: 'TestSource',
      name: 'Test Source',
    },
    bucket: partial.bucket,
    op: partial.op,
    value: partial.value,
    conditions: partial.conditions ?? [],
  };
}

export function makeCtx(weapon: Weapon, overrides: Partial<ResolveContext> = {}): ResolveContext {
  return {
    weapon,
    player: makeResolvedPlayer(),
    enemy: createDefaultEnemyConditions(),
    scenario: { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false },
    ...overrides,
  };
}

/** A torso hit at item level 50 with a default context unless overridden. */
export function paper(
  weapon: Weapon,
  modifiers: Modifier[] = [],
  overrides: Partial<PaperDamageInput> = {},
) {
  return computePaperDamage({
    mode: 'live',
    weapon,
    itemLevel: 50,
    modifiers,
    ctx: makeCtx(weapon),
    bodyPartMult: 1.0,
    bodyPart: 'torso',
    ...overrides,
  });
}

/** Leaves critRate unset: an unset critRate runs the crit-meter economy. */
export function scenarioInput(
  weapon: Weapon,
  overrides: Partial<ScenarioInput> = {},
): ScenarioInput {
  return {
    mode: 'live',
    weapon,
    itemLevel: 50,
    modifiers: [],
    player: makeResolvedPlayer(),
    enemy: createDefaultEnemyConditions(),
    weakpointMult: 2.0,
    ...overrides,
  };
}

/** A synthetic OMOD record; only `id` is required. */
export function makeOmod(
  fields: Partial<GeneratedOmod> & Pick<GeneratedOmod, 'id'>,
): GeneratedOmod {
  return {
    formId: '0x0',
    name: fields.id,
    description: '',
    attachPointFormId: '0x0',
    attachPointEdid: 'ap_Legendary3',
    targetKeywords: [],
    addedKeywords: [],
    hasEnchantments: false,
    modifiers: [],
    ...fields,
  };
}

/** Modifiers as an OMOD carries them: ids `<formId>:<index>`, one shared omod source. */
export function omodModifiers(
  source: { formId: string; edid: string; name: string },
  entries: Array<{ bucket: Bucket; op: ModOp; value: number; conditions?: Condition[] }>,
): Modifier[] {
  return entries.map((entry, i) => ({
    id: `${source.formId}:${i}`,
    source: { kind: 'omod', ...source },
    bucket: entry.bucket,
    op: entry.op,
    value: entry.value,
    conditions: entry.conditions ?? [],
  }));
}

/** buildEffectiveWeapon at item level 50 against the default enemy. */
export function effective(
  weapon: Weapon,
  omods: GeneratedOmod[] = [],
  player: PlayerConditionContext = makeResolvedPlayer(),
  loadoutModifiers: Modifier[] = [],
) {
  return buildEffectiveWeapon(
    weapon,
    omods,
    50,
    player,
    createDefaultEnemyConditions(),
    loadoutModifiers,
  );
}
