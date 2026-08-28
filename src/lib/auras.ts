import type { GameMode } from '@/types';
import type { GeneratedAura, GeneratedDamageType } from '@/types/generated';
import type { AuraSource } from '@/types/auras';
import type { DamageType, ModifierSource } from '@/types/modifiers';
import { getMutations } from '@/data/buffs';
import { getArmorEffects } from '@/data/armor-modifiers';
import { getDataset } from '@/data/dataset';
import { selectedCount } from '@/data/armor-roster';

const GENERATED_DAMAGE_TYPE_MAP: Record<GeneratedDamageType, DamageType> = {
  ballistic: 'ballistic',
  energy: 'energy',
  fire: 'fire',
  cryo: 'cryo',
  poison: 'poison',
  radiation: 'radiation',
  explosive: 'explosive',
  unknown: 'ballistic',
};

function auraFromGenerated(aura: GeneratedAura, source: ModifierSource, index: number): AuraSource {
  const damageType = GENERATED_DAMAGE_TYPE_MAP[aura.damageType];
  const base = {
    id: `${source.formId}:aura:${index}`,
    source,
    damageType,
    tickSec: aura.tickSec,
    conditions: aura.conditions,
    ...(aura.area != null && aura.area > 0 ? { area: aura.area } : {}),
    ...(aura.unresisted ? { unresisted: true as const } : {}),
  };
  if (aura.magnitudePending) {
    return { ...base, magnitudePending: true };
  }
  if (aura.curve && aura.curve.length > 0) {
    return {
      ...base,
      curve: { input: 'itemLevel', points: aura.curve },
      curveScale: aura.curveScale ?? 1,
    };
  }
  return { ...base, magnitudePerTick: aura.amount ?? 0 };
}

function aurasFromOmod(
  auraChase: readonly GeneratedAura[] | undefined,
  source: ModifierSource,
): AuraSource[] {
  if (!auraChase?.length) return [];
  return auraChase.map((a, i) => auraFromGenerated(a, source, i));
}

/** Armor checklist selections → equipped aura sources (Tesla Coils, Miasma). */
export function getArmorEffectAuras(
  mode: GameMode,
  selections: Readonly<Record<string, number>>,
): AuraSource[] {
  const dataset = getDataset(mode);
  const out: AuraSource[] = [];
  for (const effect of getArmorEffects(mode)) {
    const count = selectedCount(effect, selections);
    if (count <= 0) continue;
    const omod = dataset.armorOmods.find((o) => o.id === effect.id);
    if (!omod?.auraChase?.length) continue;
    const source: ModifierSource = {
      kind: 'omod',
      formId: omod.formId,
      edid: omod.id,
      name: omod.name,
    };
    // Auras are per-wearer, not per-piece scaled — one source regardless of count.
    out.push(...aurasFromOmod(omod.auraChase, source));
  }
  return out;
}

/** Active mutations → aura sources (Plague Walker). */
export function getMutationAuras(mode: GameMode, mutationIds: readonly string[]): AuraSource[] {
  const out: AuraSource[] = [];
  for (const id of mutationIds) {
    const mutation = getMutations(mode).find((m) => m.id === id);
    if (!mutation?.auraChase?.length) continue;
    const source: ModifierSource = {
      kind: 'mutation',
      formId: mutation.formId,
      edid: mutation.id,
      name: mutation.name,
    };
    out.push(...aurasFromOmod(mutation.auraChase, source));
  }
  return out;
}

/** Full loadout aura list — armor effects + active mutations. */
export function getLoadoutAuras(
  mode: GameMode,
  armorEffects: Readonly<Record<string, number>>,
  mutationIds: readonly string[],
): AuraSource[] {
  return [...getArmorEffectAuras(mode, armorEffects), ...getMutationAuras(mode, mutationIds)];
}
