/**
 * Sync append-only wire dictionaries from the merged app dataset.
 *
 *   bun run wire-dict:build
 *   bun run wire-dict:build -- --dry-run
 *
 * Run after `bun run extract` or any overrides/corrections.ts edit that changes
 * the app-facing id sets. Not wired into extract — that pipeline has no
 * `src/data` imports, and visibility overrides can change ids without a
 * re-extract.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { GameMode } from '../src/types';
import type { Condition, Modifier } from '../src/types/modifiers';
import type { WireDictionary } from '../src/data/wire-dictionary/types';
import { getWeapons, getPerks } from '../src/data';
import { getDataset } from '../src/data/dataset';
import { getArmorEffects } from '../src/data/armor-modifiers';
import { getMutations, getConsumables, getAddictions } from '../src/data/buffs';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const dictDir = join(repoRoot, 'src/data/wire-dictionary');

const MODES: GameMode[] = ['live', 'pts'];
const dryRun = process.argv.includes('--dry-run');

export interface SyncResult {
  dictionary: WireDictionary;
  added: string[];
  possiblyRenamed: Array<{ from: string; to: string; formId: string }>;
  missing: string[];
}

/** Pure per-category sync — unit-tested on synthetic inputs. */
export function syncWireDictionary(
  existing: WireDictionary,
  currentIds: ReadonlySet<string>,
  formIdOf: (id: string) => string | undefined,
): SyncResult {
  const ids = { ...existing.ids };
  let nextIndex = existing.nextIndex;
  const added: string[] = [];

  for (const id of [...currentIds].sort()) {
    if (!(id in ids)) {
      ids[id] = nextIndex++;
      added.push(id);
    }
  }

  const acknowledged = new Set(existing.acknowledgedRemovals);
  const missingIds = Object.keys(ids).filter((id) => !currentIds.has(id) && !acknowledged.has(id));

  const addedByFormId = new Map<string, string[]>();
  for (const id of added) {
    const formId = formIdOf(id);
    if (!formId) continue;
    const list = addedByFormId.get(formId) ?? [];
    list.push(id);
    addedByFormId.set(formId, list);
  }

  const possiblyRenamed: SyncResult['possiblyRenamed'] = [];
  const missing: string[] = [];

  for (const id of missingIds.sort()) {
    const formId = formIdOf(id);
    const candidates = formId ? addedByFormId.get(formId) : undefined;
    if (candidates?.length === 1) {
      possiblyRenamed.push({ from: id, to: candidates[0]!, formId: formId! });
    } else {
      missing.push(id);
    }
  }

  return {
    dictionary: {
      nextIndex,
      ids,
      acknowledgedRemovals: [...existing.acknowledgedRemovals],
    },
    added,
    possiblyRenamed,
    missing,
  };
}

function emptyDictionary(): WireDictionary {
  return { nextIndex: 0, ids: {}, acknowledgedRemovals: [] };
}

function loadDictionary(filename: string): WireDictionary {
  const path = join(dictDir, filename);
  if (!existsSync(path)) return emptyDictionary();
  return JSON.parse(readFileSync(path, 'utf8')) as WireDictionary;
}

function writeDictionary(filename: string, dict: WireDictionary): void {
  writeFileSync(join(dictDir, filename), `${JSON.stringify(dict, null, 2)}\n`);
}

function unionSets(...sets: ReadonlySet<string>[]): Set<string> {
  const out = new Set<string>();
  for (const s of sets) for (const id of s) out.add(id);
  return out;
}

function collectChallengeIds(mods: readonly Modifier[]): Set<string> {
  const out = new Set<string>();
  const walk = (conds: readonly Condition[]) => {
    for (const c of conds) {
      if (c.kind === 'lifetimeChallengeCompleted') out.add(c.challengeId);
    }
  };
  for (const m of mods) walk(m.conditions);
  return out;
}

interface CategorySpec {
  file: string;
  label: string;
  collect: () => { currentIds: Set<string>; formIdOf: (id: string) => string | undefined };
}

