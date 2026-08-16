import { describe, it, expect } from 'bun:test';
import { getPerks } from '@/data';
import { getMutations, getConsumables } from '@/data/buffs';
import { getDataset } from '@/data/dataset';
import { getGeneratedPerk, getLoadoutModifiers } from '@/data/perk-modifiers';
import { COMBO_MECHANISMS } from '@/lib/suggest/combos';
import type { CurveInput, Modifier, StackCounter } from '@/types/modifiers';

/**
 * Drift test: a fresh ESM sync that introduces a new stack-like mechanic must
 * fail CI until combo coverage is consciously updated (registry entry or
 * explicit exclusion). Mirrors src/data/__tests__/weapons.test.ts.
 */

const EXCLUDED_MECHANISMS: Record<string, string> = {
  killStreak: 'exogenous — condition-slider gated (ADR 0006/0009)',
  concentratedFire: 'exogenous — VATS ramp slider',
};

function coveredFromRegistry(): {
  counters: Set<StackCounter>;
  curveInputs: Set<CurveInput>;
} {
  const counters = new Set<StackCounter>();
  const curveInputs = new Set<CurveInput>();
  for (const mechanism of COMBO_MECHANISMS) {
    if (mechanism.id.startsWith('onslaught')) {
      counters.add('onslaught');
      curveInputs.add('onslaughtStacks');
    } else if (mechanism.id === 'bullet-storm') {
      counters.add('bulletStorm');
      curveInputs.add('bulletStormStacks');
    }
  }
  return { counters, curveInputs };
}

function walkModifiers(
  modifiers: readonly Modifier[],
  stackCounters: Set<StackCounter>,
  curveInputs: Set<CurveInput>,
): void {
  for (const mod of modifiers) {
    for (const cond of mod.conditions) {
      if (cond.kind === 'stacks') stackCounters.add(cond.counter);
    }
    if (mod.curve?.input) curveInputs.add(mod.curve.input);
  }
}

function scanStackMechanisms(mode: 'live'): {
  stackCounters: Set<StackCounter>;
  counterLikeCurveInputs: Set<CurveInput>;
} {
  const stackCounters = new Set<StackCounter>();
  const allCurveInputs = new Set<CurveInput>();

  const registry = getPerks(mode);
  for (const [perkId] of Object.entries(registry)) {
    const generated = getGeneratedPerk(mode, perkId);
    if (!generated) continue;
    const maxRank = generated.card ? generated.card.rankSources.length : generated.maxRank;
    for (let rank = 1; rank <= maxRank; rank++) {
      walkModifiers(getLoadoutModifiers(mode, [{ perkId, rank }]), stackCounters, allCurveInputs);
    }
  }

  for (const omod of getDataset(mode).omods) {
    walkModifiers(omod.modifiers ?? [], stackCounters, allCurveInputs);
  }

  for (const buff of [...getMutations(mode), ...getConsumables(mode)]) {
    walkModifiers(buff.modifiers ?? [], stackCounters, allCurveInputs);
  }

  const counterLikeCurveInputs = new Set<CurveInput>();
  for (const input of allCurveInputs) {
    if (input.endsWith('Stacks') || input === 'killStreak') {
      counterLikeCurveInputs.add(input);
    }
  }

  return { stackCounters, counterLikeCurveInputs };
}

function assertCovered(
  kind: 'stack mechanism' | 'stack curve input',
  value: string,
  covered: Set<string>,
  excluded: Record<string, string>,
): void {
  if (covered.has(value) || excluded[value]) return;
  throw new Error(
    `New stack ${kind} '${value}' found in generated data: add a ComboMechanism registry entry in src/lib/suggest/combos.ts or an EXCLUDED_MECHANISMS entry here with a reason (see docs/adr/0006).`,
  );
}

describe('stack mechanism census', () => {
  const { counters: coveredCounters, curveInputs: coveredCurves } = coveredFromRegistry();
  const { stackCounters, counterLikeCurveInputs } = scanStackMechanisms('live');

  it('covers or excludes every observed StackCounter', () => {
    for (const counter of stackCounters) {
      assertCovered('stack mechanism', counter, coveredCounters, EXCLUDED_MECHANISMS);
    }
  });

  it('covers or excludes every observed counter-like CurveInput', () => {
    for (const input of counterLikeCurveInputs) {
      assertCovered('stack curve input', input, coveredCurves, EXCLUDED_MECHANISMS);
    }
  });

  it('has no stale exclusions for mechanisms absent from generated data', () => {
    const observed = new Set<string>([...stackCounters, ...counterLikeCurveInputs]);
    for (const key of Object.keys(EXCLUDED_MECHANISMS)) {
      expect(observed.has(key), `stale EXCLUDED_MECHANISMS key: ${key}`).toBe(true);
    }
  });
});
