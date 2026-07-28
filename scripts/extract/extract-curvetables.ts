import type { EsmClient, EsmListRow, EsmRecord } from './esm-client';

/**
 * Re-extraction of the generic "Universal Tier" creature/player curve
 * tables (`src/data/<mode>/curvetables/{creatures,player}/**`). These files
 * were originally hand-copied byte-for-byte from a dump's
 * `misc/curvetables/json/` folder (Dec 2025, commit 6dbfc80) and had gone
 * stale — the checked-in `creatures/armor/armor_universal_tier22.json` was a
 * 50-point, domain-2–100 relic while the live ESM's version is a 50-point,
 * domain-1–540 curve (Phase 2 spike, 2026-07-18). This extractor replaces
 * that manual process: it goes through the `esm` CLI like every other
 * extractor (never touches the dump's sibling `misc/` folder directly), so
 * the output is reformatted (LF, 1-space indent) rather than byte-identical
 * to Bethesda's own CRLF/tab-indented shipped files — a deliberate,
 * accepted formatting drift; only the numbers are load-bearing.
 *
 * Scope: only the 4 "Universal Tier" CURV families consumed by the
 * engine/UI today (creature Health/Armor for Phase 2's enemy-defenses work,
 * player Damage/Armor for parity — `src/lib/curve-tables.ts` already reads
 * `player/damage`). Per-creature NAMED curve tables (e.g.
 * `CT_Creatures_Health_HumanRaider`, visible as loose
 * `misc/curvetables/json/creatures/health/health_humanraider.json` files in
 * the dump) are a DIFFERENT, out-of-scope system — every curated NPC_ sampled
 * for extract-npcs.ts referenced only Universal-Tier curves on its own
 * Properties[] rows (Phase 2 spike + extraction pass), so this scope
 * restriction hasn't lost real data. Not re-verified here.
 *
 * `CT_Player_XP_Universal_Tier*` and `CT_Creatures_Damage_Universal_Tier*`
 * (the pre-existing `curvetables/creatures/weapon/` dir, creature attack
 * damage — unrelated to Phase 2's target-defense work) are intentionally
 * NOT re-extracted here; out of this slice's stated scope.
 *
 * Also owns a handful of one-off ("singleton") CURV records that have no
 * tier family at all — just a single editor_id with no numeric suffix, so
 * `CURVE_TABLE_GROUPS`' search+tier-sort machinery doesn't apply. First
 * addition: `CT_Player_PercentOfMinToMaxRangeDMGMult` (0x008407AC,
 * `src/lib/distance.ts`'s range-falloff curve), previously a hand-copy
 * (commit 6dbfc80). Second addition: `CT_LuckVATSCriticalCharge`
 * (0x00655629, `src/lib/engine/crit-meter.ts`'s per-LCK VATS crit-meter fill
 * term) — reached via DFOB `LuckVATSCriticalChargeCurve_DO` (0x0065562A,
 * user-identified 2026-07-21; the old hardcoded `fVATSCriticalChargeMult`
 * linear term it replaces is no longer the live mechanic). Third addition:
 * `CT_Legendary_Weapon_ChargedUpWeapon` (0x008A3B85,
 * `src/lib/engine/scenarios.ts`'s Charged 4★ melee full-charge damage bonus)
 * — reached via DFOB `WeaponSecondaryChargeUpDamageBonusCurve_DO`
 * (0x0089A83C, user-identified 2026-07-21). Fourth/fifth additions
 * (2026-07-21, DFOB sweep): `SPECIAL_LevelRewardCurve` (0x004F473F, the
 * level→SPECIAL-points curve behind `player-stats.ts`'s allocation pool) and
 * `LegendaryPerkSlotCount` (0x005B67A0, slot→unlock-level behind
 * `build-reducer.ts`'s legendary slot count). Since that sweep, every
 * singleton resolves DFOB-first (`resolveSingletonRecord`) — the same
 * indirection the game exe uses. See `CURVE_TABLE_SINGLETONS` below.
 */

export interface CurveTablePoint {
  x: number;
  y: number;
}

/** Matches the on-disk shape every checked-in curvetable JSON file already uses. */
export interface CurveTableFile {
  curve: CurveTablePoint[];
}

export interface CurveTableGroup {
  /** esm `search` pattern (type-scoped to CURV). Leading `*` is required — see the zzz-prefix note below. */
  pattern: string;
  /** Output subdirectory under src/data/<mode>/curvetables/. */
  outSubdir: string;
  /** Output filename prefix (e.g. "health_universal_tier" → health_universal_tier23.json). */
  filePrefix: string;
}

/**
 * A few CURV records got renamed with a `zzz` prefix at some point (Bethesda's
 * "hide from CK browser" convention for retired-from-new-authoring records —
 * `zzzCT_Creatures_Armor_Universal_Tier49`, confirmed still live and
 * FormID-referenced, 2026-07-18) — a leading `*` on the search pattern is
 * required to still catch them (a bare `CT_Creatures_Armor_Universal_Tier*`
 * prefix search silently drops tier49, 49 files instead of the true 50).
 */
