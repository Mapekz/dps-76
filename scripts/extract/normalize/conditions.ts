import type { Condition } from '../../../src/types/modifiers';

/**
 * ESM condition rows → IR conditions.
 *
 * ESM condition lists chain with AND/OR where OR binds consecutive rows into
 * a group and groups AND together. We translate what we understand
 * (weapon-keyword gates, sneaking, power armor) and emit `unresolved` for the
 * rest so the _meta report keeps unknowns visible instead of silently wrong.
 */

export interface RawCondition {
  Function: string;
  'Parameter 1'?: string | null;
  /** A number, or a GLOB formid (0x...) whose value must be pre-resolved into ctx.globalValues. */
  'Comparison Value': number | string;
  Operator?: string;
  'AND/OR'?: string;
  'Run On'?: string;
}

export interface ConditionTranslationContext {
  /** formid (0x...) → editor_id for every Parameter 1 seen (pre-resolved, since translation is sync). */
  edidByFormId: Map<string, string>;
  /** GLOB formid → numeric value for global-valued Comparison Values (pre-resolved, since translation is sync). */
  globalValues?: Map<string, number>;
  /**
   * Rank-chain formids of the perk family being processed, in rank order.
   * HasPerk conditions on these are rank gating, consumed by the simulation.
   */
  familyFormIds?: string[];
  /** Ranks owned in the current simulation (1-based count). */
  ownedRanks?: number;
  /**
   * Rank-chain formids of a paired GENDER-TWIN family (Action Boy ↔ Action
   * Girl — extract-perks.ts's GENDER_TWIN_PAIRS), in rank order, mirroring
   * `familyFormIds`. The two cards share one ability SPEL whose per-tier
   * gates cross-reference BOTH families' own rank formids; the player owns
   * ONE gender's card at a time, so a HasPerk row on this list resolves as if
   * the paired family's rank mirrors `ownedRanks` (docs/assumptions.md).
   */
  pairedFamilyFormIds?: string[];
  /**
   * CNDF formid → its flattened condition rows, pre-fetched async (translation
   * is sync) by `resolveConditionForms` (normalize/mgef.ts). An
   * `IsTrueForConditionForm(x)=1` row expands to the form's own rows ONLY when
   * they translate completely (Ground Pounder's SmallGun_Actor_Condition →
   * weaponKeywordAny[Rifle,Shotgun,Pistol] + NOT HeavyGun); partially
   * translatable forms (Perk_Day_Condition's time-of-day rows) fall back to
   * the unresolved row unchanged.
   */
  conditionForms?: Map<string, RawCondition[]>;
}

export interface TranslationResult {
  /** null = the whole effect is inactive under the current rank simulation. */
  conditions: Condition[] | null;
  unresolved: string[];
}

/**
 * Class Freak's rank-record formids (ClassFreak01/02/03 — the Luck perk that
 * reduces mutation penalties ×0.75/×0.5/×0.25 via its "Mod Spell Magnitude"
 * keyword scaling). HasPerk rows on these appear inside mutations' granted
 * penalty PERKs (Grounded's Mutation_ReduceEnergyDamage_Perk tiers) and
 * translate to `classFreakRank` range conditions instead of `unresolved`.
 */
const CLASS_FREAK_RANK_BY_FORM_ID: Record<string, number> = {
  '0x00391F0E': 1, // ClassFreak01
  '0x00391F11': 2, // ClassFreak02
  '0x00391F12': 3, // ClassFreak03
};

function isWeaponTypeKeyword(edid: string): boolean {
  // HasLegendary_* keywords are ADDed by the legendary OMOD itself, so a
  // HasKeyword self-gate on one auto-passes once the mod is equipped
  // (effective-weapon merges addedKeywords). Newer content prefixes its
  // records (SDOW_HasLegendary_Weapon_Severing) — match anywhere after a
  // prefix, not just at the start.
  return (
    edid.startsWith('WeaponType') ||
    edid.startsWith('UI_WeaponType') ||
    edid === 'HasSilencer' ||
    edid.startsWith('HasLegendary_') ||
    edid.includes('_HasLegendary_')
  );
}

function isEnemyKeyword(edid: string): boolean {
  return edid.startsWith('ActorType');
}

