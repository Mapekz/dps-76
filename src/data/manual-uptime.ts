import type { PlayerConditions } from '@/types';
import type { Modifier } from '@/types/modifiers';

/**
 * Follow Through / Taking One for the Team: manual damage-multiplier toggles
 * folding to one `wholeDamage` ADD modifier each. Real per-rank magnitude is
 * 10/20/30/40% (esm-walk-confirmed), but both are conditional 10s-window
 * procs, not steady-state-computable — the toggle is the player's own
 * assumption of the debuff's active magnitude, independent of card rank
 * (docs/assumptions.md).
 *
 * Applied UNCONDITIONALLY, like Tenderizer (`@/data/target-debuffs`): any
 * player's card can have placed the debuff on the target, so it never gates
 * on the user's own legendary-perk selection. That selector stays useful for
 * build-completeness bookkeeping, just not as a gate here.
 */

const MANUAL_UPTIME_PERKS = {
  FollowThrough: {
    formId: '0x005A5D69',
    edid: 'LGN_FollowThrough_Perk',
    name: 'Follow Through',
    conditionKey: 'followThroughPct',
  },
  TakingOneForTheTeam: {
    formId: '0x005A59C7',
    edid: 'LGN_TakingOneForTheTeam_Perk',
    name: 'Taking One for the Team',
    conditionKey: 'takingOneForTheTeamPct',
  },
} as const satisfies Record<
  string,
  { formId: string; edid: string; name: string; conditionKey: keyof PlayerConditions }
>;

export type ManualUptimePerkKey = keyof typeof MANUAL_UPTIME_PERKS;

/** The wholeDamage ADD modifiers for whichever manual damage-multiplier toggles are dialed above 0%. */
export function getManualUptimeModifiers(conditions: PlayerConditions): Modifier[] {
  const modifiers: Modifier[] = [];
  for (const key of Object.keys(MANUAL_UPTIME_PERKS) as ManualUptimePerkKey[]) {
    const card = MANUAL_UPTIME_PERKS[key];
    const pct = (conditions[card.conditionKey] as number | undefined) ?? 0;
    if (pct <= 0) continue;
    modifiers.push({
      id: `manual:${key}`,
      source: { kind: 'legendaryPerk', formId: card.formId, edid: card.edid, name: card.name },
      bucket: 'wholeDamage',
      op: 'ADD',
      value: pct / 100,
      conditions: [],
    });
  }
  return modifiers;
}
