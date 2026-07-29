/**
 * Weapon-roster vetting report: diffs the CURRENT visible roster (generated
 * data + corrections overlays, exactly what the picker shows) against the
 * PINNED vetted list (src/data/vetted-weapons.ts), so an ESM re-extraction
 * only requires reviewing the delta instead of re-vetting all ~200 entries.
 *
 *   bun run vet:weapons
 *
 * Review procedure: .claude/skills/weapon-vetting/SKILL.md. The pinning test
 * (src/data/__tests__/weapons.test.ts) fails CI until the delta is either
 * corrected away (overrides/corrections.ts) or deliberately accepted by
 * updating VETTED_WEAPON_IDS.
 */
import { readFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getWeapons } from '../src/data';
import { VETTED_WEAPON_IDS } from '../src/data/vetted-weapons';

const weapons = getWeapons('live');

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

interface MetaShape {
  excluded?: Record<string, string[]>;
  excludedDetailed?: Record<string, Array<{ id: string; name?: string; signals?: string[] }>>;
}

function loadMeta(): MetaShape | null {
  const p = join(repoRoot, 'src/data/live/generated/_meta.json');
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8')) as MetaShape;
}

// Heuristic red flags for newly-appearing records — the same signals used in
// the 2026-07-12 vetting pass. A hit is a review prompt, not a verdict.
const SUSPICIOUS_EDID =
  /^(W0\d_MQ|AC_MQ|V9\d_|LC\d|RD0\d|SDOW|Burn_|DailyOps|CharGen|Creature_|CUT_|Workshop|PharmaBot)/i;
const SUSPICIOUS_KEYWORDS = ['WeaponTypeNonOffensive', 'BlockVATS', 'ObjectTypeCamera'];

function flagsFor(id: string): string[] {
  const w = weapons[id];
  const flags: string[] = [];
  if (SUSPICIOUS_EDID.test(id)) flags.push('suspicious-edid');
  for (const kw of SUSPICIOUS_KEYWORDS) if (w?.keywords?.includes(kw)) flags.push(kw);
  return flags;
}

const visible = Object.keys(weapons).sort();
const pinned = new Set<string>(VETTED_WEAPON_IDS);
const visibleSet = new Set(visible);

const added = visible.filter((id) => !pinned.has(id));
const removed = [...pinned].filter((id) => !visibleSet.has(id)).sort();

console.log(`# Weapon roster vetting report\n`);
console.log(`Visible: ${visible.length} · Pinned: ${pinned.size}\n`);

console.log(`## Newly visible — need vetting (${added.length})\n`);
if (added.length === 0) console.log('_none_');
for (const id of added) {
  const flags = flagsFor(id);
  console.log(`- ${id} — "${weapons[id].name}"${flags.length ? `  ⚠ ${flags.join(', ')}` : ''}`);
}

const meta = loadMeta();
console.log(`\n## Dropped from the roster — rescue or accept (${removed.length})\n`);
if (removed.length === 0) console.log('_none_');
for (const id of removed) {
  let where = 'not in generated data (removed from ESM or pre-filtered)';
  if (meta?.excluded) {
    for (const [bucket, ids] of Object.entries(meta.excluded)) {
      if (ids.includes(id)) {
        const detail = meta.excludedDetailed?.weaponUnobtainable?.find((d) => d.id === id);
        where = `excluded.${bucket}${detail?.signals?.length ? ` [${detail.signals.join(', ')}]` : ''}`;
        break;
      }
    }
  }
  console.log(`- ${id} — ${where}`);
}

const byName = new Map<string, string[]>();
for (const id of visible) {
  const list = byName.get(weapons[id].name) ?? [];
  list.push(id);
  byName.set(weapons[id].name, list);
}
const dupes = [...byName.entries()].filter(([, ids]) => ids.length > 1);
console.log(`\n## Duplicate display names (${dupes.length})\n`);
if (dupes.length === 0) console.log('_none_');
for (const [name, ids] of dupes) console.log(`- "${name}": ${ids.join(', ')}`);

if (!meta) {
  console.log(
    '\n_(no local _meta.json — excluded-bucket locations unavailable; run `bun run extract` to produce one)_',
  );
}

process.exitCode = added.length + removed.length > 0 ? 1 : 0;
