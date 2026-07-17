/** Case-insensitive substring match against any keyword - cmdk's fuzzy scorer replaced with plain search. */
export function matchesQuery(keywords: string[], query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return keywords.some(k => k.toLowerCase().includes(q));
}
