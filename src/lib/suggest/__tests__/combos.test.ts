import { describe, it, expect } from 'bun:test';
import {
  makeBuildReducer,
  createDefaultBuildState,
  type BuildAction,
  type BuildState,
} from '@/state/build-reducer';
import { enumerateCombos } from '@/lib/suggest/combos';
import { enumerateVariants } from '@/lib/suggest/variants';
import { evaluateSuggestions } from '@/lib/suggest/evaluate';
import { PerkId } from '@/data/perk-ids';

const buildReducer = makeBuildReducer('live');

function stateFrom(
  actions: BuildAction[],
  from: BuildState = createDefaultBuildState(),
): BuildState {
  return actions.reduce(buildReducer, from);
}

// Real weapon and legendary IDs (verified from generated data)
const PLASMA_CASTER = 'PlasmaCaster';
const THE_FIXER = 'CombatRifle_Fixer';
const FIXER_AUTO_RECEIVER = 'mod_CombatRifle_Receiver_Damage-Auto';
const FURIOUS_1STAR = 'mod_Legendary_Weapon1_DmgConsecutiveHits'; // Furious legendary
const CASTER_SNIPER_BARREL = 'mod_PlasmaCaster_Barrel_Sniper_Base'; // slow-fire barrel

// Real Onslaught cap perks (verified from PerkId enum)
const GUNSLINGER_MASTER = PerkId.GunslingerMaster;
const GUERRILLA_MASTER = PerkId.GuerrillaMaster;
const GUERRILLA_EXPERT = PerkId.GuerrillaExpert;

