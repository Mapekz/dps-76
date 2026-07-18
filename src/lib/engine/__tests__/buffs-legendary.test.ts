import { describe, it, expect } from 'vitest';
import { getWeapons } from '@/data';
import { adaptWeapon } from '@/data/live/weapons';
import generatedWeapons from '@/data/live/generated/weapons.json';
import type { GeneratedWeapon } from '@/types/generated';
import { getBuffModifiers } from '@/data/buffs';
import type { Modifier } from '@/types/modifiers';
import { getOmodById } from '@/data/omods';
import { getLoadoutModifiers } from '@/data/perk-modifiers';
import { PerkId } from '@/data/perk-ids';
import { buildEffectiveWeapon } from '@/lib/engine/effective-weapon';
import { computeScenarios, type ScenarioInput } from '@/lib/engine/scenarios';
import { resolveLoadout } from '@/lib/loadout';
import {
  createDefaultEnemyConditions,
  createDefaultEnemyConfig,
  createDefaultPlayerConditions,
  createDefaultPlayerConfig,
  type PlayerConfig,
} from '@/types';

// Phase 7 milestone: legendary effects, mutations, and consumables move the
// numbers per wiki values (pending in-game golden validation).

const fixer = getWeapons('live')['CombatRifle_Fixer'];

function base(overrides: Partial<ScenarioInput> = {}): ScenarioInput {
  return {
    mode: 'live',
    weapon: fixer,
    itemLevel: 50,
    modifiers: [],
    player: createDefaultPlayerConditions(),
    enemy: createDefaultEnemyConditions(),
    weakpointMult: 2.0,
    critRate: 0,
    ...overrides,
  };
}

const stockTotal = computeScenarios(base()).freeAim.perHit.total;

describe('legendary weapon effects', () => {
  it('Bloodied follows its extracted ENCH curve: (5% HP → +130) … (100% HP → 0)', () => {
    const bloodied = getOmodById('live', 'mod_Legendary_Weapon1_DamageInverseHealth')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [bloodied]);
    // At 20% HP: linear between (0.05, 130) and (1.0, 0) → +109.47% dbm.
    const at20 = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), healthPercent: 20 } }));
    const expected = 130 * (1 - (0.2 - 0.05) / 0.95) * 0.01;
    expect(at20.freeAim.perHit.total / stockTotal).toBeCloseTo(1 + expected, 6);
  });

  it('Bloodied at full HP adds nothing; below the first curve point clamps to +130%', () => {
    const bloodied = getOmodById('live', 'mod_Legendary_Weapon1_DamageInverseHealth')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [bloodied]);
    const full = computeScenarios(base({ weapon, modifiers }));
    expect(full.freeAim.perHit.total).toBeCloseTo(stockTotal, 6);
    const dying = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), healthPercent: 1 } }));
    expect(dying.freeAim.perHit.total / stockTotal).toBeCloseTo(2.3, 6);
  });

  it('Instigating adds +50% against targets at or above 60% health (granted-perk chase)', () => {
    // ESM: MGEF AbLegendary_Weapon_DamageFirstBlood → PERK
    // Legendary_Weapon_DamageFirstBlood: dbm +0.5, target GetHealthPercentage ≥ 0.6.
    const instigating = getOmodById('live', 'mod_Legendary_Weapon1_DamageFirstBlood')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [instigating]);
    // Unset enemy health defaults to full → active.
    const vsFull = computeScenarios(base({ weapon, modifiers }));
    expect(vsFull.freeAim.perHit.total).toBeCloseTo(stockTotal * 1.5, 6);
    const vsHurt = computeScenarios(base({ weapon, modifiers, enemy: { ...createDefaultEnemyConditions(), healthPercent: 50 } }));
    expect(vsHurt.freeAim.perHit.total).toBeCloseTo(stockTotal, 6);
  });

  it('legendary Adrenal follows its extracted curve: +10% per kill-streak stack, max 10', () => {
    const adrenal = getOmodById('live', 'mod_Legendary_Weapon1_Adrenal')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [adrenal]);
    const at5 = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), adrenalineStacks: 5 } }));
    expect(at5.freeAim.perHit.total / stockTotal).toBeCloseTo(1.5, 6);
    const at10 = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), adrenalineStacks: 10 } }));
    expect(at10.freeAim.perHit.total / stockTotal).toBeCloseTo(2.0, 6);
  });

  it('Adrenaline perk follows its extracted curve: +10%/kill-streak stack (distinct from mutation/legendary)', () => {
    const adrenaline = getLoadoutModifiers('live', [{ perkId: PerkId.Adrenaline, rank: 1 }]);
    const at10 = computeScenarios(base({ modifiers: adrenaline, player: { ...createDefaultPlayerConditions(), adrenalineStacks: 10 } }));
    expect(at10.freeAim.perHit.total / stockTotal).toBeCloseTo(2.0, 6);
    const at0 = computeScenarios(base({ modifiers: adrenaline, player: { ...createDefaultPlayerConditions(), adrenalineStacks: 0 } }));
    expect(at0.freeAim.perHit.total / stockTotal).toBeCloseTo(1.0, 6);
  });

  it("Junkie's follows its extracted curve: +10% per addiction", () => {
    const junkies = getOmodById('live', 'mod_Legendary_Weapon1_DamageAddiction')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [junkies]);
    const withAddictions = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), addictionCount: 3 } }));
    expect(withAddictions.freeAim.perHit.total / stockTotal).toBeCloseTo(1.3, 6);
  });
});

