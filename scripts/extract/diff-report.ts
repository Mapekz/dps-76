import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { promisify } from 'node:util';
import type { GeneratedOmod, GeneratedWeapon } from '../../src/types/generated';

const execFileAsync = promisify(execFile);

/**
 * Post-extraction review report: what changed in the generated data vs a git
 * ref (default HEAD). Run after every `pnpm extract` and attach to the
 * sign-off — this is how junk-filter/obtainability regressions get caught
 * before they ship.
 *
 * Usage: pnpm extract:diff [--mode live] [--base HEAD]
 */

const LEGENDARY_SLOT_RE = /legendary/i;

interface Entry {
  id: string;
  name: string;
  obtainable?: boolean;
}

function visible(e: Entry): boolean {
  return e.obtainable !== false;
}

async function loadGitJson<T>(ref: string, repoRelPath: string): Promise<T | null> {
  try {
    const { stdout } = await execFileAsync('git', ['show', `${ref}:${repoRelPath}`], {
      maxBuffer: 512 * 1024 * 1024,
    });
    return JSON.parse(stdout) as T;
  } catch {
    return null; // File absent at that ref.
  }
}

function diffIds<T extends Entry>(oldItems: T[], newItems: T[]): { added: T[]; removed: T[]; hidden: T[]; rescued: T[] } {
  const oldById = new Map(oldItems.map(i => [i.id, i]));
  const newById = new Map(newItems.map(i => [i.id, i]));
  const added = newItems.filter(i => !oldById.has(i.id));
  const removed = oldItems.filter(i => !newById.has(i.id));
  // Visibility flips on records present in both.
  const hidden = newItems.filter(i => oldById.has(i.id) && visible(oldById.get(i.id)!) && !visible(i));
  const rescued = newItems.filter(i => oldById.has(i.id) && !visible(oldById.get(i.id)!) && visible(i));
  return { added, removed, hidden, rescued };
}

function section(title: string, items: Entry[], detail?: (e: Entry) => string): string[] {
  const lines = [`### ${title} (${items.length})`, ''];
  if (items.length === 0) return [...lines, '_none_', ''];
  for (const item of items.slice().sort((a, b) => a.id.localeCompare(b.id))) {
    lines.push(`- \`${item.id}\` — ${item.name}${detail ? detail(item) : ''}`);
  }
  lines.push('');
  return lines;
}

async function main() {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string', default: 'live' },
      base: { type: 'string', default: 'HEAD' },
    },
  });
  const mode = values.mode!;
  const base = values.base!;
  const genRel = `src/data/${mode}/generated`;
  const genAbs = path.join(import.meta.dirname, '../..', genRel);

  const out: string[] = [`# Extraction diff — ${mode} vs ${base}`, ''];

  // Weapons
  const oldWeapons = (await loadGitJson<GeneratedWeapon[]>(base, `${genRel}/weapons.json`)) ?? [];
  const newWeapons = JSON.parse(await readFile(path.join(genAbs, 'weapons.json'), 'utf8')) as GeneratedWeapon[];
  const w = diffIds(oldWeapons, newWeapons);
  out.push(`## Weapons: ${oldWeapons.length} → ${newWeapons.length} (visible: ${oldWeapons.filter(visible).length} → ${newWeapons.filter(visible).length})`, '');
  out.push(...section('Added', w.added));
  out.push(...section('Removed', w.removed));
  out.push(...section('Newly hidden (obtainable → false)', w.hidden));
  out.push(...section('Rescued (false → obtainable)', w.rescued));

  // Omods
  const oldOmods = (await loadGitJson<GeneratedOmod[]>(base, `${genRel}/omods.json`)) ?? [];
  const newOmods = JSON.parse(await readFile(path.join(genAbs, 'omods.json'), 'utf8')) as GeneratedOmod[];
  const isLegendary = (o: GeneratedOmod) => LEGENDARY_SLOT_RE.test(o.attachPointEdid);

  for (const [label, filter] of [
    ['Legendary omods', isLegendary],
    ['Normal omods', (o: GeneratedOmod) => !isLegendary(o)],
  ] as const) {
    const oldSet = oldOmods.filter(filter);
    const newSet = newOmods.filter(filter);
    const d = diffIds(oldSet, newSet);
    out.push(`## ${label}: ${oldSet.length} → ${newSet.length} (visible: ${oldSet.filter(visible).length} → ${newSet.filter(visible).length})`, '');
    out.push(...section('Added', d.added));
    out.push(...section('Removed', d.removed));
    out.push(...section('Newly hidden (obtainable → false)', d.hidden));
    out.push(...section('Rescued (false → obtainable)', d.rescued));
  }

  // Legendary modifier-count deltas (the "did translation improve" signal),
  // grouped by star slot.
  const oldById = new Map(oldOmods.map(o => [o.id, o]));
  const deltas = newOmods
    .filter(isLegendary)
    .map(o => ({ omod: o, before: oldById.get(o.id)?.modifiers.length ?? 0, after: o.modifiers.length }))
    .filter(d => oldById.has(d.omod.id) && d.before !== d.after);
  out.push(`## Legendary modifier-count changes (${deltas.length})`, '');
  if (deltas.length === 0) {
    out.push('_none_', '');
  } else {
    const byStar = new Map<string, typeof deltas>();
    for (const d of deltas) {
      const star = d.omod.attachPointEdid;
      (byStar.get(star) ?? byStar.set(star, []).get(star)!).push(d);
    }
    for (const [star, group] of [...byStar.entries()].sort(([a], [b]) => a.localeCompare(b))) {
      out.push(`### ${star}`, '');
      for (const d of group.sort((a, b) => a.omod.id.localeCompare(b.omod.id))) {
        out.push(`- \`${d.omod.id}\` — ${d.omod.name}: ${d.before} → ${d.after} modifiers`);
      }
      out.push('');
    }
  }

  const zeroModLegendaries = newOmods.filter(o => isLegendary(o) && visible(o) && o.modifiers.length === 0);
  out.push(`## Visible zero-modifier legendaries remaining: ${zeroModLegendaries.length}`, '');
  for (const o of zeroModLegendaries.sort((a, b) => a.id.localeCompare(b.id))) {
    out.push(`- \`${o.id}\` — ${o.name}${o.hasEnchantments ? ' (has enchantment — translation gap)' : ''}`);
  }

  console.log(out.join('\n'));
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
