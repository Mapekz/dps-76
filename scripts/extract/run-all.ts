import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { GeneratedMeta, GeneratedWeapon } from '../../src/types/generated';
import { EsmClient } from './esm-client';
import { extractWeapons } from './extract-weapons';
import { extractPerks } from './extract-perks';
import { extractOmods } from './extract-omods';
import { extractBuffs } from './extract-buffs';
import { extractBodyParts } from './extract-bodyparts';
import { checkAdrenalCurve } from './checks/adrenal-curve-check';

const KNOWN_EXTRACTORS = ['weapons', 'perks', 'omods', 'buffs', 'bodyparts'] as const;
type ExtractorName = (typeof KNOWN_EXTRACTORS)[number];

async function main() {
  const { values } = parseArgs({
    options: {
      esm: { type: 'string' },
      mode: { type: 'string', default: 'live' },
      only: { type: 'string' },
    },
  });

  const esmPath = values.esm ?? process.env.FO76_ESM_PATH;
  if (!esmPath) {
    console.error('Usage: pnpm extract --esm <path-to-SeventySix.esm> [--mode live|pts] [--only weapons,...]');
    console.error('(or set FO76_ESM_PATH in your shell profile to omit --esm)');
    process.exit(1);
  }
  const mode = values.mode!;
  if (mode !== 'live' && mode !== 'pts') {
    console.error(`Invalid --mode "${mode}" (expected live or pts)`);
    process.exit(1);
  }
  const only = values.only
    ? (values.only.split(',').map(s => s.trim()) as ExtractorName[])
    : [...KNOWN_EXTRACTORS];
  for (const name of only) {
    if (!KNOWN_EXTRACTORS.includes(name)) {
      console.error(`Unknown extractor "${name}" (known: ${KNOWN_EXTRACTORS.join(', ')})`);
      process.exit(1);
    }
  }

  const outDir = path.join(import.meta.dirname, '../../src/data', mode, 'generated');
  await mkdir(outDir, { recursive: true });

  const client = new EsmClient(esmPath);
  // Partial runs (--only …) start from the existing meta so the sections not
  // re-run keep their counts/excluded review data (they'd be clobbered
  // otherwise). `unresolved` stays run-scoped: it can't be attributed to a
  // section after the fact — a full run refreshes it completely.
  let previousMeta: Partial<GeneratedMeta> = {};
  if (only.length < KNOWN_EXTRACTORS.length) {
    try {
      previousMeta = JSON.parse(await readFile(path.join(outDir, '_meta.json'), 'utf8')) as GeneratedMeta;
    } catch {
      // No previous meta — fresh start.
    }
  }
  const meta: GeneratedMeta = {
    esmPath,
    // Convention: the ESM lives in a date-stamped directory (…/Data/20260702/SeventySix.esm)
    esmDate: /(\d{8})/.exec(esmPath)?.[1] ?? null,
    mode,
    extractedAt: new Date().toISOString(),
    counts: previousMeta.counts ?? {},
    excluded: previousMeta.excluded ?? {},
    excludedDetailed: previousMeta.excludedDetailed ?? {},
    unresolved: [],
  };

  // Obtainable weapon formids feed the OMOD obtainability pass (two-phase).
  let obtainableWeaponFormIds: Set<string> | undefined;

  if (only.includes('weapons')) {
    console.log('Extracting weapons…');
    const { weapons, excluded, excludedDetailed, unresolved, obtainableFormIds } = await extractWeapons(client);
    obtainableWeaponFormIds = obtainableFormIds;
    await writeFile(path.join(outDir, 'weapons.json'), JSON.stringify(weapons, null, 1));
    meta.counts.weapons = weapons.length;
    meta.excluded = { ...meta.excluded, ...excluded };
    meta.excludedDetailed = { ...meta.excludedDetailed, ...excludedDetailed };
    meta.unresolved.push(...unresolved);
    console.log(
      `  ${weapons.length} weapons (excluded: ${Object.entries(excluded)
        .map(([k, v]) => `${v.length} ${k}`)
        .join(', ')})`
    );
  }

  if (only.includes('perks')) {
    console.log('Extracting perks…');
    const result = await extractPerks(client);
    await writeFile(path.join(outDir, 'perks.json'), JSON.stringify(result.perks, null, 1));
    meta.counts.perks = result.perks.length;
    meta.excluded = { ...meta.excluded, perkJunkEdid: result.excluded.junkEdid, perkNoCard: result.excluded.noNameOrCard };
    meta.unresolved.push(...result.unresolved);
    if (result.unknownEntryPoints.length > 0) {
      meta.unresolved.push(...result.unknownEntryPoints.map(n => `unknown entry point: ${n}`));
    }
    if (result.unmappedAvifs.length > 0) {
      meta.unresolved.push(...result.unmappedAvifs.map(a => `unmapped damage AVIF: ${a}`));
    }
    console.log(
      `  ${result.perks.length} perk families (junk: ${result.excluded.junkEdid.length}, non-card: ${result.excluded.noNameOrCard.length})`
    );
    console.log(`  unknown entry points: ${result.unknownEntryPoints.length}, unmapped AVIFs: ${result.unmappedAvifs.length}, unresolved conds: ${result.unresolved.length}`);
  }

  if (only.includes('omods')) {
    console.log('Extracting OMODs…');
    if (!obtainableWeaponFormIds) {
      // `--only omods` without a weapons pass: read the checked-in generated set.
      const existing = JSON.parse(
        await readFile(path.join(outDir, 'weapons.json'), 'utf8')
      ) as GeneratedWeapon[];
      obtainableWeaponFormIds = new Set(existing.filter(w => w.obtainable !== false).map(w => w.formId));
    }
    const result = await extractOmods(client, obtainableWeaponFormIds);
    await writeFile(path.join(outDir, 'omods.json'), JSON.stringify(result.omods, null, 1));
    meta.counts.omods = result.omods.length;
    meta.excluded = { ...meta.excluded, ...result.excluded };
    meta.excludedDetailed = { ...meta.excludedDetailed, ...result.excludedDetailed };
    meta.unresolved.push(...result.unknownProperties.map(p => `unknown OMOD property: ${p}`));
    meta.unresolved.push(...result.notes);
    console.log(
      `  ${result.omods.length} named weapon OMODs (excluded: ${Object.entries(result.excluded)
        .map(([k, v]) => `${v.length} ${k}`)
        .join(', ')}); unknown properties: ${result.unknownProperties.length}`
    );
  }

  if (only.includes('buffs')) {
    console.log('Extracting mutations & consumables…');
    const adrenalCurveFixed = await checkAdrenalCurve(client);
    if (!adrenalCurveFixed) {
      console.warn('  ⚠ esm CLI curve bug still present — Adrenal Reaction buff override retained (buff-overrides.ts)');
    } else {
      console.warn('  ✔ Adrenal curves now associate correctly — retire the buff-overrides.ts Adrenal entry and regen buffs');
    }
    const result = await extractBuffs(client);
    await writeFile(path.join(outDir, 'mutations.json'), JSON.stringify(result.mutations, null, 1));
    await writeFile(path.join(outDir, 'consumables.json'), JSON.stringify(result.consumables, null, 1));
    meta.counts.mutations = result.mutations.length;
    meta.counts.consumables = result.consumables.length;
    meta.unresolved.push(...result.notes);
    meta.unresolved.push(...result.unmappedAvifs.map(a => `unmapped buff AVIF: ${a}`));
    console.log(`  ${result.mutations.length} mutations, ${result.consumables.length} consumables (notes: ${result.notes.length})`);
  }

  if (only.includes('bodyparts')) {
    console.log('Extracting enemy body parts…');
    const result = await extractBodyParts(client);
    await writeFile(path.join(outDir, 'bodyparts.json'), JSON.stringify(result.races, null, 1));
    meta.counts.bodypartRaces = result.races.length;
    meta.unresolved.push(...result.unresolved);
    console.log(`  ${result.races.length} races (unresolved: ${result.unresolved.length})`);
  }

  await writeFile(path.join(outDir, '_meta.json'), JSON.stringify(meta, null, 2));
  if (meta.unresolved.length > 0) {
    console.warn(`Unresolved items (${meta.unresolved.length}) — review _meta.json:`);
    for (const item of meta.unresolved.slice(0, 20)) console.warn(`  - ${item}`);
  }
  console.log(`Done → ${outDir}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