describe('legendary weapon effects (2026-07-11 condition kinds)', () => {
  it('Last Shot adds +100% only while firing the last round in the magazine', () => {
    const lastShot = getOmodById('live', 'mod_Legendary_Weapon2_Guns_LastShot')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [lastShot]);
    const normally = computeScenarios(base({ weapon, modifiers }));
    expect(normally.freeAim.perHit.total).toBeCloseTo(stockTotal, 6);
    const lastRound = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), isLastShot: true } }));
    expect(lastRound.freeAim.perHit.total / stockTotal).toBeCloseTo(2.0, 6);
  });

  it("Encircler's picks its tier from the enemy group size: +10% solo target, +30% at 3, capped +50% at ≥5", () => {
    const encirclers = getOmodById('live', 'mod_Legendary_Weapon4_Encirclers')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [encirclers]);
    // Unset group count defaults to 1 (the target itself) → base tier active.
    const solo = computeScenarios(base({ weapon, modifiers }));
    expect(solo.freeAim.perHit.total / stockTotal).toBeCloseTo(1.1, 6);
    const pack = computeScenarios(base({ weapon, modifiers, enemy: { ...createDefaultEnemyConditions(), groupTargetCount: 3 } }));
    expect(pack.freeAim.perHit.total / stockTotal).toBeCloseTo(1.3, 6);
    const horde = computeScenarios(base({ weapon, modifiers, enemy: { ...createDefaultEnemyConditions(), groupTargetCount: 8 } }));
    expect(horde.freeAim.perHit.total / stockTotal).toBeCloseTo(1.5, 6);
  });

  it("Fencer's (melee) scales with teammates: +12.5% solo up to +50% with 3", () => {
    const bat = getWeapons('live')['BaseballBat'];
    const fencers = getOmodById('live', 'mod_Legendary_Weapon4_Melee_Fencers')!;
    const { weapon, modifiers } = buildEffectiveWeapon(bat, [fencers]);
    const batStock = computeScenarios(base({ weapon: bat })).freeAim.perHit.total;
    // Melee dbm folds over 1 + 0.05×STR (default 15) = 1.75, so +x dbm scales by (1.75+x)/1.75.
    const solo = computeScenarios(base({ weapon, modifiers }));
    expect(solo.freeAim.perHit.total / batStock).toBeCloseTo(1.875 / 1.75, 6);
    const fullTeam = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), teammateCount: 3 } }));
    expect(fullTeam.freeAim.perHit.total / batStock).toBeCloseTo(2.25 / 1.75, 6);
  });

  it("Gourmand's follows its hunger/thirst tier curve for humans and shuts off for ghouls", () => {
    const gourmands = getOmodById('live', 'mod_Legendary_Weapon1_Gourmand')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [gourmands]);
    const empty = computeScenarios(base({ weapon, modifiers }));
    expect(empty.freeAim.perHit.total).toBeCloseTo(stockTotal, 6);
    const fed = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), hungerThirstTier: 8 } }));
    expect(fed.freeAim.perHit.total / stockTotal).toBeCloseTo(1.4, 6);
    // ESM gates Gourmand's on GetIsPlayerGhoul()=0 — ghouls run the feral meter instead.
    const ghoul = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), hungerThirstTier: 8, isGhoul: true } }));
    expect(ghoul.freeAim.perHit.total).toBeCloseTo(stockTotal, 6);
  });

  it("Pyromaniac's and Viper's add +50% only against burning / poisoned targets", () => {
    for (const [id, key] of [
      ['mod_Legendary_Weapon4_Pyromaniac', 'isBurning'],
      ['mod_Legendary_Weapon4_Vipers', 'isPoisoned'],
    ] as const) {
      const omod = getOmodById('live', id)!;
      const { weapon, modifiers } = buildEffectiveWeapon(fixer, [omod]);
      const clean = computeScenarios(base({ weapon, modifiers }));
      expect(clean.freeAim.perHit.total).toBeCloseTo(stockTotal, 6);
      const afflicted = computeScenarios(base({ weapon, modifiers, enemy: { ...createDefaultEnemyConditions(), [key]: true } }));
      expect(afflicted.freeAim.perHit.total / stockTotal).toBeCloseTo(1.5, 6);
    }
  });
});

describe('AP economy (Stage B, real data)', () => {
  it('V.A.T.S. Optimized cuts the effective VATS AP cost by 35% (MUL_ADD −0.35 on vatsApCost)', () => {
    const vatsOptimized = getOmodById('live', 'mod_Legendary_Weapon3_VATSCostAP')!;
    const { weapon } = buildEffectiveWeapon(fixer, [vatsOptimized]);
    expect(weapon.apCost).toBeCloseTo((fixer.apCost ?? 0) * 0.65, 6);
    expect(fixer.apCost).toBe(16); // WEAP Data."Action Point Cost" — extractor-verified
  });

  it("Conductor's spike + refresh-only HoT: crit gain caps at spike×crits/sec + 20, not the flat-110 overcount", () => {
    // ESM chain hand-supplied in overrides/legendary-values.ts (script-driven
    // entry point, not extractor-modeled): 10 instant per crit + 20 AP/s over
    // 5s. The HoT REFRESHES on a new crit instead of stacking (user-confirmed
    // 2026-07-15), so at the Fixer's fast crit cadence it saturates at
    // +20 AP/s. The retired flat `apPerCrit: 110` credited 110 AP per crit
    // regardless of cadence (~76 AP/s of crit gain here vs the real ~27).
    const conductors = getOmodById('live', 'mod_Legendary_Weapon4_Conductors')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [conductors]);
    const withConductors = computeScenarios(base({ weapon, modifiers }));
    const without = computeScenarios(base());

    expect(without.vats.ap).toBeDefined();
    expect(without.vats.ap!.uptime).toBeLessThan(1); // stock Fixer is AP-limited in VATS
    expect(withConductors.vats.ap).toBeDefined();
    expect(withConductors.vats.ap!.uptime).toBeGreaterThan(without.vats.ap!.uptime);
    // apGainPerSec is combat-only (passive regen excluded, 2026-07-15) so it
    // already IS the crit gain — no need to subtract regenPerSec.
    const critGain = withConductors.vats.ap!.apGainPerSec;
    // Saturated-HoT ceiling: spike×crits/sec + 20 (crit interval ≪ 5s). Flat-110
    // would put this at 110×crits/sec ≈ 76 — assert we're far below that.
    const critsPerSec = (critGain - 20) / 10;
    expect(critsPerSec).toBeGreaterThan(0.2); // Fixer crits well inside the 5s HoT window → HoT saturated
    expect(critGain).toBeLessThan(110 * critsPerSec * 0.75);
  });
});