function translateSingle(cond: RawCondition, ctx: ConditionTranslationContext): Condition | 'inactive' | null {
  const fn = cond.Function;
  const param = cond['Parameter 1'] ?? '';
  // Comparison Values can reference a GLOB (Executioner's ≤ LGND_ExecuteHealthThreshold).
  const rawCmp = cond['Comparison Value'];
  const cmp = typeof rawCmp === 'string' ? ctx.globalValues?.get(rawCmp) : rawCmp;
  const wants = cmp === 1;
  const edid = ctx.edidByFormId.get(param) ?? param;

  switch (fn) {
    case 'HasPerk': {
      const rankIndex = ctx.familyFormIds?.indexOf(param) ?? -1;
      if (rankIndex >= 0 && ctx.ownedRanks !== undefined) {
        const owns = rankIndex < ctx.ownedRanks;
        return owns === wants ? null : 'inactive'; // rank gate: consumed or kills the effect
      }
      // Gender-twin paired family (Action Boy/Girl, Stage C4): the player owns
      // ONE gender's card at a time, so the paired family's rank mirrors the
      // rank being simulated (docs/assumptions.md).
      const pairedRankIndex = ctx.pairedFamilyFormIds?.indexOf(param) ?? -1;
      if (pairedRankIndex >= 0 && ctx.ownedRanks !== undefined) {
        const owns = pairedRankIndex < ctx.ownedRanks;
        return owns === wants ? null : 'inactive';
      }
      // Viper's gates on the target lacking ImmuneToPoison — a generic target
      // is assumed vulnerable, so the row is consumed (docs/assumptions.md).
      if (cond['Run On'] === 'Target' && edid === 'ImmuneToPoison' && !wants) return null;
      // Class Freak tier gates on mutation penalty perks (Grounded's Mod
      // Weapon Attack Damage tiers): =1 → rank ≥ N, =0 → rank < N. The rows
      // AND together into exact-tier ranges — no OR-group handling needed.
      const cfRank = CLASS_FREAK_RANK_BY_FORM_ID[param];
      if (cfRank !== undefined) {
        return wants ? { kind: 'classFreakRank', min: cfRank, max: 3 } : { kind: 'classFreakRank', min: 0, max: cfRank - 1 };
      }
      return { kind: 'unresolved', raw: `HasPerk(${edid})=${cond['Comparison Value']}` };
    }
    case 'IsSpellTarget':
      // RadX/serum suppression of mutation effects is deliberately NOT
      // modeled — selecting the mutation IS the app's active/inactive toggle
      // (docs/assumptions.md "Carnivore's / Herbivore's food scaling",
      // reaffirmed under "Mutation penalties & Class Freak"). The =0 rows
      // (effect active while unsuppressed) are consumed; the =1 rows gate the
      // treated/serum variants we never model, killing those effects.
      if (edid === 'RadX' || edid.startsWith('Serum_')) return wants ? 'inactive' : null;
      return { kind: 'unresolved', raw: `IsSpellTarget(${edid})=${cond['Comparison Value']}` };
    case 'IsMemberOfAPlayerTeam':
      // Herd Mentality's solo penalty / team bonus gate. "In a team" is
      // approximated as ≥1 teammate (consistent with Strange in Numbers'
      // derivation — docs/assumptions.md "Mutation penalties & Class Freak").
      return wants ? { kind: 'teammateCount', count: 1, orMore: true } : { kind: 'teammateCount', count: 0 };
    case 'HasKeyword':
    case 'WornHasKeyword': {
      if (cond['Run On'] === 'Target' || isEnemyKeyword(edid)) {
        return { kind: 'enemyType', keywordOrRace: edid };
      }
      if (isWeaponTypeKeyword(edid)) {
        return { kind: 'weaponKeyword', keyword: edid, present: wants };
      }
      return { kind: 'unresolved', raw: `${fn}(${edid})=${cond['Comparison Value']}` };
    }
    case 'GetIsRace':
      return { kind: 'enemyType', keywordOrRace: edid };
    case 'GetIsPlayer':
      // Perk effects granted to the player: always true — consumed.
      return wants ? null : 'inactive';
    case 'GetIsPlayerGhoul':
      // Character-type gate: Gourmand's (=0, human-only), Glowing Criticals (=1).
      return { kind: 'playerIsGhoul', value: wants };
    case 'IsSneaking':
      return wants ? { kind: 'sneaking' } : { kind: 'unresolved', raw: 'IsSneaking=0' };
    case 'GetHealthPercentage': {
      if (typeof cmp !== 'number') {
        return { kind: 'unresolved', raw: `GetHealthPercentage ${cond.Operator} ${rawCmp} (unresolved global)` };
      }
      const pct = cmp * 100;
      const onTarget = cond['Run On'] === 'Target';
      if (/^less than( or equal to)?$/i.test(cond.Operator ?? '')) {
        // Tab-index-2 perk conditions run on the target: that's the ENEMY's health
        // (Executioner's ≤40%), not the player's (Bloodied-style gates).
        return onTarget ? { kind: 'enemyHealthBelowPct', pct } : { kind: 'healthBelowPct', pct };
      }
      if (onTarget && /^greater than( or equal to)?$/i.test(cond.Operator ?? '')) {
        return { kind: 'enemyHealthAbovePct', pct }; // Instigating: enemy ≥60%
      }
      return { kind: 'unresolved', raw: `GetHealthPercentage ${cond.Operator} ${cmp}` };
    }
    case 'IsPowerArmorFrame':
    case 'IsInPowerArmor':
      return { kind: 'inPowerArmor', value: wants };
    case 'GetValue': {
      if (param === '0x00000399') {
        // Thrill-Seeker's (Stage C3): 10 discrete GetValue(killStreak) Equal
        // To N tiers, each gating its own 0.03×N-scaled effect — translate to
        // an exact-count condition (evaluated against adrenalineStacks).
        if (/^equal to$/i.test(cond.Operator ?? '') && typeof cmp === 'number') {
          return { kind: 'killStreakCount', count: cmp };
        }
        // "Kill streak ≥ 1" gates on curve-driven effects are redundant — the
        // curves are 0 at 0 stacks (Adrenaline perk, Adrenal effects). Only
        // consume the ≤1 redundant case; anything else stays unresolved so an
        // unrecognized comparison doesn't silently vanish.
        if (typeof cmp === 'number' && cmp <= 1) return null;
        return { kind: 'unresolved', raw: `GetValue(${edid}) ${cond.Operator} ${rawCmp}` };
      }
      if (param === '0x00000398') {
        // Shotgun Champ: "projectiles fired ≥ 1" is always true (every
        // weapon fires ≥1 projectile) and redundant with the
        // projectileCount curve itself — same reasoning as the killStreak
        // ≥1 case above.
        if (typeof cmp === 'number' && cmp <= 1) return null;
        return { kind: 'unresolved', raw: `GetValue(${edid}) ${cond.Operator} ${rawCmp}` };
      }
      if (param === '0x000002E1') {
        // Rads AV = the ghoul Glow meter. Every Rads gate on a real player
        // perk in the 20260710 dump (GHL_GlowingCriticals*, GHL_MadScientist,
        // GHL_BrickWall, GHL_RadiationPower, GHL_RadioactiveStrength,
        // GHL_BombScientist) uses "Greater Than Or Equal To", against either a
        // literal (180.0) or a GLOB (GHL_BasicGlowUse=5, GHL_PowerGlowUseBasic=50,
        // resolved via ctx.globalValues into `cmp` same as any other row). A
        // strict "Greater Than" doesn't occur in data; approximate it the same
        // as ≥ (min = cmp exactly) rather than leaving it unresolved, since the
        // Glow meter's practical granularity makes the off-by-epsilon
        // difference immaterial. Non-≥ comparisons (e.g. the companion-perk
        // "Less Than" tiers on OverlyGenerous01) stay unresolved.
        if (/^greater than( or equal to)?$/i.test(cond.Operator ?? '') && typeof cmp === 'number') {
          return { kind: 'glowAtLeast', min: cmp };
        }
        return { kind: 'unresolved', raw: `GetValue(${edid}) ${cond.Operator} ${rawCmp}` };
      }
      return { kind: 'unresolved', raw: `GetValue(${edid})=${cond['Comparison Value']}` };
    }
    case 'GetLoadedAmmoCount':
      // Last Shot: the fired round empties the magazine. Circuit Breaker
      // spells the same gate "< 1" (integer count).
      if (
        (/^equal to$/i.test(cond.Operator ?? '') && cmp === 0) ||
        (/^less than$/i.test(cond.Operator ?? '') && cmp === 1)
      ) {
        return { kind: 'lastRound' };
      }
      return { kind: 'unresolved', raw: `GetLoadedAmmoCount ${cond.Operator} ${rawCmp}` };
    case 'IsNextClipLastShot':
      // Companion row to GetLoadedAmmoCount()=0 — the same last-round gate
      // (translateConditions dedupes the pair to one lastRound condition).
      if ((/^greater than$/i.test(cond.Operator ?? '') && cmp === 0) || wants) return { kind: 'lastRound' };
      return { kind: 'unresolved', raw: `IsNextClipLastShot ${cond.Operator} ${rawCmp}` };
    case 'GetNumActiveEffectsWithKeyword': {
      // "Target is burning/poisoned" gates (Pyromaniac's fire, Viper's poison).
      const atLeastOne =
        (/^greater than or equal to$/i.test(cond.Operator ?? '') && cmp === 1) ||
        (/^greater than$/i.test(cond.Operator ?? '') && cmp === 0);
      if (cond['Run On'] === 'Target' && atLeastOne) return { kind: 'enemyHasActiveEffect', keyword: edid };
      return { kind: 'unresolved', raw: `GetNumActiveEffectsWithKeyword(${edid}) ${cond.Operator} ${rawCmp}` };
    }
    case 'GetGroupTargetCount': {
      // Encircler's tiers: == 1..4, ≥ 5 for the top.
      if (typeof cmp === 'number') {
        if (/^equal to$/i.test(cond.Operator ?? '')) return { kind: 'enemyGroupCount', count: cmp };
        if (/^greater than or equal to$/i.test(cond.Operator ?? '')) {
          return { kind: 'enemyGroupCount', count: cmp, orMore: true };
        }
      }
      return { kind: 'unresolved', raw: `GetGroupTargetCount ${cond.Operator} ${rawCmp}` };
    }
    case 'GetPlayerTeammateCount':
      // Fencer's tiers: exact teammate counts 0..3.
      if (typeof cmp === 'number' && /^equal to$/i.test(cond.Operator ?? '')) {
        return { kind: 'teammateCount', count: cmp };
      }
      return { kind: 'unresolved', raw: `GetPlayerTeammateCount ${cond.Operator} ${rawCmp}` };
    case 'GetDistance':
      // Fencer's teammate-range rows (< 2500 units on Potential Players):
      // consumed — teammates are assumed in range (docs/assumptions.md).
      if (cond['Run On'] === 'Potential Players' && /^less than/i.test(cond.Operator ?? '')) return null;
      return { kind: 'unresolved', raw: `GetDistance ${cond.Operator} ${rawCmp} on ${cond['Run On']}` };
    case 'IsTrueForConditionForm': {
      // Mutation value-tier CNDFs (base vs Strange-in-Numbers-boosted).
      if (edid === 'Mutation_Check_UseNormalVersion') return { kind: 'strangeInNumbers', value: !wants };
      if (edid === 'Mutation_Check_UseSuperVersion') return { kind: 'strangeInNumbers', value: wants };
      // Other forms: translateConditions tries a full inline expansion via
      // ctx.conditionForms before settling for this unresolved fallback.
      return { kind: 'unresolved', raw: `IsTrueForConditionForm(${edid})=${cond['Comparison Value']}` };
    }
    case 'GetWeaponAnimType':
      // WEAP Data."Weapon Type" anim enum. Only ≤ occurs in data (Martial
      // Artist/Swinger ≤6 = melee/unarmed; the FO76 roster has no anim types
      // between 6 and Gun=9 — 2026-07-14 all-roster sweep). Other operators
      // stay unresolved until a real use appears.
      if (/^less than or equal to$/i.test(cond.Operator ?? '') && typeof cmp === 'number') {
        return { kind: 'weaponAnimTypeMax', max: cmp };
      }
      return { kind: 'unresolved', raw: `GetWeaponAnimType() ${cond.Operator} ${rawCmp}` };
    default:
      return { kind: 'unresolved', raw: `${fn}(${edid})=${cond['Comparison Value']}` };
  }
}

