import type { PerkLoadout, PlayerConditions } from '@/types';
import type { Modifier } from '@/types/modifiers';

/**
 * Follow Through / Taking One for the Team: manual uptime sliders folding to
 * one `wholeDamage` ADD modifier each when the legendary card is equipped.
 * Real per-rank magnitude is 10/20/30/40% (esm-walk-confirmed), but both are
 * conditional 10s-window procs, not steady-state-computable — the slider is
 * the player's own uptime assumption, independent of card rank
 * (docs/assumptions.md).
 *
 * `activeManualUptimePerks` is the one equipped-card predicate, shared by
 * `resolveLoadout` (loadout.ts, decides whether to fold a modifier) and
 * `ConditionsSection.tsx` (decides whether to show the slider) — previously
 * written twice as a string-literal `.some(p => p.perkId === '...')` check in
 * each file, which could drift into a visible slider that folds nothing, or a
 * folded modifier with no control to set it.
 */

const MANUAL_UPTIME_PERKS = {
  FollowThrough: {
    perkId: 'FollowThrough',
    formId: '0x005A5D69',
    edid: 'LGN_FollowThrough_Perk',
    name: 'Follow Through',
    conditionKey: 'followThroughPct',
  },
  TakingOneForTheTeam: {
    perkId: 'TakingOneForTheTeam',
    formId: '0x005A59C7',
    edid: 'LGN_TakingOneForTheTeam_Perk',
    name: 'Taking One for the Team',
    conditionKey: 'takingOneForTheTeamPct',
  },
} as const satisfies Record<string, { perkId: string; formId: string; edid: string; name: string; conditionKey: keyof PlayerConditions }>;

export type ManualUptimePerkKey = keyof typeof MANUAL_UPTIME_PERKS;

/** Which manual-uptime legendary cards are equipped — the slider-visibility gate ConditionsSection.tsx reads. */
export function activeManualUptimePerks(legendaryPerks: PerkLoadout[]): Record<ManualUptimePerkKey, boolean> {
  const equipped = new Set(legendaryPerks.map(p => p.perkId));
  return {
    FollowThrough: equipped.has(MANUAL_UPTIME_PERKS.FollowThrough.perkId),
    TakingOneForTheTeam: equipped.has(MANUAL_UPTIME_PERKS.TakingOneForTheTeam.perkId),
  };
}

/** The wholeDamage ADD modifiers for whichever manual-uptime cards are both equipped and dialed above 0%. */
export function getManualUptimeModifiers(legendaryPerks: PerkLoadout[], conditions: PlayerConditions): Modifier[] {
  const active = activeManualUptimePerks(legendaryPerks);
  const modifiers: Modifier[] = [];
  for (const key of Object.keys(MANUAL_UPTIME_PERKS) as ManualUptimePerkKey[]) {
    if (!active[key]) continue;
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
