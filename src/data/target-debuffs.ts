import type { PlayerInput } from '@/types';
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
 *
 * Taking One for the Team's flat DR debuff (esm-walk-confirmed 2026-07-14,
 * docs/assumptions.md "Resist mitigation" §3.3): the hidden companion perk
 * `LGN_TakingOneForTheTeam_DamageIncrease_Perk` bundles a Peak Value Modifier
 * DamageResist debuff (Detrimental, 10s, no Energy Resist component) onto the
 * target alongside its damage-taken-% bonus (`manual-uptime.ts`'s
 * `takingOneForTheTeamPct` — a SEPARATE ESM effect, different units: resist
 * points here, not a percentage). Ranks 1-4 → MGEF
 * `..._DamageIncrease_Effect01-04` (0x005A5DEF, 0x005B01AB, 0x005B01AC,
 * 0x005B01AD), magnitudes 6/10/15/50. The rank-4 jump (15→50, vs the ~20 an
 * arithmetic progression would predict) is flagged as a possible ESM
 * data-entry anomaly, not confirmed intentional — docs/assumptions.md
 * "Resist mitigation". Feeds the `armorPenFlat` bucket (flat resist points,
 * not `armorPen`'s fraction — see that bucket's doc comment,
 * src/types/modifiers.ts); `mitigation.ts` applies it to physical resist
 * only (the ESM's own scope).
 */
export const TENDERIZER_MAX_STACKS = 1000;

/** Rank 0 (off) through 4 → flat DamageResist debuff magnitude. Index = rank. */
const TAKING_ONE_FOR_THE_TEAM_DR_MAGNITUDES = [0, 6, 10, 15, 50] as const;
const TAKING_ONE_FOR_THE_TEAM_DR_MGEF_FORM_IDS = [
  '0x005A5DEF',
  '0x005B01AB',
  '0x005B01AC',
  '0x005B01AD',
] as const;

export function getTargetDebuffModifiers(
  conditions: Pick<PlayerInput, 'takingOneForTheTeamDrRank'>,
): Modifier[] {
  const modifiers: Modifier[] = [
    {
      id: 'target-debuff:Tenderizer',
      source: {
        kind: 'perk',
        formId: '0x003E21F4',
        edid: 'Tenderizer',
        name: 'Tenderizer',
        rank: 1,
      },
      bucket: 'dbm',
      op: 'ADD',
      value: 0.001,
      conditions: [{ kind: 'stacks', counter: 'tenderizer', max: TENDERIZER_MAX_STACKS }],
    },
  ];

  const drRank = conditions.takingOneForTheTeamDrRank ?? 0;
  if (drRank > 0) {
    modifiers.push({
      id: 'target-debuff:TakingOneForTheTeamDr',
      source: {
        kind: 'legendaryPerk',
        formId: TAKING_ONE_FOR_THE_TEAM_DR_MGEF_FORM_IDS[drRank - 1],
        edid: 'LGN_TakingOneForTheTeam_DamageIncrease_Perk',
        name: 'Taking One for the Team',
        rank: drRank,
      },
      bucket: 'armorPenFlat',
      op: 'ADD',
      value: TAKING_ONE_FOR_THE_TEAM_DR_MAGNITUDES[drRank],
      conditions: [],
    });
  }

  return modifiers;
}
