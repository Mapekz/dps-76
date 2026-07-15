import type { GeneratedPerk, GeneratedPerkCard } from '../../src/types/generated';
import type { Bucket, Condition, Modifier, ModifierValue } from '../../src/types/modifiers';
import { EsmClient, mapPool, type EsmRecord } from './esm-client';
import {
  buildCrossFamilyRankMap,
  flattenPerkConditionRows,
  translateConditions,
  type ConditionTranslationContext,
  type RawCondition,
} from './normalize/conditions';
import {
  ENTRY_POINT_BUCKETS,
  ENTRY_POINT_EXTRA_CONDITIONS,
  buildAvifRoutes,
  collectConditionFormIds,
  collectConditionGlobalIds,
  parseMagicEffects,
  resolveConditionForms,
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

/**
 * Gender-twin perk family pairs (Stage C4): Action Boy and Action Girl are
 * separate PERK families that share ONE ability SPEL (AbPerkActionBoyGirl
 * 0x0004D871, verified in the 20260702 dump) whose 3 magnitude tiers
 * (15/30/45) each gate on HasPerk rows spanning BOTH families' own rank
 * formids (e.g. rank-1's "OR[HasPerk(ActionBoy02)|HasPerk(ActionGirl02)]").
 * The per-family rank simulation in conditions.ts needs the sibling family's
 * formids to resolve these — supplied here as `pairedFamilyFormIds`.
 *
 * Party Boy/Girl is the only other Boy/Girl-named perk pair in the 20260702
 * dump; it produces ZERO modifiers today (its "double/triple alcohol
 * effects" mechanic isn't bucket-routed), so it doesn't need pairing — kept
 * as a small hardcoded map rather than inferring pairs from naming, since
 * "Boy"/"Girl" substring matching would be fragile (e.g. it would also catch
 * unrelated cards if any existed).
 */
const GENDER_TWIN_PAIRS: Record<string, string> = {
  ActionBoy: 'ActionGirl',
  ActionGirl: 'ActionBoy',
};

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

export interface ToGeneratedPerkCardResult {
  /** Card data minus `rankSources`, which is per-family (composed at the join site). */
  card: Omit<GeneratedPerkCard, 'rankSources'>;
  /** Each Perks[] entry's Male/Female Perk formids (in rank order) — the join key into extracted families. */
  rankPerkFormIds: string[][];
}

/**
 * Maps each card rank's entry to the 1-based family rank whose PERK record it
 * points at (Male or Female — twins resolve against their own family's list).
 * Returns null when any entry matches no rank of the family. Usually [1..n];
 * compressed cards record fewer entries than the family has ranks, and
 * StarchedGenes' single entry points at the family's rank-2 record → [2].
 */
export function resolveRankSources(rankPerkFormIds: string[][], familyFormIds: string[]): number[] | null {
  const sources: number[] = [];
  for (const entryIds of rankPerkFormIds) {
    const idx = familyFormIds.findIndex(formId => entryIds.includes(formId));
    if (idx === -1) return null;
    sources.push(idx + 1);
  }
  return sources;
}

/**
 * Pure PCRD → GeneratedPerkCard normalization (verified against the 20260710
 * dump: TenderizerCard 0x003E2202, CommandoCard 0x0031AEF6, ActionBoyGirlCard
 * 0x00093E84, LGN_WhatRads_Card 0x005A5943). Shape:
 *   fields["Perk Card Data"] = { Value, "Min Level", Special: {value,name}, "Race Restriction": {value,name} }
 *   (the esm CLI decoded this node as `Unknown` before 2026-07-14 — kept as a
 *   fallback so older daemon builds keep working)
 *   fields.Perks = [{ Perk: { "Card Rank Cost", "Male Perk", "Female Perk"? } }, ...] (rank order)
 * The legendary flag lives at the RECORD's top-level `fields["Perk Card Flags"]`
 * (confirmed on LGN_WhatRads_Card: `{"value":"0x1","flags":["Legendary Perk"]}`
 * sits next to `Perks`, not nested under the card-data node) — the nested
 * variant is also checked defensively in case a differently-versioned record
 * nests it there, though none in the 20260710 dump do.
 */
export function toGeneratedPerkCard(record: EsmRecord): ToGeneratedPerkCardResult {
  const unknown = (record.fields['Perk Card Data'] ?? record.fields['Unknown'] ?? {}) as Record<string, unknown>;
  const special = ((unknown['Special'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown';
  const raceRestrictionName = (unknown['Race Restriction'] as Record<string, unknown> | undefined)?.['name'] as
    | string
    | undefined;
  // Enum names observed: "None" (0), "Human" (1), "Ghoul" (2) — join by name,
  // not the numeric value, since only the name is guaranteed stable.
  const raceRestriction: GeneratedPerkCard['raceRestriction'] =
    raceRestrictionName === 'Human' ? 'human' : raceRestrictionName === 'Ghoul' ? 'ghoul' : null;

  const perksNode = record.fields['Perks'];
  const perkEntries = Array.isArray(perksNode) ? (perksNode as Array<Record<string, unknown>>) : [];
  const costs: number[] = [];
  const rankPerkFormIds: string[][] = [];
  for (const entry of perkEntries) {
    const perk = (entry['Perk'] ?? {}) as Record<string, unknown>;
    costs.push(typeof perk['Card Rank Cost'] === 'number' ? (perk['Card Rank Cost'] as number) : 0);
    const male = perk['Male Perk'];
    const female = perk['Female Perk'];
    rankPerkFormIds.push([male, female].filter((id): id is string => typeof id === 'string'));
  }

  const flagsAt = (node: unknown): string[] => {
    const flags = (node as Record<string, unknown> | undefined)?.['flags'];
    return Array.isArray(flags) ? (flags as string[]) : [];
  };
  const isLegendaryCard =
    flagsAt(record.fields['Perk Card Flags']).includes('Legendary Perk') ||
    flagsAt(unknown['Perk Card Flags']).includes('Legendary Perk');

  return {
    card: {
      special,
      costs,
      minLevel: typeof unknown['Min Level'] === 'number' ? (unknown['Min Level'] as number) : 0,
      raceRestriction,
      isLegendaryCard,
    },
    rankPerkFormIds,
  };
}

function getEffects(record: EsmRecord): Array<Record<string, unknown>> {
  const effects = record.fields['Effects'];
  if (!Array.isArray(effects)) return [];
  return effects.map(e => (e as Record<string, unknown>)['Effect'] as Record<string, unknown>);
}

function parsePerkEffect(effect: Record<string, unknown>): PerkEffect {
  const header = (effect['Effect Header'] ?? {}) as Record<string, unknown>;
  const effectType = ((header['Effect Type'] as Record<string, unknown> | undefined)?.['name'] as string) ?? 'Unknown';

  const conditionRows = flattenPerkConditionRows(effect['Perk Conditions']);

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
  /** PCRD records whose rank perk formids matched NO extracted family (edid + why). */
  unresolvedCards: string[];
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

  // GLOB-compared condition values (e.g. GHL_MadScientist's
  // `GetValue(Rads) >= 0x007F68B6`) — collected alongside the Parameter-1
  // formid pool so they resolve in the same pass.
  const globalIdPool = new Set<string>();

  const spellCache = new Map<string, SpellEffect[]>();
  const allConditionRows: RawCondition[] = [];
  for (const record of cards) {
    for (const raw of getEffects(record)) {
      const parsed = parsePerkEffect(raw);
      collectConditionFormIds(parsed.conditionRows, formIdPool);
      collectConditionGlobalIds(parsed.conditionRows, globalIdPool);
      allConditionRows.push(...parsed.conditionRows);
      if (parsed.ability) {
        if (!spellCache.has(parsed.ability)) {
          const spellEffects = parseMagicEffects(await client.get(parsed.ability));
          spellCache.set(parsed.ability, spellEffects);
          for (const se of spellEffects) {
            collectConditionFormIds(se.conditionRows, formIdPool);
            collectConditionGlobalIds(se.conditionRows, globalIdPool);
            allConditionRows.push(...se.conditionRows);
          }
        }
      }
    }
  }

  const edidByFormId = new Map<string, string>();
  await mapPool([...formIdPool], 8, async id => {
    edidByFormId.set(id, await client.resolveEdid(id));
  });

  // CNDF indirections (IsTrueForConditionForm — Ground Pounder's
  // SmallGun_Actor_Condition) pre-fetched once for every condition row seen
  // above; shared by direct translation and translateMagicEffect below.
  const conditionForms = await resolveConditionForms(client, allConditionRows, edidByFormId);

  // Resolve each GLOB's numeric Value (mirrors normalize/mgef.ts's
  // translateGrantedPerk, which does the same for the granted-perk chase).
  const globalValues = new Map<string, number>();
  await mapPool([...globalIdPool], 8, async id => {
    try {
      const glob = await client.get(id);
      const value = glob.fields['Value'];
      if (typeof value === 'number') globalValues.set(id, value);
    } catch {
      /* stays unresolved in translation */
    }
  });

  // PCRD (perk-card) join: 401 PCRD records total.
  const pcrdRows = await client.list('PCRD');
  const formIdToFamily = new Map<string, string>();
  for (const [family, familyRecords] of families) {
    for (const r of familyRecords) formIdToFamily.set(r.header.form_id, family);
  }
  // Rank-indexed variant of the same join — resolves cross-family HasPerk
  // gates (Lock and Load → Bullet Storm's reload speed) into runtime
  // `perkFamilyRank` conditions. `families` already excludes junk (CUT_ etc.),
  // so cut-content gates keep falling through to unresolved/inactive.
  const crossFamilyRank = buildCrossFamilyRankMap(
    [...families].map(([family, familyRecords]) => ({
      family,
      formIds: familyRecords.map(r => r.header.form_id),
    }))
  );
  const cardByFamily = new Map<string, GeneratedPerkCard>();
  const unresolvedCards: string[] = [];
  await mapPool(
    pcrdRows.filter(r => !junkPerk(r.editor_id)),
    8,
    async row => {
      const record = await client.get(row.form_id);
      const { card, rankPerkFormIds } = toGeneratedPerkCard(record);
      const allPerkFormIds = rankPerkFormIds.flat();
      const matchedFamilies = new Set(
        allPerkFormIds.map(id => formIdToFamily.get(id)).filter((f): f is string => !!f)
      );
      if (matchedFamilies.size === 0) {
        unresolvedCards.push(
          `${record.editor_id}: no rank perk formid (${allPerkFormIds.join(', ') || 'none'}) matched an extracted family`
        );
        return;
      }
      // Attach to EVERY matched family — gender-twin cards (ActionBoyGirlCard)
      // match both the Boy and Girl family via their Male/Female Perk formids.
      for (const family of matchedFamilies) {
        const familyFormIds = families.get(family)!.map(r => r.header.form_id);
        const rankSources = resolveRankSources(rankPerkFormIds, familyFormIds);
        if (!rankSources) {
          unresolvedCards.push(
            `${record.editor_id}: a Perks[] entry matched no rank of family ${family} (${familyFormIds.join(', ')})`
          );
          continue;
        }
        cardByFamily.set(family, { ...card, rankSources });
      }
    }
  );

  const unknownEntryPoints = new Set<string>();
  const unmappedAvifs = new Set<string>();
  const allUnresolved = new Set<string>();
  const perks: GeneratedPerk[] = [];

  for (const [family, familyRecords] of families) {
    const formIds = familyRecords.map(r => r.header.form_id);
    const pairedFamily = GENDER_TWIN_PAIRS[family];
    const pairedFamilyFormIds = pairedFamily ? families.get(pairedFamily)?.map(r => r.header.form_id) : undefined;
    const notes = new Set<string>();
    const ranks: GeneratedPerk['ranks'] = [];

    for (let rank = 1; rank <= familyRecords.length; rank++) {
      const modifiers: Modifier[] = [];
      const translationCtx: ConditionTranslationContext = {
        edidByFormId,
        globalValues,
        conditionForms,
        familyFormIds: formIds,
        ownedRanks: rank,
        crossFamilyRank,
        ...(pairedFamilyFormIds && { pairedFamilyFormIds }),
      };

      const pushModifier = (
        bucket: Bucket,
        op: Modifier['op'],
        payload: ModifierValue,
        conditions: Condition[],
        sourceIndex: number
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
          ...payload,
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
            const { conditions: translated, unresolved } = translateConditions(parsed.conditionRows, translationCtx);
            if (translated === null) continue; // inactive at this rank
            unresolved.forEach(u => allUnresolved.add(`${family}: ${u}`));
            // Baked scope conditions for entry points the bucket alone can't
            // express (Mod Player Explosion Damage → explosive-scoped dbm).
            const conditions = [...translated, ...(ENTRY_POINT_EXTRA_CONDITIONS[ep.name] ?? [])];

            if (ep.functionName === 'Add Value') {
              pushModifier(bucket, 'ADD', { value: ep.float }, conditions, sourceIndex);
            } else if (ep.functionName === 'Set Value') {
              pushModifier(bucket, 'SET', { value: ep.float }, conditions, sourceIndex);
            } else if (ep.functionName === 'Multiply Value') {
              pushModifier(bucket, 'MUL_ADD', { value: ep.float - 1 }, conditions, sourceIndex);
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
                {
                  familyFormIds: formIds,
                  ownedRanks: rank,
                  globalValues,
                  conditionForms,
                  crossFamilyRank,
                  ...(pairedFamilyFormIds && { pairedFamilyFormIds }),
                }
              );
              result.notes.forEach(n => notes.add(n));
              result.unmappedAvifs.forEach(a => unmappedAvifs.add(a));
              for (const fragment of result.modifiers) {
                const payload: ModifierValue = fragment.curve
                  ? { curve: fragment.curve, curveScale: fragment.curveScale }
                  : { value: fragment.value };
                pushModifier(fragment.bucket, fragment.op, payload, [...grantConds, ...fragment.conditions], sourceIndex);
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
      // hasCard ⇔ a PCRD record actually joined this family (see the PCRD
      // join above) — NOT SWF-sprite presence, which was true for ~218
      // non-card families (vendor/ATX/abEpic perks with no player-facing
      // card). Kept as a field: src/data/perk-modifiers.ts's name-collision
      // tiebreak prefers carded entries.
      hasCard: cardByFamily.has(family),
      ...(cardByFamily.has(family) && { card: cardByFamily.get(family)! }),
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
    unresolvedCards,
  };
}
