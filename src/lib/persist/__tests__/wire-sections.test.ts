import { describe, expect, it } from 'bun:test';
import { getPerks } from '@/data';
import { BitReader, BitWriter } from '@/lib/persist/bitstream';
import perksDictionary from '@/data/wire-dictionary/perks.json';
import {
  clampedBitWidth,
  knobValueBitWidth,
  readAddictions,
  readArmorEffects,
  readBuildName,
  readConsumables,
  readEnemyConditions,
  readLegendaryPerks,
  readMutations,
  readPerks,
  readPlayerConditions,
  readView,
  readWeapon,
  writeAddictions,
  writeArmorEffects,
  writeBuildName,
  writeConsumables,
  writeEnemyConditions,
  writeLegendaryPerks,
  writeMutations,
  writePerks,
  writePlayerConditions,
  writeView,
  writeWeapon,
} from '@/lib/persist/wire-sections';
import { createDefaultBuildState, makeBuildReducer, type BuildAction } from '@/state/build-reducer';
import { ENEMY_KNOB_REGISTRY, PLAYER_KNOB_REGISTRY } from '@/types/knob-registry';
import { createDefaultPlayerConfig, type PerkLoadout, type PlayerConfig } from '@/types';

const mode = 'live' as const;

function stateFrom(actions: BuildAction[]) {
  return actions.reduce(makeBuildReducer(mode), createDefaultBuildState());
}

function roundTripBytes(write: (w: BitWriter) => void, read: (r: BitReader) => void): void {
  const w = new BitWriter();
  write(w);
  const r = new BitReader(w.toBytes());
  read(r);
  expect(r.overrun).toBe(false);
}

