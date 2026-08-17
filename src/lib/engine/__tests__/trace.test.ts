import { describe, it, expect } from 'bun:test';
import type { Weapon } from '@/types';
import { createDefaultEnemyConditions } from '@/types';
import type { Modifier } from '@/types/modifiers';
import { foldBucket, type ResolveContext } from '@/lib/engine/resolve';
import type { BucketTrace } from '@/lib/engine/trace';
import { computeScenarios, type ScenarioInput } from '@/lib/engine/scenarios';
import { getWeapons } from '@/data';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { PerkId } from '@/data/perk-ids';
import { makeResolvedPlayer } from '@/lib/engine/__tests__/resolved-player-fixture';

const FLAT_100 = [
  { x: 1, y: 100 },
  { x: 50, y: 100 },
];

function makeWeapon(overrides: Partial<Weapon> = {}): Weapon {
  return {
    id: 'test',
    name: 'Test',
    components: [{ damageType: 'ballistic', tier: -1, levelCap: 50, curvePoints: FLAT_100 }],
    damageType: 'ballistic',
    weaponClass: 'rifle',
    isAutomatic: false,
    isPhysical: true,
    animDelaySec: 1.0,
    ...overrides,
  };
}

function mod(
  partial: Partial<Modifier> & Pick<Modifier, 'bucket' | 'op'> & { value: number },
): Modifier {
  return {
    id: partial.id ?? 'm0',
    source: partial.source ?? { kind: 'perk', formId: '0x1', edid: 'TestPerk', name: 'Test Perk' },
    conditions: partial.conditions ?? [],
    ...partial,
  } as Modifier;
}

function input(modifiers: Modifier[], overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    mode: 'live',
    weapon: makeWeapon(),
    itemLevel: 50,
    modifiers,
    player: { ...makeResolvedPlayer(), strength: 0 },
    enemy: createDefaultEnemyConditions(),
    weakpointMult: 2.0,
    ...overrides,
  };
}