describe('explosive payload (Stage A1, real data)', () => {
  it('Explosive (2★) spawns a 20% explosive twin: freeAim total = stock × 1.2 with no other mods', () => {
    const explosive = getOmodById('live', 'mod_Legendary_Weapon2_Guns_ExplosiveBullets')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [explosive]);
    const result = computeScenarios(base({ weapon, modifiers }));
    expect(result.freeAim.perHit.total).toBeCloseTo(stockTotal * 1.2, 6);
  });
});

describe('target distance & weapon condition (Stage A3/A4, real data)', () => {
  // TEST_CLOSE_DISTANCE/TEST_FAR_DISTANCE (Phase 1 — Range + falloff): both
  // sit well below the Fixer's own minRange (2116 raw units), so
  // rangeFalloffMult stays neutral (1.0) and these cases isolate the
  // Close/Far PERK gate from the separate range-falloff mechanic (which has
  // its own dedicated tests, src/lib/__tests__/distance.test.ts).
  const TEST_CLOSE_DISTANCE = 400; // <= CLOSE_THRESHOLD_UNITS (850)
  const TEST_FAR_DISTANCE = 1500; // >= FAR_THRESHOLD_UNITS (1000)

  it("Sniper's adds +100% dbm only against far-range targets (targetDistance condition, GLOB-valued magnitude)", () => {
    // ESM: ENCH BOUNTY_ench_LegendaryWeapon_Snipers → MGEF abPerkFortifyDmgFar
    // on STAT_DmgVsFar, magnitude via GLOB BOUNTY_SnipersBonus = 100.
    const snipers = getOmodById('live', 'mod_Legendary_Weapon1_Guns_Sniper')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [snipers]);
    const none = computeScenarios(base({ weapon, modifiers }));
    expect(none.freeAim.perHit.total).toBeCloseTo(stockTotal, 6);
    const close = computeScenarios(base({ weapon, modifiers, enemy: { ...createDefaultEnemyConditions(), targetDistance: TEST_CLOSE_DISTANCE } }));
    expect(close.freeAim.perHit.total).toBeCloseTo(stockTotal, 6);
    const far = computeScenarios(base({ weapon, modifiers, enemy: { ...createDefaultEnemyConditions(), targetDistance: TEST_FAR_DISTANCE } }));
    expect(far.freeAim.perHit.total / stockTotal).toBeCloseTo(2.0, 6);
  });

  it("Guerrilla (rank 3) adds +20% dbm to ranged weapons only against close-range targets", () => {
    const guerrilla3 = getLoadoutModifiers('live', [{ perkId: PerkId.Guerrilla, rank: 3 }]);
    const none = computeScenarios(base({ modifiers: guerrilla3 }));
    expect(none.freeAim.perHit.total).toBeCloseTo(stockTotal, 6);
    const close = computeScenarios(base({ modifiers: guerrilla3, enemy: { ...createDefaultEnemyConditions(), targetDistance: TEST_CLOSE_DISTANCE } }));
    expect(close.freeAim.perHit.total / stockTotal).toBeCloseTo(1.2, 6);
    const far = computeScenarios(base({ modifiers: guerrilla3, enemy: { ...createDefaultEnemyConditions(), targetDistance: TEST_FAR_DISTANCE } }));
    expect(far.freeAim.perHit.total).toBeCloseTo(stockTotal, 6);
  });

  it("Polished follows its extracted 27-point curve: 0% at 100% condition (stock), +30% at 150%, +60% at 200% over-repaired", () => {
    // ESM: MGEF Legendary_Weapon_PolishedPerkApplyEffect on STAT_DmgAll, curve
    // input GetEquippedWeaponHealthPercent (no AVIF — edid-keyed override).
    // Extracted curve carries exact points (x: 1.5, y: 30) and (x: 2.0, y: 60)
    // at curveScale ≈ 0.01 — asserted directly, no interpolation needed.
    const polished = getOmodById('live', 'mod_Legendary_Weapon4_Polished')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [polished]);
    const stock = computeScenarios(base({ weapon, modifiers }));
    expect(stock.freeAim.perHit.total).toBeCloseTo(stockTotal, 6);
    const at150 = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), weaponConditionPct: 150 } }));
    expect(at150.freeAim.perHit.total / stockTotal).toBeCloseTo(1.3, 6);
    const at200 = computeScenarios(base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), weaponConditionPct: 200 } }));
    expect(at200.freeAim.perHit.total / stockTotal).toBeCloseTo(1.6, 6);
  });
});

describe("Thrill-Seeker's (Stage C3, real data)", () => {
  it('reload speed scales with kill-streak count (0/5/10 stacks), raising sustained DPS', () => {
    const thrillSeeker = getOmodById('live', 'RA_mod_Legendary_Weapon4_ThrillSeeker')!;
    const at0 = { ...createDefaultPlayerConditions(), adrenalineStacks: 0 };
    const at5 = { ...createDefaultPlayerConditions(), adrenalineStacks: 5 };
    const at10 = { ...createDefaultPlayerConditions(), adrenalineStacks: 10 };

    const w0 = buildEffectiveWeapon(fixer, [thrillSeeker], 50, at0).weapon;
    const w5 = buildEffectiveWeapon(fixer, [thrillSeeker], 50, at5).weapon;
    const w10 = buildEffectiveWeapon(fixer, [thrillSeeker], 50, at10).weapon;

    const baseReload = fixer.reloadSpeed ?? 1.0;
    expect(w0.reloadSpeed).toBeCloseTo(baseReload, 6); // no tier matches 0 kill streak
    expect(w5.reloadSpeed).toBeCloseTo(baseReload + 0.15, 6); // ONLY the count:5 tier (0.03×5)
    expect(w10.reloadSpeed).toBeCloseTo(baseReload + 0.3, 6); // ONLY the count:10 tier (0.03×10)

    const s0 = computeScenarios(base({ weapon: w0, player: at0 })).freeAim.sustain.sustainedDps;
    const s5 = computeScenarios(base({ weapon: w5, player: at5 })).freeAim.sustain.sustainedDps;
    const s10 = computeScenarios(base({ weapon: w10, player: at10 })).freeAim.sustain.sustainedDps;
    expect(s5).toBeGreaterThan(s0);
    expect(s10).toBeGreaterThan(s5);
  });
});

