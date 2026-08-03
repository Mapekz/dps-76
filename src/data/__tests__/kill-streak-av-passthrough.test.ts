import { describe, it, expect } from 'bun:test';
import { getDataset } from '@/data/dataset';
import { classifyOmodDisplay } from '@/data/omods';

/**
 * Pinning test for the AV pass-through extraction rule (mgef.ts, 2026-08-03,
 * issue #44): Barbarian and Mind Over Matter are zero-magnitude, curve-less
 * Peak Value Modifiers whose effect-level Actor Value is the kill-streak
 * counter (0x00000399) — the engine reads the SPECIAL bonus off that counter
 * at runtime. Guards against a future re-extract silently dropping the
 * identity curve (mirrors move-speed-census.test.ts's role for SpeedMult).
 */

const KILL_STREAK_IDENTITY_CURVE = {
  input: 'killStreak',
  points: [
    { x: 0, y: 0 },
    { x: 1, y: 1 },
    { x: 10, y: 10 },
  ],
} as const;

describe('AV pass-through (kill-streak SPECIAL grants, live dataset)', () => {
  it('Barbarian (3★ melee legendary) grants specialStrength via a killStreak identity curve, and is no longer badged inert', () => {
    const dataset = getDataset('live');
    const omod = dataset.omods.find((o) => o.id === 'mod_Legendary_Weapon3_Melee_Barbarian');
    expect(omod).toBeDefined();
    expect(omod?.modifiers).toEqual([
      expect.objectContaining({
        bucket: 'specialStrength',
        op: 'ADD',
        curve: KILL_STREAK_IDENTITY_CURVE,
        curveScale: 1,
        conditions: [],
      }),
    ]);
    expect(classifyOmodDisplay(omod!).badge).toBeUndefined();
  });

  it('Mind Over Matter perk grants specialIntelligence via the same identity curve', () => {
    const dataset = getDataset('live');
    const perk = dataset.perks.find((p) => p.family === 'MindOverMatterPerk');
    expect(perk).toBeDefined();
    expect(perk?.ranks).toHaveLength(1);
    expect(perk?.ranks[0].modifiers).toEqual([
      expect.objectContaining({
        bucket: 'specialIntelligence',
        op: 'ADD',
        curve: KILL_STREAK_IDENTITY_CURVE,
        curveScale: 1,
        conditions: [],
      }),
    ]);
  });

  it('Mind Over Matter unique plasma gun grants the same specialIntelligence curve, and is no longer badged inert', () => {
    const dataset = getDataset('live');
    const omod = dataset.omods.find((o) => o.id === 'mod_Custom_PlasmaGun_MindOverMatter');
    expect(omod).toBeDefined();
    expect(omod?.modifiers).toEqual([
      expect.objectContaining({
        bucket: 'specialIntelligence',
        op: 'ADD',
        curve: KILL_STREAK_IDENTITY_CURVE,
        curveScale: 1,
        conditions: [],
      }),
    ]);
    expect(classifyOmodDisplay(omod!).badge).toBeUndefined();
  });

  it('no equipped kill-streak source carries a "no route for AV EnableKillStreak" note anymore', () => {
    const dataset = getDataset('live');
    const noteHits = [...dataset.omods, ...dataset.armorOmods]
      .flatMap((o) => o.notes ?? [])
      .filter((n) => n.includes('EnableKillStreak'));
    expect(noteHits).toEqual([]);
  });
});
