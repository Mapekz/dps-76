import type { GeneratedHealingItem } from '../../src/types/generated';
import { EsmClient, resolveKeywordEdids } from './esm-client';
import { parseMagicEffects } from './normalize/mgef';

/**
 * Base heal magnitudes for Stimpak/RadAway-adjacent ALCH items — a curated
 * five-item list (no obtainability filter; all are player-facing). Reads
 * each record's `StimpakRestoreHealth` MGEF effect legs directly; Stimpak
 * Diffuser is script-archetype with no ESM magnitude (empty legs + note).
 * Magnitude unit is % of max HP per second — see docs/assumptions.md
 * "Stimpak base-heal unit". Concurrent-leg window math lives elsewhere
 * (`src/lib/healing.ts`, not yet written).
 */
/** StimpakRestoreHealth MGEF — Archetype 31 "Stimpak", target AV Health. */
const STIMPAK_RESTORE_HEALTH_MGEF = '0x0021DDB8';

const CURATED_HEALING_ITEMS = [
  '0x00023736', // Stimpak
  '0x00117DF9', // SuperStimpak
  '0x003078C2', // StimpakDiluted
  '0x000522F7', // HealingSalve
  '0x0041557C', // StimGas (Stimpak Diffuser)
] as const;

const STIM_GAS_FORM_ID = '0x0041557C';
const STIM_GAS_NOTE =
  'Script-archetype heal (StimGasTeamHealEffect 0x0041557B) — no ESM magnitude, needs in-game measurement';

export interface ExtractHealingResult {
  items: GeneratedHealingItem[];
  unresolved: string[];
}

export async function extractHealing(client: EsmClient): Promise<ExtractHealingResult> {
  const unresolved: string[] = [];
  const items: GeneratedHealingItem[] = [];

  for (const formId of CURATED_HEALING_ITEMS) {
    let record;
    try {
      record = await client.get(formId);
    } catch {
      unresolved.push(`healing: ALCH ${formId} not found`);
      continue;
    }

    const keywords = await resolveKeywordEdids(client, record.fields);
    const name = (record.fields['Name'] as string) ?? record.editor_id;

    if (formId === STIM_GAS_FORM_ID) {
      items.push({
        id: record.editor_id,
        formId: record.header.form_id,
        name,
        legs: [],
        keywords,
        notes: [STIM_GAS_NOTE],
      });
      continue;
    }

    const stimpakEffects = parseMagicEffects(record).filter(
      (e) => e.mgefFormId === STIMPAK_RESTORE_HEALTH_MGEF,
    );
    if (stimpakEffects.length === 0) {
      unresolved.push(
        `healing: ${record.editor_id} (${formId}) has no StimpakRestoreHealth effects`,
      );
    }

    items.push({
      id: record.editor_id,
      formId: record.header.form_id,
      name,
      legs: stimpakEffects.map((e) => ({
        magnitudePctMaxHpPerSec: e.magnitude,
        durationSec: e.duration,
      })),
      keywords,
      notes: [],
    });
  }

  items.sort((a, b) => a.id.localeCompare(b.id));

  return { items, unresolved };
}
