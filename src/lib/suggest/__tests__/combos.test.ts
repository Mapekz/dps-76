import { describe, it, expect } from 'bun:test';
import {
  makeBuildReducer,
  createDefaultBuildState,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';
import { allocationOf } from '@/lib/build-rules';
import { enumerateCombos } from '@/lib/suggest/combos';
import { comboCharts, evaluateSuggestions, TIED_THRESHOLD_PCT } from '@/lib/suggest/evaluate';
import { PerkId } from '@/data/perk-ids';

const buildReducer = makeBuildReducer('live');

function stateFrom(
  actions: BuildAction[],
  from: BuildState = createDefaultBuildState(),
): BuildState {
  return actions.reduce(buildReducer, from);
}

const PLASMA_CASTER = 'PlasmaCaster';
const THE_FIXER = 'CombatRifle_Fixer';
const GATLING_GUN = 'GatlingGun';
const FIXER_AUTO_RECEIVER = 'mod_CombatRifle_Receiver_Damage-Auto';
const FURIOUS_1STAR = 'mod_Legendary_Weapon1_DmgConsecutiveHits';
const CASTER_SNIPER_BARREL = 'mod_PlasmaCaster_Barrel_Sniper_Base';
const GATLING_EXTRA_MAG = 'mod_GatlingGun_Magazine_ExtraLarge';

const GUNSLINGER_EXPERT = PerkId.GunslingerExpert;
const GUNSLINGER_MASTER = PerkId.GunslingerMaster;
const GUERRILLA_EXPERT = PerkId.GuerrillaExpert;
const GUERRILLA_MASTER = PerkId.GuerrillaMaster;

function sniperCasterState(extra: BuildAction[] = []): BuildState {
  return stateFrom([
    { type: 'weapon/select', weaponId: PLASMA_CASTER },
    { type: 'weapon/mod', slot: 'ap_gun_Barrel', omodId: CASTER_SNIPER_BARREL },
    ...extra,
  ]);
}

function evaluatedCasterState(): BuildState {
  return stateFrom([
    { type: 'weapon/select', weaponId: PLASMA_CASTER },
    { type: 'weapon/mod', slot: 'ap_gun_Barrel', omodId: CASTER_SNIPER_BARREL },
    { type: 'special/set', stat: 'perception', value: 3 },
    { type: 'special/set', stat: 'agility', value: 4 },
  ]);
}

function fixerAutoState(): BuildState {
  return stateFrom([
    { type: 'weapon/select', weaponId: THE_FIXER },
    { type: 'weapon/mod', slot: 'ap_gun_Receiver', omodId: FIXER_AUTO_RECEIVER },
    { type: 'special/set', stat: 'perception', value: 3 },
    { type: 'special/set', stat: 'agility', value: 4 },
  ]);
}

describe('enumerateCombos', () => {
  describe('onslaught discovery', () => {
    it('discovers expected forward pieces on a clean sniper Plasma Caster', () => {
      const combos = enumerateCombos(sniperCasterState(), 'live', 'vats');
      const forward = combos.find((c) => c.id === 'combo:onslaught-forward');
      expect(forward).toBeDefined();
      expect(forward!.comboPieces).toEqual(
        expect.arrayContaining([
          `perk:${GUERRILLA_EXPERT}`,
          `perk:${GUERRILLA_MASTER}`,
          `perk:${GUNSLINGER_EXPERT}`,
          `omod:${FURIOUS_1STAR}`,
        ]),
      );
      expect(forward!.comboPieces).not.toContain(`perk:${GUNSLINGER_MASTER}`);
    });

    it('includes Gunslinger Master only in the reverse variant', () => {
      const combos = enumerateCombos(sniperCasterState(), 'live', 'vats');
      const forward = combos.find((c) => c.id === 'combo:onslaught-forward');
      const reverse = combos.find((c) => c.id === 'combo:onslaught-reverse');
      expect(reverse).toBeDefined();
      expect(reverse!.comboPieces).toContain(`perk:${GUNSLINGER_MASTER}`);
      expect(forward!.comboPieces).not.toContain(`perk:${GUNSLINGER_MASTER}`);
    });
  });

  describe('aggregate value (historical blindness case)', () => {
    it('surfaces Full Reverse Onslaught with a large positive delta when constituents chart ≈0', () => {
      const report = evaluateSuggestions(evaluatedCasterState(), 'live', 'vats');
      expect(report.baseline).not.toBeNull();

      const reverse = report.suggestions.find((s) => s.family === 'combo:onslaught-reverse');
      expect(reverse).toBeDefined();
      expect(reverse!.primaryDeltaPct).toBeGreaterThan(0.2);

      const furiousSingles = report.suggestions.filter(
        (s) => s.group === 'legendary' && s.id.endsWith(`:${FURIOUS_1STAR}`),
      );
      const gsmSingles = report.suggestions.filter(
        (s) => s.group === 'perk' && s.family === `perk:${GUNSLINGER_MASTER}`,
      );
      for (const s of [...furiousSingles, ...gsmSingles]) {
        expect(s.primaryDeltaPct).toBeLessThan(0.05);
      }
    });
  });

  describe('fast-weapon policy semantics', () => {
    it('comboCharts: door-closed / margin / positive on auto Fixer where Furious alone charts', () => {
      const report = evaluateSuggestions(fixerAutoState(), 'live', 'vats');
      const furious = report.suggestions.find(
        (s) => s.group === 'legendary' && s.id.endsWith(`:${FURIOUS_1STAR}`),
      );
      expect(furious).toBeDefined();
      expect(furious!.primaryDeltaPct).toBeGreaterThan(0.05);

      const bestConstituent = furious!.primaryDeltaPct;
      expect(comboCharts(bestConstituent, bestConstituent, 'door-closed')).toBe(false);
      expect(comboCharts(0.1, bestConstituent, 'door-closed')).toBe(false);
      expect(comboCharts(0.1, bestConstituent, 'margin')).toBe(false);
      expect(comboCharts(0.1, bestConstituent, 'positive')).toBe(true);
      expect(
        comboCharts(bestConstituent + TIED_THRESHOLD_PCT + 0.01, bestConstituent, 'margin'),
      ).toBe(true);
    });

    it('still surfaces the Onslaught bundle under the default positive policy', () => {
      const report = evaluateSuggestions(fixerAutoState(), 'live', 'vats');
      const onslaught = report.suggestions.find(
        (s) => s.group === 'combo' && s.family === 'combo:onslaught-forward',
      );
      expect(onslaught).toBeDefined();
      expect(onslaught!.primaryDeltaPct).toBeGreaterThan(0);
    });
  });

  describe('degenerate suppression', () => {
    it('does not emit a bundle when only one new piece remains', () => {
      const state = stateFrom([
        { type: 'weapon/select', weaponId: PLASMA_CASTER },
        { type: 'weapon/mod', slot: 'ap_gun_Barrel', omodId: CASTER_SNIPER_BARREL },
        { type: 'special/set', stat: 'perception', value: 3 },
        { type: 'special/set', stat: 'agility', value: 15 },
        { type: 'perk/add', perkId: GUERRILLA_EXPERT, rank: 3, legendary: false },
        { type: 'perk/add', perkId: GUERRILLA_MASTER, rank: 3, legendary: false },
        { type: 'perk/add', perkId: GUNSLINGER_EXPERT, rank: 3, legendary: false },
      ]);
      const combos = enumerateCombos(state, 'live', 'vats');
      expect(combos.find((c) => c.id === 'combo:onslaught-forward')).toBeUndefined();

      const onlyGsmMissing = stateFrom([
        { type: 'weapon/select', weaponId: PLASMA_CASTER },
        { type: 'weapon/mod', slot: 'ap_gun_Barrel', omodId: CASTER_SNIPER_BARREL },
        { type: 'special/set', stat: 'perception', value: 3 },
        { type: 'special/set', stat: 'agility', value: 15 },
        { type: 'weapon/legendary', slotIndex: 0, omodId: FURIOUS_1STAR },
        { type: 'perk/add', perkId: GUERRILLA_EXPERT, rank: 3, legendary: false },
        { type: 'perk/add', perkId: GUERRILLA_MASTER, rank: 3, legendary: false },
        { type: 'perk/add', perkId: GUNSLINGER_EXPERT, rank: 3, legendary: false },
      ]);
      const reverseOnlyGsm = enumerateCombos(onlyGsmMissing, 'live', 'vats');
      expect(reverseOnlyGsm.find((c) => c.id === 'combo:onslaught-reverse')).toBeUndefined();
    });
  });

  describe('metric gating', () => {
    it('omits crit-cadence when metric is freeAim', () => {
      const combos = enumerateCombos(sniperCasterState(), 'live', 'freeAim');
      expect(combos.some((c) => c.id === 'combo:crit-cadence')).toBe(false);
    });
  });

  describe('crit-cadence allocation piece', () => {
    it('includes a luck allocation piece and raises LCK when applied', () => {
      const state = stateFrom([
        { type: 'weapon/select', weaponId: PLASMA_CASTER },
        { type: 'special/set', stat: 'luck', value: 1 },
      ]);
      const combo = enumerateCombos(state, 'live', 'vats').find(
        (c) => c.id === 'combo:crit-cadence',
      );
      expect(combo).toBeDefined();
      expect(combo!.comboPieces).toContain('special:luck');
      expect(combo!.detail).toContain('LCK');
      expect(combo!.action.some((a) => a.type === 'special/set' && a.stat === 'luck')).toBe(true);

      const applied = stateFrom(combo!.action, state);
      expect(allocationOf(applied.player).luck).toBeGreaterThan(1);
      expect(applied.player.perks.some((p) => p.perkId === PerkId.BetterCriticals)).toBe(true);
      expect(
        applied.player.weapon?.legendaryEffects.some((e) => e === 'mod_Legendary_Weapon2_DmgCrits'),
      ).toBe(true);
    });
  });

  describe('bullet storm contributors', () => {
    it('includes Bullet Storm perk and a larger-magazine mod on a heavy gun', () => {
      const state = stateFrom([
        { type: 'weapon/select', weaponId: GATLING_GUN },
        { type: 'special/set', stat: 'strength', value: 3 },
      ]);
      const combo = enumerateCombos(state, 'live', 'vats').find(
        (c) => c.id === 'combo:bullet-storm',
      );
      expect(combo).toBeDefined();
      expect(combo!.comboPieces).toContain(`perk:${PerkId.BulletStorm}`);
      expect(combo!.comboPieces).toContain(`omod:${GATLING_EXTRA_MAG}`);
      expect(combo!.detail).toContain('Bullet Storm');
      expect(combo!.detail).toContain('Extra Large Magazine');
    });
  });

  describe('no-slot skip', () => {
    it('emits a bundle without weapon legendary pieces when all slots are full', () => {
      const state = stateFrom([
        { type: 'weapon/select', weaponId: PLASMA_CASTER },
        { type: 'weapon/mod', slot: 'ap_gun_Barrel', omodId: CASTER_SNIPER_BARREL },
        { type: 'weapon/legendary', slotIndex: 0, omodId: 'mod_Legendary_Weapon2_DmgCrits' },
        { type: 'weapon/legendary', slotIndex: 1, omodId: 'mod_Legendary_Weapon3_StatLuck' },
        { type: 'weapon/legendary', slotIndex: 2, omodId: 'mod_Legendary_Weapon3_CritSpeed' },
        { type: 'special/set', stat: 'perception', value: 3 },
        { type: 'special/set', stat: 'agility', value: 4 },
      ]);
      const forward = enumerateCombos(state, 'live', 'vats').find(
        (c) => c.id === 'combo:onslaught-forward',
      );
      expect(forward).toBeDefined();
      expect(forward!.comboPieces!.length).toBeGreaterThanOrEqual(2);
      expect(forward!.comboPieces).not.toContain(`omod:${FURIOUS_1STAR}`);
      expect(forward!.action.every((a) => a.type !== 'weapon/legendary')).toBe(true);
    });
  });
});
