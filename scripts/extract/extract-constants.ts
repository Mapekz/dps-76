import type { GeneratedConstants } from '../../src/types/generated';
import { EsmClient, type EsmListRow } from './esm-client';
import { avToNumber } from './extract-npcs';

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
 *
 * VATS crit-meter base: `src/lib/engine/crit-meter.ts`'s per-LCK fill term
 * now comes from a curve table (`extract-curvetables.ts`'s
 * `CURVE_TABLE_SINGLETONS` — `CT_LuckVATSCriticalCharge`); only the flat
 * `fVATSCriticalChargeBase` addend is a bare scalar and belongs here.
 *
 * AP economy: `src/lib/engine/ap-economy.ts`'s pool/regen-delay scalars —
 * `fAVDActionPointsBase`/`Mult` (pool size) and `fDamagedAPRegenDelay`
 * (regen-resume delay, USER-CONFIRMED 2026-07-30 as the AP-specific setting,
 * NOT the generic `fDamagedAVRegenDelay`). FO76 ships that delay exe-baked
 * with no ESM record, so it is probed by EditorID and falls back to the known
 * exe default when absent — see `AP_REGEN_DELAY_EDID` /
 * `probeOptionalGmstFloat` (docs/assumptions.md "VATS AP economy"). The
 * race-based %-of-max regen RATE (`AP_REGEN_RATE_PCT`/`_POWER_ARMOR`) is a
 * RACE `Properties` row, not a GMST — read via `resolveRaceActionPointsRate`.
 *
 * Bullet Storm: `src/lib/engine/bulletstorm.ts`'s ammo-per-stack divisor is a
 * single `u`-prefixed (unsigned int) GMST — `resolveGmstUInt` reads its
 * `UInt` field (the `u`-prefix analog of `resolveGmstFloat`'s `Float`).
 *
 * Distance gate: `src/lib/distance.ts`'s `CLOSE_THRESHOLD_UNITS` (the
 * "Close" perk-gate threshold, Guerrilla/Down Ranger) is a single GMST,
 * `fDistanceForCloseDamage`. `FAR_THRESHOLD_UNITS` (the "Far" gate) is
 * DELIBERATELY NOT extracted here — it has no backing GMST (native-code
 * check, user-measured in-game; see `distance.ts`'s own doc-comment).
 *
 * Power-attack race multiplier (`src/lib/engine/paper-damage.ts`'s
 * `POWER_ATTACK_RACE_MULT_NORMAL`/`_POWER_ARMOR`) is DELIBERATELY NOT
 * extracted here: RACE `Attacks[]` is a 32-entry table of named attack
 * events, each with its own `Attack Data.Damage Mult` — 6 read 1.5, 26 read
 * 1.0 (HumanRace, 20260717 dump), including Power-Attack-flagged carve-outs
 * (e.g. `meleeAttackShredder`, the automatic-power-tool exemption) that
 * legitimately keep 1.0. There is no single scalar to read; picking "the"
 * generic-melee entry by event name would risk silently extracting a
 * carve-out's value instead. Stays hardcoded — see `paper-damage.ts`'s
 * own doc-comment for the carve-out reasoning.
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
const FALLBACK_MITIGATION = {
  resistExponent: 0.365,
  damageFactor: 0.15,
  minReduction: 0.01,
  maxReduction: 0.99,
};

/** `fVATSCriticalChargeBase` (0x00249662) — crit-meter.ts's flat per-hit fill addend. */
const VATS_CRIT_CHARGE_BASE_GMST = '0x00249662';
/** Fallback matching crit-meter.ts's pre-extraction hardcode. */
const FALLBACK_VATS_CRIT = { chargeBase: 5.0 };

/** `fAVDActionPointsBase` (0x0004D878) — ap-economy.ts's flat AP pool floor. */
const AP_POOL_BASE_GMST = '0x0004D878';
/** `fAVDActionPointsMult` (0x0004D879) — ap-economy.ts's AP pool per AGI point. */
const AP_POOL_PER_AGILITY_GMST = '0x0004D879';
/**
 * `fDamagedAPRegenDelay` — the AP-specific regen-resume delay governing
 * ap-economy.ts's `AP_REGEN_DELAY_SEC`. Addressed by EditorID, not FormID,
 * because FO76 ships it exe-baked with NO ESM record: there is no FormID to
 * hardcode, and absence is the EXPECTED result (see `probeOptionalGmstFloat`).
 * If a future dump ever copies the setting into the ESM, this picks the real
 * value up automatically.
 */
const AP_REGEN_DELAY_EDID = 'fDamagedAPRegenDelay';
/**
 * Value used while the ESM has no `fDamagedAPRegenDelay` record: FO76's
 * exe-baked default, 1.0 (published in the "Fallout 76 game settings"
 * `EXE Game Settings (2020)` table). Deliberately NOT read from
 * `fDamagedAVRegenDelay` (0x000DB2AA) — that generic post-any-AV-drain delay
 * is a DIFFERENT setting that merely happens to share the value today.
 */
const AP_REGEN_DELAY_EXE_DEFAULT = 1.0;
/** RACE `Properties` row for AV ActionPointsRate (0x000002D8) — percent-of-max-AP regen/sec. */
const ACTION_POINTS_RATE_AV = '0x000002D8';
const HUMAN_RACE_FORMID = '0x00013746';
const POWER_ARMOR_RACE_FORMID = '0x0001D31E';
/**
 * Fallback matching ap-economy.ts's pre-extraction hardcodes. No
 * `regenDelaySec` member: that field's fallback is
 * `AP_REGEN_DELAY_EXE_DEFAULT`, which is a real sourced value rather than a
 * this-should-never-happen guard like these.
 */
const FALLBACK_ACTION_POINTS = {
  poolBase: 60,
  poolPerAgility: 10,
  regenRatePct: 6.0,
  regenRatePctPowerArmor: 3.0,
};

/** `uAmmoSpenderAmmoUsePerStack` (0x0083C3D0) — bulletstorm.ts's ammo-per-stack divisor. */
const BULLET_STORM_AMMO_PER_STACK_GMST = '0x0083C3D0';
/** Fallback matching bulletstorm.ts's pre-extraction hardcode. */
const FALLBACK_BULLET_STORM = { ammoPerStack: 30 };

/** `fDistanceForCloseDamage` (0x007D2391) — distance.ts's "Close" perk-gate threshold. */
const CLOSE_THRESHOLD_GMST = '0x007D2391';
/** Fallback matching distance.ts's pre-extraction hardcode. */
const FALLBACK_DISTANCE = { closeThresholdUnits: 850 };

/** Resolve one AVIF's Minimum/Maximum Value; null (+ unresolved note) on any failure, mirroring extract-npcs.ts's resolveGlobal. */
async function resolveSpecialAvif(
  client: EsmClient,
  formId: string,
  label: string,
  unresolved: string[],
): Promise<{ min: number; max: number } | null> {
  try {
    const rec = await client.get(formId);
    const min = rec.fields['Minimum Value'];
    const max = rec.fields['Maximum Value'];
    if (typeof min === 'number' && typeof max === 'number') return { min, max };
    unresolved.push(`constants: ${label} AVIF ${formId} missing numeric Minimum/Maximum Value`);
    return null;
  } catch (err) {
    unresolved.push(
      `constants: ${label} AVIF ${formId} failed to resolve: ${(err as Error).message}`,
    );
    return null;
  }
}

async function resolveSpecial(
  client: EsmClient,
  unresolved: string[],
): Promise<{ min: number; max: number }> {
  const resolved = await Promise.all(
    SPECIAL_AVIFS.map(({ label, formId }) => resolveSpecialAvif(client, formId, label, unresolved)),
  );
  const bounds = SPECIAL_AVIFS.map((s, i) =>
    resolved[i] ? { ...s, ...resolved[i]! } : null,
  ).filter((b): b is { label: string; formId: string; min: number; max: number } => b !== null);

  if (bounds.length === 0) {
    unresolved.push(
      `constants: no SPECIAL AVIF resolved — falling back to [${FALLBACK_SPECIAL_CLAMP.min}, ${FALLBACK_SPECIAL_CLAMP.max}]`,
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
        `constants: ${b.label} AVIF clamp [${b.min}, ${b.max}] != ${first.label} [${first.min}, ${first.max}] — SPECIAL clamp is no longer uniform across stats`,
      );
    }
  }

  return { min: first.min, max: first.max };
}

