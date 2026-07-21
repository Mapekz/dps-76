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
 *
 * Mitigation GMSTs: the resist-mitigation formula in
 * `src/lib/engine/mitigation.ts` (`applyMitigation`) draws 4 scalars from 4
 * families of `f<Type>*` GMSTs, one member per damage type. Each family is
 * uniform across every type it has a member for — read all members and flag
 * divergence instead of trusting one.
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

/** `f<Type>ArmorDmgReductionExp` — all 7 read 0.365 in the 20260717 dump (docs/assumptions.md "Resist mitigation"). */
const RESIST_EXPONENT_GMSTS: ReadonlyArray<{ label: string; formId: string }> = [
  { label: 'Physical', formId: '0x0017D8A9' },
  { label: 'Energy', formId: '0x0017D8A6' },
  { label: 'Rads', formId: '0x0017D8AB' },
  { label: 'Fire', formId: '0x0017D8A7' },
  { label: 'Frost', formId: '0x0017D8A8' },
  { label: 'Poison', formId: '0x0017D8AA' },
  { label: 'Shock', formId: '0x0017D8AC' },
];

/** `f<Type>DamageFactor` — all 7 read 0.15 in the 20260717 dump. */
const DAMAGE_FACTOR_GMSTS: ReadonlyArray<{ label: string; formId: string }> = [
  { label: 'Physical', formId: '0x000769CB' },
  { label: 'Energy', formId: '0x000769C8' },
  { label: 'Rads', formId: '0x000769CD' },
  { label: 'Fire', formId: '0x000769C9' },
  { label: 'Frost', formId: '0x000769CA' },
  { label: 'Poison', formId: '0x000769CC' },
  { label: 'Shock', formId: '0x000769CE' },
];

/**
 * `f<Type>MinDamageReduction` — only 5 members in the 20260717 dump.
 * `fRadsMinDamageReduction`/`fPoisonMinDamageReduction` do not exist (verified
 * via `esm search "*Rads*DamageReduction*"`/`"*Poison*DamageReduction*"` —
 * each returns only its Max sibling). Not a resolution failure to flag: the
 * game never defined a per-type Min for those two, and it's harmless here
 * since `applyMitigation`'s clamp floor is one shared scalar across all
 * resist types, not dispatched per type.
 */
const MIN_DAMAGE_REDUCTION_GMSTS: ReadonlyArray<{ label: string; formId: string }> = [
  { label: 'Physical', formId: '0x00066DC7' },
  { label: 'Energy', formId: '0x0006461D' },
  { label: 'Fire', formId: '0x0006461C' },
  { label: 'Frost', formId: '0x00064620' },
  { label: 'Shock', formId: '0x00064623' },
];

/** `f<Type>MaxDamageReduction` — all 7 read 0.99 in the 20260717 dump. */
const MAX_DAMAGE_REDUCTION_GMSTS: ReadonlyArray<{ label: string; formId: string }> = [
  { label: 'Physical', formId: '0x00066DC6' },
  { label: 'Energy', formId: '0x0006461E' },
  { label: 'Rads', formId: '0x000559A3' },
  { label: 'Fire', formId: '0x0006461B' },
  { label: 'Frost', formId: '0x0006461F' },
  { label: 'Poison', formId: '0x003C295D' },
  { label: 'Shock', formId: '0x00064624' },
];

/** Fallback mitigation scalars if a GMST family fails to resolve entirely — matches the pre-extraction hardcodes in `mitigation.ts`. */
const FALLBACK_MITIGATION = { resistExponent: 0.365, damageFactor: 0.15, minReduction: 0.01, maxReduction: 0.99 };

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

async function resolveSpecial(client: EsmClient, unresolved: string[]): Promise<{ min: number; max: number }> {
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
    return FALLBACK_SPECIAL_CLAMP;
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

  return { min: first.min, max: first.max };
}

/** Resolve one GMST's Float field; null (+ unresolved note) on any failure — the GMST analog of resolveSpecialAvif/resolveGlobal. */
async function resolveGmstFloat(client: EsmClient, formId: string, label: string, unresolved: string[]): Promise<number | null> {
  try {
    const rec = await client.get(formId);
    const value = rec.fields['Float'];
    if (typeof value === 'number') return value;
    unresolved.push(`constants: ${label} GMST ${formId} missing numeric Float`);
    return null;
  } catch (err) {
    unresolved.push(`constants: ${label} GMST ${formId} failed to resolve: ${(err as Error).message}`);
    return null;
  }
}

/**
 * Resolve a family of same-valued `f<Type>*` GMSTs (e.g. the 7
 * `f<Type>ArmorDmgReductionExp` records) to one representative value,
 * flagging divergence instead of silently picking one — same policy as
 * `resolveSpecial`'s 7-AVIF check, generalized to an arbitrary member count
 * (`MIN_DAMAGE_REDUCTION_GMSTS` only has 5 legitimate members).
 */
async function resolveUniformGmstGroup(
  client: EsmClient,
  familyLabel: string,
  entries: ReadonlyArray<{ label: string; formId: string }>,
  fallback: number,
  unresolved: string[]
): Promise<number> {
  const resolved = await Promise.all(
    entries.map(({ label, formId }) => resolveGmstFloat(client, formId, `${familyLabel}/${label}`, unresolved))
  );
  const bounds = entries
    .map((e, i) => (resolved[i] !== null ? { ...e, value: resolved[i]! } : null))
    .filter((b): b is { label: string; formId: string; value: number } => b !== null);

  if (bounds.length === 0) {
    unresolved.push(`constants: no ${familyLabel} GMST resolved — falling back to ${fallback}`);
    return fallback;
  }

  const [first, ...rest] = bounds;
  for (const b of rest) {
    if (b.value !== first.value) {
      unresolved.push(
        `constants: ${familyLabel}/${b.label} GMST ${b.value} != ${familyLabel}/${first.label} ${first.value} — not uniform across damage types`
      );
    }
  }
  return first.value;
}

async function resolveMitigation(client: EsmClient, unresolved: string[]): Promise<GeneratedConstants['mitigation']> {
  const [resistExponent, damageFactor, minReduction, maxReduction] = await Promise.all([
    resolveUniformGmstGroup(client, 'ArmorDmgReductionExp', RESIST_EXPONENT_GMSTS, FALLBACK_MITIGATION.resistExponent, unresolved),
    resolveUniformGmstGroup(client, 'DamageFactor', DAMAGE_FACTOR_GMSTS, FALLBACK_MITIGATION.damageFactor, unresolved),
    resolveUniformGmstGroup(client, 'MinDamageReduction', MIN_DAMAGE_REDUCTION_GMSTS, FALLBACK_MITIGATION.minReduction, unresolved),
    resolveUniformGmstGroup(client, 'MaxDamageReduction', MAX_DAMAGE_REDUCTION_GMSTS, FALLBACK_MITIGATION.maxReduction, unresolved),
  ]);
  return { resistExponent, damageFactor, minReduction, maxReduction };
}

export interface ConstantsResult {
  constants: GeneratedConstants;
  unresolved: string[];
}

export async function extractConstants(client: EsmClient): Promise<ConstantsResult> {
  const unresolved: string[] = [];
  const [special, mitigation] = await Promise.all([resolveSpecial(client, unresolved), resolveMitigation(client, unresolved)]);
  return { constants: { special, mitigation }, unresolved };
}
