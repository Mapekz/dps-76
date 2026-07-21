import type { GeneratedConstants } from '../../src/types/generated';
import { EsmClient } from './esm-client';

/**
 * Game-wide scalar constants read directly off ESM records — the one
 * extractor that emits bare numbers instead of an item list (see
 * `GeneratedConstants`'s doc-comment for why this stays narrow).
 *
 * SPECIAL clamp: all 7 SPECIAL AVIF records declare their own Minimum/Maximum
 * Value fields — the engine clamp on effective (post-buff) SPECIAL applied in
 * `src/lib/player-stats.ts` `derivePlayerStats`. FormIDs are contiguous
 * (Strength through Luck).
 */
const SPECIAL_AVIFS: ReadonlyArray<{ label: string; formId: string }> = [
  { label: 'Strength', formId: '0x000002C2' },
  { label: 'Perception', formId: '0x000002C3' },
  { label: 'Endurance', formId: '0x000002C4' },
  { label: 'Charisma', formId: '0x000002C5' },
  { label: 'Intelligence', formId: '0x000002C6' },
  { label: 'Agility', formId: '0x000002C7' },
  { label: 'Luck', formId: '0x000002C8' },
];

/** Fallback if every SPECIAL AVIF fails to resolve (dump too old/new to have them) — keeps the app's clamp behavior identical to the pre-extraction hardcode. */
const FALLBACK_SPECIAL_CLAMP = { min: 1, max: 100 };

/** Resolve one AVIF's Minimum/Maximum Value; null (+ unresolved note) on any failure, mirroring extract-npcs.ts's resolveGlobal. */
async function resolveSpecialAvif(
  client: EsmClient,
  formId: string,
  label: string,
  unresolved: string[]
): Promise<{ min: number; max: number } | null> {
  try {
    const rec = await client.get(formId);
    const min = rec.fields['Minimum Value'];
    const max = rec.fields['Maximum Value'];
    if (typeof min === 'number' && typeof max === 'number') return { min, max };
    unresolved.push(`constants: ${label} AVIF ${formId} missing numeric Minimum/Maximum Value`);
    return null;
  } catch (err) {
    unresolved.push(`constants: ${label} AVIF ${formId} failed to resolve: ${(err as Error).message}`);
    return null;
  }
}

export interface ConstantsResult {
  constants: GeneratedConstants;
  unresolved: string[];
}

export async function extractConstants(client: EsmClient): Promise<ConstantsResult> {
  const unresolved: string[] = [];
  const resolved = await Promise.all(
    SPECIAL_AVIFS.map(({ label, formId }) => resolveSpecialAvif(client, formId, label, unresolved))
  );
  const bounds = SPECIAL_AVIFS.map((s, i) => (resolved[i] ? { ...s, ...resolved[i]! } : null)).filter(
    (b): b is { label: string; formId: string; min: number; max: number } => b !== null
  );

  if (bounds.length === 0) {
    unresolved.push(
      `constants: no SPECIAL AVIF resolved — falling back to [${FALLBACK_SPECIAL_CLAMP.min}, ${FALLBACK_SPECIAL_CLAMP.max}]`
    );
    return { constants: { special: FALLBACK_SPECIAL_CLAMP }, unresolved };
  }

  // All 7 are expected to agree (SPECIAL is one clamp, not per-stat) — flag
  // divergence instead of silently picking one, since that would mean the
  // game no longer treats SPECIAL as a uniformly-bounded stat.
  const [first, ...rest] = bounds;
  for (const b of rest) {
    if (b.min !== first.min || b.max !== first.max) {
      unresolved.push(
        `constants: ${b.label} AVIF clamp [${b.min}, ${b.max}] != ${first.label} [${first.min}, ${first.max}] — SPECIAL clamp is no longer uniform across stats`
      );
    }
  }

  return { constants: { special: { min: first.min, max: first.max } }, unresolved };
}
