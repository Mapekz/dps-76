export type UnresolvedDisposition = 'resolve-pending' | 'out-of-scope' | 'deferred-with-issue';

export interface UnresolvedClassification {
  /** Matches an unresolved entry. String = exact prefix match; RegExp for pattern classes. */
  match: string | RegExp;
  disposition: UnresolvedDisposition;
  /** Why this class is not extracted — one terse sentence. Required. */
  reason: string;
  /** GitHub issue ref, required when disposition === 'deferred-with-issue'. */
  issue?: `#${number}`;
}

export interface UnresolvedClassifiedSummary {
  total: number;
  classified: number;
  unclassified: number;
  byDisposition: Record<string, number>;
}

export const unresolvedClassifications: UnresolvedClassification[] = [
  // Hostile Takeover event-scoped fortify toggles — event content, not player
  // build state; a DPS-calculator loadout can't hold them. (verified 2026-08-27)
  {
    match: /^HTO_crFortifyDamage_/,
    disposition: 'out-of-scope',
    reason: 'Hostile Takeover public-event NPC support buffs; not player build state',
  },
];

function entryMatchesRule(entry: string, rule: UnresolvedClassification): boolean {
  return typeof rule.match === 'string' ? entry.startsWith(rule.match) : rule.match.test(entry);
}

export function classifyUnresolved(
  entries: readonly string[],
  rules: readonly UnresolvedClassification[] = unresolvedClassifications,
): {
  classified: Map<UnresolvedClassification, string[]>;
  unclassified: string[];
} {
  const classified = new Map<UnresolvedClassification, string[]>();
  const unclassified: string[] = [];

  for (const entry of entries) {
    const rule = rules.find((r) => entryMatchesRule(entry, r));
    if (rule) {
      const bucket = classified.get(rule);
      if (bucket) bucket.push(entry);
      else classified.set(rule, [entry]);
    } else {
      unclassified.push(entry);
    }
  }

  return { classified, unclassified };
}

/** Fold `classifyUnresolved` output into the `_meta.json` summary shape. */
export function summarizeUnresolvedClassification(
  entries: readonly string[],
  result: ReturnType<typeof classifyUnresolved>,
): UnresolvedClassifiedSummary {
  const byDisposition: Record<string, number> = {};
  for (const [rule, matched] of result.classified) {
    byDisposition[rule.disposition] = (byDisposition[rule.disposition] ?? 0) + matched.length;
  }

  return {
    total: entries.length,
    classified: entries.length - result.unclassified.length,
    unclassified: result.unclassified.length,
    byDisposition,
  };
}
