import { byName } from '@/lib/buff-sort';
import type { GeneratedAddiction, GeneratedBuff } from '@/types/generated';

/** Strips the SPEL's " Addiction" suffix ("Psycho Addiction" → "Psycho"). */
export function familyLabel(name: string): string {
  return name.replace(/ Addiction$/, '');
}

/**
 * One row of the ledger: an addiction FAMILY plus the consumables that cause it.
 * This is the ESM's own shape — Psycho, Psychobuff and Psychotats all carry
 * `addiction: AbAddictionPsycho`, so "addicted" is a family-level fact that
 * cannot be set per chem. Chems that cause no addiction each get a family-less
 * group of their own.
 *
 * Causes split by how many there are, not by category. A family's chems (1–4)
 * are radio rows, so their ΔDPS is visible without a click. All 40-odd brews
 * cause the single Alcohol addiction and nearly none of them move damage — as
 * rows they'd be a wall of ±0%, so that family's causes collapse into one
 * combobox (`picker`) on its row instead. Med-X has neither: no modeled chem
 * causes it, but the family still gets a row so the addiction count is complete.
 */
export interface LedgerGroup {
  addiction: GeneratedAddiction | null;
  chems: GeneratedBuff[];
  picker: GeneratedBuff[];
  sortKey: string;
}

export function buildLedger(
  chems: GeneratedBuff[],
  alcohols: GeneratedBuff[],
  addictions: readonly GeneratedAddiction[],
): LedgerGroup[] {
  const chemsByFamily = new Map<string, GeneratedBuff[]>();
  const alcoholsByFamily = new Map<string, GeneratedBuff[]>();
  const unaddictive: LedgerGroup[] = [];

  const push = (map: Map<string, GeneratedBuff[]>, key: string, item: GeneratedBuff) => {
    const bucket = map.get(key);
    if (bucket) bucket.push(item);
    else map.set(key, [item]);
  };

  for (const chem of chems) {
    if (!chem.addiction)
      unaddictive.push({ addiction: null, chems: [chem], picker: [], sortKey: chem.name });
    else push(chemsByFamily, chem.addiction.id, chem);
  }
  for (const alcohol of alcohols) {
    if (alcohol.addiction) push(alcoholsByFamily, alcohol.addiction.id, alcohol);
  }

  const families = addictions.map((a) => ({
    addiction: a,
    chems: (chemsByFamily.get(a.id) ?? []).sort(byName),
    picker: (alcoholsByFamily.get(a.id) ?? []).sort(byName),
    sortKey: familyLabel(a.name),
  }));
  return [...families, ...unaddictive].sort((a, b) => a.sortKey.localeCompare(b.sortKey));
}