describe('Action Boy/Girl (Stage C4, cross-family rank gate fix)', () => {
  it('rank 3 (+45% AP regen) raises regenPerSec, and feeds uptime ONLY through the reload window (2026-07-15 reload-regen model)', () => {
    const withoutActionBoy = computeScenarios(base());
    const actionBoy3 = getLoadoutModifiers('live', [{ perkId: PerkId.ActionBoyGirl, rank: 3 }]);
    const withActionBoy = computeScenarios(base({ modifiers: actionBoy3 }));

    expect(withoutActionBoy.vats.ap).toBeDefined();
    expect(withoutActionBoy.vats.ap!.uptime).toBeLessThan(1); // stock Fixer is AP-limited in VATS
    expect(withActionBoy.vats.ap).toBeDefined();
    expect(withActionBoy.vats.ap!.regenPerSec).toBeGreaterThan(withoutActionBoy.vats.ap!.regenPerSec);
    // The Fixer's ~2.7s reload exceeds the 1s regen delay, so the bigger
    // passive rate earns a bigger reload-window credit — and that credit is
    // the ONLY way passive regen moves uptime: apGainPerSec here is exactly
    // the reloadRegenPerSec breakout (no crit-restore sources equipped).
    expect(withActionBoy.vats.ap!.reloadRegenPerSec).toBeGreaterThan(withoutActionBoy.vats.ap!.reloadRegenPerSec);
    expect(withActionBoy.vats.ap!.apGainPerSec).toBeCloseTo(withActionBoy.vats.ap!.reloadRegenPerSec, 10);
    expect(withActionBoy.vats.ap!.uptime).toBeGreaterThan(withoutActionBoy.vats.ap!.uptime);
  });

  it('each rank grants its OWN flat tier, not a cumulative stack (15%/30%/45%) — regenPerSec and the reload-regen credit both monotonic', () => {
    const rank1 = computeScenarios(base({ modifiers: getLoadoutModifiers('live', [{ perkId: PerkId.ActionBoyGirl, rank: 1 }]) }));
    const rank2 = computeScenarios(base({ modifiers: getLoadoutModifiers('live', [{ perkId: PerkId.ActionBoyGirl, rank: 2 }]) }));
    const rank3 = computeScenarios(base({ modifiers: getLoadoutModifiers('live', [{ perkId: PerkId.ActionBoyGirl, rank: 3 }]) }));
    // regenPerSec is monotonic in the AP regen bonus (15% < 30% < 45%) —
    // were the tiers cumulative, the gaps would compound instead.
    expect(rank1.vats.ap!.regenPerSec).toBeLessThan(rank2.vats.ap!.regenPerSec);
    expect(rank2.vats.ap!.regenPerSec).toBeLessThan(rank3.vats.ap!.regenPerSec);
    // Passive regen reaches uptime only via the reload window, proportionally.
    expect(rank1.vats.ap!.uptime).toBeLessThan(rank3.vats.ap!.uptime);
    expect(rank3.vats.ap!.reloadRegenPerSec / rank1.vats.ap!.reloadRegenPerSec).toBeCloseTo(
      rank3.vats.ap!.regenPerSec / rank1.vats.ap!.regenPerSec,
      10
    );
  });
});

