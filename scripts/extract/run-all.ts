import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import type { GeneratedMeta, GeneratedPerk, GeneratedWeapon } from '../../src/types/generated';
import { EsmClient } from './esm-client';
import { buildApGrantIndex } from './ap-grant-index';
import { buildCobjIndex } from './cobj-index';
import { buildCrossFamilyRankMap } from './normalize/conditions';
import { explosiveFamilyKeywordsOf, extractWeapons } from './extract-weapons';
import { extractPerks } from './extract-perks';
import { extractOmods } from './extract-omods';
import { extractUniques } from './extract-uniques';
import { extractBuffs } from './extract-buffs';
import { extractBodyParts } from './extract-bodyparts';

const KNOWN_EXTRACTORS = ['weapons', 'perks', 'omods', 'uniques', 'buffs', 'bodyparts'] as const;
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
    console.error('(or set the FO76_ESM_PATH env var to omit --esm)');
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
    reviewFlagged: previousMeta.reviewFlagged ?? {},
    unresolved: [],
  };

  // Obtainable weapon formids feed the OMOD obtainability pass (two-phase).
  let obtainableWeaponFormIds: Set<string> | undefined;
  // Full weapons list — the OMOD pass reads defaultModFormIds off it (a
  // weapon's default part is never weak-evidence-flagged).
  let allWeapons: GeneratedWeapon[] | undefined;
  // Keywords of weapons already carrying their own fromExplosion component —
  // feeds the OverrideProjectile chase's launcher-family guard (see
  // ExtractWeaponsResult.explosiveFamilyKeywords).
  let explosiveFamilyKeywords: Set<string> | undefined;
  // Full perk-family list — the OMOD pass builds its cross-family HasPerk
  // rank map (perkFamilyRank conditions) from it.
  let allPerks: GeneratedPerk[] | undefined;

  if (only.includes('weapons')) {
    console.log('Extracting weapons…');
    // Attach-point closure input (mod-granted slots). Costs one OMOD
    // list+bulkGet even on --only weapons runs; the warmed record cache
    // makes the omods pass (full runs) correspondingly cheaper.
    console.log('  building attach-point grant index…');
    const apGrantIndex = await buildApGrantIndex(client);
    const { weapons, excluded, excludedDetailed, unresolved, obtainableFormIds, explosiveFamilyKeywords: efk } =
      await extractWeapons(client, apGrantIndex);
    obtainableWeaponFormIds = obtainableFormIds;
    explosiveFamilyKeywords = efk;
    allWeapons = weapons;
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
    allPerks = result.perks;
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
    if (result.unresolvedCards.length > 0) {
      meta.unresolved.push(...result.unresolvedCards.map(c => `unresolved perk card: ${c}`));
    }
    console.log(
      `  ${result.perks.length} perk families (junk: ${result.excluded.junkEdid.length}, non-card: ${result.excluded.noNameOrCard.length})`
    );
    console.log(`  unknown entry points: ${result.unknownEntryPoints.length}, unmapped AVIFs: ${result.unmappedAvifs.length}, unresolved conds: ${result.unresolved.length}, unresolved cards: ${result.unresolvedCards.length}`);
  }

  if (only.includes('omods')) {
    console.log('Extracting OMODs…');
    if (!allWeapons) {
      // `--only omods` without a weapons pass: read the checked-in generated set.
      allWeapons = JSON.parse(
        await readFile(path.join(outDir, 'weapons.json'), 'utf8')
      ) as GeneratedWeapon[];
    }
    obtainableWeaponFormIds ??= new Set(allWeapons.filter(w => w.obtainable !== false).map(w => w.formId));
    explosiveFamilyKeywords ??= explosiveFamilyKeywordsOf(allWeapons);
    const defaultModFormIds = new Set(allWeapons.flatMap(w => w.defaultModFormIds ?? []));
    const templateModFormIds = new Set(allWeapons.flatMap(w => w.templateModFormIds ?? []));
    if (!allPerks) {
      // `--only omods` without a perks pass: read the checked-in generated
      // set (mirrors the allWeapons fallback above). Missing perks.json is
      // survivable — cross-family HasPerk gates just stay unresolved.
      try {
        allPerks = JSON.parse(await readFile(path.join(outDir, 'perks.json'), 'utf8')) as GeneratedPerk[];
      } catch {
        console.warn('  no perks.json found — cross-family HasPerk gates will stay unresolved');
      }
    }
    const crossFamilyRank = allPerks
      ? buildCrossFamilyRankMap(allPerks.map(p => ({ family: p.family, formIds: p.formIds })))
      : undefined;
    console.log('  building COBJ index…');
    const cobjIndex = await buildCobjIndex(client);
    const result = await extractOmods(
      client,
      obtainableWeaponFormIds,
      explosiveFamilyKeywords,
      cobjIndex,
      defaultModFormIds,
      templateModFormIds,
      crossFamilyRank
    );
    await writeFile(path.join(outDir, 'omods.json'), JSON.stringify(result.omods, null, 1));
    meta.counts.omods = result.omods.length;
    meta.excluded = { ...meta.excluded, ...result.excluded };
    meta.excludedDetailed = { ...meta.excludedDetailed, ...result.excludedDetailed };
    meta.reviewFlagged = { ...meta.reviewFlagged, ...result.reviewFlagged };
    meta.unresolved.push(...result.unknownProperties.map(p => `unknown OMOD property: ${p}`));
    meta.unresolved.push(...result.notes);
    console.log(
      `  ${result.omods.length} named weapon OMODs (excluded: ${Object.entries(result.excluded)
        .map(([k, v]) => `${v.length} ${k}`)
        .join(', ')}); unknown properties: ${result.unknownProperties.length}; weak-evidence review: ${
        result.reviewFlagged.omodWeakEvidence.length
      }`
    );
  }

  if (only.includes('uniques')) {
    console.log('Extracting unique weapon presets…');
    if (!allWeapons) {
      allWeapons = JSON.parse(
        await readFile(path.join(outDir, 'weapons.json'), 'utf8')
      ) as GeneratedWeapon[];
    }
    const omods = JSON.parse(
      await readFile(path.join(outDir, 'omods.json'), 'utf8')
    ) as import('../../src/types/generated').GeneratedOmod[];
    const result = await extractUniques(client, allWeapons, omods);
    await writeFile(path.join(outDir, 'uniques.json'), JSON.stringify(result.uniques, null, 1));
    meta.counts.uniques = result.uniques.length;
    if (result.skipped.length > 0) {
      meta.reviewFlagged = {
        ...meta.reviewFlagged,
        skippedUniqueCombinations: result.skipped.map(s => ({
          id: `${s.weaponId}:${s.combinationName}`,
          name: s.reason,
        })),
      };
    }
    console.log(`  ${result.uniques.length} unique presets (skipped combinations: ${result.skipped.length})`);
  }

  if (only.includes('buffs')) {
    console.log('Extracting mutations & consumables…');
    const result = await extractBuffs(client);
    await writeFile(path.join(outDir, 'mutations.json'), JSON.stringify(result.mutations, null, 1));
    await writeFile(path.join(outDir, 'consumables.json'), JSON.stringify(result.consumables, null, 1));
    await writeFile(path.join(outDir, 'addictions.json'), JSON.stringify(result.addictions, null, 1));
    meta.counts.mutations = result.mutations.length;
    meta.counts.consumables = result.consumables.length;
    meta.counts.addictions = result.addictions.length;
    meta.excluded = { ...meta.excluded, ...result.excluded };
    meta.excludedDetailed = { ...meta.excludedDetailed, ...result.excludedDetailed };
    meta.unresolved.push(...result.notes);
    meta.unresolved.push(...result.unmappedAvifs.map(a => `unmapped buff AVIF: ${a}`));
    console.log(
      `  ${result.mutations.length} mutations, ${result.consumables.length} consumables, ${result.addictions.length} addictions (excluded: ${Object.entries(
        result.excluded
      )
        .map(([k, v]) => `${v.length} ${k}`)
        .join(', ')}; notes: ${result.notes.length})`
    );
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