/** Shared shape for resolveGmstFloat/resolveGmstUInt: get one GMST, read its `field`, push an unresolved note and return null on any failure. */
async function resolveGmstNumericField(
  client: EsmClient,
  formId: string,
  field: 'Float' | 'UInt',
  label: string,
  unresolved: string[],
): Promise<number | null> {
  try {
    const rec = await client.get(formId);
    const value = rec.fields[field];
    if (typeof value === 'number') return value;
    unresolved.push(`constants: ${label} GMST ${formId} missing numeric ${field}`);
    return null;
  } catch (err) {
    unresolved.push(
      `constants: ${label} GMST ${formId} failed to resolve: ${(err as Error).message}`,
    );
    return null;
  }
}

/** Resolve one GMST's Float field; null (+ unresolved note) on any failure — the GMST analog of resolveSpecialAvif/resolveGlobal. */
async function resolveGmstFloat(
  client: EsmClient,
  formId: string,
  label: string,
  unresolved: string[],
): Promise<number | null> {
  return resolveGmstNumericField(client, formId, 'Float', label, unresolved);
}

/**
 * Probe for a GMST that is OPTIONAL in the ESM, addressed by EditorID.
 *
 * Unlike `resolveGmstFloat`, a missing record is the expected outcome and
 * stays SILENT — callers supply a known exe-baked default instead. Only a
 * record that exists but is malformed notes, since that is a real gap.
 * Presence is tested with `search` rather than `get` because a `get` miss and
 * a genuine CLI failure both surface as an empty-stdout parse error, whereas
 * `search` returns a clean `[]`.
 *
 * The pattern match is a substring, so the exact EditorID is re-checked here
 * — `fDamagedAPRegenDelay` must not be satisfied by some longer neighbour.
 */