/**
 * Resolve an OR-group made ENTIRELY of HasPerk rows against the rank-chain
 * simulation (own family and/or its gender-twin paired family — Action
 * Boy/Girl's shared-ability tiers, Stage C4): 'consumed' when at least one
 * row's actual owned/not-owned state matches what it demands (the group
 * passes, so it's dropped from the output like a single-row rank gate);
 * 'inactive' when every row can be resolved but none match (kills the whole
 * effect, same as a failing single-row rank gate); undefined when the group
 * isn't a pure rank-gate OR-group (mixed content, or a formid outside both
 * families) — the caller falls through to the existing weaponKeywordAny /
 * enemyTypeAny handling.
 */
function resolveHasPerkRankGroup(group: RawCondition[], ctx: ConditionTranslationContext): 'consumed' | 'inactive' | undefined {
  if (ctx.ownedRanks === undefined) return undefined;
  let anySatisfied = false;
  for (const row of group) {
    if (row.Function !== 'HasPerk') return undefined;
    const param = row['Parameter 1'] ?? '';
    const wants = row['Comparison Value'] === 1;
    const ownIdx = ctx.familyFormIds?.indexOf(param) ?? -1;
    const pairedIdx = ctx.pairedFamilyFormIds?.indexOf(param) ?? -1;
    let owns: boolean;
    if (ownIdx >= 0) owns = ownIdx < ctx.ownedRanks;
    else if (pairedIdx >= 0) owns = pairedIdx < ctx.ownedRanks;
    else return undefined;
    if (owns === wants) anySatisfied = true;
  }
  return anySatisfied ? 'consumed' : 'inactive';
}

