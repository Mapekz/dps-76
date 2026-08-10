import type { EsmSource } from './esm-client';

/**
 * Forward COBJ index: one bulk pass over every constructible-object record,
 * shared by extract-omods.ts (craft-linkage diagnostics) and obtainability.ts
 * (learn-method-aware recipe chases).
 *
 * Field encodings pinned against live records (2026-07-14, see
 * __tests__/fixtures/cobj-*.json):
 * - `Created Object`: bare formid of what the recipe makes (absent on
 *   dead recipes — Firecracker Whiskey precedent).
 * - `Learn Method`: `{ value, name }` enum — 0 "Learned When Picked Up Or By
 *   Script", 1 "Learned By Scrapping", 3 "Known By Default Or When Conditions
 *   Are Met", 4 "Learned From Plan".
 * - `Learn Recipe From`: polymorphic by learn method — the plan BOOK (method
 *   4), the scrap source WEAP/self (method 1), or the
 *   `recipe_Dummy_Uncraftable_Item_NOCRAFT` MISC on recipes that exist only
 *   for repair/scrap bookkeeping (the field-based NOCRAFT signal; catches
 *   records whose edid lacks the legacy suffix).
 * - `Repair Method`: NOT a craftability signal — real scrap-learnable recipes
 *   carry 5 too (it tracks how repair costs are computed), so it is recorded
 *   for review but never gates.
 */

export interface CobjLearnFrom {
  formId: string;
  /** 4-char signature of the learn-from record (WEAP, MISC, BOOK, ...). */
  recordType: string;
  edid: string;
}

export interface CobjInfo {
  formId: string;
  edid: string;
  createdObjectFormId: string | null;
  /** `Learn Method` enum value; null when the field is absent. */
  learnMethod: number | null;
  /** `Repair Method` raw value — diagnostic only (see module docs). */
  repairMethod: number | null;
  learnRecipeFrom: CobjLearnFrom | null;
}

export interface CobjIndex {
  byFormId: Map<string, CobjInfo>;
  /** createdObjectFormId → every COBJ that creates it. */
  byCreatedObject: Map<string, CobjInfo[]>;
}

export function emptyCobjIndex(): CobjIndex {
  return { byFormId: new Map(), byCreatedObject: new Map() };
}

/** COBJ recipes that reference a record without proving fresh-craft access:
 *  `_REPAIRONLY` (repair-bench only) and `_NOCRAFT` (scrap/dummy stubs).
 *  Kept in sync with obtainability.ts, which re-exports its own copy for
 *  edid-only call sites that predate the index. */
export const NON_GRANTING_COBJ_RE = /(REPAIRONLY$|NOCRAFT)/i;

/** The shared "this recipe is not craftable" learn-from stub (MISC 0x00054A1F). */
const DUMMY_UNCRAFTABLE_EDID = 'recipe_Dummy_Uncraftable_Item_NOCRAFT';

/**
 * A COBJ that references a record without granting craft access: legacy edid
 * suffix, or a learn-from pointing at the uncraftable dummy stub. Works with
 * `info` undefined (no index built / unknown record) by falling back to the
 * edid regex alone.
 */
export function isNonGrantingCobj(info: CobjInfo | undefined, edid: string): boolean {
  if (NON_GRANTING_COBJ_RE.test(edid)) return true;
  return info?.learnRecipeFrom?.edid === DUMMY_UNCRAFTABLE_EDID;
}

function numberField(value: unknown): number | null {
  if (typeof value === 'number') return value;
  if (
    value &&
    typeof value === 'object' &&
    typeof (value as { value?: unknown }).value === 'number'
  ) {
    return (value as { value: number }).value;
  }
  return null;
}

function formIdField(value: unknown): string | null {
  return typeof value === 'string' && value !== '0x00000000' ? value : null;
}

export async function buildCobjIndex(client: EsmSource): Promise<CobjIndex> {
  const rows = await client.list('COBJ');
  const records = await client.bulkGet(rows.map((r) => r.form_id));

  const infos: CobjInfo[] = [];
  const learnFromIds = new Set<string>();
  const rawLearnFrom = new Map<string, string>();
  for (const record of records) {
    const fields = record.fields;
    const learnFromId = formIdField(fields['Learn Recipe From']);
    const info: CobjInfo = {
      formId: record.header.form_id,
      edid: record.editor_id,
      createdObjectFormId: formIdField(fields['Created Object']),
      learnMethod: numberField(fields['Learn Method']),
      repairMethod: numberField(fields['Repair Method']),
      learnRecipeFrom: null,
    };
    if (learnFromId) {
      learnFromIds.add(learnFromId);
      rawLearnFrom.set(info.formId, learnFromId);
    }
    infos.push(info);
  }

  // Resolve learn-from targets (WEAP/MISC/BOOK, heavily shared) in one round
  // trip. bulkGet caches a per-target promise even when some selectors fail,
  // so settle each get() individually — an unresolvable target keeps its
  // formid with an UNKNOWN type and downstream chases fail toward "unproven"
  // rather than throwing.
  const learnFromRecords = new Map<string, CobjLearnFrom>();
  const targets = [...learnFromIds];
  await client.bulkGet(targets).catch(() => {});
  for (const settled of await Promise.allSettled(targets.map((t) => client.get(t)))) {
    if (settled.status !== 'fulfilled') continue;
    const record = settled.value;
    learnFromRecords.set(record.header.form_id, {
      formId: record.header.form_id,
      recordType: record.header.signature,
      edid: record.editor_id,
    });
  }

  const index = emptyCobjIndex();
  for (const info of infos) {
    const learnFromId = rawLearnFrom.get(info.formId);
    if (learnFromId) {
      info.learnRecipeFrom = learnFromRecords.get(learnFromId) ?? {
        formId: learnFromId,
        recordType: 'UNKNOWN',
        edid: `<unresolved:${learnFromId}>`,
      };
    }
    index.byFormId.set(info.formId, info);
    if (info.createdObjectFormId) {
      const list = index.byCreatedObject.get(info.createdObjectFormId);
      if (list) list.push(info);
      else index.byCreatedObject.set(info.createdObjectFormId, [info]);
    }
  }
  return index;
}
