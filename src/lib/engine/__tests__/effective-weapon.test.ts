import { describe, it, expect } from 'vitest';
import { getWeapons } from '@/data';
import { getOmodById, getOmodSlots } from '@/data/omods';
import { buildEffectiveWeapon } from '@/lib/engine/effective-weapon';
import { computeScenarios } from '@/lib/engine/scenarios';
import { createDefaultEnemyConditions, createDefaultPlayerConditions } from '@/types';

// Phase 5 milestone: Powerful Automatic Receiver on The Fixer gives
// +0.25 dbm, SET Speed 0.8248, automatic fire, and MUL_ADD −20% crit/sneak base.

describe('buildEffectiveWeapon with real OMOD data', () => {
  const fixer = getWeapons('live')['CombatRifle_Fixer'];
  const receiver = getOmodById('live', 'mod_CombatRifle_Receiver_Damage-Auto')!;

  it('the receiver is offered in the Fixer receiver slot', () => {
    const slots = getOmodSlots('live', fixer);
    const receiverSlot = slots.find(s => s.slot === 'ap_gun_Receiver');
    expect(receiverSlot?.options.some(o => o.id === receiver.id)).toBe(true);
    // Cosmetic and legendary slots are hidden from the standard picker.
    expect(slots.some(s => /legendary|customName|Appearance|Description/i.test(s.slot))).toBe(false);
  });

  it('rewrites speed/automatic state and merges keywords', () => {
    const { weapon } = buildEffectiveWeapon(fixer, [receiver]);
    expect(weapon.speed).toBeCloseTo(0.8248, 4);
    expect(weapon.isAutomatic).toBe(true);
    expect(weapon.keywords).toContain('WeaponTypeAutomatic');
  });

  it('feeds −30% base damage, +25% dbm, and −20% crit/sneak base through the engine', () => {
    const base = {
      mode: 'live' as const,
      itemLevel: 50,
      player: createDefaultPlayerConditions(),
      enemy: createDefaultEnemyConditions(),
      weakpointMult: 2.0,
    };
    const stock = computeScenarios({ ...base, weapon: fixer, modifiers: [], critRate: 0 });
    const { weapon, modifiers } = buildEffectiveWeapon(fixer, [receiver]);
    const modded = computeScenarios({ ...base, weapon, modifiers, critRate: 0 });

    // AttackDamage MUL_ADD −0.3 scales base BEFORE dbm: 103 × 0.7 × 1.25 = 90.125
    expect(modded.manualAim.perHit.total).toBeCloseTo(stock.manualAim.perHit.total * 0.7 * 1.25, 5);

    // crit-weighted VATS: crit mult = 2.0 × 0.8 = 1.6 → crit term +0.6
    const critted = computeScenarios({ ...base, weapon, modifiers, critRate: 1 });
    const perHitNoCrit = modded.vats.perHit.total;
    expect(critted.vats.perHit.total / perHitNoCrit).toBeCloseTo((1.25 + 0.6) / 1.25, 6);

    // automatic receiver: fire rate = 0.8248 / 0.11 ≈ 7.5
    expect(modded.vats.fireRate).toBeCloseTo(0.8248 / 0.11, 3);
  });
});
