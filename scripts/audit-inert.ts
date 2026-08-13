/**
 * Census of every "no effect yet" badge across perks, weapon mods, armor
 * mods, and unique weapons, grouped by cause (inert bucket / unresolved
 * condition / zero modifiers). Reuses the exact accessors the app badges
 * with (classifyOmodDisplay, perkHasEngineEffect, getArmorEffects, ...) so
 * the report can't drift from what the picker actually shows. Output is
 * console.log only — no files written, nothing pinned; re-run after an ESM
 * sync or when scoping inert-item implementation work.
 *
 *   bun run audit:inert [--mode live|pts]
 */
import type { GameMode } from '../src/types';
import type { Modifier } from '../src/types/modifiers';
import { modifierHasEngineEffect, hasAnyEngineEffect } from '../src/types/modifiers';
import { getDataset } from '../src/data/dataset';
import { classifyOmodDisplay } from '../src/data/omods';
import { perkHasEngineEffect, getGeneratedPerk } from '../src/data/perk-modifiers';
import { getArmorEffects } from '../src/data/armor-modifiers';
import { getUniques } from '../src/data/uniques';

const mode: GameMode = process.argv.includes('--mode')
  ? (process.argv[process.argv.indexOf('--mode') + 1] as GameMode)
  : 'live';

function causeOf(mods: readonly Modifier[]): string {
  if (mods.length === 0) return 'NO-MODS';
  const bad = [
    ...new Set(
      mods
        .filter((m) => !modifierHasEngineEffect(m))
        .map((m) =>
          m.conditions.some((c) => c.kind === 'unresolved') ? 'unresolved-cond' : m.bucket,
        ),
    ),
  ];
  return bad.join(',');
}

function section(title: string) {
  console.log(`\n${'='.repeat(80)}\n${title}\n${'='.repeat(80)}`);
}

function tally(rows: Array<{ cause: string }>) {
  const t = new Map<string, number>();
  for (const r of rows) t.set(r.cause, (t.get(r.cause) ?? 0) + 1);
  return [...t.entries()].sort((a, b) => b[1] - a[1]);
}

const ds = getDataset(mode);

// ---- Perks ---------------------------------------------------------------
section('PERKS');
const perkRows: Array<{ id: string; name: string; special: string; cause: string }> = [];
for (const [id, entry] of Object.entries(ds.perkRegistry)) {
  if (perkHasEngineEffect(mode, id)) continue;
  const g = getGeneratedPerk(mode, id);
  const cause = g ? causeOf(g.ranks.flatMap((r) => r.modifiers)) : 'UNJOINED';
  perkRows.push({ id, name: entry.name, special: entry.special ?? '?', cause });
}
console.log(`inert: ${perkRows.length} of ${Object.keys(ds.perkRegistry).length}`);
for (const [cause, n] of tally(perkRows)) console.log(`  ${String(n).padStart(4)}  ${cause}`);

// ---- Weapon OMODs (incl. legendaries) ------------------------------------
section('WEAPON OMODS (incl. legendary effects)');
const omodRows: Array<{ id: string; name: string; attachPointEdid: string; cause: string }> = [];
for (const o of ds.omods) {
  if (!o.obtainable) continue;
  const r = classifyOmodDisplay(o, undefined);
  if (!r.badge) continue;
  omodRows.push({
    id: o.id,
    name: o.name,
    attachPointEdid: o.attachPointEdid,
    cause: causeOf(o.modifiers),
  });
}
console.log(
  `badged: ${omodRows.length} of ${ds.omods.filter((o) => o.obtainable).length} obtainable`,
);
for (const [cause, n] of tally(omodRows)) console.log(`  ${String(n).padStart(4)}  ${cause}`);

// ---- Armor mods (incl. legendaries) --------------------------------------
section('ARMOR EFFECTS (incl. legendary effects)');
const armorEffects = getArmorEffects(mode);
const armorRows = armorEffects
  .filter((e) => e.badge)
  .map((e) => ({ id: e.id, name: e.name, group: e.group, cause: causeOf(e.modifiers) }));
console.log(`inert: ${armorRows.length} of ${armorEffects.length}`);
for (const [cause, n] of tally(armorRows)) console.log(`  ${String(n).padStart(4)}  ${cause}`);

// ---- Unique weapons (identity mod) ---------------------------------------
section('UNIQUE WEAPONS (identity omod)');
const omodById = new Map(ds.omods.map((o) => [o.id, o]));
const uniqueRows: Array<{ name: string; baseWeaponId: string; cause: string }> = [];
for (const u of getUniques(mode)) {
  const idOmodId = u.mods['ap_customName'] ?? u.mods['ap_Item_Description'] ?? u.id;
  const idOmod = omodById.get(idOmodId) ?? omodById.get(u.id);
  if (!idOmod) {
    uniqueRows.push({ name: u.name, baseWeaponId: u.baseWeaponId, cause: 'MISSING-OMOD' });
    continue;
  }
  if (hasAnyEngineEffect(idOmod.modifiers)) continue;
  uniqueRows.push({ name: u.name, baseWeaponId: u.baseWeaponId, cause: causeOf(idOmod.modifiers) });
}
console.log(`inert: ${uniqueRows.length} of ${getUniques(mode).length}`);
for (const [cause, n] of tally(uniqueRows)) console.log(`  ${String(n).padStart(4)}  ${cause}`);

// ---- Unresolved-condition histogram ---------------------------------------
section('UNRESOLVED CONDITION RAW STRINGS (all categories)');
const raws = new Map<string, number>();
const scanUnresolved = (mods: readonly Modifier[] | undefined) => {
  for (const m of mods ?? []) {
    for (const c of m.conditions) {
      if (c.kind === 'unresolved') raws.set(c.raw, (raws.get(c.raw) ?? 0) + 1);
    }
  }
};
for (const p of ds.perks) for (const r of p.ranks) scanUnresolved(r.modifiers);
for (const o of [...ds.omods, ...ds.armorOmods, ...ds.consumables, ...ds.mutations]) {
  scanUnresolved(o.modifiers);
}
const total = [...raws.values()].reduce((a, b) => a + b, 0);
console.log(`${total} instances, ${raws.size} distinct raw strings`);
for (const [raw, n] of [...raws.entries()].sort((a, b) => b[1] - a[1]).slice(0, 40)) {
  console.log(`  ${String(n).padStart(4)}  ${raw.slice(0, 100)}`);
}
if (raws.size > 40) console.log(`  ... and ${raws.size - 40} more distinct raw strings`);
