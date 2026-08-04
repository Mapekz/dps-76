/**
 * Hand-maintained piece-reach overrides for armor OMOD name-groups when ESM
 * id/targetKeyword tokens are missing or ambiguous. Consulted by
 * `src/data/armor-modifiers.ts` before the automatic tag scan. Every entry
 * requires a source comment (in-game test, ESM walk, wiki) — see
 * `src/data/overrides/armor-corrections.ts` for the repo convention.
 */

type ArmorPieceClass = 'torso' | 'arm' | 'leg' | 'helmet' | 'underarmorStyle' | 'underarmorLining';

/** Display name → explicit piece classes. Empty until a tag inconsistency needs rescue. */
export const armorPieceOverrides: Readonly<Record<string, readonly ArmorPieceClass[]>> = {};
