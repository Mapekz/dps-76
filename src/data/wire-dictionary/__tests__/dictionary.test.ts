import { describe, it, expect } from 'bun:test';
import type { GameMode } from '@/types';
import type { Condition, Modifier } from '@/types/modifiers';
import type { WireDomain } from '@/data/wire-dictionary';
import { wireIndexForId, wireIdForIndex } from '@/data/wire-dictionary';
import { getWeapons, getPerks } from '@/data';
import { getDataset } from '@/data/dataset';
import { getArmorEffects } from '@/data/armor-modifiers';
import { getMutations, getConsumables, getAddictions } from '@/data/buffs';
import addictions from '@/data/wire-dictionary/addictions.json';
import armorEffects from '@/data/wire-dictionary/armor-effects.json';
import attachPoints from '@/data/wire-dictionary/attach-points.json';
import challengeIds from '@/data/wire-dictionary/challenge-ids.json';
import consumables from '@/data/wire-dictionary/consumables.json';
import mutations from '@/data/wire-dictionary/mutations.json';
import omods from '@/data/wire-dictionary/omods.json';
import perks from '@/data/wire-dictionary/perks.json';
import targetBodyParts from '@/data/wire-dictionary/target-body-parts.json';
import targetRaces from '@/data/wire-dictionary/target-races.json';
import weapons from '@/data/wire-dictionary/weapons.json';
import type { WireDictionary as WireDictionaryShape } from '@/data/wire-dictionary/types';

const MODES: GameMode[] = ['live', 'pts'];

const dictionaries: Record<WireDomain, WireDictionaryShape> = {
  weapon: weapons,
  omod: omods,
  attachPoint: attachPoints,
  armorEffect: armorEffects,
  perk: perks,
  mutation: mutations,
  consumable: consumables,
  addiction: addictions,
  targetRace: targetRaces,
  targetBodyPart: targetBodyParts,
  challengeId: challengeIds,
};

function collectChallengeIds(mods: readonly Modifier[]): Set<string> {
  const out = new Set<string>();
  const walk = (conds: readonly Condition[]) => {
    for (const c of conds) {
      if (c.kind === 'lifetimeChallengeCompleted') out.add(c.challengeId);
    }
  };
  for (const m of mods) walk(m.conditions);
  return out;
}

function unionSets(...sets: ReadonlySet<string>[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) for (const id of s) out.add(id);
  return out;
}

describe('wire dictionary self-consistency', () => {
  for (const [domain, dict] of Object.entries(dictionaries) as Array<
    [WireDomain, WireDictionaryShape]
  >) {
    describe(domain, () => {
      it('has valid integers and unique values below nextIndex', () => {
        const values = Object.values(dict.ids);
        expect(values.every((v) => Number.isInteger(v) && v >= 0)).toBe(true);
        expect(new Set(values).size).toBe(values.length);
        for (const v of values) expect(v).toBeLessThan(dict.nextIndex);
      });

      it('has no acknowledgedRemovals that are still keys in ids', () => {
        for (const id of dict.acknowledgedRemovals) {
          expect(dict.ids[id], id).toBeUndefined();
        }
      });
    });
  }
});

