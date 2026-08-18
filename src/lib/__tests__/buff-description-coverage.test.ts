/**
 * CI gate: every condition keyword in consumables/perks/omods/mutations must
 * have a curated label in WEAPON_KEYWORD_LABELS or ENEMY_KEYWORD_LABELS — same
 * philosophy as the wire-dictionary staleness test (a future `bun run extract`
 * that introduces an unmapped keyword must fail here).
 */
import { describe, it, expect } from 'bun:test';
import consumables from '@/data/live/generated/consumables.json';
import perks from '@/data/live/generated/perks.json';
import omods from '@/data/live/generated/omods.json';
import mutations from '@/data/live/generated/mutations.json';
import { buffValueOverrides } from '@/data/overrides/buff-overrides';
import {
  ENEMY_KEYWORD_LABELS,
  isWeaponFlavoredKeyword,
  WEAPON_KEYWORD_LABELS,
} from '@/lib/buff-description';
import type { Modifier } from '@/types/modifiers';

type BuffRecord = { name: string; modifiers: Modifier[] };

type PerkFamily = {
  name: string;
  ranks: Array<{ modifiers: Modifier[] }>;
};

function flattenPerkModifiers(perk: PerkFamily): Modifier[] {
  return perk.ranks.flatMap((r) => r.modifiers);
}

const DATASETS: Array<{ file: string; getRecords: () => BuffRecord[] }> = [
  {
    file: 'consumables.json',
    getRecords: () => consumables as BuffRecord[],
  },
  {
    file: 'perks.json',
    getRecords: () =>
      (perks as PerkFamily[]).map((p) => ({
        name: p.name,
        modifiers: flattenPerkModifiers(p),
      })),
  },
  {
    file: 'omods.json',
    getRecords: () => omods as BuffRecord[],
  },
  {
    file: 'mutations.json',
    getRecords: () => mutations as BuffRecord[],
  },
];

function collectKeywords(modifiers: readonly Modifier[]): string[] {
  const keywords: string[] = [];
  for (const m of modifiers) {
    for (const c of m.conditions) {
      switch (c.kind) {
        case 'weaponKeyword':
          keywords.push(c.keyword);
          break;
        case 'weaponKeywordAny':
          keywords.push(...c.keywords);
          break;
        case 'enemyType':
          keywords.push(c.keywordOrRace);
          break;
        case 'enemyTypeAny':
          keywords.push(...c.keywordsOrRaces);
          break;
        default:
          break;
      }
    }
  }
  return keywords;
}

describe('buff-description keyword label coverage', () => {
  it('every condition keyword in generated buff datasets has a curated label', () => {
    const misses: string[] = [];

    for (const { file, getRecords } of DATASETS) {
      for (const record of getRecords()) {
        for (const keyword of collectKeywords(record.modifiers)) {
          const labeled = isWeaponFlavoredKeyword(keyword)
            ? WEAPON_KEYWORD_LABELS[keyword] !== undefined
            : ENEMY_KEYWORD_LABELS[keyword] !== undefined;
          if (!labeled) {
            misses.push(`${file} → ${record.name} → ${keyword}`);
          }
        }
      }
    }

    for (const [id, modifiers] of Object.entries(buffValueOverrides)) {
      for (const keyword of collectKeywords(modifiers)) {
        const labeled = isWeaponFlavoredKeyword(keyword)
          ? WEAPON_KEYWORD_LABELS[keyword] !== undefined
          : ENEMY_KEYWORD_LABELS[keyword] !== undefined;
        if (!labeled) {
          misses.push(`buff-overrides.ts → ${id} → ${keyword}`);
        }
      }
    }

    expect(
      misses,
      misses.length > 0
        ? `Unmapped condition keywords (add to WEAPON_KEYWORD_LABELS or ENEMY_KEYWORD_LABELS):\n${misses.join('\n')}`
        : undefined,
    ).toEqual([]);
  });
});