const categories: CategorySpec[] = [
  {
    file: 'weapons.json',
    label: 'weapons',
    collect() {
      const records = MODES.flatMap((mode) => Object.values(getWeapons(mode)));
      const byId = new Map(records.map((w) => [w.id, w]));
      return {
        currentIds: new Set(byId.keys()),
        formIdOf: (id) => byId.get(id)?.formId,
      };
    },
  },
  {
    file: 'omods.json',
    label: 'omods',
    collect() {
      const records = MODES.flatMap((mode) => getDataset(mode).omods);
      const byId = new Map(records.map((o) => [o.id, o]));
      return {
        currentIds: new Set(byId.keys()),
        formIdOf: (id) => byId.get(id)?.formId,
      };
    },
  },
  {
    file: 'attach-points.json',
    label: 'attach points',
    collect() {
      const records = MODES.flatMap((mode) => getDataset(mode).omods);
      const byEdid = new Map<string, string>();
      for (const o of records) {
        if (!byEdid.has(o.attachPointEdid)) byEdid.set(o.attachPointEdid, o.attachPointFormId);
      }
      return {
        currentIds: new Set(byEdid.keys()),
        formIdOf: (id) => byEdid.get(id),
      };
    },
  },
  {
    file: 'armor-effects.json',
    label: 'armor effects',
    collect() {
      const records = MODES.flatMap((mode) => getArmorEffects(mode));
      const byId = new Map(records.map((e) => [e.id, e]));
      return {
        currentIds: new Set(byId.keys()),
        // No formId on ArmorEffectEntry — id string is the stable match key.
        formIdOf: (id) => (byId.has(id) ? id : undefined),
      };
    },
  },
  {
    file: 'perks.json',
    label: 'perks',
    collect() {
      const ids = unionSets(...MODES.map((mode) => new Set(Object.keys(getPerks(mode)))));
      return {
        currentIds: ids,
        formIdOf: (id) => (ids.has(id) ? id : undefined),
      };
    },
  },
  {
    file: 'mutations.json',
    label: 'mutations',
    collect() {
      const records = MODES.flatMap((mode) => getMutations(mode));
      const byId = new Map(records.map((m) => [m.id, m]));
      return {
        currentIds: new Set(byId.keys()),
        formIdOf: (id) => byId.get(id)?.formId,
      };
    },
  },
  {
    file: 'consumables.json',
    label: 'consumables',
    collect() {
      const records = MODES.flatMap((mode) => getConsumables(mode));
      const byId = new Map(records.map((c) => [c.id, c]));
      return {
        currentIds: new Set(byId.keys()),
        formIdOf: (id) => byId.get(id)?.formId,
      };
    },
  },
  {
    file: 'addictions.json',
    label: 'addictions',
    collect() {
      const records = MODES.flatMap((mode) => getAddictions(mode));
      const byId = new Map(records.map((a) => [a.id, a]));
      return {
        currentIds: new Set(byId.keys()),
        formIdOf: (id) => byId.get(id)?.formId,
      };
    },
  },
  {
    file: 'target-races.json',
    label: 'target races',
    collect() {
      const records = MODES.flatMap((mode) => getDataset(mode).bodyPartRaces);
      const byId = new Map(records.map((r) => [r.id, r]));
      return {
        currentIds: new Set(byId.keys()),
        formIdOf: (id) => byId.get(id)?.formId,
      };
    },
  },
  {
    file: 'target-body-parts.json',
    label: 'target body parts',
    collect() {
      const names = unionSets(
        ...MODES.map(
          (mode) =>
            new Set(getDataset(mode).bodyPartRaces.flatMap((r) => r.parts.map((p) => p.name))),
        ),
      );
      return {
        currentIds: names,
        formIdOf: (id) => (names.has(id) ? id : undefined),
      };
    },
  },
  {
    file: 'challenge-ids.json',
    label: 'challenge ids',
    collect() {
      const ids = new Set<string>();
      for (const mode of MODES) {
        const ds = getDataset(mode);
        for (const o of ds.omods) collectChallengeIds(o.modifiers).forEach((id) => ids.add(id));
        for (const o of ds.armorOmods)
          collectChallengeIds(o.modifiers).forEach((id) => ids.add(id));
        for (const perk of ds.perks) {
          for (const rank of perk.ranks) {
            collectChallengeIds(rank.modifiers).forEach((id) => ids.add(id));
          }
        }
        for (const m of ds.mutations) collectChallengeIds(m.modifiers).forEach((id) => ids.add(id));
        for (const c of ds.consumables)
          collectChallengeIds(c.modifiers).forEach((id) => ids.add(id));
      }
      return {
        currentIds: ids,
        formIdOf: (id) => (ids.has(id) ? id : undefined),
      };
    },
  },
];

let anyReview = false;

console.log(`# Wire dictionary sync${dryRun ? ' (dry run)' : ''}\n`);

for (const { file, label, collect } of categories) {
  const existing = loadDictionary(file);
  const { currentIds, formIdOf } = collect();
  const result = syncWireDictionary(existing, currentIds, formIdOf);

  console.log(`## ${label} (${file})`);
  console.log(
    `Current: ${currentIds.size} · Dictionary: ${Object.keys(result.dictionary.ids).length}`,
  );

  if (result.added.length > 0) {
    console.log(`\n### ADDED (${result.added.length})`);
    for (const id of result.added) console.log(`- ${id} → ${result.dictionary.ids[id]}`);
  }

  if (result.possiblyRenamed.length > 0) {
    anyReview = true;
    console.log(`\n### POSSIBLY RENAMED (${result.possiblyRenamed.length}) — review`);
    for (const { from, to, formId } of result.possiblyRenamed) {
      console.log(`- ${from} → ${to} (formId ${formId})`);
    }
  }

  if (result.missing.length > 0) {
    anyReview = true;
    console.log(`\n### MISSING (${result.missing.length}) — needs decision`);
    for (const id of result.missing) console.log(`- ${id}`);
  }

  if (
    result.added.length === 0 &&
    result.possiblyRenamed.length === 0 &&
    result.missing.length === 0
  ) {
    console.log('_no changes_');
  }

  console.log('');

  if (!dryRun) writeDictionary(file, result.dictionary);
}

if (anyReview) {
  console.log('⚠ Review POSSIBLY RENAMED / MISSING entries before committing.');
  process.exit(1);
}
