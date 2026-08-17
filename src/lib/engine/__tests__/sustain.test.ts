import { describe, it, expect } from 'bun:test';
import type { Weapon } from '@/types';
import { makeResolvedPlayer } from '@/lib/engine/__tests__/resolved-player-fixture';
import {
  computeSustain,
  DEFAULT_BATTLE_LOADERS_BASH_SEC,
  shotsPerMagazine,
  sustainTiming,
} from '@/lib/engine/sustain';

function gun(overrides: Partial<Weapon> = {}): Weapon {
  return {
    id: 'test-gun',
    name: 'Test Gun',
    components: [],
    damageType: 'ballistic',
    weaponClass: 'rifle',
    isAutomatic: false,
    isPhysical: true,
    capacity: 20,
    ammoPerShot: 1,
    reloadSpeed: 1.0,
    animationReloadSec: 2.0,
    ...overrides,
  };
}

describe('shotsPerMagazine', () => {
  it('6-round mag, ammoPerShot 1 → 6', () => {
    expect(shotsPerMagazine(gun({ capacity: 6 }))).toBe(6);
  });

  it('single-shot weapon (capacity 1) → 1', () => {
    expect(shotsPerMagazine(gun({ capacity: 1 }))).toBe(1);
  });

  it('no magazine (capacity 0, e.g. melee) → 0', () => {
    expect(shotsPerMagazine(gun({ capacity: 0, weaponClass: 'melee' }))).toBe(0);
  });

  it('ammoPerShot 2 with capacity 500 (Gauss Minigun shape) → 250', () => {
    expect(shotsPerMagazine(gun({ capacity: 500, ammoPerShot: 2 }))).toBe(250);
  });

  it('ammoFreeChance 0.5 with capacity 10 → 20 (free ammo stretches effective capacity)', () => {
    expect(shotsPerMagazine(gun({ capacity: 10, ammoFreeChance: 0.5 }))).toBe(20);
  });

  it('stays in sync with sustainTiming.shotsPerMag (6-round mag)', () => {
    const weapon = gun({ capacity: 6 });
    expect(sustainTiming(weapon, 5).shotsPerMag).toBe(shotsPerMagazine(weapon));
  });

  it('stays in sync with sustainTiming.shotsPerMag (ammoFreeChance stretch)', () => {
    const weapon = gun({ capacity: 10, ammoFreeChance: 0.5 });
    expect(sustainTiming(weapon, 5).shotsPerMag).toBe(shotsPerMagazine(weapon));
  });
});

describe('computeSustain', () => {
  it('hand-computed cycle: 20-round mag, 5 shots/s, 2s reload, 100 dmg/hit', () => {
    const s = computeSustain(100, 5, gun());
    expect(s.burstDps).toBeCloseTo(500, 10);
    expect(s.shotsPerMag).toBe(20);
    expect(s.magDumpSec).toBeCloseTo(4, 10);
    expect(s.reloadSec).toBeCloseTo(2, 10);
    // 2000 damage over 6s cycle
    expect(s.sustainedDps).toBeCloseTo(2000 / 6, 10);
  });

  it('divides the reload animation by reload speed (Fixer: 3.2s / 1.1765)', () => {
    const s = computeSustain(100, 5, gun({ animationReloadSec: 3.2, reloadSpeed: 1.1765 }));
    expect(s.reloadSec).toBeCloseTo(3.2 / 1.1765, 10);
  });

  it('accounts for multi-ammo shots (Gauss Minigun style: 2 rounds/shot)', () => {
    const s = computeSustain(100, 5, gun({ capacity: 20, ammoPerShot: 2 }));
    expect(s.shotsPerMag).toBe(10);
    // 1000 damage over (2s dump + 2s reload)
    expect(s.sustainedDps).toBeCloseTo(250, 10);
  });

  it('single-shot weapons degenerate to 1 hit per (interval + reload)', () => {
    const s = computeSustain(100, 2, gun({ capacity: 1, animationReloadSec: 1.0 }));
    expect(s.shotsPerMag).toBe(1);
    // 100 damage over (0.5s + 1s)
    expect(s.sustainedDps).toBeCloseTo(100 / 1.5, 10);
  });

  it('no magazine (melee / capacity 0) sustains burst DPS', () => {
    const s = computeSustain(100, 2, gun({ capacity: 0, weaponClass: 'melee' }));
    expect(s.sustainedDps).toBeCloseTo(s.burstDps, 10);
    expect(s.reloadSec).toBe(0);
  });

  it('missing reload animation data behaves as a zero-cost reload', () => {
    const s = computeSustain(100, 5, gun({ animationReloadSec: undefined }));
    expect(s.sustainedDps).toBeCloseTo(s.burstDps, 10);
  });

  it('per-shell reloaders repeat the animation once per round (Lever Action shape: 1.77s × 6)', () => {
    const s = computeSustain(
      100,
      2,
      gun({ capacity: 6, animationReloadSec: 1.77, reloadPerShell: true }),
    );
    expect(s.reloadSec).toBeCloseTo(1.77 * 6, 10);
    // Control at the same capacity: a whole-magazine reload stays 1.77s.
    const control = computeSustain(100, 2, gun({ capacity: 6, animationReloadSec: 1.77 }));
    expect(control.reloadSec).toBeCloseTo(1.77, 10);
    expect(s.sustainedDps).toBeLessThan(control.sustainedDps);
  });

  it('per-shell reload time divides by the folded reload speed like any other', () => {
    const s = computeSustain(
      100,
      2,
      gun({ capacity: 6, animationReloadSec: 1.77, reloadPerShell: true, reloadSpeed: 1.3 }),
    );
    expect(s.reloadSec).toBeCloseTo((1.77 * 6) / 1.3, 10);
  });

  it('reloadSkipChance shortens reloadSec by (1 − chance)', () => {
    const base = computeSustain(100, 5, gun({ animationReloadSec: 2.0 }));
    const withSkip = computeSustain(
      100,
      5,
      gun({ animationReloadSec: 2.0, reloadSkipChance: 0.18 }),
    );
    expect(withSkip.reloadSec).toBeCloseTo(base.reloadSec * 0.82, 10);
    expect(withSkip.sustainedDps).toBeGreaterThan(base.sustainedDps);
  });

  it('ammoFreeChance stretches effective capacity and raises sustained DPS', () => {
    const base = computeSustain(100, 5, gun({ capacity: 20 }));
    const withFree = computeSustain(100, 5, gun({ capacity: 20, ammoFreeChance: 0.2 }));
    expect(withFree.shotsPerMag).toBe(25); // 20 / (1 − 0.2)
    expect(withFree.sustainedDps).toBeGreaterThan(base.sustainedDps);
  });

  it('melee/no-mag weapons ignore sustain chance fields', () => {
    const base = computeSustain(100, 2, gun({ capacity: 0, weaponClass: 'melee' }));
    const withChances = computeSustain(
      100,
      2,
      gun({ capacity: 0, weaponClass: 'melee', reloadSkipChance: 0.5, ammoFreeChance: 0.5 }),
    );
    expect(withChances).toEqual(base);
  });
});

