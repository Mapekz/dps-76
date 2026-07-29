import { describe, it, expect, vi } from 'vitest';
import { getEnemyDefenses } from '@/lib/enemy-defenses';
import type { GeneratedNpc } from '@/types/generated';

/**
 * `@/data/npcs` and `@/lib/creature-curves` are mocked so these tests assert
 * the epic-HP-mult wiring in isolation from the real extracted dataset (no
 * dependency on which races currently carry `epicRank` in npcs.json) — same
 * `vi.mock` pattern as `src/state/__tests__/build-reducer.test.ts` (hoisted
 * above this file's imports by vitest, so the plain top-level `import` above
 * already resolves against the mocks; under Bun, `mock.module` is unhoisted
 * but eager, so it patches the module registry before the top-level `import`
 * above ever resolves — same net effect, different mechanism).
 *
 * These are full-replacement factories (no `importOriginal`), so they carry
 * no Bun-portability ternary — but Bun shares one module registry across
 * test files, so this file's `@/lib/creature-curves` stub leaks into
 * `src/lib/__tests__/creature-curves.test.ts` (which mocks nothing and
 * asserts real curve math) unless `bun test` is run with `--parallel`
 * (implies `--isolate`).
 */
const BASE_HP = 100_000;
let stubNpc: GeneratedNpc | undefined;

vi.mock('@/data/npcs', () => ({
  getNpc: (_mode: string, id: string) => (stubNpc?.id === id ? stubNpc : undefined),
}));

vi.mock('@/lib/creature-curves', () => ({
  getCreatureHealth: () => BASE_HP,
  getCreatureResist: (_mode: string, tier: number) => tier, // deterministic passthrough, not exercised by these tests.
}));

function npc(overrides: Partial<GeneratedNpc>): GeneratedNpc {
  return {
    id: 'TestRace',
    formId: '0x1',
    name: 'Test',
    healthCurveTier: 55,
    healthFlatValue: 0,
    resists: [],
    levelMinGlobal: 1,
    levelMaxGlobal: 100,
    levelOffsetGlobal: null,
    epicAllowed: true,
    ...overrides,
  };
}

describe('getEnemyDefenses — epic HP mult (Phase A, data-driven off GeneratedNpc.epicRank)', () => {
  it('rank present + epicAllowed true: HP scales by EPIC_CREATURE_RANK_MULTS[rank].healthMult (rank 3 → ×3.2)', () => {
    stubNpc = npc({ id: 'EpicRace', epicAllowed: true, epicRank: 3 });
    const result = getEnemyDefenses('live', 'EpicRace', 100);
    expect(result!.hp).toBeCloseTo(BASE_HP * 3.2, 6);
  });

  it('rank absent: plain curve HP, no scaling', () => {
    stubNpc = npc({ id: 'PlainRace', epicAllowed: true, epicRank: undefined });
    const result = getEnemyDefenses('live', 'PlainRace', 100);
    expect(result!.hp).toBe(BASE_HP);
  });

  it('epicAllowed false blocks the mult even when a rank is (implausibly) present — defensive, matches a structurally-excluded npc', () => {
    stubNpc = npc({ id: 'BlockedRace', epicAllowed: false, epicRank: 3 });
    const result = getEnemyDefenses('live', 'BlockedRace', 100);
    expect(result!.hp).toBe(BASE_HP);
  });

  it('an out-of-table rank fails open to plain curve HP rather than throwing', () => {
    stubNpc = npc({ id: 'WeirdRankRace', epicAllowed: true, epicRank: 99 });
    const result = getEnemyDefenses('live', 'WeirdRankRace', 100);
    expect(result!.hp).toBe(BASE_HP);
  });

  it('DR/ER are never scaled by epic rank — resists pass through the curve/flat lookup untouched', () => {
    stubNpc = npc({
      id: 'ResistRace',
      epicAllowed: true,
      epicRank: 3,
      resists: [
        { damageType: 'physical', flatValue: 0, curveTier: 22 },
        { damageType: 'energy', flatValue: 50, curveTier: null },
      ],
    });
    const result = getEnemyDefenses('live', 'ResistRace', 100);
    expect(result!.resists.physical).toBe(22); // stub getCreatureResist passthrough of the tier.
    expect(result!.resists.energy).toBe(50); // flat value, curveTier null.
  });

  it('unknown raceId or no npc row returns null (unchanged pre-existing behavior)', () => {
    stubNpc = undefined;
    expect(getEnemyDefenses('live', null, 100)).toBeNull();
    expect(getEnemyDefenses('live', 'NoSuchRace', 100)).toBeNull();
  });
});
