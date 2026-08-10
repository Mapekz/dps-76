import type { EsmSource } from './esm-client';
import { classifyOmodRecordExclusion } from './extract-omods';

/**
 * Attach-point grant index: one bulk pass over every OMOD record (pattern:
 * cobj-index.ts), feeding the weapons pass's attach-point closure
 * (extract-weapons.ts applyAttachPointClosure). Per record it captures:
 * - the attach point the mod occupies (`Data."Attach Point"`),
 * - the attach points its installation GRANTS (`Data."Attach Parent Slots"`
 *   — a receiver granting grip/scope/barrel/mag is how most weapon slots
 *   come into existence at all),
 * - target keywords resolved to edids (weapon.keywords is edid-shaped, and
 *   the closure's eligibility gate is the shared picker predicate).
 *
 * Structural junk (dev prefixes, authoring templates, non-weapon mods —
 * classifyOmodRecordExclusion, shared with the omods pass) is dropped up
 * front so a cut/dev donor can never open slots. Records failing ONLY the
 * no-Name check are kept but flagged `unnamed`: a weapon's template may
 * legitimately include one (Holy Fire's effect mod), so its own attach point
 * must count in the closure seed — but it never contributes granted slots
 * during closure iteration. Full OMOD obtainability CANNOT gate here: it is
 * computed in the omods pass, which itself needs obtainableWeaponFormIds
 * from the end of the weapons pass (circular) — see docs/assumptions.md
 * "Attach-point closure" for the accepted residual risk.
 *
 * The bulkGet warms the shared EsmClient record cache, so the omods pass
 * that follows re-reads these records for free.
 */

/** Attach-point closure is weapon-only (extract-weapons.ts) — armor carries no equivalent slot-granting model yet. */
const WEAPON_FORM_TYPE = new Set(['Weapon']);

export interface ApGrantEntry {
  formId: string;
  edid: string;
  /** `Data."Attach Point"` — the slot this mod occupies. */
  attachPointFormId: string | null;
  /** `Data."Attach Parent Slots"` — the slots installing this mod grants. */
  grantedApFormIds: string[];
  /** `Target OMOD Keywords`, resolved to edids. */
  targetKeywords: string[];
  /** Seed-only entry (no display Name) — never contributes during iteration. */
  unnamed: boolean;
}

export type ApGrantIndex = ReadonlyMap<string, ApGrantEntry>;

export function emptyApGrantIndex(): ApGrantIndex {
  return new Map();
}

export async function buildApGrantIndex(client: EsmSource): Promise<ApGrantIndex> {
  const rows = await client.list('OMOD');
  const records = await client.bulkGet(rows.map((r) => r.form_id));

  const index = new Map<string, ApGrantEntry>();
  for (const record of records) {
    const exclusion = classifyOmodRecordExclusion(record, WEAPON_FORM_TYPE);
    if (exclusion !== null && exclusion !== 'unnamed') continue;
    const data = (record.fields['Data'] ?? {}) as Record<string, unknown>;
    const rawTargets = Array.isArray(record.fields['Target OMOD Keywords'])
      ? (record.fields['Target OMOD Keywords'] as string[])
      : [];
    index.set(record.header.form_id, {
      formId: record.header.form_id,
      edid: record.editor_id,
      attachPointFormId:
        typeof data['Attach Point'] === 'string' ? (data['Attach Point'] as string) : null,
      grantedApFormIds: Array.isArray(data['Attach Parent Slots'])
        ? (data['Attach Parent Slots'] as string[])
        : [],
      targetKeywords: await Promise.all(rawTargets.map((k) => client.resolveEdid(k))),
      unnamed: exclusion === 'unnamed',
    });
  }
  return index;
}
