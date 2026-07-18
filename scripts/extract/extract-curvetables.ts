import type { EsmClient, EsmListRow } from './esm-client';

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
  { pattern: '*Creatures_Health_Universal_Tier*', outSubdir: 'creatures/health', filePrefix: 'health_universal_tier' },
  { pattern: '*Creatures_Armor_Universal_Tier*', outSubdir: 'creatures/armor', filePrefix: 'armor_universal_tier' },
  { pattern: '*Player_Damage_Universal_Tier*', outSubdir: 'player/damage', filePrefix: 'damage_universal_tier' },
  { pattern: '*Player_Armor_Universal_Tier*', outSubdir: 'player/armor', filePrefix: 'armor_universal_tier' },
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
      .map(m => ({ ...m, tier: tierFromEdid(m.editor_id) }))
      .filter(m => {
        if (m.tier == null) {
          unresolved.push(`curvetables: ${group.outSubdir} record ${m.editor_id} (${m.form_id}) has no parseable tier suffix`);
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
        unresolved.push(`curvetables: get ${m.editor_id} (${m.form_id}) failed: ${(err as Error).message}`);
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

  return { files, unresolved };
}