describe('attribution trace', () => {
  const synthetic = [
    mod({
      id: 'a',
      bucket: 'dbm',
      op: 'SET',
      value: 1.5,
      source: { kind: 'omod', formId: '0xa', edid: 'setA', name: 'Set A' },
    }),
    mod({
      id: 'b',
      bucket: 'dbm',
      op: 'SET',
      value: 2.0,
      source: { kind: 'omod', formId: '0xb', edid: 'setB', name: 'Set B' },
    }),
    mod({
      id: 'c',
      bucket: 'dbm',
      op: 'MUL_ADD',
      value: 0.25,
      source: { kind: 'perk', formId: '0xc', edid: 'mulC', name: 'Mul C' },
    }),
    mod({
      id: 'd',
      bucket: 'dbm',
      op: 'MUL_ADD',
      value: 0.15,
      source: { kind: 'mutation', formId: '0xd', edid: 'mulD', name: 'Mul D' },
    }),
    mod({
      id: 'e',
      bucket: 'dbm',
      op: 'ADD',
      value: 0.5,
      source: { kind: 'consumable', formId: '0xe', edid: 'addE', name: 'Add E' },
    }),
  ];

  it('traced result equals untraced result exactly (invariant)', () => {
    const untraced = computeScenarios(input(synthetic));
    const traced = computeScenarios(input(synthetic, { collectTrace: true }));
    expect(traced.freeAim.perHit.total).toBe(untraced.freeAim.perHit.total);
    expect(traced.vats.perHit.total).toBe(untraced.vats.perHit.total);
    expect(traced.freeAim.sustain.sustainedDps).toBe(untraced.freeAim.sustain.sustainedDps);
  });

  it('records SET winner, overridden SETs, MUL_ADDs, and ADDs with sources', () => {
    const s = computeScenarios(input(synthetic, { collectTrace: true }));
    const dbm = s.freeAim.explain!.nonCrit.components[0].dbm;

    expect(dbm.base).toBe(1.0);
    // (last SET 2.0) + (0.25+0.15)×1.0 + 0.5 = 2.9
    expect(dbm.result).toBeCloseTo(2.9, 10);
    expect(dbm.set?.source.name).toBe('Set B');
    expect(dbm.overriddenSets.map((c) => c.source.name)).toEqual(['Set A']);
    expect(dbm.mulAdd.map((c) => [c.source.name, c.value])).toEqual([
      ['Mul C', 0.25],
      ['Mul D', 0.15],
    ]);
    expect(dbm.add.map((c) => c.source.name)).toEqual(['Add E']);
  });

  it('captures crit and crit-meter traces on VATS and none on free aim', () => {
    const s = computeScenarios(input(synthetic, { collectTrace: true }));
    expect(s.freeAim.explain!.crit).toBeNull();
    expect(s.vats.explain!.crit).not.toBeNull();
    expect(s.vats.explain!.crit!.crit?.base.bucket).toBe('critDmgBase');
    expect(s.vats.explain!.critMeter?.fill?.bucket).toBe('critFill');
    expect(s.vats.explain!.critMeter?.consumption?.bucket).toBe('critConsumption');
  });

  it('omits explain entirely when tracing is off', () => {
    const s = computeScenarios(input(synthetic));
    expect(s.freeAim.explain).toBeUndefined();
    expect(s.vats.explain).toBeUndefined();
  });

  it('gates sneak/weakpoint sections on the active conditions', () => {
    const player = {
      ...makeResolvedPlayer(),
      strength: 0,
      isSneaking: true,
      isAimingAtWeakpoint: true,
    };
    const s = computeScenarios(input(synthetic, { collectTrace: true, player }));
    const t = s.freeAim.explain!.nonCrit;
    expect(t.sneak?.base.bucket).toBe('sneakBase');
    expect(t.weakpointBonus?.bucket).toBe('weakpointBonus');
    expect(t.bodyPartMult).toBe(2.0);

    const torso = computeScenarios(input(synthetic, { collectTrace: true }));
    expect(torso.freeAim.explain!.nonCrit.sneak).toBeNull();
    expect(torso.freeAim.explain!.nonCrit.weakpointBonus).toBeNull();
  });

  it('flags explosive components in the trace (fromExplosion vs normal) — drives the breakdown UI carve-out', () => {
    const weapon = makeWeapon({
      components: [
        { damageType: 'ballistic', tier: -1, levelCap: 50, curvePoints: FLAT_100 },
        {
          damageType: 'explosive',
          tier: -1,
          levelCap: 50,
          curvePoints: FLAT_100,
          fromExplosion: true,
        },
      ],
    });
    const s = computeScenarios(input([], { weapon, collectTrace: true }));
    const components = s.freeAim.explain!.nonCrit.components;
    expect(components[0].isExplosion).toBe(false);
    expect(components[1].isExplosion).toBe(true);
  });

  it('invariant holds over a real loadout (Fixer + perks)', () => {
    const weapon = getWeapons('live')['CombatRifle_Fixer'];
    const modifiers = getLoadoutModifiers('live', [
      { perkId: PerkId.RiflemanExpert, rank: 3 },
      { perkId: PerkId.CenterMasochist, rank: 3 },
    ]);
    const base = input(modifiers, { weapon, player: makeResolvedPlayer() });
    const untraced = computeScenarios(base);
    const traced = computeScenarios({ ...base, collectTrace: true });
    expect(traced.freeAim.perHit.total).toBe(untraced.freeAim.perHit.total);
    expect(traced.vats.perHit.total).toBe(untraced.vats.perHit.total);
    // Center Masochist (torso-gated dbm) must appear as a named contributor on a torso hit.
    const dbm = traced.freeAim.explain!.nonCrit.components[0].dbm;
    const names = [...dbm.add, ...dbm.mulAdd, ...(dbm.set ? [dbm.set] : [])].map(
      (c) => c.source.name,
    );
    expect(names.join()).toMatch(/Masochist/i);
  });

  it('records cadence pieces on lastRound-conditioned contributions', () => {
    const lastShotMod = mod({
      bucket: 'dbm',
      op: 'ADD',
      value: 1.0,
      conditions: [{ kind: 'lastRound' }],
      source: { kind: 'omod', formId: '0xls', edid: 'LastShot', name: 'Last Shot' },
    });
    const ctx: ResolveContext = {
      weapon: makeWeapon(),
      player: makeResolvedPlayer(),
      enemy: createDefaultEnemyConditions(),
      scenario: { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false },
      lastRound: { procChance: 0.25, shotsPerMag: 20 },
    };
    const collect: BucketTrace[] = [];
    foldBucket([lastShotMod], 'dbm', 1.0, ctx, collect);
    const add = collect[0]!.add[0]!;
    expect(add.cadence).toEqual({ raw: 1, procChance: 0.25, oneInShots: 20 });
    expect(add.value).toBeCloseTo(0.0125, 10);
  });

  it('omits cadence on ordinary modifier contributions', () => {
    const ordinary = mod({
      bucket: 'dbm',
      op: 'ADD',
      value: 0.5,
      source: { kind: 'perk', formId: '0x1', edid: 'Ordinary', name: 'Ordinary' },
    });
    const ctx: ResolveContext = {
      weapon: makeWeapon(),
      player: makeResolvedPlayer(),
      enemy: createDefaultEnemyConditions(),
      scenario: { isVats: false, isSneaking: false, isPowerAttack: false, isCrit: false },
      lastRound: { procChance: 0.25, shotsPerMag: 20 },
    };
    const collect: BucketTrace[] = [];
    foldBucket([ordinary], 'dbm', 1.0, ctx, collect);
    expect(collect[0]!.add[0]).not.toHaveProperty('cadence');
  });
});