describe('Lock and Load → Bullet Storm reload speed (cross-family perkFamilyRank gate, 2026-07-15)', () => {
  // Bullet Storm's hidden reload-speed curve (+1%/ammo-spent stack, 0→30) is
  // gated HasPerk(LockAndLoad01) — extracted as a perkFamilyRank condition,
  // evaluated against PlayerConditions.equippedPerkRanks.
  //
  // 2026-07-16 (Bullet Storm engine core): the generated Bullet Storm perk
  // doesn't carry its own `bulletStormMaxStacks` modifier yet (pending
  // extraction — docs/assumptions.md "Bullet Storm"), so the folded cap is 0
  // and `effectiveBulletStormStacks` now clamps the reload curve's input to
  // 0 with it. These tests splice in a synthetic ADD 10 cap alongside the
  // real perk-derived modifiers instead of depending on regenerated JSON.
  const fiftyCal = getWeapons('live')['50CalMachineGun'];
  const bulletStorm = getLoadoutModifiers('live', [{ perkId: PerkId.BulletStorm, rank: 1 }]);
  const syntheticMax: Modifier = {
    id: 'synthetic-bulletstorm-max',
    source: { kind: 'perk', formId: '0x0031AF14', edid: 'HeavyGunner', name: 'Bullet Storm', rank: 1 },
    bucket: 'bulletStormMaxStacks',
    op: 'ADD',
    value: 10,
    conditions: [],
  };
  const bulletStormWithMax = [...bulletStorm, syntheticMax];
  const at10 = { ...createDefaultPlayerConditions(), bulletStormStacks: 10 };

  it('Bullet Storm alone leaves reload speed unmodified; owning Lock and Load activates the +1%/stack curve', () => {
    const without = buildEffectiveWeapon(fiftyCal, [], 50, at10, undefined, bulletStormWithMax).weapon;
    expect(without.reloadSpeed).toBeCloseTo(fiftyCal.reloadSpeed ?? 1.0, 6);

    const owning = { ...at10, equippedPerkRanks: { LockAndLoad: 1 } };
    const withLnL = buildEffectiveWeapon(fiftyCal, [], 50, owning, undefined, bulletStormWithMax).weapon;
    expect(withLnL.reloadSpeed).toBeCloseTo((fiftyCal.reloadSpeed ?? 1.0) + 0.1, 6); // 10/30 stacks × 30% max = +10%

    const sWithout = computeScenarios(base({ weapon: without, player: at10 }));
    const sWith = computeScenarios(base({ weapon: withLnL, player: owning }));
    expect(sWith.vats.sustain.reloadSec).toBeLessThan(sWithout.vats.sustain.reloadSec);
  });

  it('resolveLoadout derives equippedPerkRanks from the selected cards end-to-end', () => {
    const playerConfig: PlayerConfig = {
      ...createDefaultPlayerConfig(),
      weapon: { weaponId: '50CalMachineGun', mods: {}, legendaryEffects: [] },
      perks: [{ perkId: PerkId.BulletStorm, rank: 1 }],
    };
    const withoutLnLPerks = playerConfig.perks;
    const withLnLPerks = [...playerConfig.perks, { perkId: PerkId.LockAndLoad, rank: 1 }];
    const withoutLnL = resolveLoadout(playerConfig, createDefaultEnemyConfig(), 'live')!;
    const withLnL = resolveLoadout(
      { ...playerConfig, perks: withLnLPerks },
      createDefaultEnemyConfig(),
      'live'
    )!;
    expect(withLnL.player.equippedPerkRanks).toMatchObject({ LockAndLoad: 1, HeavyGunner: 1 });

    // weapon.reloadSpeed itself needs a real bulletStormMaxStacks source to
    // be nonzero (same extraction gap as above) — replay the SAME
    // real perk-derived modifiers resolveLoadout assembled, with the
    // synthetic cap spliced in, to confirm the cross-family gate still
    // activates the curve end-to-end once real data supplies the cap.
    const reloadWithout = buildEffectiveWeapon(
      fiftyCal, [], 50, { ...withoutLnL.player, bulletStormStacks: 10 }, undefined,
      [...getLoadoutModifiers('live', withoutLnLPerks), syntheticMax]
    ).weapon.reloadSpeed!;
    const reloadWith = buildEffectiveWeapon(
      fiftyCal, [], 50, { ...withLnL.player, bulletStormStacks: 10 }, undefined,
      [...getLoadoutModifiers('live', withLnLPerks), syntheticMax]
    ).weapon.reloadSpeed!;
    expect(reloadWith).toBeGreaterThan(reloadWithout);
  });
});