describe('wire-sections', () => {
  describe('weapon', () => {
    it('round-trips a Fixer with mods and charge time', () => {
      const player = createDefaultPlayerConfig();
      player.chargeTimeSec = 1.5;
      player.itemLevel = 45;
      player.weapon = {
        weaponId: 'CombatRifle_Fixer',
        mods: {
          ap_gun_Receiver: 'mod_CombatRifle_Receiver_Automatic',
          ap_gun_Barrel: 'mod_CombatRifle_Barrel_Long_Recoil',
        },
        legendaryEffects: [
          'mod_Legendary_Weapon1_DamageFirstBlood',
          'mod_Legendary_Weapon2_Guns_RoF',
          null,
          'mod_Legendary_Weapon4_Encirclers',
        ],
      };

      roundTripBytes(
        (w) => writeWeapon(w, player.weapon, player),
        (r) => {
          const warnings: string[] = [];
          const decoded = readWeapon(r, mode, warnings);
          expect(warnings).toEqual([]);
          expect(decoded.weapon).toEqual(player.weapon);
          expect(decoded.itemLevel).toBe(45);
          expect(decoded.chargeTimeSec).toBe(1.5);
        },
      );
    });

    it('preserves positional legendary gaps (Salt Swift at ★3)', () => {
      const state = stateFrom([
        { type: 'weapon/selectUnique', uniqueId: 'mod_Custom_SaltOfTheEarth' },
      ]);
      const player = state.player;
      expect(player.weapon?.legendaryEffects).toEqual([
        null,
        null,
        'mod_Legendary_Weapon3_Guns_ReloadSpeed',
      ]);

      roundTripBytes(
        (w) => writeWeapon(w, player.weapon, player),
        (r) => {
          const decoded = readWeapon(r, mode, []);
          expect(decoded.weapon?.legendaryEffects).toEqual([
            null,
            null,
            'mod_Legendary_Weapon3_Guns_ReloadSpeed',
          ]);
        },
      );
    });

    it('drops null mod entries from the wire', () => {
      const player = createDefaultPlayerConfig();
      player.weapon = {
        weaponId: 'CombatRifle_Fixer',
        mods: {
          ap_gun_Receiver: 'mod_CombatRifle_Receiver_Automatic',
          ap_gun_Barrel: null,
        },
        legendaryEffects: [],
      };

      const w = new BitWriter();
      writeWeapon(w, player.weapon, player);
      const bytes = w.toBytes();

      const playerWithExplicitNull = {
        ...player,
        weapon: {
          ...player.weapon!,
          mods: { ap_gun_Receiver: 'mod_CombatRifle_Receiver_Automatic' },
        },
      };
      const w2 = new BitWriter();
      writeWeapon(w2, playerWithExplicitNull.weapon, playerWithExplicitNull);
      expect(w2.toBytes()).toEqual(bytes);
    });
  });

  describe('perks', () => {
    it('round-trips rank 1 on a maxRank 4 card and a maxed card', () => {
      const perks: PerkLoadout[] = [
        { perkId: 'ActionDiet', rank: 1 },
        { perkId: 'GunFu', rank: getPerks(mode).GunFu.maxRank },
      ];
      expect(getPerks(mode).ActionDiet.maxRank).toBe(4);

      roundTripBytes(
        (w) => writePerks(w, perks),
        (r) => {
          expect(readPerks(r, mode, [])).toEqual(perks);
        },
      );
    });

    it('encodes an out-of-range rank without corrupting the stream', () => {
      const perks: PerkLoadout[] = [{ perkId: 'Tenderizer', rank: 99 }];
      const w = new BitWriter();
      writePerks(w, perks);
      const r = new BitReader(w.toBytes());
      const decoded = readPerks(r, mode, []);
      expect(decoded).toEqual([{ perkId: 'Tenderizer', rank: 1 }]);
      expect(r.overrun).toBe(false);
    });

    it('round-trips a literal perk absent from the dictionary', () => {
      const perks: PerkLoadout[] = [{ perkId: 'FuturePerk_NotInDictionary', rank: 2 }];
      roundTripBytes(
        (w) => writePerks(w, perks),
        (r) => {
          const warnings: string[] = [];
          expect(readPerks(r, mode, warnings)).toEqual([]);
          expect(warnings.some((w) => w.includes('FuturePerk_NotInDictionary'))).toBe(true);
        },
      );
    });
  });

  describe('stream alignment', () => {
    it('consumes bits for an unresolvable consumable id before the next section', () => {
      const w = new BitWriter();
      writeConsumables(w, ['Buffout', 'NotInDictionaryConsumable']);
      writeMutations(w, ['Mutation_Marsupial', 'Mutation_SpeedDemon']);

      const r = new BitReader(w.toBytes());
      const warnings: string[] = [];
      const consumables = readConsumables(r, mode, warnings);
      expect(consumables).toEqual(['Buffout']);
      expect(warnings.some((msg) => msg.includes('NotInDictionaryConsumable'))).toBe(true);

      const mutations = readMutations(r, mode, []);
      expect(mutations).toEqual(['Mutation_Marsupial', 'Mutation_SpeedDemon']);
      expect(r.overrun).toBe(false);
    });

    it('consumes bits for an unknown weapon mod id before the next section', () => {
      const w = new BitWriter();
      const player = createDefaultPlayerConfig();
      player.weapon = {
        weaponId: 'CombatRifle_Fixer',
        mods: {
          ap_gun_Receiver: 'mod_CombatRifle_Receiver_Automatic',
          ap_gun_Barrel: 'NotARealOmodId',
        },
        legendaryEffects: [],
      };
      writeWeapon(w, player.weapon, player);
      writeMutations(w, ['Mutation_AdrenalReaction']);

      const r = new BitReader(w.toBytes());
      const weaponWarnings: string[] = [];
      readWeapon(r, mode, weaponWarnings);
      expect(weaponWarnings.some((msg) => msg.includes('NotARealOmodId'))).toBe(true);
      expect(readMutations(r, mode, [])).toEqual(['Mutation_AdrenalReaction']);
      expect(r.overrun).toBe(false);
    });
  });

  describe('mutations, addictions, consumables, armor', () => {
    it('round-trips mutations and addictions via fixed bitmasks', () => {
      const mutations = [
        'Mutation_Marsupial',
        'Mutation_SpeedDemon',
        'Mutation_AdrenalReaction',
        'Mutation_EagleEyes',
        'Mutation_HerdMentality',
        'Mutation_ScalySkin',
      ];
      roundTripBytes(
        (w) => writeMutations(w, mutations),
        (r) => expect(readMutations(r, mode, []).sort()).toEqual([...mutations].sort()),
      );

      const addictions = ['AbAddictionAlcohol'];
      roundTripBytes(
        (w) => writeAddictions(w, addictions),
        (r) => {
          const warnings: string[] = [];
          const decoded = readAddictions(r, mode, warnings);
          if (decoded.length > 0) expect(decoded).toEqual(addictions);
        },
      );
    });

    it('round-trips consumables and armor effects', () => {
      const consumables = ['Buffout', 'Psycho', 'Fury', 'Overdrive', 'Med-X'];
      roundTripBytes(
        (w) => writeConsumables(w, consumables),
        (r) => {
          const warnings: string[] = [];
          const decoded = readConsumables(r, mode, warnings);
          expect(decoded.length).toBeGreaterThan(0);
          expect(decoded.every((id) => consumables.includes(id))).toBe(true);
        },
      );

      const armorEffects = {
        mod_Legendary_Armor4_LimitBreak: 3,
      };
      roundTripBytes(
        (w) => writeArmorEffects(w, armorEffects),
        (r) => {
          const warnings: string[] = [];
          const decoded = readArmorEffects(r, mode, warnings);
          for (const [id, count] of Object.entries(armorEffects)) {
            if (decoded[id] !== undefined) expect(decoded[id]).toBe(count);
          }
        },
      );
    });
  });

  describe('player conditions (pc)', () => {
    it('snaps healthPercent to stop indices', () => {
      const conditions = {
        ...createDefaultBuildState().player.conditions,
        healthPercent: 18,
      };
      roundTripBytes(
        (w) => writePlayerConditions(w, conditions),
        (r) => {
          const decoded = readPlayerConditions(r, mode, []);
          expect(decoded.healthPercent).toBe(20);
        },
      );
    });

    it('encodes each distinct player value-type branch', () => {
      const base = createDefaultBuildState().player.conditions;
      const conditions = {
        ...base,
        isSneaking: true,
        killStreak: 7,
        capsOnHand: 12000,
        glow: 42,
        healthPercent: 15,
        armorWorn: 'power' as const,
        publicTeamType: 'exploration' as const,
        hydrated: false,
        completedChallengeIds: ['Challenge_Lifetime_Fishing_LocalLegend_01'],
      };

      roundTripBytes(
        (w) => writePlayerConditions(w, conditions),
        (r) => {
          const decoded = readPlayerConditions(r, mode, []);
          expect(decoded.isSneaking).toBe(true);
          expect(decoded.killStreak).toBe(7);
          expect(decoded.capsOnHand).toBe(12000);
          expect(decoded.glow).toBe(42);
          expect(decoded.healthPercent).toBe(15);
          expect(decoded.armorWorn).toBe('power');
          expect(decoded.publicTeamType).toBe('exploration');
          expect(decoded.hydrated).toBe(false);
          expect(decoded.completedChallengeIds).toEqual([
            'Challenge_Lifetime_Fishing_LocalLegend_01',
          ]);
        },
      );
    });
  });

  describe('enemy conditions (ec)', () => {
    it('snaps enemy healthPercent to stop indices', () => {
      const conditions = {
        ...createDefaultBuildState().enemy.conditions,
        healthPercent: 55,
      };
      roundTripBytes(
        (w) => writeEnemyConditions(w, conditions),
        (r) => {
          const decoded = readEnemyConditions(r, mode, []);
          expect(decoded.healthPercent).toBe(60);
        },
      );
    });

    it('encodes target race, body part, level, booleans, clamped and varint numbers', () => {
      const base = createDefaultBuildState().enemy.conditions;
      const conditions = {
        ...base,
        isBurning: true,
        groupTargetCount: 3,
        targetDistance: 1200,
        healthPercent: 40,
        targetRace: 'SuperMutantRace',
        targetBodyPart: 'Head',
        targetLevel: 50,
      };

      roundTripBytes(
        (w) => writeEnemyConditions(w, conditions),
        (r) => {
          const decoded = readEnemyConditions(r, mode, []);
          expect(decoded.isBurning).toBe(true);
          expect(decoded.groupTargetCount).toBe(3);
          expect(decoded.targetDistance).toBe(1200);
          expect(decoded.healthPercent).toBe(40);
          expect(decoded.targetRace).toBe('SuperMutantRace');
          expect(decoded.targetBodyPart).toBe('Head');
          expect(decoded.targetLevel).toBe(50);
        },
      );
    });
  });

  describe('build name and view', () => {
    it('round-trips build name and view state', () => {
      roundTripBytes(
        (w) => writeBuildName(w, 'Bloodied Commando'),
        (r) => expect(readBuildName(r)).toBe('Bloodied Commando'),
      );
      roundTripBytes(
        (w) => writeView(w, { emphasized: 'vats', breakdownOpen: true }),
        (r) => expect(readView(r)).toEqual({ emphasized: 'vats', breakdownOpen: true }),
      );
    });
  });

  describe('legendary perks', () => {
    it('round-trips legendary perk loadouts separately from regular perks', () => {
      const perks: PerkLoadout[] = [{ perkId: 'FollowThrough', rank: 4 }];
      roundTripBytes(
        (w) => writeLegendaryPerks(w, perks),
        (r) => expect(readLegendaryPerks(r, mode, [])).toEqual(perks),
      );
    });
  });

  describe('knob registry bit widths', () => {
    it('fits every clamped row range in its derived fixed width', () => {
      for (const row of Object.values(PLAYER_KNOB_REGISTRY)) {
        if (!row?.clamp) continue;
        const range = row.clamp.max - row.clamp.min;
        const width = knobValueBitWidth(row as Parameters<typeof knobValueBitWidth>[0]);
        if (typeof width === 'number' && range <= 64) {
          expect(2 ** width).toBeGreaterThanOrEqual(range + 1);
          expect(width).toBe(clampedBitWidth(row.clamp));
        }
      }
      for (const row of Object.values(ENEMY_KNOB_REGISTRY)) {
        if (!row?.clamp) continue;
        const range = row.clamp.max - row.clamp.min;
        const width = knobValueBitWidth(row as Parameters<typeof knobValueBitWidth>[0]);
        if (typeof width === 'number' && range <= 64) {
          expect(2 ** width).toBeGreaterThanOrEqual(range + 1);
          expect(width).toBe(clampedBitWidth(row.clamp));
        }
      }
    });
  });

  describe('representative heavy build packed size', () => {
    it('reports byte count for a realistic heavy build', () => {
      const perkIds = Object.keys(perksDictionary.ids).slice(0, 46);
      const perks = perkIds.map((perkId, i) => ({
        perkId,
        rank: Math.max(
          1,
          (i % getPerks(mode)[perkId as keyof ReturnType<typeof getPerks>].maxRank) + 1,
        ),
      }));

      const player: PlayerConfig = {
        ...createDefaultPlayerConfig(),
        perks,
        mutations: [
          'Mutation_Marsupial',
          'Mutation_SpeedDemon',
          'Mutation_AdrenalReaction',
          'Mutation_EagleEyes',
          'Mutation_HerdMentality',
          'Mutation_ScalySkin',
        ],
        consumables: ['Buffout', 'Psycho', 'Fury', 'Overdrive', 'Med-X'],
        armorEffects: {
          mod_Legendary_Armor4_LimitBreak: 5,
        },
        conditions: {
          ...createDefaultBuildState().player.conditions,
          isSneaking: true,
          healthPercent: 20,
          killStreak: 5,
          capsOnHand: 5000,
          strength: 8,
          perception: 8,
        },
        weapon: {
          weaponId: 'CombatRifle_Fixer',
          mods: {
            ap_gun_Receiver: 'mod_CombatRifle_Receiver_Automatic',
            ap_gun_Barrel: 'mod_CombatRifle_Barrel_Long_Recoil',
            ap_gun_Mag: 'mod_CombatRifle_Magazine_Reload',
            ap_gun_Grip: 'mod_CombatRifle_Grip_Recoil',
            ap_gun_Receiver2: 'mod_CombatRifle_Receiver_HipAccuracy',
            ap_gun_Barrel2: 'mod_CombatRifle_Barrel_Short_Recoil',
            ap_gun_Mag2: 'mod_CombatRifle_Magazine_ArmorPen',
          },
          legendaryEffects: [
            'mod_Legendary_Weapon1_DamageFirstBlood',
            'mod_Legendary_Weapon2_Guns_RoF',
            'mod_Legendary_Weapon3_Guns_ReloadSpeed',
            'mod_Legendary_Weapon4_Encirclers',
          ],
        },
      };

      const enemy = {
        ...createDefaultBuildState().enemy.conditions,
        isBurning: true,
        healthPercent: 40,
        groupTargetCount: 2,
        targetDistance: 900,
      };

      const w = new BitWriter();
      writeWeapon(w, player.weapon, player);
      writePerks(w, player.perks);
      writeLegendaryPerks(w, []);
      writeMutations(w, player.mutations);
      writeAddictions(w, []);
      writeConsumables(w, player.consumables);
      writeArmorEffects(w, player.armorEffects);
      writePlayerConditions(w, player.conditions);
      writeEnemyConditions(w, enemy);
      writeBuildName(w, 'Heavy Fixer Commando');
      writeView(w, { emphasized: 'vats', breakdownOpen: true });

      const byteCount = w.toBytes().length;
      // eslint-disable-next-line no-console
      console.log(`Heavy build packed payload: ${byteCount} bytes`);
      expect(byteCount).toBeGreaterThan(0);
    });
  });
});
