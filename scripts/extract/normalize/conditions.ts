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
  'Comparison Value': number;
  Operator?: string;
  'AND/OR'?: string;
  'Run On'?: string;
}

export interface ConditionTranslationContext {
  /** formid (0x...) → editor_id for every Parameter 1 seen (pre-resolved, since translation is sync). */
  edidByFormId: Map<string, string>;
  /**
   * Rank-chain formids of the perk family being processed, in rank order.
   * HasPerk conditions on these are rank gating, consumed by the simulation.
   */
  familyFormIds?: string[];
  /** Ranks owned in the current simulation (1-based count). */
  ownedRanks?: number;
}

export interface TranslationResult {
  /** null = the whole effect is inactive under the current rank simulation. */
  conditions: Condition[] | null;
  unresolved: string[];
}

function isWeaponTypeKeyword(edid: string): boolean {
  return edid.startsWith('WeaponType') || edid.startsWith('UI_WeaponType') || edid === 'HasSilencer';
}

function isEnemyKeyword(edid: string): boolean {
  return edid.startsWith('ActorType');
}

function translateSingle(cond: RawCondition, ctx: ConditionTranslationContext): Condition | 'inactive' | null {
  const fn = cond.Function;
  const param = cond['Parameter 1'] ?? '';
  const wants = cond['Comparison Value'] === 1;
  const edid = ctx.edidByFormId.get(param) ?? param;

  switch (fn) {
    case 'HasPerk': {
      const rankIndex = ctx.familyFormIds?.indexOf(param) ?? -1;
      if (rankIndex >= 0 && ctx.ownedRanks !== undefined) {
        const owns = rankIndex < ctx.ownedRanks;
        return owns === wants ? null : 'inactive'; // rank gate: consumed or kills the effect
      }
      return { kind: 'unresolved', raw: `HasPerk(${edid})=${cond['Comparison Value']}` };
    }
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
    case 'IsSneaking':
      return wants ? { kind: 'sneaking' } : { kind: 'unresolved', raw: 'IsSneaking=0' };
    case 'GetHealthPercentage': {
      const pct = cond['Comparison Value'] * 100;
      if (cond.Operator === 'Less Than' || cond.Operator === 'Less Than or Equal To') {
        return { kind: 'healthBelowPct', pct };
      }
      return { kind: 'unresolved', raw: `GetHealthPercentage ${cond.Operator} ${cond['Comparison Value']}` };
    }
    case 'IsPowerArmorFrame':
    case 'IsInPowerArmor':
      return { kind: 'inPowerArmor', value: wants };
    case 'GetValue': {
      // "Kill streak ≥ 1" gates on curve-driven effects are redundant — the
      // curves are 0 at 0 stacks (Adrenaline perk, Adrenal effects).
      if (param === '0x00000399') return null;
      return { kind: 'unresolved', raw: `GetValue(${edid})=${cond['Comparison Value']}` };
    }
    case 'IsTrueForConditionForm': {
      // Mutation value-tier CNDFs (base vs Strange-in-Numbers-boosted).
      if (edid === 'Mutation_Check_UseNormalVersion') return { kind: 'strangeInNumbers', value: !wants };
      if (edid === 'Mutation_Check_UseSuperVersion') return { kind: 'strangeInNumbers', value: wants };
      return { kind: 'unresolved', raw: `IsTrueForConditionForm(${edid})=${cond['Comparison Value']}` };
    }
    default:
      return { kind: 'unresolved', raw: `${fn}(${edid})=${cond['Comparison Value']}` };
  }
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
      if (translated.kind === 'unresolved') unresolved.push(translated.raw);
      out.push(translated);
      continue;
    }

    // OR-group: supported when every row is a positive weapon-keyword check.
    const keywords: string[] = [];
    let supported = true;
    for (const row of group) {
      const edid = ctx.edidByFormId.get(row['Parameter 1'] ?? '') ?? '';
      const isKeywordFn = row.Function === 'HasKeyword' || row.Function === 'WornHasKeyword';
      if (!(isKeywordFn && row['Comparison Value'] === 1 && isWeaponTypeKeyword(edid) && row['Run On'] !== 'Target')) {
        supported = false;
        break;
      }
      keywords.push(edid);
    }
    if (supported) {
      out.push({ kind: 'weaponKeywordAny', keywords });
    } else {
      const raw = `OR-group[${group.map(r => `${r.Function}(${ctx.edidByFormId.get(r['Parameter 1'] ?? '') ?? r['Parameter 1']})=${r['Comparison Value']}`).join(' | ')}]`;
      unresolved.push(raw);
      out.push({ kind: 'unresolved', raw });
    }
  }

  return { conditions: out, unresolved };
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
