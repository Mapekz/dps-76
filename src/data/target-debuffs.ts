import type { Modifier } from '@/types/modifiers';

/**
 * Debuffs that live on the TARGET, not the player's build — anyone's attack
 * can have applied them, so they are never gated on the player's own equipped
 * cards. Emitted unconditionally by loadout assembly; each modifier's stack
 * condition returns null at 0 stacks, so they are inert until the Target
 * panel says otherwise.
 *
 * Tenderizer (2026-07-15 esm-walk): PERK Tenderizer01 0x003E21F4 applies
 * PerkTenderizer01Spell 0x003E21F8 on hit → MGEF PerkTenderizerDebuffEffect
 * 0x003E21F7, a Value Modifier on the percent-scaled DamageRecieved engine AV
 * with magnitude 0.1 → +0.1% damage taken per stack. Scale calibration: the
 * legacy zzz_ rank 2/3 spells reuse the MGEF at magnitudes 7/10, matching
 * their "receive 7%/10% more damage" descriptions; the orphaned script-side
 * path (Tenderizer_TargetDebuff 0x003E21F6, 1 + 0.01 × AV) yields the same
 * 0.1% per stack. The +100% cap (1000 stacks) is user-spec/community, not
 * ESM-visible — docs/assumptions.md "Tenderizer".
 */
export function getTargetDebuffModifiers(): Modifier[] {
  return [
    {
      id: 'target-debuff:Tenderizer',
      source: { kind: 'perk', formId: '0x003E21F4', edid: 'Tenderizer', name: 'Tenderizer', rank: 1 },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.001,
      conditions: [{ kind: 'stacks', counter: 'tenderizer', max: 1000 }],
    },
  ];
}
