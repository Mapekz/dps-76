import { describe, it, expect } from 'vitest';
import type { Condition } from '@/types/modifiers';
import { getDataset } from '@/data/dataset';
import { getGeneratedPerk } from '@/data/perk-modifiers';
import type { PerkId } from '@/types';

/**
 * Census guard for the `moveSpeedBonus` bucket (AV SpeedMult → Fast Fighter's
 * reload-speed curve input). Any new SpeedMult source after a `bun run extract`
 * must be dispositioned here and in docs/move-speed-census.md — see
 * scripts/extract/normalize/mgef.ts SpeedMult route comment.
 */

type MoveSpeedDisposition = 'modeled' | 'excluded:non-player' | 'excluded:not-reachable';

interface MoveSpeedCensusEntry {
  formId: string;
  kind: 'perk' | 'mutation' | 'consumable';
  name: string;
  rank?: number;
  value: number | 'curve';
  conditions: Condition[];
  hasCard?: boolean;
  disposition: MoveSpeedDisposition;
}

/** Hand-maintained allowlist — one row per extracted `moveSpeedBonus` modifier. */
const EXPECTED_MOVE_SPEED_SOURCES: MoveSpeedCensusEntry[] = [
  // --- modeled (player-facing, feeds Fast Fighter when conditions match) ---
  {
    formId: '0x004DF1E0',
    kind: 'mutation',
    name: 'Speed Demon',
    value: 0.2,
    conditions: [{ kind: 'strangeInNumbers', value: false }],
    disposition: 'modeled',
  },
  {
    formId: '0x004DF1E0',
    kind: 'mutation',
    name: 'Speed Demon',
    value: 0.25,
    conditions: [{ kind: 'strangeInNumbers', value: true }],
    disposition: 'modeled',
  },
  {
    formId: '0x008B33D5',
    kind: 'consumable',
    name: 'Wasteland Fish Sandwich',
    value: 0.2,
    conditions: [],
    disposition: 'modeled',
  },
  {
    formId: '0x0025A7A9',
    kind: 'perk',
    name: 'Gun Runner',
    rank: 1,
    value: 0.1,
    conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeRanged', present: true }],
    hasCard: true,
    disposition: 'modeled',
  },
  {
    formId: '0x0025A7A9',
    kind: 'perk',
    name: 'Gun Runner',
    rank: 2,
    value: 0.2,
    conditions: [{ kind: 'weaponKeyword', keyword: 'WeaponTypeRanged', present: true }],
    hasCard: true,
    disposition: 'modeled',
  },
  {
    formId: '0x00310BF9',
    kind: 'perk',
    name: 'Portable Power',
    rank: 1,
    value: 0.1,
    conditions: [{ kind: 'inPowerArmor', value: true }],
    hasCard: true,
    disposition: 'modeled',
  },
  {
    formId: '0x00310BF9',
    kind: 'perk',
    name: 'Portable Power',
    rank: 2,
    value: 0.2,
    conditions: [{ kind: 'inPowerArmor', value: true }],
    hasCard: true,
    disposition: 'modeled',
  },
  {
    formId: '0x00310BF9',
    kind: 'perk',
    name: 'Portable Power',
    rank: 3,
    value: 0.3,
    conditions: [{ kind: 'inPowerArmor', value: true }],
    hasCard: true,
    disposition: 'modeled',
  },
  {
    formId: '0x0038AB94',
    kind: 'perk',
    name: 'Squad Maneuvers',
    rank: 1,
    value: 0.1,
    conditions: [{ kind: 'teammateCount', count: 1, orMore: true }],
    hasCard: true,
    disposition: 'modeled',
  },
  {
    formId: '0x0038AB94',
    kind: 'perk',
    name: 'Squad Maneuvers',
    rank: 2,
    value: 0.2,
    conditions: [{ kind: 'teammateCount', count: 1, orMore: true }],
    hasCard: true,
    disposition: 'modeled',
  },
  // --- excluded (present in extracted data but must not reach the player fold) ---
  {
    formId: '0x00661FDF',
    kind: 'perk',
    name: 'Nuka Swift Perk',
    rank: 1,
    value: 2,
    conditions: [],
    hasCard: false,
    disposition: 'excluded:not-reachable',
  },
  {
    formId: '0x005A2637',
    kind: 'perk',
    name: 'WL006_SentryBotMovementSpeedPerk',
    rank: 1,
    value: -0.4,
    conditions: [],
    hasCard: false,
    disposition: 'excluded:non-player',
  },
];

type CollectedEntry = Omit<MoveSpeedCensusEntry, 'disposition'>;

function censusSortKey(e: CollectedEntry): string {
  return [e.formId, e.rank ?? 0, e.value, JSON.stringify(e.conditions)].join('\0');
}

function collectMoveSpeedSources(): CollectedEntry[] {
  const dataset = getDataset('live');
  const hits: CollectedEntry[] = [];

  for (const perk of dataset.perks) {
    for (const rankEntry of perk.ranks) {
      for (const mod of rankEntry.modifiers) {
        if (mod.bucket !== 'moveSpeedBonus') continue;
        hits.push({
          formId: mod.source.formId,
          kind: 'perk',
          name: mod.source.name,
          rank: mod.source.rank,
          value: 'curve' in mod && mod.curve ? 'curve' : mod.value,
          conditions: mod.conditions,
          hasCard: perk.hasCard,
        });
      }
    }
  }

  for (const mutation of dataset.mutations) {
    for (const mod of mutation.modifiers) {
      if (mod.bucket !== 'moveSpeedBonus') continue;
      hits.push({
        formId: mod.source.formId,
        kind: 'mutation',
        name: mod.source.name,
        value: 'curve' in mod && mod.curve ? 'curve' : mod.value,
        conditions: mod.conditions,
      });
    }
  }

  for (const consumable of dataset.consumables) {
    for (const mod of consumable.modifiers) {
      if (mod.bucket !== 'moveSpeedBonus') continue;
      hits.push({
        formId: mod.source.formId,
        kind: 'consumable',
        name: mod.source.name,
        value: 'curve' in mod && mod.curve ? 'curve' : mod.value,
        conditions: mod.conditions,
      });
    }
  }

  return hits.sort((a, b) => censusSortKey(a).localeCompare(censusSortKey(b)));
}

function expectedCollected(): CollectedEntry[] {
  return EXPECTED_MOVE_SPEED_SOURCES.map(
    (e): CollectedEntry => ({
      formId: e.formId,
      kind: e.kind,
      name: e.name,
      rank: e.rank,
      value: e.value,
      conditions: e.conditions,
      hasCard: e.hasCard,
    }),
  ).sort((a, b) => censusSortKey(a).localeCompare(censusSortKey(b)));
}

describe('moveSpeedBonus census (live dataset)', () => {
  it('matches the hand-maintained allowlist — new SpeedMult sources fail CI', () => {
    expect(collectMoveSpeedSources()).toEqual(expectedCollected());
  });

  it('keeps excluded perk formIds out of the selectable PerkId registry', () => {
    const excludedFormIds = new Set(
      EXPECTED_MOVE_SPEED_SOURCES.filter((e) => e.disposition.startsWith('excluded:')).map(
        (e) => e.formId,
      ),
    );
    const registry = getDataset('live').perkRegistry;
    for (const perkId of Object.keys(registry) as PerkId[]) {
      const generated = getGeneratedPerk('live', perkId);
      if (!generated) continue;
      for (const formId of generated.formIds) {
        expect(excludedFormIds.has(formId), `${perkId} → ${formId}`).toBe(false);
      }
    }
  });
});