export const CURVE_TABLE_GROUPS: CurveTableGroup[] = [
  {
    pattern: '*Creatures_Health_Universal_Tier*',
    outSubdir: 'creatures/health',
    filePrefix: 'health_universal_tier',
  },
  {
    pattern: '*Creatures_Armor_Universal_Tier*',
    outSubdir: 'creatures/armor',
    filePrefix: 'armor_universal_tier',
  },
  {
    pattern: '*Player_Damage_Universal_Tier*',
    outSubdir: 'player/damage',
    filePrefix: 'damage_universal_tier',
  },
  {
    pattern: '*Player_Armor_Universal_Tier*',
    outSubdir: 'player/armor',
    filePrefix: 'armor_universal_tier',
  },
];

export interface CurveTableSingleton {
  /**
   * Expected editor_id of the one-off CURV record. With a `dfob` bridge this
   * is a cross-check + fallback lookup key; without one it's the primary
   * `client.get` key.
   */
  editorId: string;
  /** Output subdirectory under src/data/<mode>/curvetables/. */
  outSubdir: string;
  /** Output filename, including the .json extension. */
  filename: string;
  /**
   * The DFOB ("Default Object") record the game exe itself reads to find this
   * curve — its single `Object` field holds the target CURV formid. When
   * present, resolution goes DFOB → Object → CURV (the exe's own indirection,
   * robust to CURV edid renames; a repoint to a *different* record surfaces
   * as an unresolved note instead of silently extracting a stale curve —
   * exactly how the retired `fVATSCriticalChargeMult` mechanic died
   * unnoticed). Direct `client.get(editorId)` remains the fallback if the
   * DFOB itself fails to resolve.
   */
  dfob?: { formId: string; editorId: string };
}

/**
 * One-off CURV records with no tier suffix — resolved via their DFOB bridge
 * (see `CurveTableSingleton.dfob`) rather than `CURVE_TABLE_GROUPS`'
 * search+tier-sort. The zzz-prefix tolerance `CURVE_TABLE_GROUPS` needs for
 * its `*`-prefixed search patterns doesn't apply here: each entry names its
 * exact expected editor_id.
 */
export const CURVE_TABLE_SINGLETONS: CurveTableSingleton[] = [
  {
    editorId: 'CT_Player_PercentOfMinToMaxRangeDMGMult',
    outSubdir: 'player/range',
    filename: 'percentofmintomaxrangedamagemult.json',
    dfob: { formId: '0x008407AD', editorId: 'CombatFormulaPercentOfMinToMaxRangeDMGMult_DO' },
  },
  {
    editorId: 'CT_LuckVATSCriticalCharge',
    outSubdir: 'player/vats',
    filename: 'luckvatscriticalcharge.json',
    dfob: { formId: '0x0065562A', editorId: 'LuckVATSCriticalChargeCurve_DO' },
  },
  {
    editorId: 'CT_Legendary_Weapon_ChargedUpWeapon',
    outSubdir: 'legendarymods',
    filename: 'weapon_chargedmeleeattack.json',
    dfob: { formId: '0x0089A83C', editorId: 'WeaponSecondaryChargeUpDamageBonusCurve_DO' },
  },
  {
    // X = player level (1–50), Y = cumulative level-up SPECIAL points (0–49).
    // src/lib/player-stats.ts derives the 56-point allocation pool from this
    // plus 7 × the SPECIAL AVIF Minimum Value (constants.json.special.min).
    editorId: 'SPECIAL_LevelRewardCurve',
    outSubdir: 'player/special',
    filename: 'levelrewardcurve.json',
    dfob: { formId: '0x004F4740', editorId: 'SpecialPointCurve_DO' },
  },
  {
    // X = legendary perk slot number (1–6), Y = the player level that unlocks
    // it (50/75/100/150/200/300). src/state/build-reducer.ts counts points
    // with y ≤ playerLevel — an inverse lookup, not an interpolation.
    editorId: 'LegendaryPerkSlotCount',
    outSubdir: 'player/perks',
    filename: 'legendaryperkslotcount.json',
    dfob: { formId: '0x005B67A1', editorId: 'LegendaryPerkSlotCurve_DO' },
  },
];

/** Extract the trailing tier number from an editor_id, tolerant of the zzz-prefix and zero-padding (…Tier01 → 1). */
export function tierFromEdid(edid: string): number | null {
  const m = /Tier0*(\d+)$/i.exec(edid);
  return m ? parseInt(m[1], 10) : null;
}

/** Pure normalization: raw `fields.Curve` (esm CLI JSON) → the checked-in `{curve:[...]}` shape. Exposed for fixture tests. */
export function toCurveTableFile(rawCurve: unknown): CurveTableFile | null {
  if (!Array.isArray(rawCurve)) return null;
  const points: CurveTablePoint[] = [];
  for (const p of rawCurve) {
    if (p && typeof p === 'object' && 'x' in p && 'y' in p) {
      const x = Number((p as { x: unknown }).x);
      const y = Number((p as { y: unknown }).y);
      if (Number.isFinite(x) && Number.isFinite(y)) points.push({ x, y });
    }
  }
  return { curve: points };
}