/**
 * Expand a standalone `IsTrueForConditionForm(x)=1` row into the CNDF's own
 * translated conditions (Ground Pounder's SmallGun_Actor_Condition — the
 * pre-fetch lives in normalize/mgef.ts `resolveConditionForms`). Returns null
 * (caller keeps the unresolved row) unless every nested row translates: a
 * partial expansion would silently activate a still-gated effect, and an
 * 'inactive' verdict from nested rank-gate-shaped rows is not trusted either.
 * `=0` (negated) references never expand — negating a multi-row AND/OR list
 * has no IR representation.
 */
function tryExpandConditionForm(row: RawCondition, ctx: ConditionTranslationContext): Condition[] | null {
  if (row.Function !== 'IsTrueForConditionForm') return null;
  if (row['Comparison Value'] !== 1 || !/^equal to$/i.test(row.Operator ?? 'Equal To')) return null;
  const nested = ctx.conditionForms?.get(row['Parameter 1'] ?? '');
  if (!nested || nested.length === 0) return null;
  const result = translateConditions(nested, { ...ctx, conditionForms: undefined });
  if (result.conditions === null || result.unresolved.length > 0) return null;
  return result.conditions;
}

/**
 * Translate an ESM condition list. Returns conditions: null when a rank gate
 * fails under the current simulation (effect inactive).
 */