describe('Onslaught (2026-07-12, real data)', () => {
  it('Furious grants +9 max stacks and +5%/stack dbm; sentinel default assumes full stacks', () => {
    // ESM: OMOD mod_Legendary_Weapon1_DmgConsecutiveHits → ENCH 0x006C3173 →
    // Script MGEF → PERK Legendary_Weapon_DmgConsecutiveHits: EP190 Add Value
    // 9.0 (onslaughtMaxStacks), EP189 "Add Actor Value Mult" Float 0.01 ×
    // referenced AV LGND_Furious 0x006C3172 Default 5.0 = 0.05 (dbm, stacks).
    // Corrected 2026-07-15 (was +1%/stack — user-confirmed in-game +5%/stack).
    const furious = getOmodById('live', 'mod_Legendary_Weapon1_DmgConsecutiveHits')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [furious]);

    const atMax = computeScenarios(base({ weapon, modifiers }));
    expect(atMax.onslaughtMaxStacks).toBe(9);
    expect(atMax.freeAim.perHit.total / stockTotal).toBeCloseTo(1.45, 6); // sentinel -1 → full 9 stacks

    const explicit4 = computeScenarios(
      base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), onslaughtStacks: 4 } })
    );
    expect(explicit4.freeAim.perHit.total / stockTotal).toBeCloseTo(1.2, 6);

    const overMax = computeScenarios(
      base({ weapon, modifiers, player: { ...createDefaultPlayerConditions(), onslaughtStacks: 999 } })
    );
    expect(overMax.freeAim.perHit.total / stockTotal).toBeCloseTo(1.45, 6); // clamps to the computed max
  });

  it('zero Onslaught sources equipped → computed max is 0, no bonus regardless of stored stacks', () => {
    const none = computeScenarios(base());
    expect(none.onslaughtMaxStacks).toBe(0);
    expect(none.freeAim.perHit.total).toBeCloseTo(stockTotal, 6);

    const withStoredStacks = computeScenarios(base({ player: { ...createDefaultPlayerConditions(), onslaughtStacks: 10 } }));
    expect(withStoredStacks.freeAim.perHit.total).toBeCloseTo(stockTotal, 6);
  });

  it("Pounder's grants +10 max stacks and +10%/stack dbm, self-gated to its own weapon via HasLegendary_Weapon_Pounders", () => {
    // ESM: OMOD mod_Legendary_Weapon4_Melee_Pounders adds its own keyword
    // (HasLegendary_Weapon_Pounders) and both EP190/EP189 gate on it —
    // effective-weapon.ts merges addedKeywords, so it self-satisfies once equipped.
    // EP189 Float 0.01 × referenced AV Legendary_Pounders_ConsecutiveHits
    // 0x007ACB37 Default 10.0 = 0.10/stack (corrected 2026-07-15, was 0.01).
    const bat = getWeapons('live')['BaseballBat'];
    const pounders = getOmodById('live', 'mod_Legendary_Weapon4_Melee_Pounders')!;
    const { weapon, modifiers } = buildEffectiveWeapon(bat, [pounders]);
    const batStock = computeScenarios(base({ weapon: bat })).freeAim.perHit.total;
    const result = computeScenarios(base({ weapon, modifiers }));
    expect(result.onslaughtMaxStacks).toBe(10);
    // Melee dbm folds over 1 + 0.05×STR (default 15) = 1.75 (Fencer's convention).
    expect(result.freeAim.perHit.total / batStock).toBeCloseTo((1.75 + 1.0) / 1.75, 6);
  });

  it("Splinter's built-in Special Effect grants +10 max stacks and +10%/stack dbm, unconditional (unique weapon)", () => {
    // ESM: OMOD P62_Mod_Custom_Splinter_SpecialEffect, built into the unique
    // P62_crTheDrifter10mmSMG ("Splinter"). The P62 Drifter content never
    // released, so the weapon is hidden app-side (corrections.ts) — this test
    // adapts the raw generated record directly to keep the Onslaught modeling
    // pinned for whenever P62 ships. EP190/EP189 carry NO Perk Conditions at
    // all (unconditional once equipped).
    // EP189 Float 0.01 × referenced AV P62_Weapon_Splinter_MaxConsecutiveHits
    // 0x0080219A Default 10.0 = 0.10/stack (corrected 2026-07-15, was 0.01).
    const splinterRecord = (generatedWeapons as GeneratedWeapon[]).find(w => w.id === 'P62_crTheDrifter10mmSMG');
    expect(splinterRecord).toBeDefined();
    const splinter = adaptWeapon(splinterRecord!);
    const splinterEffect = getOmodById('live', 'P62_Mod_Custom_Splinter_SpecialEffect')!;
    const { weapon, modifiers } = buildEffectiveWeapon(splinter, [splinterEffect]);
    const splinterStock = computeScenarios(base({ weapon: splinter })).freeAim.perHit.total;
    const result = computeScenarios(base({ weapon, modifiers }));
    expect(result.onslaughtMaxStacks).toBe(10);
    expect(result.freeAim.perHit.total / splinterStock).toBeCloseTo(2.0, 6);
  });

  it("Guerrilla Master's ranged+close-range dbm curve now resolves (previously the unresolved 0x00000395 input) and its own +5 max stacks apply", () => {
    const guerrillaMaster = getLoadoutModifiers('live', [{ perkId: PerkId.GuerrillaMaster, rank: 1 }]);
    const none = computeScenarios(base({ modifiers: guerrillaMaster }));
    expect(none.onslaughtMaxStacks).toBe(5);
    expect(none.freeAim.perHit.total).toBeCloseTo(stockTotal, 6); // not close-range: inactive
    // 400 raw units: <= CLOSE_THRESHOLD_UNITS (850), well below the Fixer's
    // own minRange (2116) so rangeFalloffMult stays neutral (1.0) — isolates
    // the Close perk gate from range falloff (own tests, distance.test.ts).
    const close = computeScenarios(base({ modifiers: guerrillaMaster, enemy: { ...createDefaultEnemyConditions(), targetDistance: 400 } }));
    // curve (0,0)(1,5)(100,500) at x=5 (its own max, sentinel default) → y=25, ×0.01 = +25%.
    expect(close.freeAim.perHit.total / stockTotal).toBeCloseTo(1.25, 6);
  });

  it("Gunslinger Expert adds weak-spot damage per stack (ranged only) at its own +3 max", () => {
    const gunslingerExpert = getLoadoutModifiers('live', [{ perkId: PerkId.GunslingerExpert, rank: 1 }]);
    const noWeakpoint = computeScenarios(base({ modifiers: gunslingerExpert }));
    expect(noWeakpoint.onslaughtMaxStacks).toBe(3);
    expect(noWeakpoint.freeAim.perHit.total).toBeCloseTo(stockTotal, 6); // torso hit: weakpointBonus inactive
    const stockWeakpoint = computeScenarios(base({ player: { ...createDefaultPlayerConditions(), isAimingAtWeakpoint: true } })).freeAim.perHit.total;
    const withWeakpoint = computeScenarios(
      base({ modifiers: gunslingerExpert, player: { ...createDefaultPlayerConditions(), isAimingAtWeakpoint: true } })
    );
    // curve (0,0)(1,1.0)(100,100.0) at x=3 → y=3.0, ×0.01 = +3% weak-spot damage.
    expect(withWeakpoint.freeAim.perHit.total / stockWeakpoint).toBeCloseTo(1.03, 6);
  });

  it('Whacker Smacker grants NO max stacks of its own — its power-attack curve needs an external source to do anything', () => {
    // ESM: OMOD E09B_mod_Custom_WhackerSmacker's ENCH reads the shared AV
    // 0x00000395 DIRECTLY (no EP190 of its own): +5%/stack power-attack
    // damage, curve (0,0)(1,5)(100,500) on STAT_DmgPowerAttack. The legacy
    // standalone E09B_SuperSledge_WhackerSmacker WEAP is hidden post unique-
    // weapons-rework (its identity is now this OMOD, hosted on base
    // SuperSledge's templateModFormIds) — use base SuperSledge, which is
    // stat-identical except speed (1 vs the legacy record's 1.5), which
    // doesn't factor into per-hit damage.
    const whackerWeapon = getWeapons('live')['SuperSledge'];
    expect(whackerWeapon).toBeDefined();
    const whackerEffect = getOmodById('live', 'E09B_mod_Custom_WhackerSmacker')!;
    const paPlayer = { ...createDefaultPlayerConditions(), isPowerAttacking: true };

    const aloneEff = buildEffectiveWeapon(whackerWeapon, [whackerEffect]);
    const alone = computeScenarios(base({ weapon: aloneEff.weapon, modifiers: aloneEff.modifiers, player: paPlayer }));
    expect(alone.onslaughtMaxStacks).toBe(0);
    const plainStock = computeScenarios(base({ weapon: whackerWeapon, player: paPlayer })).freeAim.perHit.total;
    expect(alone.freeAim.perHit.total).toBeCloseTo(plainStock, 6); // curve at x=0 → no bonus

    // Pair with Furious (a separate legendary slot) to grant a real max (9) —
    // demonstrates the shared-cap mechanic combining two independent sources.
    const furious = getOmodById('live', 'mod_Legendary_Weapon1_DmgConsecutiveHits')!;
    const paired = buildEffectiveWeapon(whackerWeapon, [whackerEffect, furious]);
    const withMax = computeScenarios(base({ weapon: paired.weapon, modifiers: paired.modifiers, player: paPlayer }));
    expect(withMax.onslaughtMaxStacks).toBe(9);
    // parenthesis = dbm(1 + 9×0.05 from Furious) + strTerm(0.75, melee STR 15)
    // + powerAttackTerm(curve@9=45, ×0.01=0.45), vs the alone baseline's
    // dbm(1) + strTerm(0.75) + powerAttackTerm(0) — both share the same
    // outer multiplier (paRaceMult etc.), so the ratio isolates this delta.
    expect(withMax.freeAim.perHit.total / alone.freeAim.perHit.total).toBeCloseTo((1.45 + 0.75 + 0.45) / 1.75, 6);
  });

  it('max stacks aggregate across independently-equipped sources (Furious + Guerrilla Expert → 9 + 3 = 12)', () => {
    const furious = getOmodById('live', 'mod_Legendary_Weapon1_DmgConsecutiveHits')!;
    const { weapon, modifiers: omodModifiers } = buildEffectiveWeapon(fixer, [furious]);
    const guerrillaExpert = getLoadoutModifiers('live', [{ perkId: PerkId.GuerrillaExpert, rank: 1 }]);
    const result = computeScenarios(base({ weapon, modifiers: [...omodModifiers, ...guerrillaExpert] }));
    expect(result.onslaughtMaxStacks).toBe(12);
  });
});

