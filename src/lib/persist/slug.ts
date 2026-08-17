/**
 * Decorative URL slug segment — human-readable hint in the always-visible
 * share link. Not authoritative; the packed payload carries the real state.
 */
export function buildShareSlug(buildName: string | null, weaponName: string | null): string {
  const source = (buildName?.trim() || weaponName?.trim() || '').toLowerCase();
  const collapsed = source.replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  let slug = collapsed.slice(0, 24);
  if (slug.endsWith('-')) slug = slug.slice(0, -1);
  return slug;
}