export function translateConditions(rows: RawCondition[], ctx: ConditionTranslationContext): TranslationResult {
  const out: Condition[] = [];
  const unresolved: string[] = [];

  // Split into OR-groups: a row with AND/OR = 'OR' joins the NEXT row.
  const groups: RawCondition[][] = [];
  let current: RawCondition[] = [];
  for (const row of rows) {
    current.push(row);
    if ((row['AND/OR'] ?? 'AND') !== 'OR') {
      groups.push(current);
      current = [];
    }
  }
  if (current.length > 0) groups.push(current);

  for (const group of groups) {
    if (group.length === 1) {
      const translated = translateSingle(group[0], ctx);
      if (translated === 'inactive') return { conditions: null, unresolved };
      if (translated === null) continue; // consumed rank gate
      if (translated.kind === 'unresolved') {
        // IsTrueForConditionForm indirection: inline the referenced CNDF's own
        // rows when they translate COMPLETELY (recursion depth 1 — nested
        // forms stay unexpanded). Partial translations and 'inactive' results
        // fall back to the unresolved row so nothing silently vanishes.
        const expanded = tryExpandConditionForm(group[0], ctx);
        if (expanded) {
          out.push(...expanded);
          continue;
        }
        unresolved.push(translated.raw);
      }
      out.push(translated);
      continue;
    }

    // HasPerk rank-gate OR-group (Action Boy/Girl's cross-family tiers,
    // Stage C4): resolve via the SAME rank simulation the single-row branch
    // uses, extended with the optional paired family.
    const hasPerkResolution = resolveHasPerkRankGroup(group, ctx);
    if (hasPerkResolution === 'inactive') return { conditions: null, unresolved };
    if (hasPerkResolution === 'consumed') continue;

    // OR-group: supported when every row is a positive weapon-keyword check,
    // or every row is a positive enemy-type check (Ghoul Slayer's:
    // ActorTypeFeralGhoul OR ActorTypeGhoul).
    const keywords: string[] = [];
    const enemyTypes: string[] = [];
    let supported = true;
    let enemySupported = true;
    for (const row of group) {
      const edid = ctx.edidByFormId.get(row['Parameter 1'] ?? '') ?? '';
      const isKeywordFn = row.Function === 'HasKeyword' || row.Function === 'WornHasKeyword';
      const positive = row['Comparison Value'] === 1;
      if (!(isKeywordFn && positive && isWeaponTypeKeyword(edid) && row['Run On'] !== 'Target')) {
        supported = false;
      }
      const isEnemyCheck =
        (isKeywordFn && (row['Run On'] === 'Target' || isEnemyKeyword(edid))) || row.Function === 'GetIsRace';
      if (!(isEnemyCheck && positive)) {
        enemySupported = false;
      }
      keywords.push(edid);
      enemyTypes.push(edid);
    }
    if (supported) {
      out.push({ kind: 'weaponKeywordAny', keywords });
    } else if (enemySupported) {
      out.push({ kind: 'enemyTypeAny', keywordsOrRaces: enemyTypes });
    } else {
      const raw = `OR-group[${group.map(r => `${r.Function}(${ctx.edidByFormId.get(r['Parameter 1'] ?? '') ?? r['Parameter 1']})=${r['Comparison Value']}`).join(' | ')}]`;
      unresolved.push(raw);
      out.push({ kind: 'unresolved', raw });
    }
  }

  // Distinct ESM rows can translate to the same IR condition (Last Shot's
  // GetLoadedAmmoCount()=0 + IsNextClipLastShot pair → one lastRound gate).
  const seen = new Set<string>();
  const deduped = out.filter(c => {
    const key = JSON.stringify(c);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { conditions: deduped, unresolved };
}

/**
 * Flatten a PERK "Perk Conditions" node (tabbed) into raw condition rows.
 * Tab-index 2 conditions run on the target, so their `Run On` is forced to
 * 'Target'. Shared by the plumbing-perk route builder and perk-effect parsing.
 */
export function flattenPerkConditionRows(perkConditions: unknown): RawCondition[] {
  if (!Array.isArray(perkConditions)) return [];
  const rows: RawCondition[] = [];
  for (const tab of perkConditions as Array<Record<string, unknown>>) {
    const pc = tab['Perk Condition'] as Record<string, unknown> | undefined;
    const tabIndex = (pc?.['Run On (Tab Index)'] as number) ?? 0;
    const conditions = pc?.['Conditions'];
    if (!Array.isArray(conditions)) continue;
    for (const item of conditions as Array<Record<string, unknown>>) {
      const data = (item['Condition'] as Record<string, unknown> | undefined)?.['Condition Data'] as
        | RawCondition
        | undefined;
      if (data) rows.push(tabIndex === 2 ? { ...data, 'Run On': 'Target' } : data);
    }
  }
  return rows;
}

/** Pull the flat condition rows out of the ESM's nested Conditions structures. */
export function flattenConditionRows(node: unknown): RawCondition[] {
  if (!node || typeof node !== 'object') return [];
  const rows: RawCondition[] = [];
  const conditions = (node as Record<string, unknown>)['Conditions'];
  if (Array.isArray(conditions)) {
    for (const item of conditions as Array<Record<string, unknown>>) {
      const data = (item['Condition'] as Record<string, unknown> | undefined)?.['Condition Data'] as
        | RawCondition
        | undefined;
      if (data) rows.push(data);
    }
  }
  return rows;
}
