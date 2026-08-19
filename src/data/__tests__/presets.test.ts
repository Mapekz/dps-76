import { describe, it, expect } from 'bun:test';
import { BUILD_PRESETS } from '@/data/presets';
import { normalizeBuildState } from '@/lib/build-rules';
import { resolveLoadout } from '@/lib/loadout';
import { computeScenarios } from '@/lib/engine/scenarios';
import { pickEmphasizedScenario } from '@/lib/scenario-emphasis';
import { getPerks, getWeapons } from '@/data';
import { getOmodById } from '@/data/omods';

const MODE = 'live';

describe('BUILD_PRESETS', () => {
  for (const preset of BUILD_PRESETS) {
    describe(preset.id, () => {
      const target = preset.build(MODE);

      it('every referenced id exists in the live dataset (drift guard)', () => {
        // Perks/legendary perks.
        const registry = getPerks(MODE);
        for (const { perkId } of [...target.player.perks, ...target.player.legendaryPerks]) {
          expect(registry[perkId as keyof typeof registry]).toBeDefined();
        }

        // Weapon + its equipped OMODs (regular slots + legendary star slots).
        const weapon = target.player.weapon;
        expect(weapon).not.toBeNull();
        expect(getWeapons(MODE)[weapon!.weaponId]).toBeDefined();
        for (const omodId of Object.values(weapon!.mods)) {
          if (omodId === null) continue;
          expect(getOmodById(MODE, omodId)).toBeDefined();
        }
        for (const omodId of weapon!.legendaryEffects) {
          if (omodId === null) continue;
          expect(getOmodById(MODE, omodId)).toBeDefined();
        }
      });

      it('normalizeBuildState (build/hydrate under the hood) yields zero warnings', () => {
        const { state: hydrated, warnings } = normalizeBuildState(MODE, target);
        expect(warnings).toEqual([]);
        expect(hydrated).toEqual(target);
      });

      it('resolveLoadout + computeScenarios yields nonzero DPS for the emphasized scenario', () => {
        const input = resolveLoadout(target.player, target.enemy, MODE);
        expect(input).not.toBeNull();
        const scenarios = computeScenarios(input!);
        const emphasized = target.view.emphasized ?? pickEmphasizedScenario(scenarios);
        expect(scenarios[emphasized].sustain.sustainedDps).toBeGreaterThan(0);
      });
    });
  }
});
