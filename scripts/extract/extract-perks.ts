import type { GeneratedPerk } from '../../src/types/generated';
import type { Bucket, Condition, Modifier, ValueCurve } from '../../src/types/modifiers';
import { EsmClient, mapPool, type EsmRecord } from './esm-client';
import {
  translateConditions,
  type ConditionTranslationContext,
  type RawCondition,
} from './normalize/conditions';
import {
  ENTRY_POINT_BUCKETS,
  buildAvifRoutes,
  collectConditionFormIds,
  parseMagicEffects,
  translateMagicEffect,
  type SpellEffect,
} from './normalize/mgef';

/**
 * PERK extraction. Two effect styles exist:
 *
 * 1. Entry Point (Ninja): the PERK record itself carries entry-point effects
 *    ("Mod Sneak Attack Mult", Add Value, Float) with tabbed conditions.
 * 2. Ability (Center Masochist): the PERK grants a SPEL whose effects carry
 *    Magnitude + MGEF (Peak Value Modifier → STAT_* AVIF). The hidden engine
 *    perks (STAT_DamagePerk, STAT_CritDamagePerk, STAT_DamageVsPerk) define
 *    how each STAT feeds the damage formula — we extract those routes first
 *    and reuse them, so bucket/scale/conditions are data-driven, not guessed.
 *
 * Rank chains: Commando01/02/03 are separate records sharing one SPEL whose
 * effects are gated by HasPerk(rankN). Owning rank R in-game grants records
 * 1..R, so we simulate each rank and keep the effects that survive.
 */

const EXCLUDED_PERK_EDIDS = [/^zzz/, /^CUT_/, /^DEL/, /^DEPRECATED/, /^Test/, /^TEST/, /^POST_/];

/** Entry-point names that are known damage-irrelevant (not reported as unknown). */
const ENTRY_POINT_IGNORED = new Set([
  'Mod Player Explosion Scale',
  'Mod Cone-of-fire Mult',
  'Mod VATS Concentrated Fire Chance Bonus',
  'Mod VATS Concentrated Fire Damage Mult',
  'Mod Ricochet Damage',
  'Mod Ricochet Chance',
  'Mod Bashing Damage',
]);

interface PerkEffect {
  effectType: string;
  entryPoint?: { name: string; functionName: string; float: number; actorValue: string | null };
  ability?: string;
  conditionRows: RawCondition[];
}

function junkPerk(edid: string): boolean {
  return EXCLUDED_PERK_EDIDS.some(p => p.test(edid));
}

function getEffects(record: EsmRecord): Array<Record<string, unknown>> {
  const effects = record.fields['Effects'];
  return Array.isArray(effects) ? effects.map(e => (e as Record<string, unknown>)['Effect'] as Record<string, unknown>) : [];
}

