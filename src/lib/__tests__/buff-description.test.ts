import { describe, it, expect } from 'vitest';
import { describeBuffModifiers } from '@/lib/buff-description';
import type { GeneratedBuff } from '@/types/generated';
import type { Modifier } from '@/types/modifiers';

const source: Modifier['source'] = { kind: 'consumable', formId: '0xTEST', edid: 'Test', name: 'Test' };

function buff(modifiers: Modifier[]): GeneratedBuff {
  return { id: 'Test', formId: '0xTEST', name: 'Test', kind: 'consumable', modifiers, notes: [] };
}

describe('describeBuffModifiers', () => {
  it('unconditional dbm reads as a plain damage percentage (Guns and Bullets 7)', () => {
    const mod: Modifier = { id: '0x1:0', source, bucket: 'dbm', op: 'ADD', value: 0.1, conditions: [] };
    expect(describeBuffModifiers(buff([mod]))).toBe('+10% damage');
  });

  it('SPECIAL bucket reads as a flat point add, not a percentage (Strength bobblehead)', () => {
    const mod: Modifier = { id: '0x2:0', source, bucket: 'specialStrength', op: 'ADD', value: 2, conditions: [] };
    expect(describeBuffModifiers(buff([mod]))).toBe('+2 Strength');
  });

  it('weaponKeyword present/absent pair reads as a class qualifier (Small Guns bobblehead)', () => {
    const mod: Modifier = {
      id: '0x3:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.2,
      conditions: [
        { kind: 'weaponKeyword', keyword: 'WeaponTypeBallistic', present: true },
        { kind: 'weaponKeyword', keyword: 'WeaponTypeHeavyGun', present: false },
      ],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe(
      '+20% damage (with ballistic weapons, non-heavy guns)'
    );
  });

  it('damageTypeScope reads as a damage-type qualifier (Explosive bobblehead)', () => {
    const mod: Modifier = {
      id: '0x4:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.3,
      conditions: [{ kind: 'damageTypeScope', types: ['explosive'] }],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+30% damage (explosive damage only)');
  });

  it('enemyType reads as a "vs X" qualifier (Astonishing Tales Mothman magazine)', () => {
    const mod: Modifier = {
      id: '0x5:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.15,
      conditions: [{ kind: 'enemyType', keywordOrRace: 'ActorTypeMothman' }],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+15% damage (vs the Mothman)');
  });

  it('an unresolved condition flags the bonus as currently inactive, not silently hidden', () => {
    const mod: Modifier = {
      id: '0x6:0',
      source,
      bucket: 'dbm',
      op: 'ADD',
      value: 0.5,
      conditions: [{ kind: 'unresolved', raw: 'OR-group[...]' }],
    };
    expect(describeBuffModifiers(buff([mod]))).toBe('+50% damage — not modeled yet, no effect');
  });

  it('a non-whole percentage keeps its decimal', () => {
    const mod: Modifier = { id: '0x8:0', source, bucket: 'dbm', op: 'ADD', value: 0.075, conditions: [] };
    expect(describeBuffModifiers(buff([mod]))).toBe('+7.5% damage');
  });

  it('an unmodeled bucket is omitted rather than guessed at', () => {
    const mod: Modifier = { id: '0x7:0', source, bucket: 'apRegen', op: 'ADD', value: 0.1, conditions: [] };
    expect(describeBuffModifiers(buff([mod]))).toBeNull();
  });

  it('no modifiers → null', () => {
    expect(describeBuffModifiers(buff([]))).toBeNull();
  });
});