describe('wire dictionary coverage', () => {
  it('covers every visible weapon id', () => {
    const ids = unionSets(...MODES.map((mode) => new Set(Object.keys(getWeapons(mode)))));
    for (const id of ids) expect(wireIndexForId('weapon', id), id).toBeDefined();
  });

  it('covers every omod id', () => {
    const ids = unionSets(
      ...MODES.map((mode) => new Set(getDataset(mode).omods.map((o) => o.id))),
    );
    for (const id of ids) expect(wireIndexForId('omod', id), id).toBeDefined();
  });

  it('covers every attach point edid', () => {
    const ids = unionSets(
      ...MODES.map(
        (mode) => new Set(getDataset(mode).omods.map((o) => o.attachPointEdid)),
      ),
    );
    for (const id of ids) expect(wireIndexForId('attachPoint', id), id).toBeDefined();
  });

  it('covers every armor effect id', () => {
    const ids = unionSets(
      ...MODES.map((mode) => new Set(getArmorEffects(mode).map((e) => e.id))),
    );
    for (const id of ids) expect(wireIndexForId('armorEffect', id), id).toBeDefined();
  });

  it('covers every perk id', () => {
    const ids = unionSets(...MODES.map((mode) => new Set(Object.keys(getPerks(mode)))));
    for (const id of ids) expect(wireIndexForId('perk', id), id).toBeDefined();
  });

  it('covers every mutation id', () => {
    const ids = unionSets(
      ...MODES.map((mode) => new Set(getMutations(mode).map((m) => m.id))),
    );
    for (const id of ids) expect(wireIndexForId('mutation', id), id).toBeDefined();
  });

  it('covers every consumable id', () => {
    const ids = unionSets(
      ...MODES.map((mode) => new Set(getConsumables(mode).map((c) => c.id))),
    );
    for (const id of ids) expect(wireIndexForId('consumable', id), id).toBeDefined();
  });

  it('covers every addiction id', () => {
    const ids = unionSets(
      ...MODES.map((mode) => new Set(getAddictions(mode).map((a) => a.id))),
    );
    for (const id of ids) expect(wireIndexForId('addiction', id), id).toBeDefined();
  });

  it('covers every target race id', () => {
    const ids = unionSets(
      ...MODES.map((mode) => new Set(getDataset(mode).bodyPartRaces.map((r) => r.id))),
    );
    for (const id of ids) expect(wireIndexForId('targetRace', id), id).toBeDefined();
  });

  it('covers every target body part name', () => {
    const ids = unionSets(
      ...MODES.map(
        (mode) =>
          new Set(
            getDataset(mode).bodyPartRaces.flatMap((r) => r.parts.map((p) => p.name)),
          ),
      ),
    );
    for (const id of ids) expect(wireIndexForId('targetBodyPart', id), id).toBeDefined();
  });

  it('covers every challenge id on modifier conditions', () => {
    const ids = new Set<string>();
    for (const mode of MODES) {
      const ds = getDataset(mode);
      for (const o of ds.omods) collectChallengeIds(o.modifiers).forEach((id) => ids.add(id));
      for (const o of ds.armorOmods) collectChallengeIds(o.modifiers).forEach((id) => ids.add(id));
      for (const perk of ds.perks) {
        for (const rank of perk.ranks) {
          collectChallengeIds(rank.modifiers).forEach((id) => ids.add(id));
        }
      }
      for (const m of ds.mutations) collectChallengeIds(m.modifiers).forEach((id) => ids.add(id));
      for (const c of ds.consumables) collectChallengeIds(c.modifiers).forEach((id) => ids.add(id));
    }
    for (const id of ids) expect(wireIndexForId('challengeId', id), id).toBeDefined();
  });
});

describe('wire dictionary pinned anchors', () => {
  const anchors: Array<[WireDomain, string, number]> = [
    ['weapon', 'CombatRifle_Fixer', 28],
    ['omod', 'mod_CombatRifle_Receiver_Damage', 1048],
    ['omod', 'mod_Legendary_Weapon2_DmgCrits', 1633],
    ['attachPoint', 'ap_gun_Receiver', 26],
    ['armorEffect', 'mod_Legendary_Armor1_LowHealthIncreasesStats', 43],
    ['perk', 'BloodyMess', 29],
    ['perk', 'GunFu', 107],
    ['mutation', 'Mutation_AdrenalReaction', 0],
    ['consumable', 'Buffout', 68],
    ['addiction', 'AbAddictionAlcohol', 0],
    ['targetRace', 'HumanRace', 50],
    ['targetBodyPart', 'Head', 10],
    [
      'challengeId',
      'Challenge_Lifetime_CraftScrap_Weapon_Tiers_Ranged_Pistols_Pipe',
      1,
    ],
  ];

  for (const [domain, id, index] of anchors) {
    it(`${domain}: ${id} → ${index}`, () => {
      expect(wireIndexForId(domain, id)).toBe(index);
      expect(wireIdForIndex(domain, index)).toBe(id);
    });
  }
});