async function probeOptionalGmstFloat(
  client: EsmClient,
  edid: string,
  label: string,
  unresolved: string[],
): Promise<number | null> {
  let hit: EsmListRow | undefined;
  try {
    const rows = await client.search(edid, { type: 'GMST', searchIn: 'edid' });
    hit = rows.find((r) => r.editor_id === edid);
  } catch (err) {
    unresolved.push(`constants: ${label} GMST ${edid} probe failed: ${(err as Error).message}`);
    return null;
  }
  if (!hit) return null; // no ESM record — expected for an exe-baked setting
  return resolveGmstFloat(client, hit.form_id, label, unresolved);
}

/** Resolve one `u`-prefixed GMST's UInt field; null (+ unresolved note) on any failure — the unsigned-int analog of `resolveGmstFloat`. */
async function resolveGmstUInt(
  client: EsmClient,
  formId: string,
  label: string,
  unresolved: string[],
): Promise<number | null> {
  return resolveGmstNumericField(client, formId, 'UInt', label, unresolved);
}

/**
 * Resolve one RACE record's flat `Properties[]` value for a given Actor
 * Value formid (e.g. ActionPointsRate) — the same `{Actor Value, Value}` row
 * shape `extract-npcs.ts`'s `mergeProperties` reads, narrowed here to a
 * single race/AV pair with no NPC-override merge. AV comparison goes
 * through `avToNumber` (not raw string equality) so a padding/case
 * difference in the ESM's own hex formatting can't silently diverge this
 * from `mergeProperties`' matching.
 */
async function resolveRacePropertyValue(
  client: EsmClient,
  raceFormId: string,
  avFormId: string,
  label: string,
  unresolved: string[],
): Promise<number | null> {
  const targetAv = avToNumber(avFormId);
  try {
    const rec = await client.get(raceFormId);
    const props = rec.fields['Properties'];
    if (!Array.isArray(props)) {
      unresolved.push(`constants: ${label} RACE ${raceFormId} has no Properties array`);
      return null;
    }
    const row = props.find(
      (p) =>
        p &&
        typeof p === 'object' &&
        avToNumber((p as { 'Actor Value'?: string | null })['Actor Value']) === targetAv,
    );
    const value = (row as { Value?: unknown } | undefined)?.Value;
    if (typeof value === 'number') return value;
    unresolved.push(
      `constants: ${label} RACE ${raceFormId} has no numeric Properties row for AV ${avFormId}`,
    );
    return null;
  } catch (err) {
    unresolved.push(
      `constants: ${label} RACE ${raceFormId} failed to resolve: ${(err as Error).message}`,
    );
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
  unresolved: string[],
): Promise<number> {
  const resolved = await Promise.all(
    entries.map(({ label, formId }) =>
      resolveGmstFloat(client, formId, `${familyLabel}/${label}`, unresolved),
    ),
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
        `constants: ${familyLabel}/${b.label} GMST ${b.value} != ${familyLabel}/${first.label} ${first.value} — not uniform across damage types`,
      );
    }
  }
  return first.value;
}