describe('mutations and consumables', () => {
  it('Psychobuff adds +25% dbm', () => {
    const mods = getBuffModifiers('live', [], ['Psychobuff']);
    const result = computeScenarios(base({ modifiers: mods }));
    expect(result.freeAim.perHit.total).toBeCloseTo(stockTotal * 1.25, 6);
  });

  it('Adrenal Reaction (extracted ESM curves) scales with kill streak: +5%/stack, ×1.25 with Strange in Numbers', () => {
    const mods = getBuffModifiers('live', ['Mutation_AdrenalReaction'], []);
    const player = { ...createDefaultPlayerConditions(), adrenalineStacks: 10 };
    const solo = computeScenarios(base({ modifiers: mods, player }));
    expect(solo.freeAim.perHit.total).toBeCloseTo(stockTotal * 1.5, 6);

    const team = computeScenarios(base({ modifiers: mods, player: { ...player, strangeInNumbers: true } }));
    expect(team.freeAim.perHit.total).toBeCloseTo(stockTotal * 1.625, 6);
  });

  it('Nerd Rage follows its extracted curve: +80% damage at 5% HP, 0 at full HP', () => {
    const nerdRage = getLoadoutModifiers('live', [{ perkId: PerkId.NerdRage, rank: 1 }]);
    const at5 = computeScenarios(base({ modifiers: nerdRage, player: { ...createDefaultPlayerConditions(), healthPercent: 5 } }));
    expect(at5.freeAim.perHit.total / stockTotal).toBeCloseTo(1.8, 6);
    const atFull = computeScenarios(base({ modifiers: nerdRage }));
    expect(atFull.freeAim.perHit.total / stockTotal).toBeCloseTo(1.0, 6);
  });

  it('Eagle Eyes adds +50% crit damage (+62.5% with Strange in Numbers)', () => {
    const mods = getBuffModifiers('live', ['Mutation_EagleEyes'], []);
    // full-crit VATS parenthesis = 1 + (critMult − 1); crit mult 2.0 → 2.5 solo, 2.625 team.
    const solo = computeScenarios(base({ modifiers: mods, critRate: 1 }));
    const none = computeScenarios(base({ critRate: 1 }));
    expect(solo.vats.perHit.total / none.vats.perHit.total).toBeCloseTo(2.5 / 2.0, 6);

    const team = computeScenarios(base({ modifiers: mods, critRate: 1, player: { ...createDefaultPlayerConditions(), strangeInNumbers: true } }));
    expect(team.vats.perHit.total / none.vats.perHit.total).toBeCloseTo(2.625 / 2.0, 6);
  });
});