function parsePerkEffect(effect: Record<string, unknown>): PerkEffect {
  const header = (effect['Effect Header'] ?? {}) as Record<string, unknown>;
  const effectType = ((header['Effect Type'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown';

  const conditionRows: RawCondition[] = [];
  const tabs = effect['Perk Conditions'];
  if (Array.isArray(tabs)) {
    for (const tab of tabs as Array<Record<string, unknown>>) {
      const pc = tab['Perk Condition'] as Record<string, unknown> | undefined;
      const tabIndex = (pc?.['Run On (Tab Index)'] as number) ?? 0;
      const conditions = pc?.['Conditions'];
      if (!Array.isArray(conditions)) continue;
      for (const item of conditions as Array<Record<string, unknown>>) {
        const data = (item['Condition'] as Record<string, unknown> | undefined)?.['Condition Data'] as RawCondition | undefined;
        if (!data) continue;
        // Tab 2 conditions run on the target — force enemy-side translation.
        conditionRows.push(tabIndex === 2 ? { ...data, 'Run On': 'Target' } : data);
      }
    }
  }

  if (effectType === 'Entry Point') {
    const ep = (effect['Entry Point'] ?? {}) as Record<string, unknown>;
    return {
      effectType,
      entryPoint: {
        name: ((ep['Entry Point'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown',
        functionName: ((ep['Function'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown',
        float: typeof effect['Float'] === 'number' ? (effect['Float'] as number) : 0,
        actorValue: (effect['Function Parameter 3 (Actor Value)'] as string) ?? null,
      },
      conditionRows,
    };
  }
  return { effectType, ability: (effect['Ability'] as string) ?? undefined, conditionRows };
}

export interface ExtractPerksResult {
  perks: GeneratedPerk[];
  excluded: Record<string, string[]>;
  unresolved: string[];
  unknownEntryPoints: string[];
  unmappedAvifs: string[];
}

export async function extractPerks(client: EsmClient): Promise<ExtractPerksResult> {
  const rows = await client.list('PERK');
  const excluded: Record<string, string[]> = { junkEdid: [], noNameOrCard: [] };

  const candidates = rows.filter(r => {
    if (junkPerk(r.editor_id)) {
      excluded.junkEdid.push(r.editor_id);
      return false;
    }
    return true;
  });
  const records = await mapPool(candidates, 8, r => client.get(r.form_id));

  // Keep anything with a localized Name. Some real perk cards lack an SWF
  // sprite (Nerd Rage!), so SWF presence is recorded as `hasCard`, not used
  // as a filter; and higher-rank records may carry NO own effects (Commando02
  // relies on rank 1's shared SPEL), so effects can't be required either.
  // The app-side name-join to the PerkId registry is the actual gate; it
  // prefers carded entries on collisions.
  const cards = records.filter(r => {
    const keep = !!r.fields['Name'];
    if (!keep) excluded.noNameOrCard.push(r.editor_id);
    return keep;
  });

  // Group into rank families by stripping the trailing rank number.
  const families = new Map<string, EsmRecord[]>();
  for (const record of cards) {
    const family = record.editor_id.replace(/\d+$/, '');
    (families.get(family) ?? families.set(family, []).get(family)!).push(record);
  }
  for (const list of families.values()) {
    list.sort((a, b) => a.editor_id.localeCompare(b.editor_id, undefined, { numeric: true }));
  }

  // Pre-resolve every formid needed for sync condition translation.
  const formIdPool = new Set<string>();
  const avifRoutes = await buildAvifRoutes(client, formIdPool);

  const spellCache = new Map<string, SpellEffect[]>();
  for (const record of cards) {
    for (const raw of getEffects(record)) {
      const parsed = parsePerkEffect(raw);
      collectConditionFormIds(parsed.conditionRows, formIdPool);
      if (parsed.ability) {
        if (!spellCache.has(parsed.ability)) {
          const spellEffects = parseMagicEffects(await client.get(parsed.ability));
          spellCache.set(parsed.ability, spellEffects);
          for (const se of spellEffects) collectConditionFormIds(se.conditionRows, formIdPool);
        }
      }
    }
  }

  const edidByFormId = new Map<string, string>();
  await mapPool([...formIdPool], 8, async id => {
    edidByFormId.set(id, await client.resolveEdid(id));
  });

  const unknownEntryPoints = new Set<string>();
  const unmappedAvifs = new Set<string>();
  const allUnresolved = new Set<string>();
  const perks: GeneratedPerk[] = [];

  for (const [family, familyRecords] of families) {
    const formIds = familyRecords.map(r => r.header.form_id);
    const notes = new Set<string>();
    const ranks: GeneratedPerk['ranks'] = [];

    for (let rank = 1; rank <= familyRecords.length; rank++) {
      const modifiers: Modifier[] = [];
      const translationCtx: ConditionTranslationContext = { edidByFormId, familyFormIds: formIds, ownedRanks: rank };

      const pushModifier = (
        bucket: Bucket,
        op: Modifier['op'],
        value: number,
        conditions: Condition[],
        sourceIndex: number,
        curve?: ValueCurve
      ) => {
        modifiers.push({
          id: `${formIds[0]}:r${rank}:${sourceIndex}:${modifiers.length}`,
          source: {
            kind: family.startsWith('Legendary') ? 'legendaryPerk' : 'perk',
            formId: formIds[0],
            edid: family,
            name: (familyRecords[0].fields['Name'] as string) ?? family,
            rank,
          },
          bucket,
          op,
          value,
          curve,
          conditions,
        });
      };

      let sourceIndex = 0;
      // Only records for OWNED ranks contribute effects — owning rank R grants
      // perk records 1..R, and each record's presence is itself a gate (a rank-2
      // entry point is only excluded against rank 3, never against rank 2).
      const ownedRecords = familyRecords.slice(0, rank);
      // Rank records share their ability SPEL — process each once per simulation.
      const seenAbilities = new Set<string>();
      for (const record of ownedRecords) {
        for (const raw of getEffects(record)) {
          sourceIndex++;
          const parsed = parsePerkEffect(raw);
          if (parsed.ability && seenAbilities.has(parsed.ability)) continue;
          if (parsed.ability) seenAbilities.add(parsed.ability);

          if (parsed.entryPoint) {
            const ep = parsed.entryPoint;
            const bucket = ENTRY_POINT_BUCKETS[ep.name];
            if (!bucket) {
              if (!ENTRY_POINT_IGNORED.has(ep.name)) unknownEntryPoints.add(ep.name);
              continue;
            }
            const { conditions, unresolved } = translateConditions(parsed.conditionRows, translationCtx);
            if (conditions === null) continue; // inactive at this rank
            unresolved.forEach(u => allUnresolved.add(`${family}: ${u}`));

            if (ep.functionName === 'Add Value') {
              pushModifier(bucket, 'ADD', ep.float, conditions, sourceIndex);
            } else if (ep.functionName === 'Set Value') {
              pushModifier(bucket, 'SET', ep.float, conditions, sourceIndex);
            } else if (ep.functionName === 'Multiply Value') {
              pushModifier(bucket, 'MUL_ADD', ep.float - 1, conditions, sourceIndex);
            } else {
              // Actor-value-scaled entry points (SPECIAL-scaled perks) — not modeled yet.
              notes.add(`entry point ${ep.name} uses ${ep.functionName} — skipped`);
            }
            continue;
          }

          if (parsed.ability) {
            const { conditions: grantConds } = translateConditions(parsed.conditionRows, translationCtx);
            if (grantConds === null) continue;

            for (const se of spellCache.get(parsed.ability) ?? []) {
              // Shared MGEF translation handles rank gating (via conditionCtx),
              // AVIF routing, value curves, and override-candidate notes.
              const result = await translateMagicEffect(
                { client, routes: avifRoutes, edidByFormId },
                se,
                { familyFormIds: formIds, ownedRanks: rank }
              );
              result.notes.forEach(n => notes.add(n));
              result.unmappedAvifs.forEach(a => unmappedAvifs.add(a));
              for (const fragment of result.modifiers) {
                pushModifier(
                  fragment.bucket,
                  fragment.op,
                  fragment.value,
                  [...grantConds, ...fragment.conditions],
                  sourceIndex,
                  fragment.curve
                );
              }
            }
          }
        }
      }

      ranks.push({ rank, modifiers });
    }

    perks.push({
      family,
      name: (familyRecords[0].fields['Name'] as string) ?? family,
      formIds,
      maxRank: familyRecords.length,
      descriptions: familyRecords.map(r => (r.fields['Description'] as string) ?? ''),
      ranks,
      hasCard: !!familyRecords[0].fields['SWF Sprite Name'],
      notes: [...notes],
    });
  }

  perks.sort((a, b) => a.family.localeCompare(b.family));
  return {
    perks,
    excluded,
    unresolved: [...allUnresolved],
    unknownEntryPoints: [...unknownEntryPoints],
    unmappedAvifs: [...unmappedAvifs],
  };
}