export interface ExtractedCurveTableFile {
  /** Relative to src/data/<mode>/curvetables/, e.g. "creatures/health/health_universal_tier23.json". */
  relativePath: string;
  editorId: string;
  formId: string;
  content: CurveTableFile;
}

export interface CurveTablesResult {
  files: ExtractedCurveTableFile[];
  unresolved: string[];
}

/**
 * Resolve a singleton's CURV record the way the game exe does: DFOB →
 * `Object` field → target record. The DFOB-resolved record wins even when
 * its editor_id differs from the expected one (the exe's truth — but the
 * mismatch is flagged for review). Direct `client.get(editorId)` is the
 * fallback when the DFOB chain fails, and the whole path for entries with no
 * `dfob` bridge.
 */
async function resolveSingletonRecord(
  client: EsmClient,
  singleton: CurveTableSingleton,
  unresolved: string[],
): Promise<EsmRecord | null> {
  if (singleton.dfob) {
    const { formId, editorId } = singleton.dfob;
    try {
      const dfobRecord = await client.get(formId);
      const target = dfobRecord.fields['Object'];
      if (typeof target !== 'string') {
        unresolved.push(
          `curvetables: DFOB ${editorId} (${formId}) has no Object formid — falling back to ${singleton.editorId}`,
        );
      } else {
        const record = await client.get(target);
        if (record.header.signature !== 'CURV') {
          unresolved.push(
            `curvetables: DFOB ${editorId} points at ${record.header.signature} ${record.editor_id} (${target}), not a CURV — falling back to ${singleton.editorId}`,
          );
        } else {
          if (record.editor_id !== singleton.editorId) {
            unresolved.push(
              `curvetables: DFOB ${editorId} repointed — expected CURV ${singleton.editorId}, got ${record.editor_id} (${target}); using the DFOB target, review the rename/repoint`,
            );
          }
          return record;
        }
      }
    } catch (err) {
      unresolved.push(
        `curvetables: DFOB ${editorId} (${formId}) failed to resolve: ${(err as Error).message} — falling back to ${singleton.editorId}`,
      );
    }
  }
  try {
    return await client.get(singleton.editorId);
  } catch (err) {
    unresolved.push(`curvetables: get ${singleton.editorId} failed: ${(err as Error).message}`);
    return null;
  }
}

export async function extractCurveTables(client: EsmClient): Promise<CurveTablesResult> {
  const files: ExtractedCurveTableFile[] = [];
  const unresolved: string[] = [];

  for (const group of CURVE_TABLE_GROUPS) {
    let matches: EsmListRow[];
    try {
      matches = await client.search(group.pattern, { type: 'CURV', limit: 0 });
    } catch (err) {
      unresolved.push(`curvetables: search "${group.pattern}" failed: ${(err as Error).message}`);
      continue;
    }

    const withTiers = matches
      .map((m) => ({ ...m, tier: tierFromEdid(m.editor_id) }))
      .filter((m) => {
        if (m.tier == null) {
          unresolved.push(
            `curvetables: ${group.outSubdir} record ${m.editor_id} (${m.form_id}) has no parseable tier suffix`,
          );
          return false;
        }
        return true;
      })
      .sort((a, b) => a.tier! - b.tier!);

    for (const m of withTiers) {
      let record;
      try {
        record = await client.get(m.form_id);
      } catch (err) {
        unresolved.push(
          `curvetables: get ${m.editor_id} (${m.form_id}) failed: ${(err as Error).message}`,
        );
        continue;
      }
      const content = toCurveTableFile(record.fields['Curve']);
      if (!content || content.curve.length === 0) {
        unresolved.push(`curvetables: ${m.editor_id} (${m.form_id}) has no curve points`);
        continue;
      }
      files.push({
        relativePath: `${group.outSubdir}/${group.filePrefix}${m.tier}.json`,
        editorId: m.editor_id,
        formId: m.form_id,
        content,
      });
    }
  }

  for (const singleton of CURVE_TABLE_SINGLETONS) {
    const record = await resolveSingletonRecord(client, singleton, unresolved);
    if (!record) continue;
    const content = toCurveTableFile(record.fields['Curve']);
    if (!content || content.curve.length === 0) {
      unresolved.push(
        `curvetables: ${record.editor_id} (${record.header.form_id}) has no curve points`,
      );
      continue;
    }
    files.push({
      relativePath: `${singleton.outSubdir}/${singleton.filename}`,
      // The RESOLVED record's identity, not the expected one — under a
      // repointed DFOB these differ, and the metadata must not mislabel
      // what was actually extracted.
      editorId: record.editor_id,
      formId: record.header.form_id,
      content,
    });
  }

  return { files, unresolved };
}