describe('AP economy completion (2026-07-15, real extracted data)', () => {
  it("Lone Wanderer's CHA-curve AP regen applies solo and vanishes on a team", () => {
    // Rank 1's ability (shared by every rank — ranks 2/3 carry only the DR
    // effect, their flat "20/30% AP regen" descriptions are stale legacy
    // text): CHA curve (1,10)(15,30)(30,45)(60,70)(100,85), teammateCount 0
    // gate. Default CHA 15 → +30% on the race base: 210 × 6/100 × 1.30 = 16.38.
    const lw = getLoadoutModifiers('live', [{ perkId: PerkId.LoneWanderer, rank: 3 }]);
    const solo = computeScenarios(base({ modifiers: lw }));
    expect(solo.vats.ap!.regenPerSec).toBeCloseTo(16.38, 6);
    const teamed = computeScenarios(
      base({ modifiers: lw, player: { ...createDefaultPlayerConditions(), teammateCount: 2 } })
    );
    expect(teamed.vats.ap!.regenPerSec).toBeCloseTo(12.6, 6);
  });

  it('Number Cruncher scales dbm by the EFFECTIVE weapon AP cost, in free aim too', () => {
    // +2% per AP point (STAT_DmgAP route): stock Fixer costs 16 AP → +32%.
    const nc = getLoadoutModifiers('live', [{ perkId: PerkId.NumberCruncher, rank: 1 }]);
    const plain = computeScenarios(base({ modifiers: nc }));
    expect(plain.freeAim.perHit.total / stockTotal).toBeCloseTo(1 + 0.02 * 16, 6);

    // V.A.T.S. Optimized (−35%) rewrites the effective cost → 10.4 → +20.8%.
    const vatsOptimized = getOmodById('live', 'mod_Legendary_Weapon3_VATSCostAP')!;
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [vatsOptimized]);
    const optimized = computeScenarios(base({ weapon, modifiers: [...modifiers, ...nc] }));
    const stockOptimized = computeScenarios(base({ weapon, modifiers }));
    expect(optimized.freeAim.perHit.total / stockOptimized.freeAim.perHit.total).toBeCloseTo(1 + 0.02 * 16 * 0.65, 6);
  });

  it('Company Tea adds +10 onto the race-base rate stat (percent of max AP per second)', () => {
    // 210 pool × (6 + 10)/100 = 33.6 AP/s.
    const tea = getBuffModifiers('live', [], ['CompanyTea_RSVP02']);
    const result = computeScenarios(base({ modifiers: tea }));
    expect(result.vats.ap!.regenPerSec).toBeCloseTo(33.6, 6);

    // Stacked with Packin' Light (+25% ActionPointsRateMult, always-on under
    // the never-over-encumbered assumption): 33.6 × 1.25 = 42.
    const pl = getLoadoutModifiers('live', [{ perkId: PerkId.PackinLight, rank: 1 }]);
    const stacked = computeScenarios(base({ modifiers: [...tea, ...pl] }));
    expect(stacked.vats.ap!.regenPerSec).toBeCloseTo(42, 6);
  });

  it("Scaly Skin's −50 max AP penalty shrinks the pool AND its regen proportionally (%-of-max rate)", () => {
    const ss = getBuffModifiers('live', ['Mutation_ScalySkin'], []);
    const withMutation = computeScenarios(base({ modifiers: ss }));
    const without = computeScenarios(base());
    expect(withMutation.vats.ap!.maxAp).toBe(without.vats.ap!.maxAp - 50);
    expect(withMutation.vats.ap!.regenPerSec / without.vats.ap!.regenPerSec).toBeCloseTo(160 / 210, 10);
  });

  it('hydration baseline (+35% AP regen) applies through resolveLoadout, gated by the toggle and ghoul', () => {
    const resolve = (conditions: Partial<ReturnType<typeof createDefaultPlayerConditions>>) =>
      resolveLoadout(
        {
          ...createDefaultPlayerConfig(),
          weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
          conditions: { ...createDefaultPlayerConditions(), ...conditions },
        },
        createDefaultEnemyConfig(),
        'live'
      )!;
    expect(computeScenarios(resolve({})).vats.ap!.regenPerSec).toBeCloseTo(12.6 * 1.35, 6);
    expect(computeScenarios(resolve({ hydrated: false })).vats.ap!.regenPerSec).toBeCloseTo(12.6, 6);
    expect(computeScenarios(resolve({ isGhoul: true })).vats.ap!.regenPerSec).toBeCloseTo(12.6, 6);
  });

  it('Rejuvenated deltas stack on the hydration baseline to the ESM tier values (45%/60%)', () => {
    const resolve = (rank: 1 | 2) =>
      resolveLoadout(
        {
          ...createDefaultPlayerConfig(),
          perks: [{ perkId: PerkId.Rejuvenated, rank }],
          weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: [] },
        },
        createDefaultEnemyConfig(),
        'live'
      )!;
    expect(computeScenarios(resolve(1)).vats.ap!.regenPerSec).toBeCloseTo(12.6 * 1.45, 6);
    expect(computeScenarios(resolve(2)).vats.ap!.regenPerSec).toBeCloseTo(12.6 * 1.6, 6);
  });
});

describe('consumables overhaul integration (2026-07-13, real extracted data)', () => {
  it("an active chem suppresses its own addiction from Junkie's count (3 selected, 1 suppressed → count 2, not 3)", () => {
    // Depends on the real post-overhaul consumables.json/addictions.json
    // shape (GeneratedBuff.category/.addiction, GeneratedAddiction catalog)
    // produced by the rewritten scripts/extract/extract-buffs.ts. If a
    // future re-extraction changes these ids, update them here rather than
    // deleting the test — this is the one place suppression is pinned
    // end-to-end through resolveLoadout.
    const withJunkies = (overrides: Partial<PlayerConfig>) => {
      const playerConfig: PlayerConfig = {
        ...createDefaultPlayerConfig(),
        weapon: { weaponId: 'CombatRifle_Fixer', mods: {}, legendaryEffects: ['mod_Legendary_Weapon1_DamageAddiction'] },
        ...overrides,
      };
      const result = resolveLoadout(playerConfig, createDefaultEnemyConfig(), 'live');
      expect(result).not.toBeNull();
      return result!;
    };

    // Psycho (active chem) causes AbAddictionPsycho — selecting it among the
    // 3 addictions should suppress exactly that one.
    const suppressed = withJunkies({
      consumables: ['Psycho'],
      addictions: ['AbAddictionPsycho', 'AbAddictionBuffout', 'AbAddictionMentats'],
    });
    expect(suppressed.player.addictionCount).toBe(2);

    // Same active chem (keeps Psycho's own dbm buff constant across both
    // scenarios), but none of these 3 addictions is caused by Psycho — no
    // suppression.
    const unsuppressed = withJunkies({
      consumables: ['Psycho'],
      addictions: ['AbAddictionBuffout', 'AbAddictionMentats', 'AbAddictionFury'],
    });
    expect(unsuppressed.player.addictionCount).toBe(3);

    // Full pipeline: the suppression flows through to computed damage.
    // Junkie's curve is exactly +10%/addiction (pinned above), so the two
    // scenarios' totals should differ by exactly one Junkie's stack (10%
    // of stockTotal) — Psycho's own separate dbm buff is identical on both
    // sides and cancels out of the difference.
    const suppressedTotal = computeScenarios(suppressed).freeAim.perHit.total;
    const unsuppressedTotal = computeScenarios(unsuppressed).freeAim.perHit.total;
    expect((unsuppressedTotal - suppressedTotal) / stockTotal).toBeCloseTo(0.1, 6);
  });
});