describe('enumerateCombos', () => {
  describe('piece discovery and enumeration', () => {
    it('emits combo candidates with proper structure when pieces exist', () => {
      // Clean Plasma Caster state: no perks, no legendary effects
      const casterState = stateFrom([{ type: 'weapon/select', weaponId: PLASMA_CASTER }]);

      const combos = enumerateCombos(casterState, 'live');

      // Every candidate should have group: 'combo' and exactly 2 pieces
      expect(combos.length).toBeGreaterThan(0);
      for (const combo of combos) {
        expect(combo.group).toBe('combo');
        expect(combo.comboPieces).toBeDefined();
        expect(combo.comboPieces!.length).toBe(2);
        // Every combo should have at least one action
        expect(combo.action.length).toBeGreaterThanOrEqual(1);
        // Family should be prefixed with 'combo:'
        expect(combo.family).toMatch(/^combo:/);
      }
    });

    it('includes at least one combo pairing Gunslinger Master with Furious omod', () => {
      const casterState = stateFrom([{ type: 'weapon/select', weaponId: PLASMA_CASTER }]);

      const combos = enumerateCombos(casterState, 'live');
      const gsm = `perk:${GUNSLINGER_MASTER}`;
      const furious = `omod:${FURIOUS_1STAR}`;

      const gsmFuriousCombo = combos.some(
        (c) =>
          c.comboPieces &&
          ((c.comboPieces[0] === gsm && c.comboPieces[1] === furious) ||
            (c.comboPieces[0] === furious && c.comboPieces[1] === gsm)),
      );

      expect(gsmFuriousCombo).toBe(true);
    });

    it('does not pair payoff-less pieces with themselves', () => {
      // Gunslinger Master is payoff-less (it only raises cap, not payout)
      // so a valid combo must pair it with something that has payoff
      const casterState = stateFrom([{ type: 'weapon/select', weaponId: PLASMA_CASTER }]);

      const combos = enumerateCombos(casterState, 'live');
      const gsm = `perk:${GUNSLINGER_MASTER}`;

      // No combo should consist solely of the GSM (i.e., paired with itself)
      for (const combo of combos) {
        if (combo.comboPieces![0] === gsm && combo.comboPieces![1] === gsm) {
          throw new Error('Invalid: GSM paired with itself');
        }
      }
      expect(true).toBe(true);
    });

    it('groups placement variants of the same pair under a shared family', () => {
      const casterState = stateFrom([{ type: 'weapon/select', weaponId: PLASMA_CASTER }]);

      const combos = enumerateCombos(casterState, 'live');
      const gsm = `perk:${GUNSLINGER_MASTER}`;
      const furious = `omod:${FURIOUS_1STAR}`;

      // Find all combos with this piece pair
      const gsmFuriousCombos = combos.filter(
        (c) =>
          c.comboPieces &&
          ((c.comboPieces[0] === gsm && c.comboPieces[1] === furious) ||
            (c.comboPieces[0] === furious && c.comboPieces[1] === gsm)),
      );

      expect(gsmFuriousCombos.length).toBeGreaterThan(0);

      // All variants should share the same family
      const families = new Set(gsmFuriousCombos.map((c) => c.family));
      expect(families.size).toBe(1);
    });
  });

  describe('both-unequipped rule', () => {
    it('excludes a combo if a legendary effect is already equipped (furious case)', () => {
      // Equip Furious in star slot 0
      const withFurious = stateFrom([
        { type: 'weapon/select', weaponId: PLASMA_CASTER },
        { type: 'weapon/legendary', slotIndex: 0, omodId: FURIOUS_1STAR },
      ]);

      const combos = enumerateCombos(withFurious, 'live');
      const furious = `omod:${FURIOUS_1STAR}`;

      // No combo should include the equipped Furious omod
      for (const combo of combos) {
        expect(combo.comboPieces).toBeDefined();
        const includes = combo.comboPieces!.includes(furious);
        expect(includes).toBe(false);
      }
    });

    it('excludes a combo if a perk is already equipped', () => {
      // Equip Gunslinger Master (must raise Agility first to fit)
      const withGsm = stateFrom([
        { type: 'special/set', stat: 'agility', value: 3 },
        { type: 'weapon/select', weaponId: PLASMA_CASTER },
        { type: 'perk/add', perkId: GUNSLINGER_MASTER, rank: 1, legendary: false },
      ]);

      const combos = enumerateCombos(withGsm, 'live');
      const gsm = `perk:${GUNSLINGER_MASTER}`;

      // No combo should include the equipped Gunslinger Master perk
      for (const combo of combos) {
        expect(combo.comboPieces).toBeDefined();
        const includes = combo.comboPieces!.includes(gsm);
        expect(includes).toBe(false);
      }
    });
  });

  describe('empty-slot-first placement', () => {
    it('targets the first available empty slot when placing legendary effects', () => {
      // Clean caster with empty legendaryEffects
      const casterState = stateFrom([{ type: 'weapon/select', weaponId: PLASMA_CASTER }]);

      const combos = enumerateCombos(casterState, 'live');
      const gsm = `perk:${GUNSLINGER_MASTER}`;
      const furious = `omod:${FURIOUS_1STAR}`;

      // Find a GSM+Furious combo (perk+legendary pair)
      const combo = combos.find(
        (c) =>
          c.comboPieces &&
          ((c.comboPieces[0] === gsm && c.comboPieces[1] === furious) ||
            (c.comboPieces[0] === furious && c.comboPieces[1] === gsm)),
      );

      expect(combo).toBeDefined();

      // Find the weapon/legendary action to check the slot index
      const legendaryAction = combo!.action.find(
        (a): a is Extract<BuildAction, { type: 'weapon/legendary' }> =>
          a.type === 'weapon/legendary',
      );
      expect(legendaryAction).toBeDefined();

      // For empty slots, should target index 0 (the first legendary slot)
      expect(legendaryAction!.slotIndex).toBe(0);

      // Label should reference slot 1 as a single star (legendaryEffectLabel — labels.ts)
      expect(combo!.label).toContain('* Furious');
    });
  });

  describe('regression: real engine evaluation', () => {
    it('creates combos that pass the dominance filter when they beat their best constituent single', () => {
      // Sniper-barrel Plasma Caster: the slow-weapon blindness case. The
      // DEFAULT caster fires fast enough that Furious alone charts (+34%) and
      // the door-closed clause rightly suppresses pairs — the sniper barrel
      // is what pushes forward sustained stacks to ≈ 0.
      const casterState = stateFrom([
        { type: 'weapon/select', weaponId: PLASMA_CASTER },
        { type: 'weapon/mod', slot: 'ap_gun_Barrel', omodId: CASTER_SNIPER_BARREL },
        { type: 'special/set', stat: 'perception', value: 3 },
        { type: 'special/set', stat: 'agility', value: 4 },
      ]);

      const report = evaluateSuggestions(casterState, 'live', 'vats');

      expect(report.baseline).not.toBeNull();
      expect(report.suggestions.length).toBeGreaterThan(0);

      // The GSM+Furious combo must survive the dominance filter with a large
      // delta — this is the exact blindness case the feature exists for
      // (docs/adr/0006): a slow weapon where the greedy ladder has no first
      // rung, yet the pair is the weapon's best move by far.
      const gsmFuriousCombo = report.suggestions.find(
        (s) =>
          s.group === 'combo' &&
          s.comboPieces?.includes(`omod:${FURIOUS_1STAR}`) &&
          s.comboPieces?.includes(`perk:${GUNSLINGER_MASTER}`),
      );
      expect(gsmFuriousCombo).toBeDefined();
      expect(gsmFuriousCombo!.primaryDeltaPct).toBeGreaterThan(0.2);

      // ...while both constituent singles are individually near-worthless
      // (forward sustained stacks ≈ 0 without GSM; GSM enables stacks but
      // carries no payoff). Note: report.suggestions is post-collapse, so a
      // perk family surfaces ≤2 rows — check every surviving row.
      const gsmSingles = report.suggestions.filter(
        (s) => s.group === 'perk' && s.family === `perk:${GUNSLINGER_MASTER}`,
      );
      const furiousSingles = report.suggestions.filter(
        (s) => s.group === 'legendary' && s.id.endsWith(`:${FURIOUS_1STAR}`),
      );
      for (const s of [...gsmSingles, ...furiousSingles]) {
        expect(s.primaryDeltaPct).toBeLessThan(0.05);
      }
    });
  });

  describe('dominance suppression', () => {
    it('suppresses all combos on a fast auto weapon where a single already charts', () => {
      // Auto Fixer: Furious alone charts strongly (forward stacks sustain on a
      // fast automatic), so the greedy ladder has a first rung — every combo
      // row is redundant noise and the door-closed clause of the dominance
      // filter must remove them all, even though pair synergy is superlinear
      // (a Furious pair DOES beat the Furious single; that alone must not be
      // enough to chart).
      const fixerState = stateFrom([
        { type: 'weapon/select', weaponId: THE_FIXER },
        { type: 'weapon/mod', slot: 'ap_gun_Receiver', omodId: FIXER_AUTO_RECEIVER },
        { type: 'special/set', stat: 'perception', value: 3 },
        { type: 'special/set', stat: 'agility', value: 4 },
      ]);

      const report = evaluateSuggestions(fixerState, 'live', 'vats');
      expect(report.baseline).not.toBeNull();

      // Sanity: the Furious single itself charts (the rung exists)...
      const furiousSingle = report.suggestions.find(
        (s) => s.group === 'legendary' && s.id.endsWith(`:${FURIOUS_1STAR}`),
      );
      expect(furiousSingle).toBeDefined();
      expect(furiousSingle!.primaryDeltaPct).toBeGreaterThan(0.05);

      // ...so no combo may survive the filter.
      const combos = report.suggestions.filter((s) => s.group === 'combo');
      expect(combos).toHaveLength(0);
    });
  });

  describe('combined SPECIAL budget', () => {
    it('flags multi-perk combos as illegal when SPECIAL allocation is insufficient', () => {
      // Guerrilla Expert and Guerrilla Master both belong to Agility.
      // Set Agility to 3 so Expert fits but both together don't.
      const guerrillaState = stateFrom([
        { type: 'weapon/select', weaponId: PLASMA_CASTER },
        { type: 'special/set', stat: 'agility', value: 3 },
      ]);

      const combos = enumerateCombos(guerrillaState, 'live');
      const guerrillaExpert = `perk:${GUERRILLA_EXPERT}`;
      const guerrillaMaster = `perk:${GUERRILLA_MASTER}`;

      // Find combo pairing the two Guerrilla perks
      const guerrillaCombo = combos.find(
        (c) =>
          c.comboPieces &&
          ((c.comboPieces[0] === guerrillaExpert && c.comboPieces[1] === guerrillaMaster) ||
            (c.comboPieces[0] === guerrillaMaster && c.comboPieces[1] === guerrillaExpert)),
      );

      expect(guerrillaCombo).toBeDefined();
      // Should be illegal with a deficit
      expect(guerrillaCombo!.budget.legal).toBe(false);
      expect(guerrillaCombo!.budget.deficit).toBeGreaterThan(0);

      // Verify that individual Guerrilla perk singles (from enumerateVariants) are legal
      const allVariants = enumerateVariants(guerrillaState, 'live');
      const guerrillaExpertSingles = allVariants.filter((v) => v.family === guerrillaExpert);
      const guerrillaMasterSingles = allVariants.filter((v) => v.family === guerrillaMaster);

      expect(guerrillaExpertSingles.length).toBeGreaterThan(0);
      expect(guerrillaMasterSingles.length).toBeGreaterThan(0);
      // Both singles should be legal individually
      expect(guerrillaExpertSingles[0].budget.legal).toBe(true);
      expect(guerrillaMasterSingles[0].budget.legal).toBe(true);
    });
  });
});