async function resolveMitigation(
  client: EsmClient,
  unresolved: string[],
): Promise<GeneratedConstants['mitigation']> {
  const [resistExponent, damageFactor, minReduction, maxReduction] = await Promise.all([
    resolveUniformGmstGroup(
      client,
      'ArmorDmgReductionExp',
      RESIST_EXPONENT_GMSTS,
      FALLBACK_MITIGATION.resistExponent,
      unresolved,
    ),
    resolveUniformGmstGroup(
      client,
      'DamageFactor',
      DAMAGE_FACTOR_GMSTS,
      FALLBACK_MITIGATION.damageFactor,
      unresolved,
    ),
    resolveUniformGmstGroup(
      client,
      'MinDamageReduction',
      MIN_DAMAGE_REDUCTION_GMSTS,
      FALLBACK_MITIGATION.minReduction,
      unresolved,
    ),
    resolveUniformGmstGroup(
      client,
      'MaxDamageReduction',
      MAX_DAMAGE_REDUCTION_GMSTS,
      FALLBACK_MITIGATION.maxReduction,
      unresolved,
    ),
  ]);
  return { resistExponent, damageFactor, minReduction, maxReduction };
}

async function resolveVatsCrit(
  client: EsmClient,
  unresolved: string[],
): Promise<GeneratedConstants['vatsCrit']> {
  const chargeBase = await resolveGmstFloat(
    client,
    VATS_CRIT_CHARGE_BASE_GMST,
    'VATSCriticalChargeBase',
    unresolved,
  );
  return { chargeBase: chargeBase ?? FALLBACK_VATS_CRIT.chargeBase };
}

async function resolveActionPoints(
  client: EsmClient,
  unresolved: string[],
): Promise<GeneratedConstants['actionPoints']> {
  const [poolBase, poolPerAgility, regenDelaySec, regenRatePct, regenRatePctPowerArmor] =
    await Promise.all([
      resolveGmstFloat(client, AP_POOL_BASE_GMST, 'ActionPointsBase', unresolved),
      resolveGmstFloat(client, AP_POOL_PER_AGILITY_GMST, 'ActionPointsMult', unresolved),
      probeOptionalGmstFloat(client, AP_REGEN_DELAY_EDID, 'DamagedAPRegenDelay', unresolved),
      resolveRacePropertyValue(
        client,
        HUMAN_RACE_FORMID,
        ACTION_POINTS_RATE_AV,
        'HumanRace ActionPointsRate',
        unresolved,
      ),
      resolveRacePropertyValue(
        client,
        POWER_ARMOR_RACE_FORMID,
        ACTION_POINTS_RATE_AV,
        'PowerArmorRace ActionPointsRate',
        unresolved,
      ),
    ]);
  return {
    poolBase: poolBase ?? FALLBACK_ACTION_POINTS.poolBase,
    poolPerAgility: poolPerAgility ?? FALLBACK_ACTION_POINTS.poolPerAgility,
    // No `?? FALLBACK_ACTION_POINTS.regenDelaySec` — this one's absence is
    // routine, not a resolution failure, so it falls back to the exe default.
    regenDelaySec: regenDelaySec ?? AP_REGEN_DELAY_EXE_DEFAULT,
    regenRatePct: regenRatePct ?? FALLBACK_ACTION_POINTS.regenRatePct,
    regenRatePctPowerArmor: regenRatePctPowerArmor ?? FALLBACK_ACTION_POINTS.regenRatePctPowerArmor,
  };
}

async function resolveBulletStorm(
  client: EsmClient,
  unresolved: string[],
): Promise<GeneratedConstants['bulletStorm']> {
  const ammoPerStack = await resolveGmstUInt(
    client,
    BULLET_STORM_AMMO_PER_STACK_GMST,
    'AmmoSpenderAmmoUsePerStack',
    unresolved,
  );
  return { ammoPerStack: ammoPerStack ?? FALLBACK_BULLET_STORM.ammoPerStack };
}

async function resolveDistance(
  client: EsmClient,
  unresolved: string[],
): Promise<GeneratedConstants['distance']> {
  const closeThresholdUnits = await resolveGmstFloat(
    client,
    CLOSE_THRESHOLD_GMST,
    'DistanceForCloseDamage',
    unresolved,
  );
  return { closeThresholdUnits: closeThresholdUnits ?? FALLBACK_DISTANCE.closeThresholdUnits };
}

export interface ConstantsResult {
  constants: GeneratedConstants;
  unresolved: string[];
}

export async function extractConstants(client: EsmClient): Promise<ConstantsResult> {
  const unresolved: string[] = [];
  const [special, mitigation, vatsCrit, actionPoints, bulletStorm, distance] = await Promise.all([
    resolveSpecial(client, unresolved),
    resolveMitigation(client, unresolved),
    resolveVatsCrit(client, unresolved),
    resolveActionPoints(client, unresolved),
    resolveBulletStorm(client, unresolved),
    resolveDistance(client, unresolved),
  ]);
  return {
    constants: { special, mitigation, vatsCrit, actionPoints, bulletStorm, distance },
    unresolved,
  };
}