describe('reloadSkipChanceBash — two-channel reload-skip model (Phase C)', () => {
  it('bash-only: costs bashAnimationSec instead of the real reload', () => {
    // reloadSec = (1-0) * ((1-0.5)*2.0 + 0.5*1.0) = 1.0 + 0.5 = 1.5
    const timing = sustainTiming(
      gun({ animationReloadSec: 2.0, reloadSkipChanceBash: 0.5 }),
      5,
      1.0,
    );
    expect(timing.reloadSec).toBeCloseTo(1.5, 10);
  });

  it('bash-only at bashAnimationSec=0 acts as a free instant skip, same shape as reloadSkipChance', () => {
    const bash = sustainTiming(gun({ animationReloadSec: 2.0, reloadSkipChanceBash: 0.4 }), 5, 0);
    const free = sustainTiming(gun({ animationReloadSec: 2.0, reloadSkipChance: 0.4 }), 5);
    expect(bash.reloadSec).toBeCloseTo(free.reloadSec, 10);
    expect(bash.reloadSec).toBeCloseTo(2.0 * 0.6, 10);
  });

  it('combines reloadSkipChance and reloadSkipChanceBash — free skip wins first', () => {
    // reloadSec = (1-0.2) * ((1-0.5)*2.0 + 0.5*1.0) = 0.8 * 1.5 = 1.2
    const timing = sustainTiming(
      gun({ animationReloadSec: 2.0, reloadSkipChance: 0.2, reloadSkipChanceBash: 0.5 }),
      5,
      1.0,
    );
    expect(timing.reloadSec).toBeCloseTo(1.2, 10);
  });

  it('bashAnimationSec=0 reproduces the old single-channel union formula EXACTLY', () => {
    const pFree = 0.2;
    const pBash = 0.5;
    const twoChannel = sustainTiming(
      gun({ animationReloadSec: 2.0, reloadSkipChance: pFree, reloadSkipChanceBash: pBash }),
      5,
      0,
    );
    // Old formula (pre-Phase-C): reloadSec = realReloadSec * (1 - union),
    // union = 1 - (1-pFree)(1-pBash).
    const union = 1 - (1 - pFree) * (1 - pBash);
    const oldFormula = 2.0 * (1 - union);
    expect(twoChannel.reloadSec).toBeCloseTo(oldFormula, 10);
    expect(twoChannel.reloadSec).toBeCloseTo(2.0 * (1 - pFree) * (1 - pBash), 10);
  });

  it('sustainTiming defaults bashAnimationSec to DEFAULT_BATTLE_LOADERS_BASH_SEC when omitted', () => {
    const omitted = sustainTiming(gun({ animationReloadSec: 2.0, reloadSkipChanceBash: 0.5 }), 5);
    const explicit = sustainTiming(
      gun({ animationReloadSec: 2.0, reloadSkipChanceBash: 0.5 }),
      5,
      DEFAULT_BATTLE_LOADERS_BASH_SEC,
    );
    expect(omitted.reloadSec).toBeCloseTo(explicit.reloadSec, 10);
  });

  it('computeSustain threads bashAnimationSec through to sustainTiming', () => {
    const s = computeSustain(
      100,
      5,
      gun({ animationReloadSec: 2.0, reloadSkipChanceBash: 0.5 }),
      1.0,
    );
    expect(s.reloadSec).toBeCloseTo(1.5, 10);
    expect(s.sustainedDps).toBeGreaterThan(0);
  });
});

describe('DEFAULT_BATTLE_LOADERS_BASH_SEC default-sync regression', () => {
  it('makeResolvedPlayer().battleLoadersBashSec stays in sync with DEFAULT_BATTLE_LOADERS_BASH_SEC (deliberate literal duplication — types/ stays a leaf)', () => {
    expect(makeResolvedPlayer().battleLoadersBashSec).toBe(DEFAULT_BATTLE_LOADERS_BASH_SEC);
  });
});
